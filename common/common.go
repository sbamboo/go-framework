package goframework_common

type FrameworkConfig struct {
	DebugSendPort   int // Only used if compiled with 'with_debugger' tag
	DebugListenPort int // Only used if compiled with 'with_debugger' tag
}

type JSONObject = map[string]any
type Tree = []any
type ElementIdentifier = any // string | int[]

type NetworkEvent struct {
	ID string `json:"id"`
}

type DebuggerInterface interface {
	// Common
	CustomEnvelope(string, JSONObject) error
	// FwLog
	ConsoleLog(string, string, JSONObject) error
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
