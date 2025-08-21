//go:build !with_debugger

package goframework_debug

import (
	"sync"

	fwcommon "github.com/sbamboo/goframework/common"
)

const W_ProtocolVersion = 1

// Implements: fwcommon.DebuggerInterface
type DebugEmitter struct {
	// Config
	ProtocolVersion int

	// State and concurrency control
	Active     bool
	stateMutex sync.RWMutex
	active     bool

	// Measuring values
	LastKnownLatency int64
}

func NewDebugEmitter(config *fwcommon.FrameworkConfig) *DebugEmitter {
	return &DebugEmitter{
		ProtocolVersion:  W_ProtocolVersion,
		Active:           false,
		LastKnownLatency: -1,
	}
}

// Functions for fullfilling the fwcommon.DebuggerInterface
func (e *DebugEmitter) IsActive() bool {
	return e.Active
}
func (e *DebugEmitter) GetProtocolVersion() int {
	return e.ProtocolVersion
}

// Activate establishes the UDP connections for sending and receiving.
// It can be called multiple times but will only perform the activation logic once until Deactivate is called.
func (e *DebugEmitter) Activate() {
	e.stateMutex.Lock()
	defer e.stateMutex.Unlock()
	if !e.active {
		e.active = true
	}
}

// Deactivate closes the UDP connections.
// It can be called multiple times but will only perform the deactivation logic once until Activate is called.
func (e *DebugEmitter) Deactivate() {
	e.stateMutex.Lock()
	defer e.stateMutex.Unlock()
	if e.active {
		e.active = false
	}
}

// Send a raw message to the debugger via UDP.
// Returns an error if the Emitter is not active.
func (e *DebugEmitter) Send(msg fwcommon.JSONObject) error {
	return nil
}

// Register handler for incoming signal
func (e *DebugEmitter) RegisterFor(signal string, handler func(fwcommon.JSONObject)) {}

// Close ensures all resources are properly released. (Spec alias)
func (e *DebugEmitter) Close() {}

// Function that takes an error console-logs it and returns the error so its a drop in wrap around errors
func (e *DebugEmitter) LogThroughError(err error) error { return err }

// --- Recommended event handlers ---
func (e *DebugEmitter) OnPing(_ fwcommon.JSONObject) {}

// --- Specific signals ---

func (e *DebugEmitter) ConsoleLog(logType fwcommon.LogLevel, text string, object fwcommon.JSONObject) error {
	return nil
}
func (e *DebugEmitter) ElementsTree(tree fwcommon.Tree) error { return nil }
func (e *DebugEmitter) ElementsUpdate(element fwcommon.ElementIdentifier, props fwcommon.JSONObject) error {
	return nil
}
func (e *DebugEmitter) NetCreate(netevent fwcommon.NetworkEvent) error             { return nil }
func (e *DebugEmitter) NetUpdate(id string, props fwcommon.JSONObject) error       { return nil }
func (e *DebugEmitter) NetUpdateFull(netevent fwcommon.NetworkEvent) error         { return nil }
func (e *DebugEmitter) NetStop(id string) error                                    { return nil }
func (e *DebugEmitter) NetStopEvent(netevent fwcommon.NetworkEvent) error          { return nil }
func (e *DebugEmitter) NetStopWFUpdate(netevent fwcommon.NetworkEvent) error       { return nil }
func (e *DebugEmitter) UsageStat(stats fwcommon.JSONObject) error                  { return nil }
func (e *DebugEmitter) Ping() error                                                { return nil }
func (e *DebugEmitter) Pong() error                                                { return nil }
func (e *DebugEmitter) CustomEnvelope(kind string, body fwcommon.JSONObject) error { return nil }
