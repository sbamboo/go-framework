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

wss.on("connection", (ws) => {
    console.log("[DebuggerServer] Browser connected via WebSocket");

    ws.on("message", (message) => {
        try {
            const msg = JSON.parse(message);
            const event = msg.event

            if (event === "construct") {
                const { signalPort = 9000, commandPort = 9001 } = msg.params;
                debug = new Debugger(signalPort, commandPort);
                console.log(`[DebuggerServer] Debugger instance created (${signalPort}, ${commandPort})`);
            } else if (event === "configure" && debug) {
                debug.Configure(msg.params.signalPort, msg.params.commandPort);
                console.log(`[DebuggerServer] Debugger reconfigured`);
            } else if (event === "send" && debug) {
                debug.Send(msg.msg);
            } else if (event === "send_constructed" && debug) {
                debug.sendConstructed(msg.msg);
            }
        } catch (e) {
            console.error("[DebuggerServer] Failed to handle WebSocket message:", e);
        }
    });

    // Forward UDP messages to WebSocket
    const forwardUDPToWebSocket = (msg) => {
        try {
            const data = JSON.parse(msg.toString());
            ws.send(JSON.stringify({
                event: "receive",
                msg: data
            }));
        } catch (e) {
            console.warn("[DebuggerServer] Failed to parse UDP message", e);
        }
    };

    const attachUDPForwarder = () => {
        if (debug && debug.signalReceiver) {
            // Remove all previous listeners before adding a new one
            debug.signalReceiver.removeAllListeners("message");
            debug.signalReceiver.on("message", forwardUDPToWebSocket);
        } else {
            setTimeout(attachUDPForwarder, 100);
        }
    };
    attachUDPForwarder();

    ws.on("close", () => {
        console.log("[DebuggerServer] WebSocket client disconnected");

        if (debug && debug.signalReceiver) {
            debug.signalReceiver.removeListener("message", forwardUDPToWebSocket);
        }
    });
});

const PORT = 8080;
const HOST = "localhost"
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
