package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

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

// -- Main Function --
func main() {
	fw := SetupFramework()

	fw.Debugger.Activate()

	reader := bufio.NewReader(os.Stdin)

	for {
		fmt.Print(": ")
		input, err := reader.ReadString('\n')
		if err != nil {
			continue
		}

		input = strings.TrimSpace(input) // remove newline

		if input == "exit" {
			break
		}

		fw.Log.Debug(fw.Chck.HashStr(input, libfw.SHA256))
	}
}
