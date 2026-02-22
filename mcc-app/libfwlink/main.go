package libfwlink

import (
	_ "embed"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strconv"

	libfw "github.com/sbamboo/goframework"
)

// -- Application Metadata --

// App metadata injected at compile time
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

	netOptions := (&libfw.NetFetchOptions{}).Default()
	netOptions.DebuggerInterval = 10

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

		NetFetchOptions: netOptions,
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

		LogFrameworkInternalErrors: true, // Change on prod?
		WriteDebugLogs:             true, // Change on prod?
	}

	return libfw.NewFramework(config)
}