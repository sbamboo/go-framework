package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"time"

	libfw "github.com/sbamboo/goframework"

	_ "embed"
)

// -- Application Metadata --

// App metadata injected at compile time (these will be passed to NetUpdater)
var (
	AppVersion    = "0.0.0"
	AppUIND       = "0"
	AppChannel    = "default"
	AppBuildTime  = "unknown"
	AppCommitHash = "unknown"
	AppDeployURL  string
	AppGithubRepo = "" // If not provided this will be cast to *string nil later
	DebuggerHost  = ""
)

//go:embed signing/public.pem
var appPublicKey []byte

// -- Helpers --
func Ptr[T any](v T) *T { return &v }

func SetupFramework() *libfw.Framework {
	// Setup GoFramework
	var _AppGithubRepo *string
	if AppGithubRepo != "" {
		_AppGithubRepo = &AppGithubRepo
	} else {
		_AppGithubRepo = nil
	}

	AppUIND, err := strconv.Atoi(AppUIND)
	if err != nil {
		panic(fmt.Errorf("invalid AppUIND: %w", err))
	}

	config := &libfw.FrameworkConfig{
		DebugSendPort:          9000,
		DebugListenPort:        9001,
		DebugSendUsage:         true,
		DebugSendUsageInterval: 1000,
		DebugOverrideHost:      DebuggerHost,

		// LoggerFile is <built-executable-parent-directory>/app.log using os.Executable()
		LoggerFile:     Ptr(filepath.Join(filepath.Dir(func() string { exe, _ := os.Executable(); return exe }()), "app.log")),
		LoggerFormat:   nil,
		LoggerCallable: nil,

		NetFetchOptions: (&libfw.NetFetchOptions{}).Default(),
		UpdatorAppConfiguration: &libfw.UpdatorAppConfiguration{
			SemVer:           AppVersion,
			UIND:             AppUIND,
			Channel:          AppChannel,
			Released:         AppBuildTime,
			Commit:           AppCommitHash,
			PublicKeyPEM:     appPublicKey,
			DeployURL:        Ptr(AppDeployURL),
			GithubUpMetaRepo: _AppGithubRepo,
			Target:           fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH),
		},

		LogFrameworkInternalErrors: true,
		WriteDebugLogs:             true,
	}

	return libfw.NewFramework(config)
}

func GetJSON(v interface{}, indent ...any) ([]byte, error) {
	var ind any = false
	if len(indent) > 0 {
		ind = indent[0]
	}

	// Recursive helper to convert a struct to map[string]interface{}
	var structToMap func(interface{}) map[string]interface{}

	structToMap = func(v interface{}) map[string]interface{} {
		val := reflect.ValueOf(v)
		typ := reflect.TypeOf(v)

		if val.Kind() == reflect.Ptr {
			if val.IsNil() {
				// If nil pointer, return nil map
				return nil
			}
			val = val.Elem()
			typ = typ.Elem()
		}

		if val.Kind() != reflect.Struct {
			return nil
		}

		result := make(map[string]interface{})

		// Add struct fields
		for i := 0; i < typ.NumField(); i++ {
			field := typ.Field(i)
			if field.PkgPath != "" { // unexported
				continue
			}
			jsonKey := field.Name
			if tag, ok := field.Tag.Lookup("json"); ok {
				tagParts := strings.Split(tag, ",")
				if tagParts[0] != "" && tagParts[0] != "-" {
					jsonKey = tagParts[0]
				}
			}

			fieldVal := val.Field(i)

			// If field is struct or pointer to struct, recurse
			if fieldVal.Kind() == reflect.Struct || (fieldVal.Kind() == reflect.Ptr && !fieldVal.IsNil() && fieldVal.Elem().Kind() == reflect.Struct) {
				m := structToMap(fieldVal.Interface())
				if m != nil {
					result[jsonKey] = m
					continue
				}
			}

			result[jsonKey] = fieldVal.Interface()
		}

		// Add methods
		vVal := reflect.ValueOf(v)
		vType := reflect.TypeOf(v)
		for i := 0; i < vType.NumMethod(); i++ {
			method := vType.Method(i)
			if method.PkgPath != "" || method.Type.NumIn() != 1 || method.Type.NumOut() != 1 {
				continue
			}
			out := method.Func.Call([]reflect.Value{vVal})

			key := method.Name
			if strings.HasPrefix(key, "Get") && len(key) > 3 {
				key = strings.ToLower(key[:1]) + key[4:]
			}

			if _, exists := result[key]; !exists {
				// Handle nil pointer results: replace nil with "None"
				outVal := out[0]
				if outVal.Kind() == reflect.Ptr && outVal.IsNil() {
					result[key] = "None"
				} else {
					result[key] = outVal.Interface()
				}
			}
		}

		return result
	}

	mapped := structToMap(v)

	switch v := ind.(type) {
	case bool:
		if v {
			return json.MarshalIndent(mapped, "", "  ")
		} else {
			return json.Marshal(mapped)
		}
	case int:
		if v < 0 {
			return nil, errors.New("indent spaces cannot be negative")
		}
		spaces := strings.Repeat(" ", v)
		return json.MarshalIndent(mapped, "", spaces)
	default:
		return nil, errors.New("indent parameter must be bool or int")
	}
}

func beepMorse(code string) {
	unit := 150 // milliseconds for a dot
	freq := 750 // Hz

	for _, c := range code {
		switch c {
		case '.':
			Beep(uint32(freq), uint32(unit)) // dot
		case '-':
			Beep(uint32(freq), uint32(3*unit)) // dash
		}
		time.Sleep(time.Duration(unit) * time.Millisecond) // pause between symbols
	}
}

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

var marqueeState int
var marqueeDirection = 1
var myProgressor func(progressPtr libfw.NetworkProgressReportInterface, err error) = func(progressPtr libfw.NetworkProgressReportInterface, err error) {
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
	case libfw.NetStateWaiting, libfw.NetStatePaused:
		prefix = ColorGray
	case libfw.NetStateRetry:
		prefix = ColorYellow
	case libfw.NetStateEstablished, libfw.NetStateResponded:
		prefix = ColorBlue
	case libfw.NetStateTransfer:
		prefix = ColorMagenta
	case libfw.NetStateFinished:
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
	if event.EventState == libfw.NetStateFinished {
		fmt.Print("\n")
	}
}

// -- Main Function --
func main() {
	fw := SetupFramework()

	fw.Debugger.Activate()

	handleCommand := func(cmd string) *string {
		cmd = strings.TrimSpace(cmd)
		lct := strings.ToLower(cmd)

		if strings.HasPrefix(cmd, "morse:") {
			cmd = cmd[5:]
			beepMorse(cmd)

		} else if strings.HasPrefix(cmd, "sha256:") {
			cmd = cmd[6:]
			res := fw.Chck.HashStr(cmd, libfw.SHA256)
			return &res

		} else if strings.HasPrefix(cmd, "sha1:") {
			cmd = cmd[4:]
			res := fw.Chck.HashStr(cmd, libfw.SHA1)
			return &res

		} else if strings.HasPrefix(cmd, "crc32:") {
			cmd = cmd[5:]
			res := fw.Chck.HashStr(cmd, libfw.CRC32)
			return &res

		} else if strings.HasPrefix(cmd, "beep:") {
			cmd = cmd[5:] // remove "beep:"
			parts := strings.Split(cmd, ",")

			if len(parts) == 0 || parts[0] == "" {
				Beep(1000, 500)
			} else if len(parts) == 1 {
				num, err := strconv.Atoi(parts[0])
				if err != nil {
					fmt.Println("[ERR]:", err)
					return nil
				} else {
					Beep(uint32(num), 500)
				}
			} else {
				freq, err1 := strconv.Atoi(parts[0])
				dur, err2 := strconv.Atoi(parts[1])
				if err1 != nil || err2 != nil {
					fmt.Println("[ERR]:", err1, err2)
					return nil
				} else {
					Beep(uint32(freq), uint32(dur))
				}
			}

		} else if strings.HasPrefix(lct, "f:") || strings.HasPrefix(lct, "sf:") {
			parts := strings.SplitN(cmd[2:], ",", 2)
			if len(parts) != 2 {
				fmt.Println("[ERR] Invalid format. Use f:<METHOD>,<URL> or sf:<METHOD>,<URL>")
				return nil
			}

			_method := strings.ToUpper(strings.TrimSpace(parts[0]))
			method := libfw.MethodGet
			switch _method {
			case string(libfw.MethodConnect):
				method = libfw.MethodConnect
			case string(libfw.MethodDelete):
				method = libfw.MethodDelete
			case string(libfw.MethodGet):
				method = libfw.MethodGet
			case string(libfw.MethodHead):
				method = libfw.MethodHead
			case string(libfw.MethodPost):
				method = libfw.MethodPost
			case string(libfw.MethodPut):
				method = libfw.MethodPut
			case string(libfw.MethodPatch):
				method = libfw.MethodPatch
			case string(libfw.MethodOptions):
				method = libfw.MethodOptions
			case string(libfw.MethodTrace):
				method = libfw.MethodTrace
			}
			url := strings.TrimSpace(parts[1])
			stream := strings.HasPrefix(lct, "sf:")

			report, err := fw.Net.Fetch(
				method, url,
				stream, false, // not writing to file
				nil, // default path
				myProgressor,
				nil, nil, nil,
				(&libfw.NetFetchOptions{}).Default(),
			)
			if err != nil {
				fmt.Println("[ERR]", err)
				return nil
			}

			if !stream {
				content := *report.GetNonStreamContent()
				return &content
			} else {
				data, err := io.ReadAll(report) // read the full stream
				report.Close()
				if err != nil {
					fmt.Println("[ERR] reading stream:", err)
					return nil
				}

				contentStr := string(data) // convert bytes to string
				fmt.Println("Streamed fetch completed. Content length:", len(contentStr))
				fmt.Println("Content preview (first 500 chars):")
				if len(contentStr) > 500 {
					fmt.Println(contentStr[:500], "...")
				} else {
					fmt.Println(contentStr)
				}

				return &contentStr // return pointer to string if you want to propagate it
			}

		} else if strings.HasPrefix(lct, "ff:") || strings.HasPrefix(lct, "sff:") {
			parts := strings.SplitN(cmd[3:], ",", 3) // split into method, url, filename
			if len(parts) != 3 {
				fmt.Println("[ERR] Invalid format. Use ff:<METHOD>,<URL>,<FILENAME> or sff:<METHOD>,<URL>,<FILENAME>")
				return nil
			}

			_method := strings.ToUpper(strings.TrimSpace(parts[0]))
			method := libfw.MethodGet
			switch _method {
			case string(libfw.MethodConnect):
				method = libfw.MethodConnect
			case string(libfw.MethodDelete):
				method = libfw.MethodDelete
			case string(libfw.MethodGet):
				method = libfw.MethodGet
			case string(libfw.MethodHead):
				method = libfw.MethodHead
			case string(libfw.MethodPost):
				method = libfw.MethodPost
			case string(libfw.MethodPut):
				method = libfw.MethodPut
			case string(libfw.MethodPatch):
				method = libfw.MethodPatch
			case string(libfw.MethodOptions):
				method = libfw.MethodOptions
			case string(libfw.MethodTrace):
				method = libfw.MethodTrace
			}

			url := strings.TrimSpace(parts[1])
			filePath := strings.TrimSpace(parts[2])
			stream := strings.HasPrefix(lct, "sff:")

			_, err := fw.Net.Fetch(
				method, url,
				stream, true, // write to file
				&filePath, // target filename
				myProgressor,
				nil, nil, nil,
				(&libfw.NetFetchOptions{}).Default(),
			)
			if err != nil {
				fmt.Println("[ERR]", err)
				return nil
			}

		} else if lct == "beep" {
			Beep(1000, 500)

		} else if lct == "exit" {
			os.Exit(0)

		} else if lct == "ping" {
			fw.Debugger.Ping()

		} else {
			return &cmd
		}

		return nil
	}

	fw.Debugger.RegisterFor("console:in", func(msg libfw.JSONObject) {
		cmd, ok := msg["cmd"].(string)
		if ok {
			ret := handleCommand(cmd)
			if ret != nil {
				fmt.Println(">> " + *ret)
			}
		}
	})

	fw.Debugger.RegisterFor("misc:pong", func(msg libfw.JSONObject) {
		fmt.Println("Got pong!")
	})

	fw.Debugger.RegisterFor("misc:ping", func(msg libfw.JSONObject) {
		// fmt.Println("Got ping, sending pong!")
		fw.Debugger.OnPing(msg)
	})

	// descriptor := libfw.GetDescriptor()

	// jsonData, err := GetJSON(descriptor, true)
	// if err != nil {
	// 	panic(err)
	// }
	// os.Stdout.Write(jsonData)
	// fmt.Print("\n")
	// if err == nil {
	// 	fw.Log.Debug(string(jsonData))
	// }

	reader := bufio.NewReader(os.Stdin)
	for {
		fmt.Print(": ") // print prompt safely
		input, err := reader.ReadString('\n')
		if err != nil {
			continue
		}

		ret := handleCommand(input)
		if ret != nil {
			fw.Log.Debug(*ret)
		}
	}
}
