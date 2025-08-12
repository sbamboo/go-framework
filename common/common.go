package goframework_common

import (
	"context"
	"net/http"
	"time"
)

// MARK: Helpers
func Ptr[T any](v T) *T { return &v }

// MARK: Config
type FrameworkConfig struct {
	DebugSendPort   int // Only used if compiled with 'with_debugger tag
	DebugListenPort int // Only used if compiled with 'with_debugger' tag

	LoggerFile     *string                      // Path to the log file
	LoggerFormat   *string                      // Format for log messages, auto %s is replaced with: timestamp, level, message; so three %s are required
	LoggerCallable func(LogLevel, string) error // Custom log handler, if set, LoggerFile and LoggerFormat are ignored

	NetFetchOptions *NetFetchOptions // Default options for network fetches, if nil, uses NetFetchOptions{}.Default()
}

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
	ID        string
	Context   *string
	Initiator *ElementIdentifier
	Method    HttpMethod
	Priority  NetPriority

	// Infra
	NetFetchOptions *NetFetchOptions

	// Meta
	MetaBufferSize      int // <0 for unknown    // Dupe of NetFetchOptions.BufferSize if they are set
	MetaIsStream        bool
	MetaAsFile          bool
	MetaDirection       NetDirection
	MetaSpeed           float64 // <0 for unknown, in Mbit/s
	MetaTimeToCon       time.Duration
	MetaTimeToFirstByte time.Duration
	MetaGotFirstResp    time.Time
	MetaRetryAttempt    int

	// Connection
	Status      int
	ClientIP    string
	Remote      string
	RemoteIP    string
	Protocol    string
	Scheme      string
	ContentType string
	Headers     *http.Header // Dupe of NetFetchOptions.Headers if they are set
	RespHeaders *http.Header

	// Status
	Transferred int64
	Size        int64

	// Event
	EventState       NetState
	EventSuccess     bool
	EventStepCurrent int
	EventStepMax     *int
}

type ProgressorFn func(progress NetworkProgressReportInterface, err error)

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

//MARK: Interfaces

type DebuggerInterface interface {
	// Common
	IsActive() bool
	GetProtocolVersion() int
	CustomEnvelope(string, JSONObject) error
	// FwLog
	ConsoleLog(LogLevel, string, JSONObject) error
	// FwNet
	NetCreate(NetworkEvent) error
	NetUpdate(string, JSONObject) error
	NetUpdateFull(NetworkEvent) error // Wrapper for NetUpdate taking FwNetworkEvent.* -> props
	NetStop(string) error
	NetStopEvent(NetworkEvent) error // Wrapper for NetStop taking FwNetworkEvent.ID
}

type FetcherInterface interface {
	Fetch(url string) (any, error)
}

type NetworkProgressReportInterface interface {
	GetNetworkEvent() *NetworkEvent
	GetResponse() *http.Response
	GetNonStreamContent() *string // Nill if stream
	Read(p []byte) (n int, err error)
	Close() error
}

//MARK: Full Class-likes

type NetFetchOptions struct {
	BufferSize         int          // Negative numbers defaults it to 32k
	TotalSizeOverride  int64        // -2 is "unchanged" -1 is "unknown"
	Headers            *http.Header // nil to not override
	Client             *http.Client // nil to not override
	InsecureSkipVerify bool
	Timeout            time.Duration // Negative numbers mean no timeout
	Context            *context.Context
	RetryTimeouts      int           // The number of times to retry a connection when it timeouts, 0 or less to not
	DialTimeout        time.Duration // Negative numbers mean no timeout, DialTimeout does not trigger Retry
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
