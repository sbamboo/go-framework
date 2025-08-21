const dgram = require("dgram");

// --- Types ----

/**
 * @typedef {Object<string, any>} JSONObject
 */

/**
 * @typedef {Array<any>} Tree
 */

/**
 * @typedef {string | Array<number>} ElementIdentifier
 */


// --- Main Class ----

class Debugger {
    constructor(signalPort = 9000, commandPort = 9001, host = "127.0.0.1") {
        this.ProtocolVersion = 1;

        this.signalPort = signalPort;
        this.commandPort = commandPort;
        this.host = host;

        this.lastKnownLatency = -1;

        this.signalReceiver = null;
        this.commandSender = null;
        this.signalHandlers = new Map();

        this.Configure(signalPort, commandPort);
    }

    /**
     * Reconfigure the debugger with new ports.
     * @param {number} signalPort 
     * @param {number} commandPort 
     */
    Configure(signalPort, commandPort) {
        // Cleanup existing sockets
        if (this.signalReceiver) this.signalReceiver.close();
        if (this.commandSender) this.commandSender.close();

        this.signalPort = signalPort;
        this.commandPort = commandPort;

        // --- Setup Signal Receiver ---
        this.signalReceiver = dgram.createSocket("udp4");

        this.signalReceiver.on("error", (err) => {
            console.error(`[Debugger] Signal receiver error:\n${err.stack}`);
            this.signalReceiver.close();
        });

        this.signalReceiver.on("message", (msg, rinfo) => {
            try {
                const data = JSON.parse(msg.toString());

                if (data.hasOwnProperty("sent")) {
                    this.lastKnownLatency = Date.now() - parseInt(data.sent, 10)
                }

                console.log(`[Debugger] Signal received from ${rinfo.address}:${rinfo.port}:`, data);

                const handler = this.signalHandlers.get(data.signal);
                if (handler) {
                    handler(data);
                }
            } catch (e) {
                console.warn(`[Debugger] Failed to parse signal: ${msg.toString()}, Error: ${e.message}`);
            }
        });

        this.signalReceiver.on("listening", () => {
            const address = this.signalReceiver.address();
            console.log(`[Debugger] Debugger listening for signals on ${address.address}:${address.port}`);
        });

        this.signalReceiver.bind(this.signalPort, this.host);

        // --- Setup Command Sender ---
        this.commandSender = dgram.createSocket("udp4");

        this.commandSender.on("error", (err) => {
            console.error(`[Debugger] Command sender error:\n${err.stack}`);
            this.commandSender.close();
        });

        this.commandSender.on("listening", () => {
            const address = this.commandSender.address();
            console.log(`[Debugger] Command sender bound on ${address.address}:${address.port} (sending to ${this.host}:${this.commandPort})`);
        });

        this.commandSender.bind(0, this.host); // ephemeral port
    }

    /**
     * Send a command.
     * Automatically includes `protocol` and `sent` fields.
     * @param {object} msg 
     */
    Send(msg) {
        const payload = {
            "protocol": this.ProtocolVersion,
            "sent": Date.now(),
            ...msg,
        };

        const buffer = Buffer.from(JSON.stringify(payload));
        this.commandSender.send(buffer, this.commandPort, this.host, (err) => {
            if (err) {
                console.error(`[Debugger] Failed to send command: ${err.message}`);
            } else {
                console.log(`[Debugger] Signal sent: ${msg.signal || "[no signal]"}`);
            }
        });
    }

    /**
     * Send a command that already includes `protocol` and `sent` fields.
     * @param {object} payload 
     */
    sendConstructed(payload) {

        const buffer = Buffer.from(JSON.stringify(payload));
        this.commandSender.send(buffer, this.commandPort, this.host, (err) => {
            if (err) {
                console.error(`[Debugger] Failed to send command: ${err.message}`);
            } else {
                console.log(`[Debugger] Signal sent: ${payload.signal || "[no signal]"}`);
            }
        });
    }

    /**
     * Register a callback for a specific incoming signal.
     * @param {string} signal 
     * @param {function} callback 
     */
    RegisterFor(signal, callback) {
        this.signalHandlers.set(signal, callback);
    }

    /**
     * Recomendation implementation of onPing
     */
    OnPing(msg) {
        this.Pong();
    }

    // --- Specific signals ---

    /**
     * Send a console command to the emitter.
     * @param {string} cmd The command string.
     * @param {object|null} obj Optional payload object.
     */
    ConsoleIn(cmd, obj = null) {
        this.Send({
                "signal": "console:in",
                "cmd": cmd,
                "object": obj,
        });
    }

    /**
     * 
     * @param {ElementIdentifier} element
     * @param {string} property
     * @param {*} value
     */
    ElementsMod(element, property, value) {
        this.Send({
            "signal": "elements:mod",
            "element": element,
            "property": property,
            "value": value
        })
    }

    /**
     * Send a pong response signal.
     */
    Pong() {
        this.sendConstructed({
            "signal": "misc:pong"
        })
    }
}

module.exports = Debugger;