class Debugger {
    /**
     * Create a new Debugger instance.
     * @param {object} params Configuration params like signalPort, commandPort, etc.
     * @param {string} wsUrl WebSocket URL (default: ws://localhost:8080)
     */
    constructor(params = {}, wsUrl = "ws://localhost:8080") {
        this.ProtocolVersion = 1;
        this.ws = new WebSocket(wsUrl);
        this.params = params;
        this.eventHandlers = new Map();
        this.signalHandlers = new Map();
        this.incomingListeners = [];
        this.outgoingListeners = [];
        this.lastKnownLatency = -1;

        this.ws.addEventListener("open", () => {
            console.log("[DebuggerFrontend] WebSocket connected");
            this.sendEvent("construct", {
                params: this.params
            });
        });

        this.ws.addEventListener("message", (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.hasOwnProperty("sent")) {
                    this.lastKnownLatency = Date.now() - parseInt(data.sent, 10);
                }

                this.incomingListeners.forEach((cb) => cb(data));

                if (data.event === "receive" && data.msg && data.msg.signal) {
                    const signalHandler = this.signalHandlers.get(data.msg.signal);
                    if (signalHandler) {
                        signalHandler(data.msg);
                        data["__handled__"] = true;
                    }
                }

                const generalHandler = this.eventHandlers.get(data.event);
                if (generalHandler) {
                    generalHandler(data);
                } else {
                    console.log("[DebuggerFrontend] Unhandled event:", data.event, data);
                }
            } catch (e) {
                console.warn("[DebuggerFrontend] Failed to parse incoming message", e);
            }
        });

        this.ws.addEventListener("close", () => {
            console.log("[DebuggerFrontend] WebSocket disconnected");
        });

        this.ws.addEventListener("error", (err) => {
            console.error("[DebuggerFrontend] WebSocket error:", err);
        });
    }

    /**
     * Send a generic event to the server.
     */
    sendEvent(event, payload = {}) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                event,
                ...payload
            }));
        } else {
            console.warn("[DebuggerFrontend] WebSocket not ready");
        }
    }

    /**
     * Register a callback for a specific server event
     * @param {string} signal
     * @param {function} callback
     */
    RegisterForServerEvent(event, callback) {
        this.eventHandlers.set(event, callback);
    }

    RegisterForIncoming(callback) {
        this.incomingListeners.push(callback);
    }

    RegisterForOutgoing(callback) {
        this.outgoingListeners.push(callback);
    }

    sendConstructed(payload) {
        this.sendEvent("send_constructed", {
            msg: payload
        }); // Use the 'send_constructed' since we added protocol+sent
        this.outgoingListeners.forEach((cb) =>
            cb({
                event: "send",
                msg: payload
            }),
        );
    }

    /**
     * Send a raw message to the server's debugger.
     */
    Send(msg) {
        const payload = {
            protocol: this.ProtocolVersion,
            sent: Date.now(),
            ...msg,
        };
        this.sendEvent("send_constructed", {
            msg: payload
        }); // Use the 'send_constructed' since we added protocol+sent
        this.outgoingListeners.forEach((cb) =>
            cb({
                event: "send",
                msg: payload
            }),
        );
    }

    /**
     * Reconfigure debugger on the server.
     */
    Configure(signalPort, commandPort) {
        this.sendEvent("configure", {
            params: {
                signalPort,
                commandPort
            },
        });
    }

    /**
     * Register a callback for a specific signal in debugger protocol.
     * @param {string} signal
     * @param {function} callback
     */
    RegisterFor(signal, callback) {
        this.signalHandlers.set(signal, callback);
    }

    /**
     * Recomendation implementation of onPing
     */
    OnPing = (msg) => {
        this.Pong();
    };
    // Arrow function to bind this to the invokating instance else one could use <instance>.OnPing.bind(<instance>)

    /**
     * Send a console command to the emitter.
     */
    ConsoleIn(cmd, obj = null) {
        this.Send({
            signal: "console:in",
            cmd: cmd,
            object: obj,
        });
    }

    /**
     * Modify a property on a debugged element.
     */
    ElementsMod(element, property, value) {
        this.Send({
            signal: "elements:mod",
            element,
            property,
            value,
        });
    }

    /**
     * Send a pong response signal.
     */
    Pong() {
        this.Send({
            signal: "misc:pong",
        });
    }
}

/**
 * @typedef {Object} CpuTimesStat
 * @property {number} user
 * @property {number} system
 * @property {number} idle
 * @property {number} nice
 * @property {number} iowait
 * @property {number} irq
 * @property {number} softirq
 * @property {number} steal
 * @property {number} guest
 * @property {number} guest_nice
 */

/**
 * @typedef {Object} RlimitStat
 * @property {number} resource
 * @property {string} name
 * @property {number} soft
 * @property {number} hard
 * @property {number} used
 */

/**
 * @typedef {Object} ConnectionStat
 * @property {number} fd
 * @property {number} family
 * @property {number} type
 * @property {string} laddr_ip
 * @property {number} laddr_port
 * @property {string} raddr_ip
 * @property {number} raddr_port
 * @property {string} status
 * @property {number} pid
 */

class UsageStatObject {
    /**
     * @type {number | undefined} Process ID (PID).
     */
    pid;

    /**
     * @type {string | undefined} Name of the process.
     */
    name;

    /**
     * @type {string[] | undefined} Current status of the process (e.g., 'running', 'sleeping').
     */
    status;

    /**
     * @type {string | undefined} Command line used to start the process.
     */
    cmdline;

    /**
     * @type {string[] | undefined} Command line arguments as a slice.
     */
    args;

    /**
     * @type {string | undefined} Path to the executable.
     */
    exe;

    /**
     * @type {string | undefined} Current working directory of the process.
     */
    cwd;

    /**
     * @type {number | undefined} Process creation time in Unix milliseconds.
     */
    create_time;

    /**
     * @type {string | undefined} Username of the process owner.
     */
    username;

    /**
     * @type {number[] | undefined} User IDs of the process.
     */
    uids;

    /**
     * @type {number[] | undefined} Group IDs of the process.
     */
    gids;

    /**
     * @type {number[] | undefined} Supplementary group IDs of the process.
     */
    groups;

    /**
     * @type {number | undefined} CPU utilization percentage.
     */
    cpu_percent;

    /**
     * @type {number | undefined} Memory utilization percentage.
     */
    memory_percent;

    /**
     * @type {number | undefined} Resident Set Size (RSS) memory in bytes.
     */
    memory_rss;

    /**
     * @type {number | undefined} Virtual Memory Size (VMS) in bytes.
     */
    memory_vms;

    /**
     * @type {number | undefined} Bytes read by the process (I/O).
     */
    io_read_bytes;

    /**
     * @type {number | undefined} Bytes written by the process (I/O).
     */
    io_write_bytes;

    /**
     * @type {number | undefined} Number of file descriptors opened by the process.
     */
    num_fds;

    /**
     * @type {number | undefined} Number of threads used by the process.
     */
    num_threads;

    /**
     * @type {number | undefined} Alias for num_threads.
     */
    thread_count;

    /**
     * @type {Object.<string, CpuTimesStat> | undefined} CPU times for individual threads, mapped by thread ID.
     */
    threads;

    /**
     * @type {number | undefined} Number of voluntary context switches.
     */
    num_ctx_switches_voluntary;

    /**
     * @type {number | undefined} Number of involuntary context switches.
     */
    num_ctx_switches_involuntary;

    /**
     * @type {number | undefined} Count of open files by the process.
     */
    open_files_count;

    /**
     * @type {string[] | undefined} List of paths to open files by the process.
     */
    open_files;

    /**
     * @type {number | undefined} Nice value (priority) of the process.
     */
    nice;

    /**
     * @type {string | undefined} Terminal associated with the process.
     */
    terminal;

    /**
     * @type {number | undefined} Parent Process ID (PPID).
     */
    ppid;

    /**
     * @type {number | undefined} Alias for ppid.
     */
    parent_pid;

    /**
     * @type {RlimitStat[] | undefined} Resource limits applied to the process.
     */
    rlimit;

    /**
     * @type {ConnectionStat[] | undefined} Network connections associated with the process.
     */
    connections;

    /**
     * @type {number | undefined} Number of logical CPU cores on the system.
     */
    system_cpu_cores;

    /**
     * @type {number | undefined} Total available memory on the system in bytes.
     */
    "max#memory_total";

    /**
     * @type {number | undefined} Maximum possible I/O read bytes (placeholder).
     */
    "max#io_read_bytes";

    /**
     * @type {number | undefined} Maximum possible I/O write bytes (placeholder).
     */
    "max#io_write_bytes";

    /**
     * @type {number | undefined} Maximum possible number of file descriptors (placeholder).
     */
    "max#num_fds";

    /**
     * @type {number | undefined} Maximum possible number of threads (placeholder).
     */
    "max#num_threads";

    /**
     * Creates an instance of ProcessInfo from a plain JavaScript object.
     * @param {Object.<string, any>} data - The raw JSON object received from the Go backend.
     */
    constructor(data) {
        if (typeof data !== "object" || data === null) {
            console.warn("ProcessInfo constructor received non-object data:", data);
            return;
        }

        // Iterate over the keys in the input data object and assign them
        // directly to the instance. This handles presence/absence dynamically.
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                // Special handling for nested objects/arrays if you wanted to hydrate them
                // into their own classes. For simplicity, we're keeping them as plain objects/arrays.
                // If 'threads' should be a map of CpuTimesStat instances, you'd do:
                // if (key === 'threads' && typeof data[key] === 'object' && data[key] !== null) {
                //   this.threads = Object.fromEntries(
                //     Object.entries(data[key]).map(([id, cpuTimes]) => [id, new CpuTimesStat(cpuTimes)])
                //   );
                // } else if (key === 'rlimit' && Array.isArray(data[key])) {
                //   this.rlimit = data[key].map(rl => new RlimitStat(rl));
                // } // ... and so on for other nested structs
                // else {
                this[key] = data[key];
                // }
            }
        }
    }

    // You can add methods here to encapsulate logic related to process info
    getMemoryUsageMB() {
        if (this.memory_rss) {
            return this.memory_rss / (1024 * 1024);
        }
        return 0;
    }

    // Example: Check if the process is running based on status (simple example)
    isRunning() {
        return this.status?.includes("running") || false;
    }

    // --- Helper Methods for Formatting ---

    /**
     * Formats bytes into a human-readable string (e.g., KB, MB, GB).
     * @param {number | undefined} bytes
     * @returns {string}
     */
    _formatBytes(bytes) {
        if (bytes === undefined || bytes === null) {
            return "N/A";
        }
        if (bytes === 0) {
            return "0 Bytes";
        }
        const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + sizes[i];
    }

    /**
     * Finds an rlimit by its name.
     * @param {string} name
     * @returns {RlimitStat | undefined}
     */
    _getRlimitByName(name) {
        return this.rlimit?.find((r) => r.name === name);
    }

    /**
     * Formats milliseconds into a human-readable duration.
     * @param {number | undefined} ms
     * @returns {string}
     */
    _formatMsToDuration(ms) {
        if (ms === undefined || ms === null) return "N/A";
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        let parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours % 24 > 0) parts.push(`${hours % 24}h`);
        if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
        if (seconds % 60 > 0 || parts.length === 0)
            parts.push(`${seconds % 60}s`); // Ensure at least seconds
        return parts.join(" ");
    }

    /**
     * Formats a duration in seconds into a human-readable string.
     * Used for CPU time limits.
     * @param {number | undefined} seconds
     * @returns {string}
     */
    _formatSecondsToDuration(seconds) {
        if (seconds === undefined || seconds === null) return "N/A";
        if (seconds === -1) return "Unlimited";

        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        let parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours % 24 > 0) parts.push(`${hours % 24}h`);
        if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
        if (seconds % 60 > 0 || parts.length === 0)
            parts.push(`${seconds % 60}s`);
        return parts.join(" ");
    }

    // --- Computation and Formatting Methods ---

    /**
     * Gets process CPU usage.
     * @returns {string} Formatted CPU usage.
     */
    getFormattedCpuUsage() {
        if (this.cpu_percent !== undefined) {
            return `CPU: ${this.cpu_percent.toFixed(2)}%`;
        }
        return "CPU: N/A";
    }

    /**
     * Gets process memory usage formatted clearly.
     * Prioritizes RSS against total, then shows VMS separately.
     * @returns {string}
     */
    getFormattedMemoryUsage() {
        const rss = this.memory_rss;
        const vms = this.memory_vms;
        const totalMem = this["max#memory_total"];
        const memPercent = this.memory_percent; // This is usually RSS-based

        let parts = [];

        // Main memory usage (RSS)
        if (rss !== undefined) {
            let rssStr = `Physical (RSS): ${this._formatBytes(rss)}`;
            if (totalMem !== undefined && totalMem > 0) {
                rssStr += ` / ${this._formatBytes(totalMem)}`;
            }
            if (memPercent !== undefined) {
                rssStr += ` (${memPercent.toFixed(2)}%)`;
            }
            parts.push(rssStr);
        } else {
            parts.push("Physical (RSS): N/A");
        }

        // Virtual memory usage (VMS) as a separate line
        if (vms !== undefined) {
            parts.push(`Virtual (VMS): ${this._formatBytes(vms)}`);
        }

        if (parts.length === 0) {
            return "Memory: N/A";
        }

        // Join with a newline for clarity if both RSS and VMS are present
        return `Memory:\n  ${parts.join("\n  ")}`;
    }

    /**
     * Gets formatted file descriptor usage.
     * @returns {string}
     */
    getFormattedFdUsage() {
        const numFds = this.num_fds;
        const nofileRlimit = this._getRlimitByName("NOFILE");
        const maxFdsSystem = this["max#num_fds"];

        let usageStr = "File Descriptors: ";
        if (numFds !== undefined) {
            usageStr += `${numFds}`;
        } else {
            usageStr += "N/A";
        }

        let limitValue;
        let limitType = "";

        if (nofileRlimit && nofileRlimit.soft !== undefined) {
            limitValue = nofileRlimit.soft;
            limitType = " (soft limit)";
        } else if (maxFdsSystem !== undefined && maxFdsSystem !== 0) {
            limitValue = maxFdsSystem;
            limitType = " (system max estimate)";
        }

        if (limitValue !== undefined) {
            usageStr += ` / ${
        limitValue === -1 ? "Unlimited" : limitValue
      }${limitType}`;
            if (
                numFds !== undefined &&
                limitValue !== -1 &&
                limitValue > 0
            ) {
                const percent = (numFds / limitValue) * 100;
                usageStr += ` (${percent.toFixed(2)}%)`;
            }
        }
        return usageStr;
    }

    /**
     * Gets formatted thread usage.
     * @returns {string}
     */
    getFormattedThreadUsage() {
        const numThreads = this.num_threads;
        const nprocRlimit = this._getRlimitByName("NPROC");
        const maxThreadsSystem = this["max#num_threads"];

        let usageStr = "Threads: ";
        if (numThreads !== undefined) {
            usageStr += `${numThreads}`;
        } else {
            usageStr += "N/A";
        }

        let limitValue;
        let limitType = "";

        if (nprocRlimit && nprocRlimit.soft !== undefined) {
            limitValue = nprocRlimit.soft;
            limitType = " (soft limit)";
        } else if (maxThreadsSystem !== undefined && maxThreadsSystem !== 0) {
            limitValue = maxThreadsSystem;
            limitType = " (system max estimate)";
        }

        if (limitValue !== undefined) {
            usageStr += ` / ${
        limitValue === -1 ? "Unlimited" : limitValue
      }${limitType}`;
            if (
                numThreads !== undefined &&
                limitValue !== -1 &&
                limitValue > 0
            ) {
                const percent = (numThreads / limitValue) * 100;
                usageStr += ` (${percent.toFixed(2)}%)`;
            }
        }
        return usageStr;
    }

    /**
     * Gets formatted I/O usage.
     * @returns {string}
     */
    getFormattedIoUsage() {
        const readBytes = this.io_read_bytes;
        const writeBytes = this.io_write_bytes;
        const maxReadBytes = this["max#io_read_bytes"];
        const maxWriteBytes = this["max#io_write_bytes"];

        let ioParts = [];
        if (readBytes !== undefined) {
            let readStr = `Read: ${this._formatBytes(readBytes)}`;
            if (maxReadBytes !== undefined && maxReadBytes !== 0) {
                readStr += ` / ${this._formatBytes(maxReadBytes)}`;
            }
            ioParts.push(readStr);
        }
        if (writeBytes !== undefined) {
            let writeStr = `Write: ${this._formatBytes(writeBytes)}`;
            if (maxWriteBytes !== undefined && maxWriteBytes !== 0) {
                writeStr += ` / ${this._formatBytes(maxWriteBytes)}`;
            }
            ioParts.push(writeStr);
        }

        if (ioParts.length > 0) {
            return `I/O: ${ioParts.join(", ")}`;
        }
        return "I/O: N/A";
    }

    /**
     * Gets formatted CPU time limit from rlimit.
     * @returns {string}
     */
    getFormattedCpuTimeLimit() {
        const cpuRlimit = this._getRlimitByName("CPU");
        if (cpuRlimit && cpuRlimit.soft !== undefined) {
            return `CPU Time Limit: ${this._formatSecondsToDuration(
        cpuRlimit.soft,
      )} (soft)`;
        }
        return "CPU Time Limit: N/A";
    }

    /**
     * Generates a comprehensive formatted text report for the process.
     * @returns {string}
     */
    getFormattedReport() {
        const lines = [];

        lines.push(`--- Process Report for PID: ${this.pid || "N/A"} ---`);
        lines.push(`Name: ${this.name || "N/A"}`);
        lines.push(`Status: ${this.status?.join(", ") || "N/A"}`);
        // Only one CreateTime line
        lines.push(
            `Create Time: ${
        this.create_time
          ? new Date(this.create_time).toLocaleString()
          : "N/A"
      }`,
        );
        lines.push(`Username: ${this.username || "N/A"}`);
        lines.push(`Exe: ${this.exe || "N/A"}`);
        lines.push(`Args: ${this.args?.join(", ") || "N/A"}`);
        lines.push(`Command: ${this.cmdline || "N/A"}`);
        lines.push(`CWD: ${this.cwd || "N/A"}`);

        // New fields
        if (this.uids !== undefined) {
            lines.push(`UIDs: ${this.uids.join(", ")}`);
        }
        if (this.gids !== undefined) {
            lines.push(`GIDs: ${this.gids.join(", ")}`);
        }
        if (this.groups !== undefined) {
            lines.push(`Groups: ${this.groups.join(", ")}`);
        }
        // Check for ppid first, as parent_pid is an alias
        if (this.ppid !== undefined) {
            lines.push(`Parent PID: ${this.ppid}`);
        } else if (this.parent_pid !== undefined) {
            lines.push(`Parent PID (Alias): ${this.parent_pid}`);
        }
        if (this.nice !== undefined) {
            lines.push(`Nice Value: ${this.nice}`);
        }
        if (this.terminal !== undefined) {
            lines.push(`Terminal: ${this.terminal}`);
        }

        lines.push("\n--- Resource Usage ---");
        lines.push(this.getFormattedCpuUsage());
        lines.push(this.getFormattedMemoryUsage()); // Includes VMS now, formatted differently
        lines.push(this.getFormattedFdUsage());
        lines.push(this.getFormattedThreadUsage());
        lines.push(this.getFormattedIoUsage()); // Now shows /max for I/O

        lines.push("\n--- Resource Limits (from rlimit) ---");
        if (this.rlimit && this.rlimit.length > 0) {
            this.rlimit.forEach((rl) => {
                let limitStr = `${rl.name}: Soft=${this._formatSecondsToDuration(
          rl.soft,
        )}, Hard=${this._formatSecondsToDuration(rl.hard)}`;
                if (rl.name === "CPU") {
                    limitStr += ` (Used: ${this._formatSecondsToDuration(rl.used)})`;
                } else {
                    limitStr += ` (Used: ${rl.used})`;
                }
                lines.push(limitStr);
            });
        } else {
            lines.push("No rlimit information available.");
        }

        lines.push("\n--- Detailed Information ---");
        lines.push(
            `Open Files Count: ${
        this.open_files_count !== undefined ? this.open_files_count : "N/A"
      }`,
        );
        if (this.open_files && this.open_files.length > 0) {
            lines.push("  Open File Paths:");
            this.open_files.forEach((file) => lines.push(`    - ${file}`));
        }

        lines.push(
            `Context Switches (Vol/Invol): ${
        this.num_ctx_switches_voluntary !== undefined
          ? this.num_ctx_switches_voluntary
          : "N/A"
      }/${
        this.num_ctx_switches_involuntary !== undefined
          ? this.num_ctx_switches_involuntary
          : "N/A"
      }`,
        );
        lines.push(
            `System CPU Cores: ${
        this.system_cpu_cores !== undefined ? this.system_cpu_cores : "N/A"
      }`,
        );

        // Only show individual thread CPU times if `threads` object is present
        if (this.threads && Object.keys(this.threads).length > 0) {
            lines.push("\n--- Per-Thread CPU Times ---");
            for (const threadId in this.threads) {
                if (Object.prototype.hasOwnProperty.call(this.threads, threadId)) {
                    const threadCpu = this.threads[threadId];
                    lines.push(
                        `  Thread ID ${threadId}: User=${threadCpu.user.toFixed(
              3,
            )}s, System=${threadCpu.system.toFixed(3)}s, Idle=${threadCpu.idle.toFixed(3)}s`,
                    );
                }
            }
        }

        if (this.connections && this.connections.length > 0) {
            lines.push("\n--- Network Connections ---");
            this.connections.forEach((conn, index) => {
                lines.push(`  Connection ${index + 1}:`);
                lines.push(`    FD: ${conn.fd}`);
                lines.push(`    Family: ${conn.family}, Type: ${conn.type}`);
                lines.push(`    Local: ${conn.laddr_ip}:${conn.laddr_port}`);
                if (conn.raddr_ip && conn.raddr_port) {
                    lines.push(`    Remote: ${conn.raddr_ip}:${conn.raddr_port}`);
                }
                lines.push(`    Status: ${conn.status}`);
                if (conn.pid !== undefined) {
                    lines.push(`    PID: ${conn.pid}`);
                }
            });
        }

        return lines.join("\n");
    }
}

window.Debugger = Debugger;