package goframework_net

import (
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

// Read implements the io.Reader interface for NetProgressReport.
func (pr *NetProgressReport) Read(p []byte) (n int, err error) {
	pr.Event.EventState = fwcommon.NetStateTransfer
	n, err = pr.Response.Body.Read(p)
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
			if pr.debPtr.IsActive() && fwcommon.FrameworkFlags.IsEnabled(fwcommon.Net_ProgressorNetUpdate) {
				pr.debPtr.NetUpdateFull(*pr.Event)
			}
		}
		if err != io.EOF {
			pr.errorWrapper(err)
		}
	}
	return n, err
}

// Close implements the io.Closer interface for NetProgressReport.
// It ensures the underlying reader is closed.
func (pr *NetProgressReport) Close() error {
    if pr.closed {
        return nil
    }

	pr.Event.EventState = fwcommon.NetStateFinished

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

// Main network Class-like
type NetHandler struct {
	config     *fwcommon.FrameworkConfig
	deb        fwcommon.DebuggerInterface // Pointer
	log        fwcommon.LoggerInterface   // Pointer
	progressor fwcommon.ProgressorFn
}

// Implements: fwcommon.FetcherInterface
func NewNetHandler(config *fwcommon.FrameworkConfig, debPtr fwcommon.DebuggerInterface, logPtr fwcommon.LoggerInterface, progressor fwcommon.ProgressorFn) *NetHandler {
	return &NetHandler{
		config:     config,
		deb:        debPtr,
		log:        logPtr,
		progressor: progressor,
	}
}

func (nh *NetHandler) logThroughError(err error) error {
	if fwcommon.FrameworkFlags.IsEnabled(fwcommon.Net_InternalErrorLog) {
		return nh.log.LogThroughError(err)
	}
	return err
}

func (nh *NetHandler) DebUpdateFull(progressPtr fwcommon.NetworkProgressReportInterface) {
	if nh.deb.IsActive() && fwcommon.FrameworkFlags.IsEnabled(fwcommon.Net_ProgressorNetUpdate) {
		nh.deb.NetUpdateFull(*progressPtr.GetNetworkEvent())
	}
}

func (nh *NetHandler) Fetch(method fwcommon.HttpMethod, remoteUrl string, stream bool, file bool, fileout *string, progressor fwcommon.ProgressorFn, body io.Reader, contextID *string, initiator *fwcommon.ElementIdentifier, options *fwcommon.NetFetchOptions) (fwcommon.NetworkProgressReportInterface, error) {
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
			nh.DebUpdateFull(progressPtr)
			// Call original progressor
			orgProgressor(progressPtr, err)
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

		// Define Scheme
		if resolveAdditionalInfo {
			u, _ := url.Parse(remoteUrl)
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
				nh.DebUpdateFull(&progress)
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
			u, err := url.Parse(remoteUrl)
			if err != nil || u.Host == "" {
				return &progress, fmt.Errorf("invalid URL: %s", remoteUrl)
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
				nh.DebUpdateFull(&progress)
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
				nh.DebUpdateFull(&progress)
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
			nh.DebUpdateFull(&progress)
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
				nh.DebUpdateFull(&progress)
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
			nh.DebUpdateFull(&progress)
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
						nh.DebUpdateFull(&progress)
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
					nh.DebUpdateFull(&progress)
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
						nh.DebUpdateFull(&progress)
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
					if progress.debPtr.IsActive() && fwcommon.FrameworkFlags.IsEnabled(fwcommon.Net_ProgressorNetUpdate) {
						progress.debPtr.NetUpdateFull(*progress.Event)
					}
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
				if progress.debPtr.IsActive() && fwcommon.FrameworkFlags.IsEnabled(fwcommon.Net_ProgressorNetUpdate) {
					progress.debPtr.NetUpdateFull(*progress.Event)
				}
			}
		}

		if err == io.EOF {
			progress.Event.EventState = fwcommon.NetStateFinished
			if progress.progressor != nil {
				progress.progressor(progress, nil)
			} else {
				if progress.debPtr.IsActive() && fwcommon.FrameworkFlags.IsEnabled(fwcommon.Net_ProgressorNetUpdate) {
					progress.debPtr.NetUpdateFull(*progress.Event)
				}
			}
			break
		} else if err != nil {
			progress.Event.EventState = fwcommon.NetStateFailed
			if progress.progressor != nil {
				progress.progressor(progress, fmt.Errorf("failed to read from source: %w", err))
			} else {
				if progress.debPtr.IsActive() && fwcommon.FrameworkFlags.IsEnabled(fwcommon.Net_ProgressorNetUpdate) {
					progress.debPtr.NetUpdateFull(*progress.Event)
				}
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
