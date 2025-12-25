const http = require("http");
const express = require("express");
const WebSocket = require("ws");
const path = require("path");
const { exec } = require("child_process");

const Debugger = require("./debugger");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve everything in /public
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

let debug = null;
let lastAttachedSignalReceiver = null; // Track the specific signalReceiver instance
const connectedClients = new Set(); // Store all active WebSocket connections

// Helper to log the debugger ws connections
function logDebuggerStatus(context = "OK") {
    const activeWs = connectedClients.size;
    console.log(`[DebuggerServer] WS.${context}, Active WebSocket clients: ${activeWs}`);
}

// This function now broadcasts to all connected clients.
const broadcastUDPToWebSockets = (msg) => {
    try {
        const data = JSON.parse(msg.toString());
        const messageToClients = JSON.stringify({
            event: "receive",
            msg: data
        });
        connectedClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageToClients);
            }
        });
        // console.log("[DebuggerServer] Forwarded (broadcasted):", data.signal || "UNKNOWN_SIGNAL");
    } catch (e) {
        console.warn("[DebuggerServer] Failed to parse UDP message for broadcast:", e);
    }
};

// Function to attach the UDP forwarder to the *current* debugger's signalReceiver
// This function needs to be called whenever `debug` is initialized or reconfigured
function attachDebuggerUDPListener() {
    if (debug && debug.signalReceiver && debug.signalReceiver !== lastAttachedSignalReceiver) {
        // If there was a previous signalReceiver, remove the listener from it
        if (lastAttachedSignalReceiver) {
            lastAttachedSignalReceiver.removeListener("message", broadcastUDPToWebSockets);
            console.log("[DebuggerServer] Removed listener from old signalReceiver.");
        }

        // Attach the listener to the new (or first) signalReceiver
        debug.signalReceiver.on("message", broadcastUDPToWebSockets);
        lastAttachedSignalReceiver = debug.signalReceiver;
        console.log("[DebuggerServer] Attached UDP broadcast listener to new signalReceiver.");
    }
}


wss.on("connection", (ws) => {
    console.log("[DebuggerServer] Browser connected via WebSocket");
    connectedClients.add(ws); // Add new client to the set
    logDebuggerStatus("NEW"); // Log status on new connection

    ws.on("message", (message) => {
        try {
            const msg = JSON.parse(message);
            const event = msg.event;

            if (event === "construct") {
                const { signalPort = 9000, commandPort = 9001 } = msg.params;
                if (!debug) {
                    debug = new Debugger(signalPort, commandPort);
                    console.log(`[DebuggerServer] Debugger instance created (${signalPort}, ${commandPort})`);
                    attachDebuggerUDPListener(); // Attach listener after first creation
                } else {
                    // If debugger exists, reconfigure. This will recreate internal UDP sockets.
                    // So we must re-attach the listener.
                    debug.Configure(signalPort, commandPort);
                    console.log(`[DebuggerServer] Debugger reconfigured to (${signalPort}, ${commandPort})`);
                    attachDebuggerUDPListener(); // Re-attach listener after reconfiguration
                }
            } else if (event === "configure" && debug) {
                // Explicit configure command
                debug.Configure(msg.params.signalPort, msg.params.commandPort);
                console.log(`[DebuggerServer] Debugger reconfigured`);
                attachDebuggerUDPListener(); // Re-attach listener after explicit reconfiguration
            } else if (event === "send" && debug) {
                debug.Send(msg.msg);
            } else if (event === "send_constructed" && debug) {
                debug.sendConstructed(msg.msg);
            }
        } catch (e) {
            console.error("[DebuggerServer] Failed to handle WebSocket message:", e);
        }
    });

    ws.on("close", () => {
        console.log("[DebuggerServer] WebSocket client disconnected");
        connectedClients.delete(ws); // Remove client from the set
        logDebuggerStatus("CLOSED"); // Log status on disconnect
    });

    ws.on("error", (err) => {
        console.error("[DebuggerServer] WebSocket client error:", err);
        connectedClients.delete(ws); // Ensure client is removed on error too
        logDebuggerStatus("ERROR"); // Log status on error/disconnect
    });
});


const PORT = 8080;
const HOST = "localhost";
server.listen(PORT, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`[DebuggerServer] Server running at ${url}`);

    // Open browser automatically
    const platform = process.platform;
    let command = "";

    if (platform === "darwin") command = `open ${url}`;
    else if (platform === "win32") command = `start ${url}`;
    else if (platform === "linux") command = `xdg-open ${url}`;

    if (command) {
        exec(command, (err) => {
            if (err) {
                console.error("[DebuggerServer] Failed to open browser:", err);
            }
        });
    } else {
        console.log("[DebuggerServer] Please open the browser manually:", url);
    }
});