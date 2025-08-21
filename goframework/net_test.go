package libgoframework

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// -- Helpers --
func Ptr[T any](v T) *T { return &v }

func SetupFramework() *Framework {
	config := &FrameworkConfig{
		DebugSendPort:   9000,
		DebugListenPort: 9001,

		LoggerFile:     nil,
		LoggerFormat:   nil,
		LoggerCallable: nil,

		NetFetchOptions: (&NetFetchOptions{}).Default(),

		LogFrameworkInternalErrors: true,
	}

	return NewFramework(config)
}

// -- Main Functions --
// ANSI Color Codes
const (
	ColorReset   = "\033[0m"
	ColorRed     = "\033[31m"
	ColorGreen   = "\033[32m"
	ColorBlue    = "\033[34m"
	ColorGray    = "\033[90m"
	ColorYellow  = "\033[33m"
	ColorMagenta = "\033[35m"
)

func printTestCaseHeader(name string) {
	str := ColorGray + "\n--- " + name + " ---\n" + ColorReset
	fmt.Printf("%s", str)
}

func TestNet(t *testing.T) {
	fw := SetupFramework()

	fw.Debugger.Activate()

	// ---

	testURL := "http://example.com"
	largeFileTestURL := "https://proof.ovh.net/files/1Mb.dat"

	var marqueeState int
	var marqueeDirection = 1
	myProgressor := func(progressPtr NetworkProgressReportInterface, err error) {
		resp := progressPtr.GetResponse()
		event := progressPtr.GetNetworkEvent()

		status := "N/A"
		if resp != nil {
			status = resp.Status
		}

		var errValue any
		if err == nil {
			errValue = false
		} else {
			errValue = err.Error()
		}

		var prefix string
		switch event.EventState {
		case NetStateWaiting, NetStatePaused:
			prefix = ColorGray
		case NetStateRetry:
			prefix = ColorYellow
		case NetStateEstablished, NetStateResponded:
			prefix = ColorBlue
		case NetStateTransfer:
			prefix = ColorMagenta
		case NetStateFinished:
			prefix = ColorGreen
		}

		// ──────────────── Step 1: Move cursor up one line to overwrite progress bar (unless first run)
		// On very first run, terminal will not have two lines yet — so optionally guard with a `firstRun` flag if needed
		fmt.Print("\033[F") // move cursor up to overwrite bar
		fmt.Print("\r")     // reset cursor to beginning of line
		fmt.Print("\033[K") // clear line

		// ──────────────── Step 2: Reprint Progressor line
		fmt.Printf("%s[Progressor] State: %s, IsStream: %t, AsFile: %t, Transferred: %d, Size: %d, Status: %s, TTC: %dms, TTFB: %dms, Speed: %.2fMbps, Attempt: %d, Error: %t%s\n",
			prefix, event.EventState, event.MetaIsStream, event.MetaAsFile, event.Transferred, event.Size,
			status, event.MetaTimeToCon.Milliseconds(),
			event.MetaTimeToFirstByte.Milliseconds(), event.MetaSpeed, event.MetaRetryAttempt,
			errValue, ColorReset)

		// ──────────────── Step 3: Print progress bar on second line
		fmt.Print("\r")     // Return to beginning of progress bar line
		fmt.Print("\033[K") // Clear the progress bar line

		if event.Size != -1 {
			// Known total size – render full progress bar
			const barWidth = 40
			percent := float64(event.Transferred) / float64(event.Size) * 100
			completed := int(float64(barWidth) * percent / 100)
			bar := strings.Repeat("=", completed) + strings.Repeat("-", barWidth-completed)
			if completed < barWidth {
				bar = bar[:completed] + ">" + bar[completed+1:]
			}
			fmt.Printf("%s[Progressor] [%s] %.2f%% %d/%d bytes Status: %s%s",
				ColorMagenta, bar, percent, event.Transferred, event.Size, status, ColorReset)

		} else {
			// Unknown total – marquee animation
			const barWidth = 30
			bar := make([]rune, barWidth)
			for i := range bar {
				bar[i] = '-'
			}
			bar[marqueeState] = '<'
			if marqueeState+1 < barWidth {
				bar[marqueeState+1] = '='
			}
			if marqueeState+2 < barWidth {
				bar[marqueeState+2] = '>'
			}
			fmt.Printf("%s[Progressor] [%s] %d bytes Status: %s%s",
				ColorYellow, string(bar), event.Transferred, status, ColorReset)

			// Update animation state
			marqueeState += marqueeDirection
			if marqueeState+2 >= barWidth || marqueeState <= 0 {
				marqueeDirection *= -1
			}
		}

		// ──────────────── Step 4: Print newline only once finished
		if event.EventState == NetStateFinished {
			fmt.Print("\n")
		}
	}

	// Helper for cleaning up files if needed
	cleanupFile := func(path string) {
		if path != "" {
			_ = os.Remove(path)
		}
	}

	// --- Test Case 1 ---
	printTestCaseHeader("Test Case 1: Fetch content; not stream; not file; not progressor")
	report, err := fw.Net.Fetch(MethodGet, testURL, false, false, nil, myProgressor, nil, nil, nil, (&NetFetchOptions{}).Default())
	content := *report.GetNonStreamContent()
	if err != nil {
		t.Errorf("Test Case 1 failed: %v", err)
	} else {
		if len(content) == 0 {
			t.Errorf("Test Case 1 failed: content is empty")
		}
		fmt.Printf("Test Case 1 output (first 100 chars): %s...\n", content[:100])
	}

	// --- Test Case 2 ---
	printTestCaseHeader("Test Case 2: Fetch content; not stream; not file; with progressor")
	report, err = fw.Net.Fetch(MethodGet, testURL, false, false, nil, myProgressor, nil, nil, nil, (&NetFetchOptions{}).Default())
	content = *report.GetNonStreamContent()
	if err != nil {
		t.Errorf("Test Case 2 failed: %v", err)
	} else {
		if len(content) == 0 {
			t.Errorf("Test Case 2 failed: content is empty")
		}
		fmt.Printf("Test Case 2 output (first 100 chars): %s...\n", content[:100])
	}

	// --- Test Case 3 ---
	printTestCaseHeader("Test Case 3: Fetch content; stream; not file; not progressor")
	report, err = fw.Net.Fetch(MethodGet, testURL, true, false, nil, nil, nil, nil, nil, (&NetFetchOptions{}).Default())
	if err != nil {
		t.Errorf("Test Case 3 failed: %v", err)
	} else {
		content, err := io.ReadAll(report)
		report.Close()
		if err != nil {
			t.Errorf("Test Case 3 read error: %v", err)
		}
		fmt.Printf("Test Case 3 total bytes read: %d\n", len(content))
	}

	// --- Test Case 4 ---
	printTestCaseHeader("Test Case 4: Fetch content; stream; not file; with progressor")
	report, err = fw.Net.Fetch(MethodGet, largeFileTestURL, true, false, nil, myProgressor, nil, nil, nil, (&NetFetchOptions{}).Default())
	if err != nil {
		t.Errorf("Test Case 4 failed: %v", err)
	} else {
		_, err := io.ReadAll(report)
		report.Close()
		if err != nil {
			t.Errorf("Test Case 4 read error: %v", err)
		}
		fmt.Println("Test Case 4 completed reading stream with progressor.")
	}

	// --- Test Case 5 ---
	printTestCaseHeader("Test Case 5: Fetch content; not stream; to file; default path; not progressor")
	defaultFileName := filepath.Base(testURL)
	if defaultFileName == "" || defaultFileName == "." || defaultFileName == "/" {
		defaultFileName = "fetched_content"
	}
	_, err = fw.Net.Fetch(MethodGet, testURL, false, true, nil, nil, nil, nil, nil, (&NetFetchOptions{}).Default())
	if err != nil {
		t.Errorf("Test Case 5 failed: %v", err)
	} else {
		fmt.Printf("Test Case 5 file saved to: %s\n", defaultFileName)
		cleanupFile(defaultFileName)
	}

	// --- Test Case 6 ---
	printTestCaseHeader("Test Case 6: Fetch content; not stream; to file; default path; with progressor")
	_, err = fw.Net.Fetch(MethodGet, testURL, false, true, nil, myProgressor, nil, nil, nil, (&NetFetchOptions{}).Default())
	if err != nil {
		t.Errorf("Test Case 6 failed: %v", err)
	} else {
		fmt.Printf("Test Case 6 file saved to: %s\n", defaultFileName)
		cleanupFile(defaultFileName)
	}

	// --- Test Case 7 ---
	printTestCaseHeader("Test Case 7: Fetch content; stream; to file; default path; not progressor")
	_, err = fw.Net.Fetch(MethodGet, largeFileTestURL, true, true, nil, nil, nil, nil, nil, (&NetFetchOptions{}).Default())
	if err != nil {
		t.Errorf("Test Case 7 failed: %v", err)
	} else {
		defaultFileName = filepath.Base(largeFileTestURL)
		fmt.Printf("Test Case 7 file saved to: %s\n", defaultFileName)
		cleanupFile(defaultFileName)
	}

	// --- Test Case 8 ---
	printTestCaseHeader("Test Case 8: Fetch content; stream; to file; default path; with progressor")
	_, err = fw.Net.Fetch(MethodGet, largeFileTestURL, true, true, nil, myProgressor, nil, nil, nil, (&NetFetchOptions{}).Default())
	if err != nil {
		t.Errorf("Test Case 8 failed: %v", err)
	} else {
		defaultFileName = filepath.Base(largeFileTestURL)
		fmt.Printf("Test Case 8 file saved to: %s\n", defaultFileName)
		cleanupFile(defaultFileName)
	}

	// --- Test Case 9 ---
	printTestCaseHeader("Test Case 9: Fetch content; stream; to file; default path; with progressor; OVERRIDE SIZE HEADER TO -1")
	// This test requires altering response headers to simulate size = -1
	// We'll wrap the progressor to force size = -1 on call
	myProgressorOverrideSize := func(progressPtr NetworkProgressReportInterface, err error) {
		progressPtr.GetNetworkEvent().NetFetchOptions.TotalSizeOverride = -1
		myProgressor(progressPtr, err)
	}

	_, err = fw.Net.Fetch(MethodGet, largeFileTestURL, true, true, nil, myProgressorOverrideSize, nil, nil, nil, (&NetFetchOptions{}).Default())
	if err != nil {
		t.Errorf("Test Case 9 failed: %v", err)
	} else {
		defaultFileName = filepath.Base(largeFileTestURL)
		fmt.Printf("Test Case 9 file saved to: %s\n", defaultFileName)
		cleanupFile(defaultFileName)
	}

	// --- Test Case 10 ---
	printTestCaseHeader("Test Case 10: Fetch content; stream; to file; custom path; with progressor")
	customFilePath := "custom_10mb.dat"
	_, err = fw.Net.Fetch(MethodGet, largeFileTestURL, true, true, &customFilePath, myProgressor, nil, nil, nil, (&NetFetchOptions{}).Default())
	if err != nil {
		t.Errorf("Test Case 10 failed: %v", err)
	} else {
		fmt.Printf("Test Case 10 file saved to: %s\n", customFilePath)
		cleanupFile(customFilePath)
	}

	// --- Test Case 11 ---
	printTestCaseHeader("Test Case 11: Invalid URL")
	_, err = fw.Net.Fetch(MethodGet, "http://invalid.url.localhost", false, false, nil, nil, nil, nil, nil, (&NetFetchOptions{}).Default())
	if err == nil {
		t.Errorf("Test Case 11 failed: expected error for invalid URL")
	} else {
		fmt.Printf("Test Case 11 expected error received: %v\n", err)
	}

	// --- Test Case 12 ---
	printTestCaseHeader("Test Case 12: Invalid URL with streaming attempt")
	_, err = fw.Net.Fetch(MethodGet, "http://invalid.url.localhost", true, false, nil, nil, nil, nil, nil, (&NetFetchOptions{}).Default())
	if err == nil {
		t.Errorf("Test Case 12 failed: expected error for invalid URL with streaming")
	} else {
		fmt.Printf("Test Case 12 expected error received: %v\n", err)
	}

	// --- Test Case 13 ---
	printTestCaseHeader("Test Case 13: Non-OK HTTP Status (e.g., 404)")
	_, err = fw.Net.Fetch(MethodGet, "http://example.com/nonexistentpage404", false, false, nil, nil, nil, nil, nil, (&NetFetchOptions{}).Default())
	if err == nil {
		t.Errorf("Test Case 13 failed: expected error for 404 status")
	} else {
		fmt.Printf("Test Case 13 expected error received: %v\n", err)
	}

	// --- Test Case 14 ---
	printTestCaseHeader("Test Case 14: Fetch blob; not stream; not file; with progressor")
	report, err = fw.Net.Fetch(MethodGet, largeFileTestURL, false, false, nil, myProgressor, nil, nil, nil, (&NetFetchOptions{}).Default())
	content = *report.GetNonStreamContent()
	if err != nil {
		t.Errorf("Test Case 2 failed: %v", err)
	} else {
		if len(content) == 0 {
			t.Errorf("Test Case 2 failed: content is empty")
		}
		fmt.Printf("Test Case 2 output (first 100 chars): %s...\n", content[:100])
	}

	// Cleanup
	// If <cwd>/fetched_content or <cwd>/custom_10mb.dat exists, remove them
	if _, err := os.Stat(defaultFileName); err == nil {
		cleanupFile(defaultFileName)
	}
	if _, err := os.Stat("custom_10mb.dat"); err == nil {
		cleanupFile("custom_10mb.dat")
	}
}
