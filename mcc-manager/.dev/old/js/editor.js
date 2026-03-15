var STORAGE_JSON = "mcc-editor-json";
var STORAGE_FILENAME = "mcc-editor-filename";

// Holds descriptions for the repo schema
//   keypaths are split by "." if a dot inside a key its \.
//   [] means its an array matching any index [1] would be specifically that index
//   * means any value in that slot
const REPO_KEYPATH_SCHEMA = {
    "format": {
        type: "property",
        info: "V3 Formats begin at 3, as of now 3 is the only V3 format number but future changes may introduce V3 format:4 etc."
    },
    "name": {
        type: "property",
        info: "Display name (Optional)"
    },
    "author": {
        type: "property",
        info: "Display author (Optional)"
    },
    "version": {
        type: "property",
        info: "Display version (Optional)"
    },
    "created": {
        type: "property",
        info: "When this file was created"
    },
    "last_updated": {
        type: "property",
        info: "When this file was last updated"
    },

    "resources.sources.*": {
        type: "property",
        info: "Resource source URL or string override (all fields optional)"
    },

    "resources.runtimes.[]": {
        type: "array",
        info: "Runtime resource with id and versions"
    },
    "resources.runtimes.[].id": {
        type: "id",
        info: "Runtime identifier (e.g., 'jdk')"
    },
    "resources.runtimes.[].versions.*.created": {
        type: "property",
        info: "When this runtime version entry was created"
    },
    "resources.runtimes.[].versions.*.sources.[]": {
        type: "array",
        info: "Sources for the runtime version"
    },
    "resources.runtimes.[].versions.*.sources.[].type": {
        type: "property",
        info: "Type of source (e.g., builtin.java)"
    },
    "resources.runtimes.[].versions.*.sources.[].platforms.[]": {
        type: "array",
        info: "Platform identifiers for the source"
    },
    "resources.runtimes.[].versions.*.sources.[].source": {
        type: "property",
        info: "Download URL or resource key for the source"
    },

    "resources.loaders.[]": {
        type: "array",
        info: "Loader resource with id, name, description, and versions"
    },
    "resources.loaders.[].id": {
        type: "id",
        info: "Loader identifier (e.g., 'fabric')"
    },
    "resources.loaders.[].versions.*.sources.[]": {
        type: "array",
        info: "Sources for a loader version"
    },
    "resources.loaders.[].versions.*.sources.[].depends.[]": {
        type: "array",
        info: "Dependency keypaths this source depends on"
    },

    "resources.mods.[]": {
        type: "array",
        info: "Mod resource"
    },
    "resources.mods.[].id": {
        type: "id",
        info: "Mod identifier"
    },
    "resources.mods.[].hidden": {
        type: "bool",
        info: "Mark mod as hidden?"
    },
    "resources.mods.[].versions.*.sources.[]": {
        type: "array",
        info: "Sources for a mod version"
    },

    "resources.resourcepacks.[]": {
        type: "array",
        info: "Resourcepack resource"
    },
    "resources.resourcepacks.[].id": {
        type: "id",
        info: "Resourcepack identifier"
    },
    "resources.resourcepacks.[].hidden": {
        type: "bool",
        info: "Mark resourcepack as hidden?"
    },
    "resources.resourcepacks.[].versions.*.sources.[]": {
        type: "array",
        info: "Sources for a resourcepack version"
    },

    "resources.modpacks.[]": {
        type: "array",
        info: "Modpack resource with type, format, and versions"
    },
    "resources.modpacks.[].id": {
        type: "id",
        info: "Modpack identifier"
    },
    "resources.modpacks.[].hidden": {
        type: "bool",
        info: "Mark modpack as hidden?"
    },
    "resources.modpacks.[].versions.*.depends.[]": {
        type: "array",
        info: "Dependencies for the modpack version"
    },
    "resources.modpacks.[].versions.*.resources.*.[]": {
        type: "array",
        info: "Resources inside modpack version (mods/resourcepacks)"
    },
    "resources.modpacks.[].versions.*.variants.*": {
        type: "object",
        info: "Variant resources inside a modpack version"
    },
    "resources.modpacks.[].versions.*.overrides": {
        type: "object",
        info: "Overrides for the modpack version"
    },
    "resources.modpacks.[].versions.*.overrides.source": {
        type: "property",
        info: "URL, base64, or relative path of the override"
    }
};

/** Split keypath by "."; literal dots in keys are escaped as \. */
function keypathSegments(keypath) {
    const s = String(keypath).replace(/\\\./g, "\u0001");
    return s.split(".").map((seg) => seg.replace(/\u0001/g, "."));
}

/** Path is array of segments (key strings and numeric indices). Normalize to comparable form: numbers -> "[]". */
function pathToMatchSegments(path) {
    return path.map((p) => (typeof p === "number" ? "[]" : p));
}

/** True if schema segments (may contain [] and *) match path segments. */
function schemaKeyMatchesPath(schemaSegs, pathSegs) {
    if (schemaSegs.length !== pathSegs.length) return false;
    for (let i = 0; i < schemaSegs.length; i++) {
        const s = schemaSegs[i];
        const p = pathSegs[i];
        if (s === "[]" && p === "[]") continue;
        if (s === "[]" || s === "*") continue;
        if (s !== p) return false;
    }
    return true;
}

/** Find best (longest) matching schema entry for path. Path = array of key/index segments. */
function getSchemaForPath(path) {
    const matchSegs = pathToMatchSegments(path);
    let best = null;
    let bestLen = -1;
    for (const key in REPO_KEYPATH_SCHEMA) {
        const segs = keypathSegments(key);
        if (schemaKeyMatchesPath(segs, matchSegs) && segs.length > bestLen) {
            best = REPO_KEYPATH_SCHEMA[key];
            bestLen = segs.length;
        }
    }
    return best;
}

/**
 * Holds repo JSON data (object + text). Notifies subscribers when data changes via setObjValue.
 */
class RepoData {
    #obj;
    #text;
    #subscribers;

    /**
     * @param {object} data - Initial parsed JSON object
     */
    constructor(data) {
        this.#obj = data;
        this.#text = JSON.stringify(data, null, 4);
        this.#subscribers = [];
    }

    subscribeOnChange(callback) {
        if (typeof callback !== "function") return function () {};
        this.#subscribers.push(callback);
        const list = this.#subscribers;
        return function unsubscribe() {
            const i = list.indexOf(callback);
            if (i !== -1) list.splice(i, 1);
        };
    }

    getTextValue() {
        return this.#text;
    }

    getObjValue() {
        return this.#obj;
    }

    setObjValue(obj) {
        if (obj === null || typeof obj !== "object") return;
        this.#obj = obj;
        this.#text = JSON.stringify(obj, null, 4);
        this.#subscribers.forEach((cb) => {
            try {
                cb(this.#text);
            } catch (e) {
                console.error("RepoData subscriber error:", e);
            }
        });
    }

    /**
     * Builds a node graph by recursively walking the JSON object, for use with showNodeGraph.
     * Matches keypaths to REPO_KEYPATH_SCHEMA for type, info, showUnder, collapsed.
     * Primitive values appear as a child node with type property-value, bool-value, or number-value.
     * @param {string} [rootName="Root"] - Name for the root node
     * @param {boolean} [flattenArrays=false] - If true, array index nodes are skipped; array elements become direct children of the array node
     * @returns {Array} Array of node objects (single root)
     */
    getNodeGraph(rootName, flattenArrays = false) {
        const name = rootName != null ? String(rootName) : "Root";

        const walk = (value, nodeName, path = []) => {
            const schema = getSchemaForPath(path);
            const applySchema = (node) => {
                if (!schema) return node;
                if (schema.type != null) node.type = schema.type;
                if (schema.info != null) node.info = schema.info;
                if (schema.showUnder != null) node.showUnder = schema.showUnder;
                if (schema.collapsed != null) node.collapsed = schema.collapsed;
                return node;
            };

            if (value === null) {
                const node = applySchema({
                    name: nodeName,
                    type: "property",
                    children: [{ name: "null", type: "null" }],
                });
                return node;
            }
            if (Array.isArray(value)) {
                const arrChildren = [];
                for (let i = 0; i < value.length; i++) {
                    arrChildren.push(walk(value[i], String(i), path.concat(i)));
                }
                return applySchema({ name: nodeName, type: "array", children: arrChildren });
            }
            if (typeof value === "object") {
                const objChildren = [];
                for (const key in value) {
                    if (Object.prototype.hasOwnProperty.call(value, key)) {
                        objChildren.push(walk(value[key], key, path.concat(key)));
                    }
                }
                return applySchema({ name: nodeName, type: "object", children: objChildren });
            }
            if (value === "") {
                return applySchema({ name: nodeName, type: "property", children: [] });
            }
            const valueType =
                typeof value === "boolean"
                    ? "bool-value"
                    : typeof value === "number"
                      ? "number-value"
                      : "property-value";
            const valueNode = { name: String(value), type: valueType };
            return applySchema({
                name: nodeName,
                type: "property",
                children: [valueNode],
            });
        };

        let graph = [walk(this.#obj, name, [])];

        if (flattenArrays) {
            const flatten = (nodes) => {
                if (!nodes || !Array.isArray(nodes)) return;
                for (const node of nodes) {
                    if (node.type === "array" && node.children && node.children.length > 0) {
                        node.children = node.children.flatMap((indexNode) =>
                            indexNode.children ? indexNode.children : [indexNode]
                        );
                        flatten(node.children);
                    } else if (node.children) {
                        flatten(node.children);
                    }
                }
            };
            flatten(graph);
        }

        return graph;
    }
}

/** Remove single-line (//) and block comments from JSON string so JSON.parse can run. Leaves string contents unchanged. */
function stripJsonComments(str) {
    var out = "";
    var i = 0;
    var inString = false;
    var escape = false;
    var quote = "";
    while (i < str.length) {
        var c = str[i];
        if (escape) {
            if (inString) { out += c; }
            escape = false;
            i++;
            continue;
        }
        if (c === "\\" && inString) {
            escape = true;
            out += c;
            i++;
            continue;
        }
        if (inString) {
            if (c === quote) { inString = false; }
            out += c;
            i++;
            continue;
        }
        if (c === "\"" || c === "'") {
            inString = true;
            quote = c;
            out += c;
            i++;
            continue;
        }
        if (c === "/" && i + 1 < str.length) {
            if (str[i + 1] === "/") {
                i += 2;
                while (i < str.length && str[i] !== "\n" && str[i] !== "\r") i++;
                if (i < str.length) out += str[i++];
                continue;
            }
            if (str[i + 1] === "*") {
                i += 2;
                while (i + 1 < str.length && !(str[i] === "*" && str[i + 1] === "/")) i++;
                i += 2;
                continue;
            }
        }
        out += c;
        i++;
    }
    return out;
}

function getEl(id) {
    return document.getElementById(id);
}

function show(el) {
    if (el) el.classList.remove("hidden");
}

function hide(el) {
    if (el) el.classList.add("hidden");
}

function showError(message) {
    var main = getEl("editor-main");
    var errPanel = getEl("editor-error");
    var errMsg = getEl("editor-error-message");
    var statusBar = getEl("editor-status-bar");
    var viewToggle = getEl("editor-view-toggle");
    if (main) hide(main);
    if (statusBar) hide(statusBar);
    if (viewToggle) hide(viewToggle);
    if (errPanel && errMsg) {
        errMsg.textContent = message;
        show(errPanel);
    }
}

function showEditor(filename) {
    var main = getEl("editor-main");
    var errPanel = getEl("editor-error");
    var statusBar = getEl("editor-status-bar");
    var filenameEl = getEl("editor-filename");
    var viewToggle = getEl("editor-view-toggle");
    if (errPanel) hide(errPanel);
    if (main) show(main);
    if (statusBar) show(statusBar);
    if (viewToggle) show(viewToggle);
    if (filenameEl) filenameEl.textContent = filename || "file.json";
}

function init() {
    var jsonString = null;
    var filename = null;
    try {
        jsonString = sessionStorage.getItem(STORAGE_JSON);
        filename = sessionStorage.getItem(STORAGE_FILENAME) || "config.json";
    } catch (e) {
        showError("Could not read stored data.");
        return;
    }

    if (jsonString == null || jsonString === "") {
        showError("No configuration loaded. Choose a source on the home page.");
        return;
    }

    jsonString = stripJsonComments(jsonString);

    var obj;
    try {
        obj = JSON.parse(jsonString);
    } catch (e) {
        showError("Invalid JSON: " + (e.message || String(e)));
        return;
    }

    if (typeof obj !== "object" || obj === null) {
        showError("JSON must be an object.");
        return;
    }

    sessionStorage.removeItem(STORAGE_JSON);
    sessionStorage.removeItem(STORAGE_FILENAME);

    var repoData = new RepoData(obj);
    var currentFilename = filename;
    var monacoEditorInstance = null;
    var guiPanel = getEl("editor-gui-panel");
    var jsonPanel = getEl("editor-json-panel");

    showEditor(filename);

    var sidebarOpen = true;
    var guiSidebar = getEl("editor-gui-sidebar");
    var guiSidebarGraph = getEl("editor-gui-sidebar-graph");
    var sidebarRepoPanel = getEl("editor-gui-sidebar-repo");
    var sidebarTreePanel = getEl("editor-gui-sidebar-tree");

    function refreshGuiPanel() {
        if (!guiSidebarGraph || typeof showNodeGraph !== "function") return;
        guiSidebarGraph.innerHTML = "";
        guiSidebarGraph.classList.remove("node-graph");
        var graph = repoData.getNodeGraph(filename ?? "file.json", true);
        if (graph && graph.length) {
            guiSidebarGraph.classList.add("node-graph");
            showNodeGraph(graph, guiSidebarGraph);
        }
    }

    function setSidebarView(view) {
        var repoBtn = getEl("editor-sidebar-repo");
        var treeBtn = getEl("editor-sidebar-tree");
        if (view === "repo") {
            if (sidebarRepoPanel) show(sidebarRepoPanel);
            if (sidebarTreePanel) hide(sidebarTreePanel);
            if (repoBtn) { repoBtn.classList.add("is-active"); repoBtn.setAttribute("aria-pressed", "true"); }
            if (treeBtn) { treeBtn.classList.remove("is-active"); treeBtn.setAttribute("aria-pressed", "false"); }
        } else {
            if (sidebarRepoPanel) hide(sidebarRepoPanel);
            if (sidebarTreePanel) show(sidebarTreePanel);
            refreshGuiPanel();
            if (repoBtn) { repoBtn.classList.remove("is-active"); repoBtn.setAttribute("aria-pressed", "false"); }
            if (treeBtn) { treeBtn.classList.add("is-active"); treeBtn.setAttribute("aria-pressed", "true"); }
        }
    }

    var repoSidebarBtn = getEl("editor-sidebar-repo");
    var treeSidebarBtn = getEl("editor-sidebar-tree");
    if (repoSidebarBtn) repoSidebarBtn.addEventListener("click", function () { setSidebarView("repo"); });
    if (treeSidebarBtn) treeSidebarBtn.addEventListener("click", function () { setSidebarView("tree"); });
    setSidebarView("repo");

    function setSidebarOpen(open) {
        sidebarOpen = open;
        if (guiSidebar) {
            if (open) guiSidebar.classList.remove("editor-gui-sidebar--collapsed");
            else guiSidebar.classList.add("editor-gui-sidebar--collapsed");
        }
        var expandIcon = document.querySelector(".editor-sidebar-icon-expand");
        var collapseIcon = document.querySelector(".editor-sidebar-icon-collapse");
        if (expandIcon && collapseIcon) {
            if (open) {
                expandIcon.setAttribute("hidden", "");
                collapseIcon.removeAttribute("hidden");
            } else {
                expandIcon.removeAttribute("hidden");
                collapseIcon.setAttribute("hidden", "");
            }
        }
    }

    var sidebarToggleBtn = getEl("editor-sidebar-toggle");
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener("click", function () {
            setSidebarOpen(!sidebarOpen);
        });
    }
    setSidebarOpen(true);

    function refreshJsonPanel() {
        if (!jsonPanel) return;
        if (typeof MonacoEditor === "undefined") return;
        if (!monacoEditorInstance) {
            monacoEditorInstance = new MonacoEditor(jsonPanel, {
                value: repoData.getTextValue(),
                language: "json_custom",
                onChange: function (value) {
                    var parsed;
                    try {
                        parsed = JSON.parse(value);
                    } catch (e) {
                        return;
                        /* ignore invalid JSON while typing */
                    }
                    if (parsed !== null && typeof parsed === "object") {
                        repoData.setObjValue(parsed);
                    }
                }
            });
        } else {
            monacoEditorInstance.setValue(repoData.getTextValue());
        }
    }

    function showView(view) {
        var guiBtn = getEl("editor-view-gui");
        var jsonBtn = getEl("editor-view-json");
        if (view === "gui") {
            hide(jsonPanel);
            show(guiPanel);
            refreshGuiPanel();
            if (guiBtn) { guiBtn.classList.add("is-active"); guiBtn.setAttribute("aria-pressed", "true"); }
            if (jsonBtn) { jsonBtn.classList.remove("is-active"); jsonBtn.setAttribute("aria-pressed", "false"); }
        } else {
            hide(guiPanel);
            show(jsonPanel);
            refreshJsonPanel();
            if (guiBtn) { guiBtn.classList.remove("is-active"); guiBtn.setAttribute("aria-pressed", "false"); }
            if (jsonBtn) { jsonBtn.classList.add("is-active"); jsonBtn.setAttribute("aria-pressed", "true"); }
        }
    }

    var guiBtn = getEl("editor-view-gui");
    var jsonBtn = getEl("editor-view-json");
    if (guiBtn) guiBtn.addEventListener("click", function () { showView("gui"); });
    if (jsonBtn) jsonBtn.addEventListener("click", function () { showView("json"); });

    showView("gui");

    var backBtn = getEl("editor-back");
    if (backBtn) {
        backBtn.addEventListener("click", function () {
                var indexUrl = typeof appendLsDeclinedToPath === "function" ? appendLsDeclinedToPath("index.html") : "index.html";
                window.location.href = indexUrl;
            });
    }

    var downloadBtn = getEl("editor-download");
    if (downloadBtn) {
        downloadBtn.addEventListener("click", function () {
            var str = repoData.getTextValue();
            var name = currentFilename || "config.json";
            var blob = new Blob([str], { type: "application/json" });
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = name;
            a.click();
            URL.revokeObjectURL(a.href);
        });
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}