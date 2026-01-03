package goframework_net

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	fwcommon "github.com/sbamboo/goframework/common"
)

type ErrorWrapperFn func(err error) error
type OnDestroyFn func(*fwcommon.NetworkEvent) error

// Implements: fwcommon.NetworkProgressReportInterface
type NetProgressReport struct {
	Event    *fwcommon.NetworkEvent
	Response *http.Response
	Content  *string // Nil if stream

	progressor    fwcommon.ProgressorFn
	orgProgressor fwcommon.ProgressorFn
	errorWrapper  ErrorWrapperFn
	debPtr        fwcommon.DebuggerInterface

	lastSentProgressor *time.Time
	lastSentDebug      *time.Time

	closed bool
}

func (npr *NetProgressReport) GetNetworkEvent() *fwcommon.NetworkEvent {
	return npr.Event
}
func (npr *NetProgressReport) GetResponse() *http.Response {
	return npr.Response
}
func (npr *NetProgressReport) GetNonStreamContent() *string {
	return npr.Content
}
func (npr *NetProgressReport) GetLastSentProgressor() *time.Time {
	return npr.lastSentProgressor
}
func (npr *NetProgressReport) SetLastSentProgressor(t time.Time) {
	npr.lastSentProgressor = &t
}
func (npr *NetProgressReport) GetLastSentDebug() *time.Time {
	return npr.lastSentDebug
}
func (npr *NetProgressReport) SetLastSentDebug(t time.Time) {
	npr.lastSentDebug = &t
}
func (npr *NetProgressReport) SetSteppingMax(max int) {
	npr.GetNetworkEvent().EventStepMax = &max
}
func (npr *NetProgressReport) SetSteppingCurrent(current int) {
	npr.GetNetworkEvent().EventStepCurrent = &current
}
func (npr *NetProgressReport) UnsetSteppingMax() {
	npr.GetNetworkEvent().EventStepMax = nil
}
func (npr *NetProgressReport) UnsetSteppingCurrent() {
	npr.GetNetworkEvent().EventStepCurrent = nil
}
func (npr *NetProgressReport) IncrSteppingCurrent() {
	event := npr.GetNetworkEvent()

	if event.EventStepCurrent == nil || event.EventStepMax == nil {
		return
	}

	cur := event.EventStepCurrent
	max := event.EventStepMax

	*cur++
	if *cur > *max {
		*cur = *max
	}
}
func (npr *NetProgressReport) ResetSteppingCurrent() {
	event := npr.GetNetworkEvent()

	if event.EventStepCurrent != nil && event.EventStepMax != nil {
		*event.EventStepCurrent = 0
	}
}

func (pr *NetProgressReport) LenRead(p []byte, start int, maxLen int) (n int, err error) {
    pr.Event.EventState = fwcommon.NetStateTransfer

    if start < 0 || start > len(p) {
        return 0, fmt.Errorf("invalid start index %d for buffer of length %d", start, len(p))
    }

    readBuf := p[start:]
    if maxLen >= 0 && maxLen < len(readBuf) {
        readBuf = readBuf[:maxLen]
    }

    if len(readBuf) == 0 {
        return 0, nil
    }

    n, err = pr.Response.Body.Read(readBuf)
    if n > 0 {
        pr.Event.Transferred += int64(n)

        duration := time.Since(pr.Event.MetaGotFirstResp).Seconds()
        if duration > 0 {
            pr.Event.MetaSpeed = float64(n*8) / duration / 1_000_000
        }

		// If EventStepMax is not nil calc EventStepCurrent
        pr.Event.CalcStep()

        if pr.progressor != nil {
            pr.progressor(pr, nil)
        } else {
			// Progress to debugger
			callNetUpdateFull(pr.debPtr, pr)
		}
    }

    if err != nil {
        if err == io.EOF && pr.Event.NetFetchOptions.AutoReadEOFClose {
            pr.Close()
        }

        if err != io.EOF {
            pr.Event.EventState = fwcommon.NetStateFailed
        }

        if pr.progressor != nil {
			if err == io.EOF {
				pr.progressor(pr, nil)
			} else {
				pr.progressor(pr, err)
			}
		} else {
			// Progress to debugger
			callNetUpdateFull(pr.debPtr, pr)
		}
		if err != io.EOF {
			pr.errorWrapper(err)
		}
    }

    return n, err
}

// Read implements the io.Reader interface for NetProgressReport.
func (pr *NetProgressReport) Read(p []byte) (int, error) {
	return pr.LenRead(p, 0, -1)
}

// Close implements the io.Closer interface for NetProgressReport.
// It ensures the underlying reader is closed.
func (pr *NetProgressReport) Close() error {
    if pr.closed {
        return nil
    }

	if pr.Event.EventState != fwcommon.NetStateFailed {
		pr.Event.EventState = fwcommon.NetStateFinished
	}

	if pr.orgProgressor != nil {
		pr.orgProgressor(pr, nil)
	}

	if pr.debPtr.IsActive() {
		pr.debPtr.NetStopWFUpdate(*pr.Event)
	}

	pr.closed = true

	// Ensure pr.Response and pr.Response.Body are not nil
	if pr.Response == nil || pr.Response.Body == nil {
		return nil
	}

	return pr.Response.Body.Close()
}

// Helper class
func atleastInterval(last *time.Time, intervalMs int) bool {
	if intervalMs < 0 {
		return true
	}
	if last == nil {
		return true
	}
	return time.Since(*last) >= time.Duration(intervalMs)*time.Millisecond
}

// Main network Class-like
type NetHandler struct {
	config     *fwcommon.FrameworkConfig
	deb        fwcommon.DebuggerInterface // Pointer
	log        fwcommon.LoggerInterface   // Pointer
	progressor fwcommon.ProgressorFn

	prefixHandlers []fwcommon.ResponsePrefixHandler
}

// Implements: fwcommon.FetcherInterface
func NewNetHandler(config *fwcommon.FrameworkConfig, debPtr fwcommon.DebuggerInterface, logPtr fwcommon.LoggerInterface, progressor fwcommon.ProgressorFn) *NetHandler {
	return &NetHandler{
		config:     config,
		deb:        debPtr,
		log:        logPtr,
		progressor: progressor,

		prefixHandlers: []fwcommon.ResponsePrefixHandler{
			{
				Name: "gdrive",
				PrefixLen: 100,
				Validator: isGoogleDriveWarning,
				Parser: parseGoogleDriveConfirm,
				ContentTypeContains: "text/html",
				NeedsContent: true,
				FilterForUrls: []string{"drive.google.com", "drive.usercontent.google.com"},
			},
			{
				Name: "sprend",
				PrefixLen: 0,
				Validator: isSprendLink,
				Parser: parseSprendLink,
				ContentTypeContains: "text/html",
				NeedsContent: false,
				FilterForUrls: []string{"sprend.com"},
			},
			{
				Name: "dropbox",
				PrefixLen: 0,
				Validator: isDropboxDl0link,
				Parser: parseDropboxDl0link,
				ContentTypeContains: "text/html",
				NeedsContent: false,
				FilterForUrls: []string{"www.dropbox.com"},
			},
			{
				Name: "mediafire",
				PrefixLen: 0,
				Validator: isMediafireLink,
				Parser: parseMediafireLink,
				ContentTypeContains: "text/html",
				NeedsContent: true,
				FilterForUrls: []string{"www.mediafire.com"},
			},
		},
	}
}

func (nh *NetHandler) logThroughError(err error) error {
	if fwcommon.FrameworkFlags.IsEnabled(fwcommon.Net_InternalErrorLog) {
		return nh.log.LogThroughError(err)
	}
	return err
}

func callNetUpdateFull(debPtr fwcommon.DebuggerInterface, progressPtr fwcommon.NetworkProgressReportInterface) {
	// Is the debugger active and internal logging enabled?
	if debPtr.IsActive() && fwcommon.FrameworkFlags.IsEnabled(fwcommon.Net_ProgressorNetUpdate) {
		event := progressPtr.GetNetworkEvent()
		// Is the interval -1 (always) or 0 or the state is not "Transfer", just call debugger
		if event.NetFetchOptions.DebuggerInterval <= 0 || event.EventState != fwcommon.NetStateTransfer {
			debPtr.NetUpdateFull(*event)
			progressPtr.SetLastSentDebug(time.Now())
		} else {
			// Else we check if we have waited atleast the interval and if so update and set lastSent
			if atleastInterval(progressPtr.GetLastSentDebug(), event.NetFetchOptions.DebuggerInterval) {
				debPtr.NetUpdateFull(*event)
				progressPtr.SetLastSentDebug(time.Now())
			}
		}
	}
}

func (nh *NetHandler) RegisterPrefixHandler(h fwcommon.ResponsePrefixHandler) {
    nh.prefixHandlers = append(nh.prefixHandlers, h)
}

func (nh *NetHandler) debUpdateFull(progressPtr fwcommon.NetworkProgressReportInterface) {
	callNetUpdateFull(nh.deb, progressPtr)
}

// The core network request function
func (nh *NetHandler) FetchWithoutHandlers(method fwcommon.HttpMethod, remoteUrl string, stream bool, file bool, fileout *string, progressor fwcommon.ProgressorFn, body io.Reader, contextID *string, initiator *fwcommon.ElementIdentifier, options *fwcommon.NetFetchOptions) (fwcommon.NetworkProgressReportInterface, error) {
	// If options is nil set options to point to nh.config.NetFetchOptions
	if options == nil {
		options = nh.config.NetFetchOptions
	}

	// Determine if we should resolve further data
	resolveAdditionalInfo := false
	if nh.deb.IsActive() || options.ResolveAdditionalInfo {
		resolveAdditionalInfo = true
	}

	// If progressor is nil, set it to nh.progressor
	if progressor == nil {
		progressor = nh.progressor
	}

	// If debugger is active wrap progressor to call NetUpdate
	orgProgressor := progressor
	if progressor != nil {
		progressor = func(progressPtr fwcommon.NetworkProgressReportInterface, err error) {
			// Relay progress
			nh.debUpdateFull(progressPtr)

			// Call original progressor
			event := progressPtr.GetNetworkEvent()
			// Is the interval -1 (always) or 0 or the state is not "Transfer", just call progressor
			if event.NetFetchOptions.ProgressorInterval <= 0 || event.EventState != fwcommon.NetStateTransfer {
				orgProgressor(progressPtr, err)
				progressPtr.SetLastSentProgressor(time.Now())
			} else {
				// Else we check if we have waited atleast the interval and if so update and set lastSent
				if atleastInterval(progressPtr.GetLastSentProgressor(), event.NetFetchOptions.ProgressorInterval) {
					orgProgressor(progressPtr, err)
					progressPtr.SetLastSentProgressor(time.Now())
				}
			}
		}
	}

	if options.BufferSize < 0 {
		options.BufferSize = 32 * 1024
	}

	var lastProgress NetProgressReport
	var lastErr error

	attempts := 1
	if options.Timeout > 0 && options.RetryTimeouts > 0 {
		attempts = options.RetryTimeouts + 1 // initial try + retries
	}

	for attempt := 1; attempt <= attempts; attempt++ {

		// Initialize progress report fresh each attempt
		progress := NetProgressReport{
			Event: &fwcommon.NetworkEvent{
				ID:        fmt.Sprintf("Fw.Net.Fetch:%d", fwcommon.FrameworkIndexes.GetNewOfIndex("netevent")),
				Context:   contextID,
				Initiator: initiator,
				Method:    method,
				Priority:  fwcommon.NetPriorityUnset,

				NetFetchOptions: options,

				MetaBufferSize:      options.BufferSize,
				MetaIsStream:        stream,
				MetaAsFile:          file,
				MetaDirection:       fwcommon.NetOutgoing,
				MetaSpeed:           -1,
				MetaTimeToCon:       -1,
				MetaTimeToFirstByte: -1,
				MetaGotFirstResp:    time.Time{},
				MetaRetryAttempt:    attempt,

				Status: 200,
				//ClientIP
				Remote: remoteUrl,
				//RemoteIP
				//Protocol
				//Scheme
				//ContentType
				Headers: options.Headers,
				//RespHeaders

				Transferred: 0,
				Size:        -1,

				EventState:       fwcommon.NetStateWaiting,
				EventSuccess:     false,
				EventStepCurrent: nil,
				EventStepMax:     options.EventStepMax,
				EventStepMode:    options.EventStepMode,
			},
			Response:      nil,
			Content:       nil,
			progressor:    progressor,
			orgProgressor: orgProgressor,
			errorWrapper:  nh.logThroughError,
			debPtr:        nh.deb,
		}

		var u *url.URL = nil

		// Define Scheme
		if resolveAdditionalInfo {
			var err error
			u, err = url.Parse(remoteUrl)
			progress.Event.EventState = fwcommon.NetStateFailed
			if err != nil || u.Host == "" || u == nil {
				return &progress, fmt.Errorf("invalid URL: %s", remoteUrl)
			}
			progress.Event.Scheme = u.Scheme
		}

		// If debugger is active call NetCreate
		if nh.deb.IsActive() {
			nh.deb.NetCreate(*progress.Event)
		}
		if !stream {
			defer progress.Close()
		}

		// If we aren't on the first attempt, we need to update the progress state to retry
		if attempt > 1 {
			progress.Event.EventState = fwcommon.NetStateRetry
			if progressor != nil {
				progressor(&progress, nil)
			} else {
				nh.debUpdateFull(&progress)
			}
		}

		// Setup client
		var client *http.Client
		if options.Client == nil {
			tr := &http.Transport{}

			if options.InsecureSkipVerify {
				tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
			}

			// Define dialcontext
			tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
				var dialer *net.Dialer
				if options.DialTimeout > 0 {
					dialer = &net.Dialer{
						Timeout: options.DialTimeout * time.Second,
					}
				} else {
					// Default dialer without timeout
					dialer = &net.Dialer{}
				}

				// Create a connection using the dialer
				conn, err := dialer.DialContext(ctx, network, addr)

				// If ResolveAdditionalInfo is enabled, we can resolve the ClientIP here
				if resolveAdditionalInfo && err == nil {
					progress.Event.ClientIP = conn.RemoteAddr().String()
				}

				return conn, nh.logThroughError(err)
			}

			if options.Timeout > 0 {
				client = &http.Client{Transport: tr, Timeout: options.Timeout * time.Second}
			} else {
				client = &http.Client{Transport: tr}
			}
		} else {
			client = options.Client
		}

		// Setup context
		var ctx context.Context
		if options.Context != nil {
			ctx = *options.Context
		} else {
			ctx = context.Background()
		}

		// DNS pre-check
		if options.DNSPreCheck {
			if u != nil {
				var err error
				u, err = url.Parse(remoteUrl)
				if err != nil || u.Host == "" || u == nil {
					return &progress, fmt.Errorf("invalid URL: %s", remoteUrl)
				}
			}
			host := u.Hostname()
			if _, err := net.LookupHost(host); err != nil {
				return &progress, fmt.Errorf("DNS resolution failed for host %s: %w", host, err)
			}
		}

		// Create request
		req, err := http.NewRequestWithContext(ctx, string(method), remoteUrl, body)
		if err != nil {
			progress.Event.EventState = fwcommon.NetStateFailed
			if progressor != nil {
				progressor(&progress, fmt.Errorf("failed to create request: %w", err))
			} else {
				nh.debUpdateFull(&progress)
			}
			return &progress, nh.logThroughError(fmt.Errorf("failed to create request: %w", err))
		}

		var connectStart time.Time

		trace := &httptrace.ClientTrace{
			ConnectStart: func(_, _ string) {
				connectStart = time.Now()
			},
			ConnectDone: func(_, _ string, err error) {
				if err == nil {
					progress.Event.MetaTimeToCon = time.Since(connectStart)
				}
			},
			GotFirstResponseByte: func() {
				progress.Event.MetaGotFirstResp = time.Now()
				progress.Event.MetaTimeToFirstByte = progress.Event.MetaGotFirstResp.Sub(connectStart)
			},
		}

		req = req.WithContext(httptrace.WithClientTrace(req.Context(), trace))

		if options.Headers != nil {
			req.Header = *options.Headers
		}

		resp, err := client.Do(req)

		if err != nil {
			// Check if this is a timeout error
			var netErr net.Error
			if errors.As(err, &netErr) && netErr.Timeout() {
				lastErr = fmt.Errorf("timeout on attempt %d: %w", attempt, err)
				lastProgress = progress
				if attempt < attempts {
					continue // retry on timeout
				}
			}

			// Other errors or no retries left
			progress.Event.EventState = fwcommon.NetStateFailed
			if progressor != nil {
				progressor(&progress, err)
			} else {
				nh.debUpdateFull(&progress)
			}
			return &progress, nh.logThroughError(fmt.Errorf("failed to fetch URL: %w", err))
		}

		progress.Event.Status = resp.StatusCode
		progress.Response = resp

		// If enabled collect some additional information
		if resolveAdditionalInfo {
			// RemoteIP
			hostPort := resp.Request.URL.Host
			host, port, err := net.SplitHostPort(hostPort)
			if err != nil {
				host = hostPort
			}
			ips, _ := net.LookupIP(host)
			if len(ips) > 0 {
				if port != "" {
					progress.Event.RemoteIP = net.JoinHostPort(ips[0].String(), port)
				} else {
					progress.Event.RemoteIP = ips[0].String()
				}
			}

			// Protocol
			progress.Event.Protocol = fmt.Sprintf("HTTP/%d.%d", resp.ProtoMajor, resp.ProtoMinor)

			// Headers
			progress.Event.Headers = fwcommon.Ptr(req.Header.Clone())

			// RespHeaders
			progress.Event.RespHeaders = fwcommon.Ptr(progress.Response.Header.Clone())

			// ContentType
			if ct := resp.Header.Get("Content-Type"); ct != "" {
				progress.Event.ContentType = ct
			}
		}

		progress.Event.EventState = fwcommon.NetStateEstablished
		if progressor != nil {
			progressor(&progress, nil)
		} else {
			nh.debUpdateFull(&progress)
		}

		if !stream {
			defer resp.Body.Close()
		}

		if resp.StatusCode != http.StatusOK {
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			progress.Event.EventState = fwcommon.NetStateFinished // Should this be .NetStateFailed instead? Where do we draw the line of failed or finished-non-ok
			if progressor != nil {
				progressor(&progress, fmt.Errorf("non-OK status: %s", resp.Status))
			} else {
				nh.debUpdateFull(&progress)
			}
			return &progress, nh.logThroughError(fmt.Errorf("received non-OK HTTP status: %s", resp.Status))
		}

		progress.Event.Size = resp.ContentLength
		if options.TotalSizeOverride != -2 {
			progress.Event.Size = options.TotalSizeOverride
		}

		progress.Event.EventState = fwcommon.NetStateResponded
		progress.Event.EventSuccess = true
		if progressor != nil {
			progressor(&progress, nil)
		} else {
			nh.debUpdateFull(&progress)
		}

		lastProgress = progress

		if stream && !file {
			return &progress, nil
		}

		var outputPath string
		if file {
			if fileout != nil && *fileout != "" {
				outputPath = *fileout
			} else {
				fileName := "fetched_content"
				if cd := resp.Header.Get("Content-Disposition"); cd != "" {
					if _, params, err := mime.ParseMediaType(cd); err == nil {
						if name, ok := params["filename"]; ok {
							fileName = name
						}
					}
				}
				if fileName == "fetched_content" {
					base := filepath.Base(resp.Request.URL.Path)
					if base != "." && base != "/" && base != "" {
						fileName = base
					}
				}
				if fileName == "." || fileName == "/" || fileName == "" {
					fileName = "fetched_content"
				}
				wd, err := os.Getwd()
				if err != nil {
					progress.Event.EventState = fwcommon.NetStateFailed
					if progressor != nil {
						progressor(&progress, fmt.Errorf("failed to get working directory: %w", err))
					} else {
						nh.debUpdateFull(&progress)
					}
					return &progress, nh.logThroughError(fmt.Errorf("failed to get working directory: %w", err))
				}
				outputPath = filepath.Join(wd, fileName)
			}
		}

		if file {
			outputFile, err := os.Create(outputPath)
			if err != nil {
				progress.Event.EventState = fwcommon.NetStateFailed
				if progressor != nil {
					progressor(&progress, fmt.Errorf("failed to create output file %s: %w", outputPath, err))
				} else {
					nh.debUpdateFull(&progress)
				}
				return &progress, nh.logThroughError(fmt.Errorf("failed to create output file %s: %w", outputPath, err))
			}
			defer outputFile.Close()

			// Stream, File
			if stream {
				err = writeStream(outputFile, &progress, options.BufferSize)
				if err != nil {
					return &progress, nh.logThroughError(err)
				}
				return &progress, nil
			} else { // Non Stream, File
				bodyBytes, readErr := io.ReadAll(&progress)
				if readErr != nil {
					return &progress, fmt.Errorf("failed to read response body: %w", readErr) // Error already handled by .Read() in .ReadAll()
				}
				_, writeErr := outputFile.Write(bodyBytes)
				if writeErr != nil {
					progress.Event.EventState = fwcommon.NetStateFailed
					if progressor != nil {
						progressor(&progress, fmt.Errorf("failed to write to file %s: %w", outputPath, writeErr))
					} else {
						nh.debUpdateFull(&progress)
					}
					return &progress, nh.logThroughError(fmt.Errorf("failed to write to file %s: %w", outputPath, writeErr))
				}
				return &progress, nil
			}
		} else { // Non stream, Non File
			bodyBytes, readErr := io.ReadAll(&progress)
			if readErr != nil {
				return &progress, fmt.Errorf("failed to read response body: %w", readErr) // Error already handled by .Read() in .ReadAll()
			}
			progress.Content = fwcommon.Ptr(string(bodyBytes))
			return &progress, nil
		}
	}

	// If we got here, all retries failed due to timeout
	return &lastProgress, nh.logThroughError(lastErr)
}

// Internal helper function made to provide the correct interface from fallbacks when using `Fetch()`
func (nh *NetHandler) _outerFetchInterfaceMatcher(bufferSize int, irep fwcommon.NetworkProgressReportInterface, err error, stream bool, file bool, fileout *string) (fwcommon.NetworkProgressReportInterface, error) {
	// Takes in a report that is stream=True, file=False, fileout=nil and turns into requested
	// If stream!=True and file=True and fileout!=nil we consume irep fully and write to file
	// If stream!=True and file=False we just consume irep fully, set content and return
	// If stream=True and file=True and fileout!=nil we stream irep to the file
	// If stream=True and file=False we just return irep,err

	if irep == nil {
		return nil, err
	}

	// STREAM = true, FILE = false: just return the irep
	if stream && !file {
		return irep, err
	}

	progress, ok := irep.(*NetProgressReport)
	if !ok {
		return nil, fmt.Errorf("expected *NetProgressReport for streaming-to-file")
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
	} else {
		// STREAM = false, FILE = false: io.Readall set as content and return
		bodyBytes, readErr := io.ReadAll(irep)
		if readErr != nil {
			return irep, fmt.Errorf("failed to read response body: %w", readErr) // Error already handled by .Read() in .ReadAll()
		}

		progress.Content = fwcommon.Ptr(string(bodyBytes))

		progress.Event.EventState = fwcommon.NetStateFinished
		if progress.progressor != nil {
			progress.progressor(progress, nil)
		} else {
			nh.debUpdateFull(progress)
		}

		// Fully consumed, close the original body
		irep.Close()

		return irep, nil
	}
}

// Wraps `FetchWithoutHandlers` with prefix-handlers
func (nh *NetHandler) Fetch(method fwcommon.HttpMethod, remoteUrl string, stream bool, file bool, fileout *string, progressor fwcommon.ProgressorFn, body io.Reader, contextID *string, initiator *fwcommon.ElementIdentifier, options *fwcommon.NetFetchOptions) (fwcommon.NetworkProgressReportInterface, error) {
	// Make an overriding request with stream=True, file=False
	irep, err := nh.FetchWithoutHandlers(method, remoteUrl, true, false, nil, progressor, body, contextID, initiator, options)
	
	// If there was any errors during the transfer we can just return
	if err != nil {
		if irep != nil {
			irep.Close() // Ensure close
		}
		return irep, err
	}
	if irep == nil {
		return irep, err
	}

	resp := irep.GetResponse()
	event := irep.GetNetworkEvent()

	bufferSize := event.NetFetchOptions.BufferSize

	if bufferSize <= 0 {
		bufferSize = 32 * 1024
	}

	// Now that we have a full response object that is known to be stream we can look into the headers and options then stream as we like before returning an interface as requested by the called of Fetch()
	if resp.Body != nil && len(nh.prefixHandlers) > 0 && event.NetFetchOptions.EnabledPrefixHandlers != nil && len(event.NetFetchOptions.EnabledPrefixHandlers) > 0 {
		ct := resp.Header.Get("Content-Type")
			
		enabledHandlers := []fwcommon.ResponsePrefixHandler{}
		maxPrefix := -1

		for _, h := range nh.prefixHandlers {
			if !slices.Contains(event.NetFetchOptions.EnabledPrefixHandlers, h.Name) {
				continue // not enabled so skip
			}

			if ct != "" && h.ContentTypeContains != "" && !strings.Contains(ct, h.ContentTypeContains) {
				continue // Content-Type header existed in response and the handler was registered with a content-type filter and the filter was not contained in the content-type-header we skip
			}

			if len(h.FilterForUrls) > 0 {
				// Is any part in FilterForUrls ([]string) in `resp.Request.URL.String()`
				anyFound := false
				urlStr := resp.Request.URL.String()
				nh.log.Debug(urlStr)
				for _, filter := range h.FilterForUrls {
					nh.log.Debug(filter)
					if strings.Contains(urlStr, filter) {
						// match found
						anyFound = true
						break
					}
				}
				if !anyFound {
					continue
				}
			}

			if h.PrefixLen < 0 {
				continue // invalid length
			}

			enabledHandlers = append(enabledHandlers, h)

			if h.PrefixLen > maxPrefix {
				maxPrefix = h.PrefixLen
			}
		}

		// Since maxPrefix starts with -1 and any handlers that are registered with prefixLen < 0 is ignored if the maxPrefix is still < 0 we dont do anything
		if len(enabledHandlers) > 0 && maxPrefix > -1 {
			prefixBuf := make([]byte, maxPrefix)
			readN := 0
			if maxPrefix > 0 {
				// Read up to maxPrefix

				for readN < maxPrefix {
					n, err := irep.LenRead(prefixBuf, readN, maxPrefix-readN)
					if n < 0 {
						n = 0
					}
					readN += n

					// Stop if nothing more can be read
					if n == 0 && err == nil {
						break
					}

					if err != nil {
						if err == io.EOF {
							break
						}

						irep.Close() // Ensure closed

						return irep, nh.logThroughError(err)
					}
				}

				// Slice safely
				if readN > len(prefixBuf) {
					readN = len(prefixBuf)
				}
				prefixBuf = prefixBuf[:readN]
			}

			// Find first matching handler
			var matchedHandler *fwcommon.ResponsePrefixHandler
			for _, h := range enabledHandlers {
				if h.Validator != nil && h.Validator(prefixBuf, resp.Request.URL.String()) {
					matchedHandler = &h
					break
				}
			}

			// If no matches we continue as usual, else we fetch remaining content (if stream its fully consuming)
			// Then call the validator .Parse, if the .Parse failed/errored or returned empty URL we return full-original-content / full-replay-stream
			//   else we set the current progress.Event.Interupted to true, re-call progressor since we changed event state,
			//   then finally we re-call Fetch() with new url and otherwise all the same parameters
			matched := matchedHandler != nil && matchedHandler.Parser != nil
			var newURL string
			if matched {
				// Since irep is stream we can read the rest of it
				fullBuf := append([]byte{}, prefixBuf...)

				// As an optimization prefix-handlers that only rely on the response can just not have the content read further then their prefixSize
				if matchedHandler.NeedsContent {
					tmp := make([]byte, bufferSize)
					for {
						n, err := irep.LenRead(tmp, 0, -1)
						if n > 0 {
							fullBuf = append(fullBuf, tmp[:n]...)
						}
						if err != nil {
							if err == io.EOF {
								break
							} else {
								irep.Close() // Ensure closed
								return irep, nh.logThroughError(err)
							}
						}

						// To prevent infinite loop
						if n == 0 {
							break
						}
					}
				}

				// Call parser
				newURL, err = matchedHandler.Parser(fullBuf, resp.Request.URL.String())
				if err != nil {
					newURL = ""
					nh.logThroughError(err)
				}

				// Set interupted attribute
				if newURL != "" {
					irep.GetNetworkEvent().Interrupted = true
					progress, ok := irep.(*NetProgressReport)
					if !ok {
						return nil, fmt.Errorf("expected *NetProgressReport for streaming-to-file")
					}
					if progress.progressor != nil {
						progress.progressor(progress, nil)
					} else {
						nh.debUpdateFull(irep)
					}
				}

				if newURL != "" {
					// Now the irep is fully consumed or not needed anymore
					irep.Close()

					// Parser returned a URL => fetch
					return nh.FetchWithoutHandlers(method, newURL, stream, file, fileout, progressor, body, contextID, initiator, options)
				}
			}
			if !matched || newURL == "" {
				// No handler matched => prepend prefix for further reads
				if pr, ok := irep.(*NetProgressReport); ok {
					pr.Response.Body = io.NopCloser(io.MultiReader(
						bytes.NewReader(prefixBuf[:readN]),
						pr.Response.Body,
					))
				}
			}
		}
	}

	// Incase no matches match-output
	return nh._outerFetchInterfaceMatcher(bufferSize, irep, err, stream, file, fileout)
}

// writeStream helps with writing a stream to a file while reporting progress.
func writeStream(dst io.Writer, progress *NetProgressReport, bufferSize int) error {
	if bufferSize <= 0 {
		bufferSize = 32 * 1024
	}
	buf := make([]byte, bufferSize)
	var written int64

	for {
		n, err := progress.Response.Body.Read(buf)
		if n > 0 {
			_, writeErr := dst.Write(buf[:n])
			if writeErr != nil {
				progress.Event.EventState = fwcommon.NetStateFailed
				if progress.progressor != nil {
					progress.progressor(progress, fmt.Errorf("failed to write to destination: %w", writeErr))
				} else {
					callNetUpdateFull(progress.debPtr, progress)
				}
				return fmt.Errorf("failed to write to destination: %w", writeErr)
			}
			written += int64(n)

			progress.Event.Transferred = written

			progress.Event.CalcStep()

			duration := time.Since(progress.Event.MetaGotFirstResp).Seconds()
			if duration > 0 {
				progress.Event.MetaSpeed = float64(int(written)*8) / duration / 1_000_000
			}

			progress.Event.EventState = fwcommon.NetStateTransfer
			if progress.progressor != nil {
				progress.progressor(progress, nil)
			} else {
				callNetUpdateFull(progress.debPtr, progress)
			}
		}

		if err == io.EOF {
			progress.Event.EventState = fwcommon.NetStateFinished
			if progress.progressor != nil {
				progress.progressor(progress, nil)
			} else {
				callNetUpdateFull(progress.debPtr, progress)
			}
			break
		} else if err != nil {
			progress.Event.EventState = fwcommon.NetStateFailed
			if progress.progressor != nil {
				progress.progressor(progress, fmt.Errorf("failed to read from source: %w", err))
			} else {
				callNetUpdateFull(progress.debPtr, progress)
			}
			return fmt.Errorf("failed to read from source: %w", err)
		}
	}
	return nil
}

// Function wrapping NetHandler.Fetch for with an easier interface
func (nh *NetHandler) AutoFetch(method fwcommon.HttpMethod, url string, stream bool, file bool, fileout *string, body io.Reader) (fwcommon.NetworkProgressReportInterface, error) {
	// Options can be nil since NetHandler.Fetch auto's it to NetHandler.Config
	// progressor can be nil since NetHandler.Fetch auto's it to NetHandler.progressor
	return nh.Fetch(method, url, stream, file, fileout, nil, body, fwcommon.Ptr(fmt.Sprintf("Fw.Net.AutoFetch.%s", method)), nil, nil)
}

// Function wrapping NetHandler.Fetch for a GET request
func (nh *NetHandler) GET(url string, stream bool, file bool, fileout *string) (fwcommon.NetworkProgressReportInterface, error) {
	return nh.AutoFetch(fwcommon.MethodGet, url, stream, file, fileout, nil)
}

// Function wrapping NetHandler.Fetch for a POST request
func (nh *NetHandler) POST(url string, stream bool, file bool, fileout *string, body io.Reader) (fwcommon.NetworkProgressReportInterface, error) {
	return nh.AutoFetch(fwcommon.MethodPost, url, stream, file, fileout, body)
}

// Function wrapping NetHandler.Fetch for a PUT request
func (nh *NetHandler) PUT(url string, stream bool, file bool, fileout *string, body io.Reader) (fwcommon.NetworkProgressReportInterface, error) {
	return nh.AutoFetch(fwcommon.MethodPut, url, stream, file, fileout, body)
}

// Function wrapping NetHandler.Fetch for a PATCH request
func (nh *NetHandler) PATCH(url string, stream bool, file bool, fileout *string, body io.Reader) (fwcommon.NetworkProgressReportInterface, error) {
	return nh.AutoFetch(fwcommon.MethodPatch, url, stream, file, fileout, body)
}

// Function wrapping NetHandler.Fetch for a DELETE request
func (nh *NetHandler) DELETE(url string, stream bool, file bool, fileout *string, body io.Reader) (fwcommon.NetworkProgressReportInterface, error) {
	return nh.AutoFetch(fwcommon.MethodDelete, url, stream, file, fileout, body)
}

// Function wrapping NetHandler.Fetch for a HEAD request
func (nh *NetHandler) HEAD(url string, stream bool, file bool, fileout *string) (fwcommon.NetworkProgressReportInterface, error) {
	return nh.AutoFetch(fwcommon.MethodHead, url, stream, file, fileout, nil)
}

// Function wrapping NetHandler.Fetch for a OPTIONS request
func (nh *NetHandler) OPTIONS(url string, stream bool, file bool, fileout *string, body io.Reader) (fwcommon.NetworkProgressReportInterface, error) {
	return nh.AutoFetch(fwcommon.MethodOptions, url, stream, file, fileout, body)
}

// Function wrapping NetHandler.Fetch for ease of use, fetches a url and returns the content as a string in report.Content
func (nh *NetHandler) FetchBody(url string) (fwcommon.NetworkProgressReportInterface, error) {
	return nh.AutoFetch(fwcommon.MethodGet, url, false, false, nil, nil)
}

// Function wrapping NetHandler.Fetch for ease of use, fetches a url and returns the content as a stream usable through report
func (nh *NetHandler) StreamBody(url string) (fwcommon.NetworkProgressReportInterface, error) {
	return nh.AutoFetch(fwcommon.MethodGet, url, true, false, nil, nil)
}

// Function wrapping NetHandler.Fetch for ease of use, fetches a url and saves the content to a file
func (nh *NetHandler) FetchFile(url string, fileout *string) (fwcommon.NetworkProgressReportInterface, error) {
	return nh.AutoFetch(fwcommon.MethodGet, url, false, true, fileout, nil)
}

// Function wrapping NetHandler.Fetch for ease of use, fetches a url and streams the content to a file
func (nh *NetHandler) StreamFile(url string, fileout *string) (fwcommon.NetworkProgressReportInterface, error) {
	return nh.AutoFetch(fwcommon.MethodGet, url, true, true, fileout, nil)
}
