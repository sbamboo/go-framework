package goframework_net

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	fwcommon "github.com/sbamboo/goframework/common"
)

func prependElementIdentifier(initiator *fwcommon.ElementIdentifier, prefix string) *fwcommon.ElementIdentifier {
	var new fwcommon.ElementIdentifier
	if initiator == nil {
		new = fwcommon.ElementIdentifier(prefix)
	} else {
		new = fwcommon.ElementIdentifier(prefix + "::" + (*initiator).(string))
	}
	return &new
}

// Internal helper function made to provide the correct interface from fallbacks when using `Fetch()`
func (nh *NetHandler) _outerFetchWithChibitsInterfaceMatcher(bufferSize int, irep fwcommon.NetworkProgressReportInterface, err error, stream bool, file bool, fileout *string) (fwcommon.NetworkProgressReportInterface, error) {
	// Takes in a report that is stream=False, file=False, fileout=nil and turns into requested
	if irep == nil {
		return nil, err
	}

	// If stream!=True and file=True and fileout!=nil
	// If stream!=True and file=False
	// If stream=True and file=True and fileout!=nil
	// If stream=True and file=False

	progress, ok := irep.(*NetProgressReport)
	if !ok {
		return nil, fmt.Errorf("expected *NetProgressReport for streaming-to-file")
	}

	if !stream && !file {
		progress.Event.Transferred = progress.Event.Size
		return irep, err
	}

	if stream && !file {
		progress.Event.MetaIsStream = true
		return irep, err
	}

	if file && fileout != nil {
		f, openErr := os.Create(*fileout)
		if openErr != nil {

			progress.Event.EventState = fwcommon.NetStateFailed
			if progress.progressor != nil {
				progress.progressor(progress, openErr)
			} else {
				nh.debUpdateFull(progress)
			}

			return nil, nh.logThroughError(openErr)
		}
		defer f.Close()

		if stream {
			// STREAM = true, FILE = true: write to file while streaming
			writeErr := writeStream(f, progress, bufferSize)
			if writeErr != nil {
				irep.Close()
				return nil, nh.logThroughError(writeErr)
			}

			// Fully consumed, close the original body
			irep.Close()

			return irep, nil

		} else {
			// STREAM = false, FILE = true: io.Readall then write to f
			bodyBytes, readErr := io.ReadAll(irep)
			if readErr != nil {
				return irep, fmt.Errorf("failed to read response body: %w", readErr) // Error already handled by .Read() in .ReadAll()
			}

			_, writeErr := f.Write(bodyBytes)
			if writeErr != nil {
				progress.Event.EventState = fwcommon.NetStateFailed
				if progress.progressor != nil {
					progress.progressor(progress, fmt.Errorf("failed to write to file %s: %w", *fileout, writeErr))
				} else {
					nh.debUpdateFull(progress)
				}
				return irep, nh.logThroughError(fmt.Errorf("failed to write to file %s: %w", *fileout, writeErr))
			}

			// Fully consumed, close the original body
			irep.Close()

			return irep, nil
		}
	}
	
	return irep,err
}

func (nh *NetHandler) FetchWithChibits(method fwcommon.HttpMethod, remoteUrl string, stream bool, file bool, fileout *string, progressor fwcommon.ProgressorFn, body io.Reader, contextID *string, initiator *fwcommon.ElementIdentifier, options *fwcommon.NetFetchOptions, defaultChibitRepo *string, chckPtr fwcommon.ChckInterface) (fwcommon.NetworkProgressReportInterface, error) {
	// Check if the remoteURL is using the chibit protocol if not call Fetch

	// chibit:{chibit-uuid}
	// chibit:{chibit-uuid}@{repo-url}
	// chibit:{chibit-uuid};{fallback-url}
	// chibit:{chibit-uuid}@{repo-url};{fallback-url}

	// Non chibit, call Fetch
	if !strings.HasPrefix(remoteUrl, "chibit:") {
		return nh.Fetch(method, remoteUrl, stream, file, fileout, progressor, body, contextID, initiator, options)
	} else {
		var fallback *string
		chibitRepo := defaultChibitRepo
		uuid := strings.TrimPrefix(strings.TrimSpace(remoteUrl), "chibit:")
		if strings.Contains(uuid, "@") {
			parts := strings.Split(uuid, "@")
			uuid = parts[0]
			if len(parts) > 1 {
				if parts[1] != "" {
					chibitRepo = &parts[1]
				}
			}
			if strings.Contains(parts[1], ";") {
				parts2 := strings.Split(parts[1], ";")
				chibitRepo = &parts2[0]
				if len(parts) > 1 {
					fallback = &parts2[1]
				}
			}
		}

		debEvent := fwcommon.NetworkEvent{
			ID: fmt.Sprintf("Fw.Net.Chibit:%d", fwcommon.FrameworkIndexes.GetNewOfIndex("netevent")),
			Remote: remoteUrl,
			Interrupted: true,
			EventSuccess: true,
			EventState: fwcommon.NetStateFinished,
			EventStepCurrent: fwcommon.Ptr(1),
			EventStepMax: fwcommon.Ptr(1),
			Status: 200,
		}
		nh.deb.NetCreate(debEvent)
		nh.deb.NetStop(debEvent.ID)

		entry, err := nh.FetchChibitUUID(uuid, progressor, contextID, initiator, options, *chibitRepo)
		if err != nil || entry == nil {
			if fallback != nil {
				// Failed to fetch entry, use fallback
				return nh.Fetch(method, *fallback, stream, file, fileout, progressor, body, contextID, prependElementIdentifier(initiator, "Fw.Net.Chibit.Fallback"), options)
			} else {
				return nil, nh.logThroughError(fmt.Errorf("Failed to fetch chibit repo, and no fallback provided."))
			}
		}

		// If entry resolved to a redirection url we fetch that
		if entry.redirUrl != "" {
			return nh.Fetch(method, entry.redirUrl, stream, file, fileout, progressor, body, contextID, prependElementIdentifier(initiator, "Fw.Net.Chibit.Redirect"), options)
		} else {

			// Else we use metadata + chunks to resolve actuall

			// For V1 we fetch each chunk in order accumulate them in a buffer then compares size and checksum using chck.ChckStr(content string, sum string, algo fwcommon.HashAlgorithm)
			switch entry.metadata.chibitType {
			case Redirect:
				return nh.Fetch(
					method,
					entry.metadata.chunks[0],
					stream,
					file,
					fileout,
					progressor,
					body,
					contextID,
					prependElementIdentifier(initiator, "Fw.Net.Chibit.Redirect"),
					options,
				)
		
			case Single, Split:
				var buffer []byte
				totalSize := 0
			
				// Fetch chunks in order
				for i, chunkUrl := range entry.metadata.chunks {
					chunkReport, err := nh.Fetch(
						method,
						chunkUrl,
						false,
						false,
						nil,
						progressor,
						nil,
						contextID,
						prependElementIdentifier(prependElementIdentifier(initiator, uuid + "." + fmt.Sprint(i)), "Fw.Net.Chibit.Chunk"),
						options,
					)
					if err != nil {
						return nil, err
					}
			
					chunkContent := chunkReport.GetNonStreamBytes()
					if chunkContent == nil {
						return nil, nh.logThroughError(fmt.Errorf("Chunk returned no content"))
					}
			
					buffer = append(buffer, chunkContent...)
					totalSize += len(chunkContent)
				}
			
				// Size check
				if totalSize != entry.metadata.size {
					return nil, nh.logThroughError(fmt.Errorf("Chibit size mismatch"))
				}
			
				// Checksum check using binary-safe ChckBuff
				if !chckPtr.ChckBuff(
					buffer,
					entry.metadata.checksum.hash,
					entry.metadata.checksum.algorithm,
				) {
					return nil, nh.logThroughError(fmt.Errorf("Chibit checksum mismatch"))
				}
			
				// Build response using buffer directly
				event := &fwcommon.NetworkEvent{
					// ID
					Context: contextID,
					Initiator: prependElementIdentifier(initiator, "Fw.Net.Chibit.Result"),
					Method: method,
					// Priority
					NetFetchOptions: options,
					MetaBufferSize: options.BufferSize,
					MetaIsStream: stream,
					MetaAsFile: file,
					MetaDirection: fwcommon.NetOutgoing,
					// MetaSpeed
					// MetaTimeToCon
					// MetaTimeToFirstByte
					// MetaGotFirstResp
					MetaRetryAttempt: 1,
					// Status
					// ClientIP
					Remote: remoteUrl,
					// RemoteIP
					// Protocol
					// Scheme
					// ContentType
					// Headers
					// RespHeaders
					Transferred: 0,
					Size: int64(len(buffer)),
					EventState:  fwcommon.NetStateFinished,
					EventSuccess: true,
					// EventStepCurrent
					// EventStepMax
					EventStepMode: options.EventStepMode,
					Interrupted: false,
				}
			
				// Wrap buffer as an io.ReadCloser for http.Response.Body
				bodyReader := io.NopCloser(strings.NewReader(string(buffer)))
			
				// Optional: store as string if needed for compatibility
				finalContent := string(buffer)
			
				report := &NetProgressReport{
					Event:    event,
					Response: &http.Response{
						StatusCode: http.StatusOK,
						Body:       bodyReader,
					},
					Content:       &finalContent,
					progressor:    progressor,
					orgProgressor: progressor,
					errorWrapper:  nh.logThroughError,
					debPtr:        nh.deb,
				}

				bufferSize := options.BufferSize
				if bufferSize <= 0 {
					bufferSize = 32 * 1000
				}

				return nh._outerFetchWithChibitsInterfaceMatcher(bufferSize, report, nil, stream, file, fileout)
			}

			// For V2 ...

			return nil, nil
		}
	}
}

type ChibitEntry struct {
	redirUrl string
	metadata ChibitMetadata
}

type ChibitChecksumEntry struct {
	algorithm fwcommon.HashAlgorithm
	hash string
}

type ChibitVersionId string
const (
	V1_0 ChibitVersionId = "1.0"
	V1_1 ChibitVersionId = "1.1"
	V2_0 ChibitVersionId = "2.0"
)

type V1ChibitType string
const (
	Split V1ChibitType = "split"
	Single V1ChibitType = "single"
	Redirect V1ChibitType = "redirect"
)

type ChibitMetadata struct {
	filename string
	checksum ChibitChecksumEntry
	size int
	chibitType V1ChibitType
	chunks []string // Urls to chunks (ORDERED) | single url | redirect url
	maxSize int
	chibitVersion ChibitVersionId
}

func (nh *NetHandler) FetchChibitUUID(uuid string, progressor fwcommon.ProgressorFn, contextID *string, initiator *fwcommon.ElementIdentifier, options *fwcommon.NetFetchOptions, chibitRepo string) (*ChibitEntry, error) {
	entry := &ChibitEntry{}
	
	// For V1 we fetch {repo}/chibits/chibits.json which is {"uuid": "entry-json-url"} then fetch that into V1ChibitEntry
	// Example entry JSON
	//     {
	//     	   "filename": "The Axolot 77's pack v.0.5.0 [1.21+] ALPHA-12_m.zip",
	// 	       "checksum": {
	// 		       "algorithm": "crc32",
	// 	   	       "hash": 3533785743
	// 	       },
	// 	       "size": 167045430,
	//        	"type": "split",
	// 	       "chunks": [
	// 		       "https://sbamboo.github.io/theaxolot77/storage/chunks/5b000da3-0a3e-475d-a262-dc395b45dbf7/1.chunk",
	// 	          "https://sbamboo.github.io/theaxolot77/storage/chunks/5b000da3-0a3e-475d-a262-dc395b45dbf7/2.chunk"
	// 	       ],
	// 	       "max-size": 100000000,
	// 	       "chibit-version": "1.0"
	//     }
	// Note chunks IS ORDERED
	indexUrl := chibitRepo + "/chibits/chibits.json"
	indexReport, err := nh.Fetch(
		fwcommon.MethodGet,
		indexUrl,
		false,
		false,
		nil,
		progressor,
		nil,
		contextID,
		fwcommon.Ptr(fwcommon.ElementIdentifier("Fw.Net.Chibit.Index::" + uuid)),
		options,
	)
	if err != nil {
		return nil, err
	}

	indexContent := indexReport.GetNonStreamContent()
	if indexContent == nil {
		return nil, fmt.Errorf("Index fetch returned no content")
	}

	var index map[string]string
	if err := json.Unmarshal([]byte(*indexContent), &index); err != nil {
		return nil, err
	}

	entryUrl, ok := index[uuid]
	if !ok {
		return nil, fmt.Errorf("Chibit UUID not found")
	}

	entryReport, err := nh.Fetch(
		fwcommon.MethodGet,
		entryUrl,
		false,
		false,
		nil,
		progressor,
		nil,
		contextID,
		fwcommon.Ptr(fwcommon.ElementIdentifier("Fw.Net.Chibit.Entry::" + uuid)),
		options,
	)
	if err != nil {
		return nil, err
	}

	entryContent := entryReport.GetNonStreamContent()
	if entryContent == nil {
		return nil, fmt.Errorf("Entry fetch returned no content")
	}

	var raw map[string]any
	if err := json.Unmarshal([]byte(*entryContent), &raw); err != nil {
		return nil, err
	}

	version := ChibitVersionId(raw["chibit-version"].(string))

	switch version {
	case V1_0, V1_1:
		v1 := &ChibitMetadata{}

		v1.filename = raw["filename"].(string)
		v1.size = int(raw["size"].(float64))
		v1.chibitType = V1ChibitType(raw["type"].(string))
		v1.maxSize = int(raw["max-size"].(float64))
		v1.chibitVersion = version

		v1.checksum = ChibitChecksumEntry{}
		checksumRaw := raw["checksum"].(map[string]any)
		v1.checksum.algorithm = fwcommon.HashAlgorithm(checksumRaw["algorithm"].(string))

		// Safely extract the hash and convert it to its integer string representation
		switch v1.checksum.algorithm {
			case fwcommon.CRC32:
				// JSON unmarshals large integers as float64 by default when using interface{}
				if hashFloat, ok := checksumRaw["hash"].(float64); ok {
					v1.checksum.hash = fmt.Sprint(uint32(hashFloat)) // Convert float to uint32, then to string
				} else if hashStr, ok := checksumRaw["hash"].(string); ok {
					// In case the hash was already a string in the JSON
					v1.checksum.hash = hashStr
				} else {
					// Handle other unexpected types or errors
					return nil, fmt.Errorf("unexpected type for CRC32 hash: %T", checksumRaw["hash"])
				}
			case fwcommon.SHA1, fwcommon.SHA256:
				// These are typically strings already
				if hashStr, ok := checksumRaw["hash"].(string); ok {
					v1.checksum.hash = hashStr
				} else {
					return nil, fmt.Errorf("unexpected type for SHA hash: %T", checksumRaw["hash"])
				}
			default:
				// Fallback for other hash types if any, or error
				return nil, fmt.Errorf("unsupported hash algorithm for parsing: %s", v1.checksum.algorithm)
		}

		for _, c := range raw["chunks"].([]any) {
			v1.chunks = append(v1.chunks, c.(string))
		}

		// Fill YOUR entry
		entry.metadata = *v1

		if v1.chibitType == Redirect && len(v1.chunks) > 0 {
			entry.redirUrl = v1.chunks[0]
		}

		return entry, nil
	}

	// For V2 ...

	return entry, nil
}