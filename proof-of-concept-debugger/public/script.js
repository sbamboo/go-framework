// Ensure Debugger class is available via window.Debugger as per debugger_wrapper.js
// And UsageStatObject from debugger_wrapper.js is also available

const logArea = document.getElementById("console-log");
const input = document.getElementById("console-input");
const inputRaw = document.getElementById("console-input-raw");
const statusBar = document.getElementById("status-bar");
const processStatsOutput = document.getElementById("process-stats-output");
const aboutProtocolVer = document.getElementById("about-value-protocol-ver");

// Global instance of the debugger, so it can be accessed by new buttons/functions
const debuggerInstance = new Debugger();
window.debuggerInstance = debuggerInstance; // Expose for inline HTML or console access
aboutProtocolVer.innerText = debuggerInstance.ProtocolVersion;

// --- Tab Management Logic ---
const tabs = document.querySelectorAll(".tab");
const tabContents = document.querySelectorAll(".tab-content");

function activateTab(tabId) {
    tabs.forEach((tab) => tab.classList.remove("active"));
    tabContents.forEach((content) => (content.style.display = "none"));

    const clickedTab = document.getElementById(tabId);
    if (clickedTab) {
        clickedTab.classList.add("active");
        const targetContentId = clickedTab.dataset.tabTarget;
        const targetContent = document.getElementById(targetContentId);
        if (targetContent) {
            targetContent.style.display = "block"; // Show the target content
        }
    }
}

// Attach click listeners to tabs
tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
        activateTab(tab.id);
    });
});

// Activate a tab based on URL parameter or default to Console
document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    if (tabParam) {
        const targetTab = document.getElementById(`${tabParam}-tab`);
        if (targetTab) {
            activateTab(targetTab.id);
        } else {
            activateTab("console-tab"); // Fallback to console if invalid tab in URL
        }
    } else {
        activateTab("console-tab"); // Activate the Console tab by default on load
    }
});

// --- Debugger Event Handling ---

// Initial status bar update
debuggerInstance.ws.addEventListener("open", () => {
    statusBar.textContent = "Debugger Status: 🟢Connected";
});

debuggerInstance.ws.addEventListener("close", () => {
    statusBar.textContent = "Debugger Status: 🔴Disconnected";
});

debuggerInstance.ws.addEventListener("error", (err) => {
    statusBar.textContent = `Debugger Status: Error - ${err.message || err}`;
});

debuggerInstance.RegisterFor("misc:ping", debuggerInstance.OnPing);

debuggerInstance.RegisterFor("usage:stats", (msg) => {
    console.log("[Usage Stats Received]"); // Debug log
    try {
        console.log(msg);
        const statsObject = new UsageStatObject(msg.stats);
        // Display the formatted report in the Process & Usage tab
        processStatsOutput.textContent = statsObject.getFormattedReport();
    } catch (e) {
        console.error("Error processing usage stats:", e);
        processStatsOutput.textContent = `Error processing usage stats: ${e.message}`;
    }
});

debuggerInstance.RegisterForIncoming((event) => {
    let logMessage = "";
    switch (event.event) {
        case "receive":
            toDisp = event.msg;
            if (event.msg.signal) {
                if (event.msg.signal === "usage:stats") {
                    toDisp = JSON.parse(JSON.stringify(event.msg));
                    toDisp.stats = "...";
                } else if (event.msg.signal === "elements:tree") {
                    toDisp = JSON.parse(JSON.stringify(event.msg));
                    toDisp.tree = "...";
                } else if (event.msg.signal === "console:log") {
                    toDisp = JSON.parse(JSON.stringify(event.msg));
                    toDisp.text = "...";
                }
            }
            logMessage = `>> [Event:Receive] ${JSON.stringify(toDisp)}\n`;
            break;
        case "construct":
            logMessage = `>> [Event:Construct] ${JSON.stringify(event.params)}\n`;
            break;
        case "configure":
            logMessage = `>> [Event:Configure] ${JSON.stringify(event.params)}\n`;
            break;
        case "send":
            // Outgoing messages are also caught by RegisterForOutgoing, avoid double logging for 'send'
            // This 'send' event from incoming would be if the server echoes our 'send' command back.
            // If `sendEvent` triggers an incoming "send" due to server echo, handle it here
            // but typically outgoing is better handled by RegisterForOutgoing.
            break;
        default:
            logMessage = `>> [Event:Unknown/Incoming] ${JSON.stringify(event)}\n`;
            break;
    }
    if (logMessage) {
        logArea.innerHTML += logMessage + "\n";
        logArea.scrollTop = logArea.scrollHeight;
    }
});

debuggerInstance.RegisterForOutgoing((event) => {
    let logMessage = "";
    switch (event.event) {
        case "send":
            logMessage = `<< [Event:Send] ${JSON.stringify(event.msg)}\n`;
            break;
        default:
            logMessage = `<< [Event:Unknown/Outgoing] ${JSON.stringify(event)}\n`;
            break;
    }
    if (logMessage) {
        logArea.innerHTML += logMessage;
        logArea.scrollTop = logArea.scrollHeight;
    }
});

input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        const text = input.value.trim();
        if (text) {
            debuggerInstance.ConsoleIn(text);
            input.value = "";
        }
    }
});

inputRaw.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        const text = inputRaw.value.trim();
        if (text) {
            try {
                debuggerInstance.Send(JSON.parse(text));
                inputRaw.value = "";
            } catch (e) {}
        }
    }
});

debuggerInstance.RegisterFor("console:log", (msg) => {
    // msg.type is "debug", "info", "warn", "error", encoded as string or int: 0, 1, 2, 3
    // type check msg.type
    if (!msg.type) {
        msg.type = "info"; // Default to info if no type is provided
    }
    if (typeof msg.type === "number") {
        switch (msg.type) {
            case 0:
                msg.type = "debug";
                break;
            case 1:
                msg.type = "info";
                break;
            case 2:
                msg.type = "warn";
                break;
            case 3:
                msg.type = "error";
                break;
            default:
                msg.type = "info"; // Default to info for unknown types
        }
    }

    // Format the log message with colors debug=gray, info=unchanged, warn=orange, error=red
    let color = null;
    switch (msg.type) {
        case "debug":
            color = "gray";
            break;
        case "info":
            break;
        case "warn":
            color = "orange";
            break;
        case "error":
            color = "red";
            break;
        default:
            break;
    }

    // msg.object is null or should be ensured to be a JSON-string
    if (msg.object) {
        if (typeof msg.object === "object") {
            try {
                msg.object = JSON.stringify(msg.object, null, 2); // Pretty print JSON
            } catch (e) {
                console.error("Error stringifying object:", e);
                msg.object = null;
            }
        } else if (typeof msg.object !== "string") {
            // Pretty print the JSON by string->object->pretty_string
            try {
                msg.object = JSON.stringify(JSON.parse(msg.object), null, 2); // Pretty print JSON
            } catch (e) {
                console.error("Error prettying json string:", e);
                msg.object = null;
            }
        }
    }

    let logMessage = `[Console:Log ${msg.type.toUpperCase()}] ${msg.text} ${msg.object ? `\n${msg.object}` : ""}\n`;
    if (color) {logMessage = `<span style="color: ${color};">${logMessage}</span>`;}
    logArea.innerHTML += logMessage;
});

// --- network tab ---
const networkTable = document.getElementById("network-table");
const networkTableHead = document.querySelector("#network-table thead");
const networkTableBody = document.querySelector("#network-table tbody");
const clearAllBtn = document.getElementById("clear-all");
const clearStoppedBtn = document.getElementById("clear-stopped");
const clearActiveBtn = document.getElementById("clear-active");

const networkEvents = new Map(); // id -> data object

// --- Column Visibility Logic ---
let hiddenColumns = new Set();
const columnHeaders = Array.from(
    networkTableHead.querySelectorAll("th"),
).map((th) => th.textContent);

function updateURLParams() {
    const urlParams = new URLSearchParams(window.location.search);
    if (hiddenColumns.size > 0) {
        urlParams.set("nethidecolumns", Array.from(hiddenColumns).join(","));
    } else {
        urlParams.delete("nethidecolumns");
    }
    const newUrl = `${window.location.pathname}?${urlParams.toString()}${
        window.location.hash
    }`;
    window.history.replaceState({ path: newUrl }, "", newUrl);
}

function applyColumnVisibility() {
    const headers = networkTableHead.querySelectorAll("th");
    const rows = networkTableBody.querySelectorAll("tr");

    headers.forEach((header, index) => {
        const headerText = header.textContent;
        if (hiddenColumns.has(headerText)) {
            header.style.display = "none";
            rows.forEach((row) => {
                if (row.children[index]) {
                    row.children[index].style.display = "none";
                }
            });
        } else {
            header.style.display = "";
            rows.forEach((row) => {
                if (row.children[index]) {
                    row.children[index].style.display = "";
                }
            });
        }
    });
}

function initializeColumnVisibility() {
    const urlParams = new URLSearchParams(window.location.search);
    const hiddenParam = urlParams.get("nethidecolumns");
    if (hiddenParam) {
        hiddenColumns = new Set(hiddenParam.split(","));
    }
    applyColumnVisibility();
}

// Context menu for column headers
networkTableHead.addEventListener("contextmenu", (e) => {
    e.preventDefault(); // Prevent default browser context menu

    const menu = document.createElement("div");
    menu.className = "column-context-menu";
    menu.style.position = "absolute";
    menu.style.backgroundColor = "white";
    menu.style.border = "1px solid #ccc";
    menu.style.padding = "5px";
    menu.style.boxShadow = "2px 2px 5px rgba(0,0,0,0.2)";
    menu.style.zIndex = "10000"; // Ensure it's on top

    columnHeaders.forEach((headerText) => {
        const item = document.createElement("label");
        item.style.display = "block";
        item.style.padding = "3px 0";
        item.innerHTML = `<input type="checkbox" ${
            !hiddenColumns.has(headerText) ? "checked" : ""
        }> ${headerText}`;
        item.querySelector("input").addEventListener("change", (event) => {
            if (event.target.checked) {
                hiddenColumns.delete(headerText);
            } else {
                hiddenColumns.add(headerText);
            }
            updateURLParams();
            applyColumnVisibility();
        });
        menu.appendChild(item);
    });

    document.body.appendChild(menu);

    // Position the menu
    const documentWidth = document.documentElement.scrollWidth;
    const viewportHeight = window.innerHeight;

    let top = e.clientY + window.scrollY;
    let left = e.clientX + window.scrollX;

    // Adjust if menu goes off screen
    if (left + menu.offsetWidth > documentWidth + window.scrollX) {
        left = documentWidth + window.scrollX - menu.offsetWidth - 10;
    }
    if (top + menu.offsetHeight > viewportHeight + window.scrollY) {
        top = viewportHeight + window.scrollY - menu.offsetHeight - 10;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;

    // Hide menu on outside click
    const hideMenu = (event) => {
        if (!menu.contains(event.target) && event.button !== 2) {
            menu.remove();
            document.removeEventListener("click", hideMenu);
            document.removeEventListener("contextmenu", hideMenu); // Also hide if another right click
        }
    };
    document.addEventListener("click", hideMenu);
    document.addEventListener("contextmenu", hideMenu); // Hide if another right click happens
});

// Call this on page load to apply initial column visibility from URL
document.addEventListener("DOMContentLoaded", initializeColumnVisibility);
// --- End Column Visibility Logic ---

function createNewDomRow(rowId, props) {
    // Remove existing row with this exact DOM id if any
    const existingRow = document.querySelector(`tr[data-id="${rowId}"]`);
    if (existingRow) existingRow.remove();

    const row = document.createElement("tr");
    row.dataset.id = rowId;
    row.classList.add("network-row");

    // Create cells for all columns initially, then hide as needed
    for (let i = 0; i < columnHeaders.length; i++) {
        const cell = document.createElement("td");
        row.appendChild(cell);
    }
    networkTableBody.appendChild(row);

    // Note: Only update networkEvents if rowId == base id (handled in caller)
    if (rowId === props.id) {
        networkEvents.set(rowId, props);
    }

    populateRow(row, props);
    applyColumnVisibility(); // Apply visibility after creating/populating row
}

function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);
    return `${value.toFixed(2).replace(".00","")} ${units[i]}`;
}

function populateRow(row, eventData) {
    // Ensure omitempty fields by nulling them if not present
    if (!eventData.context) eventData.context = null;
    if (!eventData.initiator) eventData.initiator = null;
    if (!eventData.headers) eventData.headers = null;
    if (!eventData.resp_headers) eventData.resp_headers = null;
    if (!eventData.event_step_current) eventData.event_step_current = null;
    if (!eventData.event_step_max) eventData.event_step_max = null;

    let is_stepped = false;
    let progress = 0;
    if (eventData.event_step_current == null || eventData.event_step_max == null) {
        if (eventData.transferred != null && eventData.size != null) {
            progress = Math.min(100, (eventData.transferred / eventData.size) * 100).toFixed(0);
        }
    } else {
        is_stepped = true;
        progress = Math.min(100, (eventData.event_step_current / eventData.event_step_max) * 100).toFixed(0);
    }

    const cells = row.children;
    const statusCell = cells[0];
    if (eventData.status == 0) {
        statusCell.textContent = "0";
    } else {
        statusCell.textContent = eventData.status || "N/A";
    }
    statusCell.classList.remove("http-status-ok", "http-status-warn", "http-status-notok");
    const statusCode = parseInt(eventData.status || 0, 10);
    if (!isNaN(statusCode) && statusCode >= 0) {
        if (statusCode >= 200 && statusCode < 300) {
            statusCell.classList.add("http-status-ok");
        } else if (statusCode >= 300 && statusCode < 400) {
            statusCell.classList.add("http-status-warn");
        } else {
            statusCell.classList.add("http-status-notok");
        }
    }
    statusCell.dataset.prop = "status";

    const progressBarCell = cells[1];
    progressBarCell.innerHTML = "";
    if (eventData.size === -1) {
        if (
            eventData.event_state === "finished" ||
            eventData.event_state === "retry" ||
            eventData.event_state === "transfer"
        ) {
            progressBarCell.innerHTML = `<div class="loader-progress-bar"></div>`;
        } else if (
            eventData.event_state === "established" ||
            eventData.event_state === "responded"
        ) {
            progressBarCell.innerHTML = `<div class="loader-progress-bar loader-progress-bar-blue"></div>`;
        } else {
            progressBarCell.innerHTML = `<div class="loader-progress-bar loader-progress-bar-gray"></div>`;
        }
    } else {
        if (
            eventData.event_state === "finished" ||
            eventData.event_state === "retry" ||
            eventData.event_state === "transfer"
        ) {
            progressBarCell.innerHTML = `<div class="progress-bar"><div class="progress-fill" style="width: ${progress}%"></div></div>`;
        } else if (
            eventData.event_state === "established" ||
            eventData.event_state === "responded"
        ) {
            progressBarCell.innerHTML = `<div class="progress-bar"><div class="progress-fill progress-fill-blue" style="width: ${progress}%"></div></div>`;
        } else {
            progressBarCell.innerHTML = `<div class="progress-bar"><div class="progress-fill progress-fill-gray" style="width: ${progress}%"></div></div>`;
        }
    }
    progressBarCell.dataset.prop = "progress";

    const cell_properties = [
        "method",
        "remote",
        "scheme",
        "protocol",
        "content_type",
        "meta_direction",
        "unkb:transferred",
        "unkb:size",
        "mbps:meta_speed", // MegaBytes per second
        "context",
        "obj:initiator",
        "bool:meta_is_stream",
        "bool:meta_as_file",
        "exp:headers", // expandable cell
        "exp:resp_headers", // expandable cell
        "client_ip",
        "remote_ip",
        "event_state",
        "bool:event_success",
        "meta_retry_attempt",
        "priority",
        "meta_buffer_size",
        "nstms:meta_time_to_con", // NanoSeconds to be displayed as Milliseconds
        "nstms:meta_time_to_first_byte", // NanoSeconds to be displayed as Milliseconds
        "meta_got_first_resp",
        "id:ID",
    ];

    // iterate cell_properties
    let cell_ind = 0;
    for (let i = 0; i < cell_properties.length; i++) {
        cell_ind = i + 2; // Start from the 3rd cell (index 2) after status and progress
        let prop = cell_properties[i];
        let type = "string";
        // Check if prop contains ":" if so split by ":" into type, prop
        if (prop.includes(":")) {
            [type, prop] = prop.split(":");
        }

        // Check if prop exists as property of eventData else null value
        let value = eventData[prop] !== undefined ? eventData[prop] : null;

        // If cell_ind is out of bounds, add new cell
        if (cell_ind >= cells.length) {
            const newCell = document.createElement("td");
            row.appendChild(newCell);
        }

        // Add the property as data to the cell
        cells[cell_ind].dataset.prop = prop;

        // Add cells
        try {
            switch (type) {
                case "string":
                    if (value === null || value === undefined) { value = ""; }
                    cells[cell_ind].textContent = value;
                    break;
                case "unkb": // bytes where -1 means "unknown"
                    if (value === null || value === undefined) { value = ""; }
                    if ((typeof value === "number" && value < 0) || (typeof value === "string" && value.startsWith("-"))) {
                        cells[cell_ind].textContent = "N/A";
                    } else {
                        cells[cell_ind].textContent = formatBytes(Number(value));
                    }
                    cells[cell_ind].style.whiteSpace = "nowrap";
                    break;
                case "bool":
                    cells[cell_ind].textContent = value ? "True" : "False";
                    break;
                case "exp":
                    createExpandableCell(cells[cell_ind], value || {}, `exp-${eventData.__uniqueId__}-${prop}`);
                    break;
                case "id":
                    createExpandableCell(cells[cell_ind], {"id": value || eventData.__preEmptiveId__, "unique": eventData.__uniqueId__ }, `exp-${eventData.__uniqueId__}-${prop}`);
                    break;
                case "nstms":
                    if (value === null || value === undefined || value === "") {
                        cells[cell_ind].textContent = "N/A";
                    } else {
                        cells[cell_ind].textContent = (Number(value) / 1e6).toFixed(2) + " ms";
                    }
                    cells[cell_ind].style.whiteSpace = "nowrap";
                    break;
                case "mbps":
                    if (value === null || value === undefined || (typeof value === "number" && value < 0) || (typeof value === "string" && value.startsWith("-"))) {
                        cells[cell_ind].textContent = "N/A";
                    } else {
                        cells[cell_ind].textContent = Number(value).toFixed(2) + " mb/s";
                    }
                    cells[cell_ind].style.whiteSpace = "nowrap";
                    break;
                case "obj":
                    if (value === null || value === undefined) {
                        cells[cell_ind].textContent = "";
                    } else if (typeof value === "object") {
                        createExpandableCell(cells[cell_ind], value, `exp-${eventData.__uniqueId__}-${prop}`);
                    } else {
                        cells[cell_ind].textContent = String(value);
                    }
                    break;
                default:
                    cells[cell_ind].textContent = "?"; // Unknown type
                    console.warn(`Unknown type "${type}" for property "${prop}" in network event data.`);
                    break;
            }
        } catch (e) {
            console.error(`Error processing property "${prop}" with type "${type}":`, e);
            cells[cell_ind].textContent = "!";
        }
    }

    // Add is_stepped to the last cell
    const isSteppedCellIndex = cell_properties.length + 2;
    if (isSteppedCellIndex >= cells.length) {
        const newCell = document.createElement("td");
        row.appendChild(newCell);
    }
    cells[isSteppedCellIndex].textContent = is_stepped === true ? "True" : "False";
    cells[isSteppedCellIndex].dataset.prop = "is_stepped";
}

function createExpandableCell(cell, data, uniqueId) {
    cell.innerHTML = `<button class="expand-button">...</button>`;

    let popup = document.getElementById(`popup-${uniqueId}`);
    if (popup) popup.remove();

    popup = document.createElement("div");
    popup.id = `popup-${uniqueId}`;
    popup.className = "popup";
    popup.style.position = "absolute";
    popup.style.zIndex = "9999";
    popup.style.backgroundColor = "white";
    popup.style.border = "1px solid #ccc";
    popup.style.padding = "10px";
    popup.style.boxShadow = "0px 2px 10px rgba(0,0,0,0.2)";
    popup.style.display = "none"; // Start with display: none
    popup.innerHTML = Object.entries(data)
        .map(([key, val]) => `<div><strong>${key}</strong>: ${val}</div>`)
        .join("") || "<em>No data</em>";

    document.body.appendChild(popup);

    const button = cell.querySelector("button");

    button.addEventListener("click", (e) => {
        e.stopPropagation();

        // Hide others
        document.querySelectorAll(".popup").forEach((p) => {
            if (p !== popup) p.style.display = "none";
        });

        const documentWidth = document.documentElement.scrollWidth;
        const viewportHeight = window.innerHeight;
        popup.style.display = "block";
        popup.style.left = `${documentWidth + 100}px`; // Temporarily position off-screen
        popup.style.top = "0px"; // Temporarily position at top

        const rect = button.getBoundingClientRect();
        const popupRect = popup.getBoundingClientRect();

        let top = rect.bottom + window.scrollY;
        let left;

        // Try positioning to the right first
        left = rect.right + window.scrollX;
        if (left + popupRect.width > window.innerWidth + window.scrollX) {
            // If it goes off screen to the right, try positioning to the left
            left = rect.left + window.scrollX - popupRect.width;
            if (left < 0) {
                // If it goes off screen to the left, position at start of viewport
                left = window.scrollX;
            }
        }

        // Adjust top if it goes off screen to the bottom
        if (top + popupRect.height > viewportHeight + window.scrollY) {
            top = rect.top + window.scrollY - popupRect.height;
            if (top < 0) {
                // If it goes off screen to the top, position at top of viewport
                top = 0;
            }
        }

        popup.style.top = `${top}px`;
        popup.style.left = `${left}px`;
    });

    // Hide popup on outside click
    document.addEventListener("click", (e) => {
        if (!popup.contains(e.target) && !button.contains(e.target)) {
            popup.style.display = "none";
        }
    });
}

debuggerInstance.RegisterFor("net:start", (msg) => {
    const { id, ...eventData } = msg.properties;
    if (!id) return;

    eventData.__preEmptiveId__ = id;
    eventData.__uniqueId__ = `${id}-${Date.now()}`; // DOM identifier
    networkEvents.set(id, eventData);
    createNewDomRow(eventData.__uniqueId__, eventData);
});

updateNetworkRow = (msg) => {
    const { id, properties } = msg;
    if (!id || !properties) return;

    const existingData = networkEvents.get(id) || {};
    Object.assign(existingData, properties);
    networkEvents.set(id, existingData);

    // Update the existing row with data-id = id (base id row)
    const baseRow = document.querySelector(`tr[data-id="${existingData.__uniqueId__}"]`);
    if (baseRow) {
        populateRow(baseRow, existingData);
        applyColumnVisibility(); // Re-apply visibility after populating
    } else {
        // No base id row exists, create it now with base id
        existingData.__uniqueId__ = `${id}-${Date.now()}`; // DOM identifier
        networkEvents.set(id, existingData);
        createNewDomRow(existingData.__uniqueId__, existingData);
    }
};

stopNetworkRow = (msg) => {
    const { id } = msg;
    if (!id) return;
    const existingData = networkEvents.get(id) || {};

    if (existingData.__uniqueId__) {
        const row = document.querySelector(`tr[data-id="${existingData.__uniqueId__}"]`);
        if (row) {
            if (existingData.size == -1) {
                // Set progressbar to 100%
                const progressCell = row.children[1];
                if (existingData.size === -1) {
                    if (progressCell) {
                        if (
                            existingData.event_state === "finished" ||
                            existingData.event_state === "retry" ||
                            existingData.event_state === "transfer"
                        ) {
                            progressCell.innerHTML = `<div class="progress-bar"><div class="progress-fill" style="width: 100%;"></div></div>`;
                        } else if (
                            existingData.event_state === "established" ||
                            existingData.event_state === "responded"
                        ) {
                            progressCell.innerHTML = `<div class="progress-bar"><div class="progress-fill progress-fill-blue" style="width: 100%;"></div></div>`;
                        } else {
                            progressCell.innerHTML = `<div class="progress-bar"><div class="progress-fill progress-fill-gray" style="width: 100%;"></div></div>`;
                        }
                    }
                } else {
                    if (progressCell && progressCell.querySelector(".progress-fill")) {
                        const progressFill = progressCell.querySelector(".progress-fill");
                        progressFill.style.width = "100%";

                        if (
                            existingData.event_state === "finished" ||
                            existingData.event_state === "retry" ||
                            existingData.event_state === "transfer"
                        ) {
                            progressFill.classList = "progress-fill";
                        } else if (
                            existingData.event_state === "established" ||
                            existingData.event_state === "responded"
                        ) {
                            progressFill.classList = "progress-fill progress-fill-blue";
                        } else {
                            progressFill.classList = "progress-fill progress-fill-gray";
                        }
                    }
                }
                // Set size to transferred
                existingData.size = existingData.transferred;
                networkEvents.set(id, existingData);
                // Get cell by dataset.prop == "size"
                const sizeCell = row.querySelector("td[data-prop='size']");
                if (sizeCell) {
                    sizeCell.textContent = formatBytes(Number(existingData.transferred));
                }
            }
            row.classList.add("stopped");
        }
    }
};

debuggerInstance.RegisterFor("net:update", updateNetworkRow);

debuggerInstance.RegisterFor("net:stop", stopNetworkRow);

debuggerInstance.RegisterFor("net:stop.update", (msg) => {
    updateNetworkRow(msg);
    stopNetworkRow(msg);
});

clearAllBtn.addEventListener("click", () => {
    networkEvents.clear();
    networkTableBody.innerHTML = "";
});

clearStoppedBtn.addEventListener("click", () => {
    document.querySelectorAll("tr.stopped").forEach((row) => {
        const id = row.dataset.id;
        networkEvents.delete(id);
        row.remove();
    });
});

clearActiveBtn.addEventListener("click", () => {
    document.querySelectorAll("tbody tr:not(.stopped)").forEach((row) => {
        const id = row.dataset.id;
        networkEvents.delete(id);
        row.remove();
    });
});