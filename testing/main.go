package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strconv"
	"strings"
	"syscall"
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
		DebugSendPort:   9000,
		DebugListenPort: 9001,

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

var (
	modkernel32 = syscall.NewLazyDLL("kernel32.dll")
	procBeep    = modkernel32.NewProc("Beep")
)

func Beep(frequency, duration uint32) error {
	r, _, err := procBeep.Call(uintptr(frequency), uintptr(duration))
	if r == 0 {
		return err
	}
	return nil
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

// -- Main Function --
func main() {
	fw := SetupFramework()

	fw.Debugger.Activate()

	fw.Debugger.RegisterFor("console:in", func(msg libfw.JSONObject) {
		cmd, ok := msg["cmd"].(string)
		lct := strings.ToLower(strings.TrimSpace(cmd))
		if ok {
			if strings.HasPrefix(cmd, "morse:") {
				cmd = cmd[5:]
				beepMorse(cmd)
			} else if lct == "beep" {
				Beep(1000, 500)
			} else {
				fmt.Println(">> " + cmd)
			}
		}
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

	stat, err := libfw.GetUsageStats()
	if err == nil {
		// jsonData2, _ := GetJSON(stat, true)
		// if err == nil {
		// 	fw.Log.Debug(string(jsonData2))
		// }
		fw.Debugger.UsageStat(stat)
	}

	reader := bufio.NewReader(os.Stdin)
	for {
		fmt.Print(": ") // print prompt safely
		input, err := reader.ReadString('\n')
		if err != nil {
			continue
		}
		input = strings.TrimSpace(input)
		if input == "exit" {
			os.Exit(0)
		}
		fw.Log.Debug(fw.Chck.HashStr(input, libfw.SHA256))
	}
}
