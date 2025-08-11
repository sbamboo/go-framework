//go:build with_debugger

package goframework_debug

import (
	"encoding/json"
	"fmt"
	"net"
	"sync"
	"time"

	fwcommon "github.com/sbamboo/goframework/common"
)

const W_ProtocolVersion = 1

type DebugEmitter struct {
	// Config
	host            string
	config          *fwcommon.FrameworkConfig
	ProtocolVersion int

	// State and concurrency control
	Active         bool
	stateMutex     sync.RWMutex // Protects 'active', 'sendPort', 'listenPort'
	activateOnce   sync.Once    // Ensures activation logic runs only once initially
	deactivateOnce sync.Once    // Ensures deactivation logic runs only once per deactivation cycle

	// For sending signals (broadcast)
	signalOutConn     *net.UDPConn
	signalOutAddr     *net.UDPAddr
	signalOutChan     chan fwcommon.JSONObject // Channel for outgoing messages
	signalOutStopChan chan struct{}            // To signal the sender goroutine to stop
	signalOutWg       sync.WaitGroup           // To wait for the sender goroutine to exit

	// For receiving signals (listen)
	signalInConn     *net.UDPConn  // To signal the listener goroutine to stop
	signalInStopChan chan struct{} // To wait for the listener goroutine to exit
	signalInWg       sync.WaitGroup

	// Handlers for incoming signals
	handlers     map[string]func(fwcommon.JSONObject)
	handlerMutex sync.RWMutex

	// Measuring values
	LastKnownLatency int64
}

func NewDebugEmitter(config *fwcommon.FrameworkConfig) *DebugEmitter {
	return &DebugEmitter{
		host:   "127.0.0.1", // Static for localhost
		config: config,

		ProtocolVersion: W_ProtocolVersion,

		Active: false,

		handlers: make(map[string]func(fwcommon.JSONObject)),

		LastKnownLatency: -1,
	}
}

// activateInternal is the core logic for setting up network connections.
// Must be called with e.stateMutex locked.
func (e *DebugEmitter) activateInternal() {
	// If activate has been called we should do early return
	if e.Active {
		return
	}

	// Reset DeactivateOnce for the next deactivation cycle
	e.deactivateOnce = sync.Once{}

	// Setup for sending signals (broadcast to debugger)
	signalOutAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", e.host, e.config.DebugSendPort))
	if err != nil {
		return
	}
	signalOutConn, err := net.ListenUDP("udp", nil) // Listen on any available port for sending, we still need the addr for later when we write, but this makes sure we have a bound connection.
	if err != nil {
		return
	}

	// Setup for receiving signals (listen from debugger)
	signalInAddr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("%s:%d", e.host, e.config.DebugListenPort))
	if err != nil {
		signalOutConn.Close() // Clean up previously opened connection
		return
	}
	signalInConn, err := net.ListenUDP("udp", signalInAddr)
	if err != nil {
		signalOutConn.Close() // Clean up previously opened connection
		return
	}

	e.signalOutConn = signalOutConn
	e.signalOutAddr = signalOutAddr
	e.signalInConn = signalInConn
	e.Active = true
	e.signalInStopChan = make(chan struct{}) // Reset stop channel

	e.signalInWg.Add(1) // Increment wait group for the new goroutine
	go e.listenForIncomming()
}

// deactivateInternal is the core logic for tearing down network connections.
// Must be called with e.stateMutex locked.
func (e *DebugEmitter) deactivateInternal() {
	// If deactivate has been called we should do early return
	if !e.Active {
		return
	}

	// Reset ActivateOnce for the next activation cycle
	e.activateOnce = sync.Once{}

	// Signal the listener goroutine to stop
	if e.signalInStopChan != nil {
		close(e.signalInStopChan)
		// Wait for the goroutine to finish before closing connections
		e.signalInWg.Wait()
		e.signalInStopChan = nil // Mark as closed
	}

	if e.signalOutConn != nil {
		e.signalOutConn.Close()
		e.signalOutConn = nil
	}
	if e.signalInConn != nil {
		e.signalInConn.Close()
		e.signalInConn = nil
	}

	e.Active = false
}

// listenForIncomming handles incoming UDP datagrams as signals.
// This goroutine is started when Activate() is called and stopped when Deactivate() is called.
func (e *DebugEmitter) listenForIncomming() {
	defer e.signalInWg.Done() // Signal that this goroutine is done when it exits

	buffer := make([]byte, 4096) // Max UDP datagram size is around 65KB, 4KB is usually enough

	for {
		select {
		case <-e.signalInStopChan:
			return // Exit the goroutine
		default:
			// Set a read deadline to allow checking signalInStopChan periodically
			// or after a read error.
			e.signalInConn.SetReadDeadline(time.Now().Add(time.Second))
			n, _, err := e.signalInConn.ReadFromUDP(buffer)
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					continue // Timeout, check stop channel again
				}
				// If the connection is closed by Deactivate, ReadFromUDP will return an error.
				// Check if the stop channel has been closed to distinguish graceful shutdown.
				select {
				case <-e.signalInStopChan:
					return // Graceful shutdown
				default:
					// Sleep briefly to prevent busy loop on persistent errors
					time.Sleep(100 * time.Millisecond)
					continue
				}
			}

			if n == 0 {
				continue // No data
			}

			var msg fwcommon.JSONObject
			if err := json.Unmarshal(buffer[:n], &msg); err != nil {
				continue
			}

			sentVal, ok := msg["sent"]
			if ok {
				// Compare the sent timestamp with the current time to calculate latency
				if sentFloat, ok := sentVal.(float64); ok {
					sentMillis := int64(sentFloat)
					nowMillis := time.Now().UnixMilli()
					e.LastKnownLatency = nowMillis - sentMillis
				}
			}

			signal, ok := msg["signal"].(string)
			if !ok {
				continue
			}

			e.handlerMutex.RLock()
			handler, exists := e.handlers[signal]
			e.handlerMutex.RUnlock()
			if exists {
				go handler(msg) // Run handler in a goroutine to avoid blocking the read loop
			}
		}
	}
}

// Activate establishes the UDP connections for sending and receiving.
// It can be called multiple times but will only perform the activation logic once until Deactivate is called.
func (e *DebugEmitter) Activate() {
	e.stateMutex.Lock()
	defer e.stateMutex.Unlock()
	e.activateInternal()
}

// Deactivate closes the UDP connections.
// It can be called multiple times but will only perform the deactivation logic once until Activate is called.
func (e *DebugEmitter) Deactivate() {
	e.stateMutex.Lock()
	defer e.stateMutex.Unlock()
	e.deactivateInternal()
}

// Send a raw message to the debugger via UDP.
// Returns an error if the Emitter is not active.
func (e *DebugEmitter) Send(msg fwcommon.JSONObject) error {
	e.stateMutex.RLock()
	isActive := e.Active
	signalOutConn := e.signalOutConn
	signalOutAddr := e.signalOutAddr
	e.stateMutex.RUnlock()

	if !isActive || signalOutConn == nil || signalOutAddr == nil {
		return fmt.Errorf("emitter is not active, cannot send signal")
	}

	msg["protocol"] = e.ProtocolVersion
	msg["sent"] = time.Now().UnixMilli()

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	// UDP is connectionless, we just send to the target address without caring if there is a debugger connected
	_, err = signalOutConn.WriteToUDP(data, signalOutAddr)
	if err != nil {
		return fmt.Errorf("failed to send UDP datagram: %w", err)
	}
	return nil
}

// Register handler for incoming signal
func (e *DebugEmitter) RegisterFor(signal string, handler func(fwcommon.JSONObject)) {
	e.handlerMutex.Lock()
	defer e.handlerMutex.Unlock()
	e.handlers[signal] = handler
}

// Close ensures all resources are properly released. (Spec alias)
func (e *DebugEmitter) Close() {
	e.Deactivate()
}

// --- Recommended event handlers ---
func (e *DebugEmitter) OnPing(_ fwcommon.JSONObject) {
	e.Pong()
}

// --- Specific signals ---

func (e *DebugEmitter) ConsoleLog(logType, text string, object fwcommon.JSONObject) error {
	return e.Send(fwcommon.JSONObject{
		"signal": "console:log",
		"type":   logType,
		"text":   text,
		"object": object,
	})
}

func (e *DebugEmitter) ElementsTree(tree fwcommon.Tree) error {
	return e.Send(fwcommon.JSONObject{
		"signal": "elements:tree",
		"tree":   tree,
	})
}

func (e *DebugEmitter) ElementsUpdate(element fwcommon.ElementIdentifier, props fwcommon.JSONObject) error {
	return e.Send(fwcommon.JSONObject{
		"signal":     "elements:update",
		"element":    element,
		"properties": props,
	})
}

func (e *DebugEmitter) NetCreate(netevent fwcommon.NetworkEvent) error {
	payload := fwcommon.JSONObject{}
	payload["signal"] = "net:start"
	payload["properties"] = netevent
	return e.Send(payload)
}

func (e *DebugEmitter) NetUpdate(id string, props fwcommon.JSONObject) error {
	return e.Send(fwcommon.JSONObject{
		"signal":     "net:update",
		"id":         id,
		"properties": props,
	})
}

func (e *DebugEmitter) NetUpdateFull(netevent fwcommon.NetworkEvent) error {
	return e.Send(fwcommon.JSONObject{
		"signal":     "net:update",
		"id":         netevent.ID,
		"properties": netevent,
	})
}

func (e *DebugEmitter) NetStop(id string) error {
	return e.Send(fwcommon.JSONObject{
		"signal": "net:stop",
		"id":     id,
	})
}

func (e *DebugEmitter) NetStopEvent(netevent fwcommon.NetworkEvent) error {
	return e.Send(fwcommon.JSONObject{
		"signal": "net:stop",
		"id":     netevent.ID,
	})
}

func (e *DebugEmitter) UsageStat(stats fwcommon.JSONObject) error {
	return e.Send(fwcommon.JSONObject{
		"signal": "usage:stats",
		"stats":  stats,
	})
}

func (e *DebugEmitter) Ping() error {
	return e.Send(fwcommon.JSONObject{
		"signal": "misc:ping",
	})
}

func (e *DebugEmitter) Pong() error {
	return e.Send(fwcommon.JSONObject{
		"signal": "misc:pong",
	})
}

func (e *DebugEmitter) CustomEnvelope(kind string, body fwcommon.JSONObject) error {
	return e.Send(fwcommon.JSONObject{
		"signal": "custom:envelope",
		"kind":   kind,
		"body":   body,
	})
}
