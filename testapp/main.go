package main

import (
	"fmt"
	"runtime"
	"strconv"

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

// -- Main Function --
func Ptr[T any](v T) *T { return &v }
func main() {
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

		LoggerFile:     nil,
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
	}
	fw := libfw.NewFramework(config)

	fmt.Println(fw)
}
