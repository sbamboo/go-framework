package goframework_common

import (
	"context"
	"io"
	"net/http"
	"time"
)

// MARK: Config
type FrameworkConfig struct {
	DebugSendPort   int // Only used if compiled with 'with_debugger tag
	DebugListenPort int // Only used if compiled with 'with_debugger' tag

	LoggerFile     *string                      // Path to the log file
	LoggerFormat   *string                      // Format for log messages, auto %s is replaced with: timestamp, level, message; so three %s are required
	LoggerCallable func(LogLevel, string) error // Custom log handler, if set, LoggerFile and LoggerFormat are ignored

	NetFetchOptions *NetFetchOptions // Default options for network fetches, if nil, uses NetFetchOptions{}.Default()

	UpdatorAppConfiguration *UpdatorAppConfiguration

	LogFrameworkInternalErrors bool // Toggles log.LogThroughError used by .net and .update
}

// MARK: Helpers
func Ptr[T any](v T) *T { return &v }

type FrameworkIndexHandler map[string]int

func (indh *FrameworkIndexHandler) GetIndex(ctx string) int {
	if ind, ok := (*indh)[ctx]; ok {
		return ind
	}
	return -1 // Not found
}
func (indh *FrameworkIndexHandler) IncrIndex(ctx string) {
	if ind, ok := (*indh)[ctx]; ok {
		(*indh)[ctx] = ind + 1
	} else {
		(*indh)[ctx] = 0
	}
}
func (indh *FrameworkIndexHandler) ResetIndex(ctx string) {
	(*indh)[ctx] = 0
}
func (indh *FrameworkIndexHandler) ResetAll() {
	for k := range *indh {
		(*indh)[k] = 0
	}
}
func (indh *FrameworkIndexHandler) GetNewOfIndex(ctx string) int {
	indh.IncrIndex(ctx)
	return indh.GetIndex(ctx)
}

var FrameworkIndexes = FrameworkIndexHandler{
	"netevent": 0,
}

type FrameworkFlagHandler map[string]bool

func (flagh *FrameworkFlagHandler) Enable(flag string) {
	(*flagh)[flag] = true
}
func (flagh *FrameworkFlagHandler) Disable(flag string) {
	(*flagh)[flag] = false
}
func (flagh *FrameworkFlagHandler) IsEnabled(flag string) bool {
	if enabled, ok := (*flagh)[flag]; ok {
		return enabled
	}
	return false // Not found, default to false
}

var FrameworkFlags = FrameworkFlagHandler{
	"net.internal_error_log":    true,
	"update.internal_error_log": true,
}

// MARK: Types
type JSONObject = map[string]any
type Tree = []any
type ElementIdentifier = any // string | int[]

type NetDirection string

const (
	NetOutgoing NetDirection = "outgoing"
	NetIncoming NetDirection = "incoming"
)

type NetState string

const (
	NetStateWaiting     NetState = "waiting"
	NetStatePaused      NetState = "paused"
	NetStateRetry       NetState = "retry"
	NetStateEstablished NetState = "established"
	NetStateResponded   NetState = "responded"
	NetStateTransfer    NetState = "transfer"
	NetStateFinished    NetState = "finished"
)

type NetPriority string

const (
	NetPriorityUnset NetPriority = "unset"
)

type HttpMethod string

const (
	MethodGet     HttpMethod = "GET"
	MethodHead    HttpMethod = "HEAD"
	MethodPost    HttpMethod = "POST"
	MethodPut     HttpMethod = "PUT"
	MethodPatch   HttpMethod = "PATCH"
	MethodDelete  HttpMethod = "DELETE"
	MethodConnect HttpMethod = "CONNECT"
	MethodOptions HttpMethod = "OPTIONS"
	MethodTrace   HttpMethod = "TRACE"
)

type NetworkEvent struct {
	// Identifier
	ID        string             `json:"id"`
	Context   *string            `json:"context,omitempty"`
	Initiator *ElementIdentifier `json:"initiator,omitempty"`
	Method    HttpMethod         `json:"method"`
	Priority  NetPriority        `json:"priority"`

	// Infra
	NetFetchOptions *NetFetchOptions `json:"-"` // Always omitted from JSON

	// Meta
	MetaBufferSize      int           `json:"meta_buffer_size"` // <0 for unknown    // Dupe of NetFetchOptions.BufferSize if they are set
	MetaIsStream        bool          `json:"meta_is_stream"`
	MetaAsFile          bool          `json:"meta_as_file"`
	MetaDirection       NetDirection  `json:"meta_direction"`
	MetaSpeed           float64       `json:"meta_speed"` // <0 for unknown, in Mbit/s
	MetaTimeToCon       time.Duration `json:"meta_time_to_con"`
	MetaTimeToFirstByte time.Duration `json:"meta_time_to_first_byte"`
	MetaGotFirstResp    time.Time     `json:"meta_got_first_resp"`
	MetaRetryAttempt    int           `json:"meta_retry_attempt"`

	// Connection
	Status      int          `json:"status"`
	ClientIP    string       `json:"client_ip"`
	Remote      string       `json:"remote"`
	RemoteIP    string       `json:"remote_ip"`
	Protocol    string       `json:"protocol"`
	Scheme      string       `json:"scheme"`
	ContentType string       `json:"content_type"`
	Headers     *http.Header `json:"headers,omitempty"` // Dupe of NetFetchOptions.Headers if they are set
	RespHeaders *http.Header `json:"resp_headers,omitempty"`

	// Status
	Transferred int64 `json:"transferred"`
	Size        int64 `json:"size"`

	// Event
	EventState       NetState `json:"event_state"`
	EventSuccess     bool     `json:"event_success"`
	EventStepCurrent *int     `json:"event_step_current,omitempty"`
	EventStepMax     *int     `json:"event_step_max,omitempty"`
}

type ProgressorFn func(progressPtr NetworkProgressReportInterface, err error)

type LogLevel int

const (
	DEBUG LogLevel = iota
	INFO
	WARN
	ERROR
)

func (l LogLevel) String() string {
	switch l {
	case DEBUG:
		return "DEBUG"
	case INFO:
		return "INFO"
	case WARN:
		return "WARN"
	case ERROR:
		return "ERROR"
	default:
		return "UNKNOWN"
	}
}

type UpdatorAppConfiguration struct {
	SemVer           string
	UIND             int
	Channel          string
	Released         string
	Commit           string
	PublicKeyPEM     []byte
	DeployURL        *string
	GithubUpMetaRepo *string // New field for GitHub repo (e.g., "owner/repo")
	Target           string
	GhMetaFetcher    GithubUpdateFetcherInterface // Auto Filled
}

type UpdateReleaseData struct {
	Tag      string        `json:"tag"`
	Notes    string        `json:"notes"`
	Released string        `json:"released"`
	UpMeta   *UpdateUpMeta `json:"upmeta"` // Pointer to allow for releases without upmeta
}

// UpMeta represents the __upmeta__ YAML structure found in release bodies.
type UpdateUpMeta struct {
	UpMetaVer string                      `yaml:"__upmeta__" json:"__upmeta__"`
	Format    int                         `yaml:"format" json:"format"`
	Uind      int                         `yaml:"uind" json:"uind"`
	Semver    string                      `yaml:"semver" json:"semver"`
	Channel   string                      `yaml:"channel" json:"channel"`
	Sources   map[string]UpdateSourceInfo `yaml:"sources" json:"sources"`
}

// SourceInfo holds details about a specific update source (e.g., a binary for a platform-arch).
// This struct serves as the single source of truth for update file metadata,
// used within both UpMeta and NetUpReleaseInfo.
type UpdateSourceInfo struct {
	URL                 string  `yaml:"url,omitempty" json:"url"`
	Checksum            string  `yaml:"checksum" json:"checksum"`
	Signature           *string `yaml:"signature" json:"signature"` // Pointer to allow omitempty/null
	SignatureBytes      []byte
	IsPatch             bool    `yaml:"is_patch" json:"is_patch"`
	PatchFor            *int    `yaml:"patch_for" json:"patch_for"`
	PatchChecksum       *string `yaml:"patch_checksum" json:"patch_checksum"`
	PatchSignature      *string `yaml:"patch_signature" json:"patch_signature"`
	PatchSignatureBytes []byte
	PatchURL            *string `yaml:"patch_url,omitempty" json:"patch_url"`
	Filename            string  `yaml:"filename,omitempty" json:"filename"`
	PatchAsset          *string `yaml:"patch_asset,omitempty" json:"patch_asset"` // Only used in UpMeta parsing
}

// GithubReleaseAssets represents a GitHub release with fields relevant for UpMeta processing.
type GithubReleaseAssets struct {
	TagName  string        `json:"tag_name"`
	Body     string        `json:"body"`
	Assets   []GithubAsset `json:"assets"`
	Released string        `json:"published_at"`
}

// GithubAsset represents a release asset from the GitHub API relevant for UpMeta.
type GithubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Digest             string `json:"digest"`
}

//MARK: Interfaces

type DebuggerInterface interface {
	// Common
	IsActive() bool
	GetProtocolVersion() int
	CustomEnvelope(string, JSONObject) error
	LogThroughError(error) error
	// FwLog
	ConsoleLog(LogLevel, string, JSONObject) error
	// FwNet
	NetCreate(NetworkEvent) error
	NetUpdate(string, JSONObject) error
	NetUpdateFull(NetworkEvent) error // Wrapper for NetUpdate taking FwNetworkEvent.* -> props
	NetStop(string) error
	NetStopEvent(NetworkEvent) error    // Wrapper for NetStop taking FwNetworkEvent.ID
	NetStopWFUpdate(NetworkEvent) error // Similar to sending both .NetUpdateFull and .NetStop

}

type FetcherInterface interface {
	Fetch(method HttpMethod, url string, stream bool, file bool, fileout *string, progressor ProgressorFn, body io.Reader, contextID *string, initiator *ElementIdentifier, options *NetFetchOptions) (NetworkProgressReportInterface, error)

	AutoFetch(method HttpMethod, url string, stream bool, file bool, fileout *string, body io.Reader) (NetworkProgressReportInterface, error)

	GET(url string, stream bool, file bool, fileout *string) (NetworkProgressReportInterface, error)
	POST(url string, stream bool, file bool, fileout *string, body io.Reader) (NetworkProgressReportInterface, error)
	PUT(url string, stream bool, file bool, fileout *string, body io.Reader) (NetworkProgressReportInterface, error)
	PATCH(url string, stream bool, file bool, fileout *string, body io.Reader) (NetworkProgressReportInterface, error)
	DELETE(url string, stream bool, file bool, fileout *string, body io.Reader) (NetworkProgressReportInterface, error)
	HEAD(url string, stream bool, file bool, fileout *string) (NetworkProgressReportInterface, error)
	OPTIONS(url string, stream bool, file bool, fileout *string, body io.Reader) (NetworkProgressReportInterface, error)

	FetchBody(url string) (NetworkProgressReportInterface, error)
	StreamBody(url string) (NetworkProgressReportInterface, error)
	FetchFile(url string, fileout *string) (NetworkProgressReportInterface, error)
	StreamFile(url string, fileout *string) (NetworkProgressReportInterface, error)
}

type NetworkProgressReportInterface interface {
	GetNetworkEvent() *NetworkEvent
	GetResponse() *http.Response
	GetNonStreamContent() *string // Nill if stream
	Read(p []byte) (n int, err error)
	Close() error
}

type GithubUpdateFetcherInterface interface {
	FetchUpMetaReleases() ([]UpdateReleaseData, error)
	FetchAssetReleases() ([]UpdateReleaseData, error)
	//parseAssetReleaseForMeta(tagName string) (*UpdateUpMeta, error)
	//fetchReleases() ([]GithubReleaseAssets, error)
	//fetchFileContent(url string) (string, error)
	//parseReleaseBodyForUpMeta(body string) (string, *UpdateUpMeta, error)
	//findAssetURL(assets []GithubAsset, name string) *string
}

type LoggerInterface interface {
	Log(LogLevel, string) error
	Debug(string) error
	Info(string) error
	Warn(string) error
	Error(string) error
	LogThroughError(error) error
}

//MARK: Full Class-likes

type NetFetchOptions struct {
	BufferSize            int              `json:"buffersize"`                // Negative numbers defaults it to 32k
	TotalSizeOverride     int64            `json:"total_size_override"`       // -2 is "unchanged" -1 is "unknown"
	Headers               *http.Header     `json:"headers,omitempty"`         // nil to not override
	Client                *http.Client     `json:"_go_http_client,omitempty"` // nil to not override
	InsecureSkipVerify    bool             `json:"insecure_skip_verify"`
	Timeout               time.Duration    `json:"duration"` // Negative numbers mean no timeout
	Context               *context.Context `json:"_go_http_context,omitempty"`
	RetryTimeouts         int              `json:"retry_timeouts"`          // The number of times to retry a connection when it timeouts, 0 or less to not
	DialTimeout           time.Duration    `json:"dial_timeout"`            // Negative numbers mean no timeout, DialTimeout does not trigger Retry
	ResolveAdditionalInfo bool             `json:"resolve_additional_info"` // Also true when a debugger is active
}

// Default all values to a sensible empty: BuffSize=32k, SizeOvr:No, Headers:UseDefault, Client:UseBuiltin, InsecureSkipVerify:false, Timeout:No, Context:No, RetryTimeouts:No, DialTimeout:No
func (op *NetFetchOptions) Empty() *NetFetchOptions {
	op.BufferSize = 32 * 1024
	op.TotalSizeOverride = -2
	op.Headers = nil
	op.Client = nil
	op.InsecureSkipVerify = false
	op.Timeout = -1
	op.Context = nil
	op.RetryTimeouts = -1
	op.DialTimeout = -1
	return op
}

// Defaults all values to sensible defaults: BuffSize=32k, SizeOvr:No, Headers:UseDefault, Client:UseBuiltin, InsecureSkipVerify:false, Timeout:30s, Context:No, RetryTimeouts:2, DialTimeout:5s
func (op *NetFetchOptions) Default() *NetFetchOptions {
	op.BufferSize = 32 * 1024
	op.TotalSizeOverride = -2
	op.Headers = nil
	op.Client = nil
	op.InsecureSkipVerify = false
	op.Timeout = 30
	op.Context = nil
	op.RetryTimeouts = 2
	op.DialTimeout = 5
	return op
}
