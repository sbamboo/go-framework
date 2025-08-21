package main

import (
	"bufio"
	"fmt"
	"os"
	"runtime"
	"strconv"
	"strings"

	"github.com/inconshreveable/go-update"
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

		LogFrameworkInternalErrors: true,
	}

	return libfw.NewFramework(config)
}

// -- Main Function --
func main() {
	fw := SetupFramework()

	fw.Debugger.Activate()

	upconf := fw.Update.GetUpdateConfig()

	// Main code
	fmt.Println("--- GoFramework Test App ---")
	fmt.Printf("Version: %s (UIND: %d)\n", upconf.SemVer, upconf.UIND)
	fmt.Printf("Channel: %s\n", upconf.Channel)
	fmt.Printf("Build Time: %s\n", upconf.Released)
	fmt.Printf("Commit Hash: %s\n", upconf.Commit)
	fmt.Printf("Running on: %s\n", upconf.Target)
	if upconf.GithubUpMetaRepo != nil {
		fmt.Printf("GitHub Repo: %s\n", *upconf.GithubUpMetaRepo)
	}

	// This initial check determines if an update is available for the *default* channel
	// or the channel initially set.
	latestRelease, err := fw.Update.GetLatestVersion()
	if err != nil {
		fmt.Printf("Error checking for updates: %v\n", err)
	} else if latestRelease != nil && latestRelease.UIND > upconf.UIND {
		fmt.Printf("\n--- Update Available! ---\n")
		fmt.Printf("New Version: %s (UIND: %d)\n", latestRelease.Semver, latestRelease.UIND)
		fmt.Printf("Notes: %s\n", latestRelease.Notes)
		fmt.Println("-------------------------\n")
	} else {
		fmt.Println("You are running the latest version for your channel.")
	}

	reader := bufio.NewReader(os.Stdin)
	for {
		fmt.Print("Enter channel name, 'update', or 'exit': ")
		input, _ := reader.ReadString('\n')
		input = strings.TrimSpace(input)

		if input == "exit" {
			break
		}

		if input == "update" {
			if latestRelease == nil || latestRelease.UIND <= upconf.UIND {
				fmt.Println("No update available or you are already on the latest version.")
				continue
			}
			fmt.Printf("Attempting to update to version %s...\n", latestRelease.Semver)
			err := fw.Update.PerformUpdate(latestRelease)
			if err != nil {
				fmt.Printf("Update failed: %v\n", err)
				if rerr := update.RollbackError(err); rerr != nil {
					fmt.Printf("Failed to rollback from bad update: %v\n", rerr)
				}
			} else {
				fmt.Println("Update successful! Please restart the application.")
				break // Exit after successful update to encourage restart
			}
		} else {
			// Update the updater's channel property for the current session
			upconf.Channel = input
			fmt.Printf("Switching to channel: %s\n", upconf.Channel)
			// Re-check for the latest release in the newly set channel
			latestRelease, err = fw.Update.GetLatestVersion()
			if err != nil {
				fmt.Printf("Error checking for updates in channel '%s': %v\n", upconf.Channel, err)
			} else if latestRelease != nil && latestRelease.UIND > upconf.UIND {
				fmt.Printf("\n--- Update Available for Channel %s! ---\n", upconf.Channel)
				fmt.Printf("New Version: %s (UIND: %d)\n", latestRelease.Semver, latestRelease.UIND)
				fmt.Printf("Notes: %s\n", latestRelease.Notes)
				fmt.Println("-----------------------------------------\n")
			} else {
				fmt.Printf("No newer version available in channel '%s'.\n", upconf.Channel)
			}
		}
	}
}
