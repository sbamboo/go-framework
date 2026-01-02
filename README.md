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

Updates are fetched/pulled from update **channels**, each channel have their own `uind`'s.<br>
The update system by default pulls from a *deploy.json* file, but if the channel name has prefix `git.` the update system fetches the *GithubUpMetaRepo* releases and finds ones with the tag `ci-git.<channel>-<uind>-<semver>` ex. `ci-git.commit-1-0.0.0`. And in releases finds `<app>-<semver>-<platform>-<arch>(.exe)` and `<app>-<semver>-<platform>-<arch>.sig`<br>
Another one is the `ugit.` prefix where we fetch *GithubUpMetaRepo* for releases that includes a yaml codeblock whos first line is `__upmeta__: "<upmeta-version>"`, then it parses out the meta information from the upmeta data format before matching to release files.

The platform descriptor is meant to be used internally by goframework and by external tools to get metadata and capabilities of the host. However the host machine information uses `github.com/shirou/gopsutil/v4` if that is not desired the `-tags no_gopsutil` can be added to skip that, note that it limits the host-machine information that can be retrieved through goframework.

## Networking / Fetch
When fetching with `stream=true` the networking module returns the `NetProgressReport` instantly and then fetch on read of the `NetProgressReport`. When debugging (and in general) remember to call `.Close()` or defer it, debug NetStop will ever only be called once closed.

# Testing
To make the code communicate with debuggers it must be built with the `with_debugger` ldflag, all testapp dev builds have it, when running tests add `-tags with_debugger`