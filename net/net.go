package goframework_net

import (
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"mime"
	"net"
	"net/http"
	"net/http/httptrace"
	"os"
	"path/filepath"
	"time"

	fwcommon "github.com/sbamboo/goframework/common"
)

// Implements: fwcommon.NetworkProgressReportInterface
type NetProgressReport struct {
	Event    *fwcommon.NetworkEvent
	Response *http.Response
	Content  *string // Nil if stream

	progressor fwcommon.ProgressorFn
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

// Read implements the io.Reader interface for NetProgressReport.
func (pr *NetProgressReport) Read(p []byte) (n int, err error) {
	n, err = pr.Response.Body.Read(p)
	if n > 0 {
		pr.Event.Transferred += int64(n)
		duration := time.Since(pr.Event.MetaGotFirstResp).Seconds()
		if duration > 0 {
			pr.Event.MetaSpeed = float64(n*8) / duration / 1_000_000
		}
		if pr.progressor != nil {
			pr.progressor(pr, nil)
		}
	}
	if err != nil {
		if err == io.EOF && pr.progressor != nil {
			pr.progressor(pr, nil)
		} else if pr.progressor != nil {
			pr.progressor(pr, err)
		}
	}
	return n, err
}

// Close implements the io.Closer interface for NetProgressReport.
// It ensures the underlying reader is closed.
func (pr *NetProgressReport) Close() error {
	return pr.Response.Body.Close()
}

// Main network Class-like
type NetHandler struct {
	config *fwcommon.FrameworkConfig
	deb    fwcommon.DebuggerInterface
}

// Implements: fwcommon.FetcherInterface
func NewNetHandler(config *fwcommon.FrameworkConfig, deb fwcommon.DebuggerInterface) *NetHandler {
	return &NetHandler{
		config: config,
		deb:    deb,
	}
}

func (nh *NetHandler) Fetch(method fwcommon.HttpMethod, url string, stream bool, file bool, fileout *string, progressor fwcommon.ProgressorFn, body io.Reader, context *string, initiator *fwcommon.ElementIdentifier) (*NetProgressReport, error) {
	if nh.config.NetFetchOptions.BufferSize < 0 {
		nh.config.NetFetchOptions.BufferSize = 32 * 1024
	}

	var lastProgress NetProgressReport
	var lastErr error

	attempts := 1
	if nh.config.NetFetchOptions.Timeout > 0 && nh.config.NetFetchOptions.RetryTimeouts > 0 {
		attempts = nh.config.NetFetchOptions.RetryTimeouts + 1 // initial try + retries
	}

	for attempt := 1; attempt <= attempts; attempt++ {

		// Initialize progress report fresh each attempt
		progress := NetProgressReport{
			Event: &fwcommon.NetworkEvent{
				ID:        fmt.Sprintf("Fw.Net.Fetch:%d", fwcommon.FrameworkIndexes.GetNewOfIndex("netevent")),
				Context:   context,
				Initiator: initiator,
				Method:    method,

				NetFetchOptions: nh.config.NetFetchOptions,

				MetaBufferSize:      nh.config.NetFetchOptions.BufferSize,
				MetaIsStream:        stream,
				MetaAsFile:          file,
				MetaDirection:       fwcommon.NetOutgoing,
				MetaSpeed:           -1,
				MetaTimeToCon:       -1,
				MetaTimeToFirstByte: -1,
				MetaGotFirstResp:    time.Time{},
				MetaRetryAttempt:    attempt,

				Status:  0,
				Remote:  url,
				Headers: nh.config.NetFetchOptions.Headers,

				Transferred: 0,
				Size:        -1,

				EventState:       fwcommon.NetStateWaiting,
				EventSuccess:     false,
				EventStepCurrent: 0,
				EventStepMax:     nil,
			},
			Response: nil,
			Content:  nil,
		}

		_progress := NetProgressReport{
			Url:          url,
			IsStream:     stream,
			AsFile:       file,
			Current:      0,
			Total:        -1,
			Response:     nil,
			Times:        NetConnectionTimes{},
			Content:      "",
			progressor:   progressor,
			BufferSize:   options.BufferSize,
			RetryAttempt: attempt,
		}

		if attempt > 1 {
			if progressor != nil {
				progressor(StateRetry, &progress, nil)
			}
		}

		// Setup client
		var client *http.Client
		if options.Client == nil {
			tr := &http.Transport{}

			if options.InsecureSkipVerify {
				tr.TLSClientConfig = &tls.Config{InsecureSkipVerify: true}
			}

			if options.DialTimeout > 0 {
				tr.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
					dialer := &net.Dialer{
						Timeout: options.DialTimeout * time.Second,
					}
					return dialer.DialContext(ctx, network, addr)
				}
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

		req, err := http.NewRequestWithContext(ctx, string(method), url, body)
		if err != nil {
			if progressor != nil {
				progressor(StateFinished, &progress, err)
			}
			return &progress, fmt.Errorf("failed to create request: %w", err)
		}

		var connectStart time.Time

		trace := &httptrace.ClientTrace{
			ConnectStart: func(_, _ string) {
				connectStart = time.Now()
			},
			ConnectDone: func(_, _ string, err error) {
				if err == nil {
					progress.Times.TimeToConnect = time.Since(connectStart)
				}
			},
			GotFirstResponseByte: func() {
				progress.Times.gotFirstResponse = time.Now()
				progress.Times.TimeToFirstByte = progress.Times.gotFirstResponse.Sub(connectStart)
			},
		}

		req = req.WithContext(httptrace.WithClientTrace(req.Context(), trace))

		if options.Headers != nil {
			req.Header = *options.Headers
		}

		resp, err := client.Do(req)
		progress.Response = resp

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
			if progressor != nil {
				progressor(StateFinished, &progress, err)
			}
			return &progress, fmt.Errorf("failed to fetch URL: %w", err)
		}

		if progressor != nil {
			progressor(StateEstablished, &progress, nil)
		}

		if !stream {
			defer resp.Body.Close()
		}

		if resp.StatusCode != http.StatusOK {
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			if progressor != nil {
				progressor(StateFinished, &progress, fmt.Errorf("non-OK status: %s", resp.Status))
			}
			return &progress, fmt.Errorf("received non-OK HTTP status: %s", resp.Status)
		}

		progress.Total = resp.ContentLength
		if options.TotalSizeOverride != -2 {
			progress.Total = options.TotalSizeOverride
		}

		if progressor != nil {
			progressor(StateResponded, &progress, nil)
		}

		lastProgress = progress

		// The rest of your original logic remains unchanged here:
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
					if progressor != nil {
						progressor(StateFinished, &progress, fmt.Errorf("failed to get working directory: %w", err))
					}
					return &progress, fmt.Errorf("failed to get working directory: %w", err)
				}
				outputPath = filepath.Join(wd, fileName)
			}
		}

		if file {
			outputFile, err := os.Create(outputPath)
			if err != nil {
				if progressor != nil {
					progressor(StateFinished, &progress, fmt.Errorf("failed to create output file %s: %w", outputPath, err))
				}
				return &progress, fmt.Errorf("failed to create output file %s: %w", outputPath, err)
			}
			defer outputFile.Close()

			if stream {
				err = writeStream(outputFile, &progress, progress.BufferSize)
				if err != nil {
					return &progress, err
				}
				return &progress, nil
			} else {
				bodyBytes, readErr := io.ReadAll(resp.Body)
				progress.Current = int64(len(bodyBytes))
				if readErr != nil {
					if progressor != nil {
						progressor(StateFinished, &progress, fmt.Errorf("failed to read response body: %w", readErr))
					}
					return &progress, fmt.Errorf("failed to read response body: %w", readErr)
				}
				_, writeErr := outputFile.Write(bodyBytes)
				if writeErr != nil {
					if progressor != nil {
						progressor(StateFinished, &progress, fmt.Errorf("failed to write to file %s: %w", outputPath, writeErr))
					}
					return &progress, fmt.Errorf("failed to write to file %s: %w", outputPath, writeErr)
				}
				if progressor != nil {
					progressor(StateFinished, &progress, nil)
				}
				return &progress, nil
			}
		} else {
			bodyBytes, readErr := io.ReadAll(resp.Body)
			progress.Current = int64(len(bodyBytes))
			if readErr != nil {
				if progressor != nil {
					progressor(StateFinished, &progress, fmt.Errorf("failed to read response body: %w", readErr))
				}
				return &progress, fmt.Errorf("failed to read response body: %w", readErr)
			}
			if progressor != nil {
				progressor(StateFinished, &progress, nil)
			}
			progress.Content = string(bodyBytes)
			return &progress, nil
		}
	}

	// If we got here, all retries failed due to timeout
	return &lastProgress, lastErr
}
