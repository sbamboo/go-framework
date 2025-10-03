# GoFramework
A framework to act as the basis of my golang applications, handling network fetches, debugging/logging and implementing an update system.

### This is under very early development and meant for my own projects, so not recommeded to be used :P
<br><br>

# Project Notes
- Library is recommended to be imported as `fwlib`
- All common definitions are in /common which should be imported as `fwcommon`
- /common provides a `Ptr(any) &any` helper
- Inside /common is the framework-wide counter, *(Ex. used to label network events)*, accessible as `fwcommon.FrameworkIndexes`
    - `netevent` is for network events
- Inside /common is a handler for interal flags accessible at `fwcommon.FrameworkFlags`
    - `net.internal_error_log`, default `true`, Enables /net internal logging of errors *(Should be toggled when calling subparts internally and externally handling logging, to avoid double-logged errors)*
    - `update.internal_error_log`, default `true`, Enables /update internal logging of errors *(Should be toggled when calling subparts internally and externally handling logging, to avoid double-logged errors)*

## Update system
To make the update system work there must be an update config defined.
```go
libfw.UpdatorAppConfiguration{
    SemVer:           "0.0.0",
    UIND:             "0",
    Channel:          "default",
    Released:         "2025-08-20T17:54:09Z",
    Commit:           "unknown",
    PublicKeyPEM:     "...",
    DeployURL:        Ptr("example.com/deploy.json"),
    GithubUpMetaRepo: "owner/repo",
    Target:           fmt.Sprintf("%s-%s", runtime.GOOS, runtime.GOARCH),
}
```
Though its recomended to embed appPublicKey instead of adding it in code, example:
```go
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

libfw.UpdatorAppConfiguration{
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
```