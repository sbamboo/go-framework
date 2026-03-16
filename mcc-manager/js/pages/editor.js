/* JS for the editor page */

var ISMODIFIED_KEY = "ismodified";

// region: ViewTab
/* ========================================================================================== */
var viewTabInitialized = false;
var viewTabChangeUnsubscribe = null;

// region: RawTab
/* ========================================================================================== */
var rawTabInitialized = false;
var rawTabChangeUnsubscribe = null;
var rawTabPdLoadedUnsubscribe = null;

var rawTabNavLeftButton = null;
var rawTabNavRightButton = null;
var rawTabNavTabsContainer = null;
var rawTabStripEl = null;

var rawTabDescriptors = [];
var rawActiveTabId = null;
var rawScrollIndex = 0;
/* ========================================================================================== */
//endregion: RawTab

// Holds descriptions for the repo schema
//   keypaths are split by "."; literal dots in keys are escaped as \.
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
/* ========================================================================================== */
//endregion: ViewTab

function updateRepoModifiedUI() {
    var el = document.getElementById("editor-ismodified-text");
    if (!el) {
        return;
    }
    var isModified = window.isRepoModified();
    el.textContent = isModified ? "● Unsaved changes" : "● All saved";
    el.classList.remove("editor-ismodified-saved", "editor-ismodified-unsaved");
    el.classList.add(isModified ? "editor-ismodified-unsaved" : "editor-ismodified-saved");
}

window.onEditorTabChange = function (fromMode, toMode) {
    // Hook for external listeners; currently just logs and initializes view tab on first entry.
    console.log("[Editor.Event] Tab changed", { fromMode, toMode });

    if (toMode === "view" && !viewTabInitialized) {
        viewTabInitialized = true;

        function attachViewChangeSubscriber() {
            if (typeof window.subscribeOnEditorChange === "function" && !viewTabChangeUnsubscribe) {
                viewTabChangeUnsubscribe = window.subscribeOnEditorChange(function (repoSourceType, partialDataClass, changeIn, keypath, changedData) {
                    renderViewTab();
                });
            }
        }

        // If pd is already ready, render immediately and subscribe to changes
        if (window.pd && typeof window.pd.getStatic === "function") {
            renderViewTab();
            attachViewChangeSubscriber();
        } else if (typeof window.subscribeOnPdLoaded === "function") {
            // Defer initialization until pd is loaded
            window.subscribeOnPdLoaded(function () {
                renderViewTab();
                attachViewChangeSubscriber();
            });
        }
    }

    if (toMode === "raw" && !rawTabInitialized) {
        rawTabInitialized = true;

        if (!rawTabNavLeftButton || !rawTabNavRightButton || !rawTabNavTabsContainer) {
            rawTabNavLeftButton = document.getElementById("editor-mode-raw-nav-left");
            rawTabNavRightButton = document.getElementById("editor-mode-raw-nav-right");
            rawTabNavTabsContainer = document.getElementById("editor-mode-raw-nav-tabs");
        }

        if (rawTabNavTabsContainer && !rawTabStripEl) {
            rawTabStripEl = document.createElement("div");
            rawTabStripEl.className = "editor-raw-tab-strip";
            rawTabNavTabsContainer.appendChild(rawTabStripEl);

            rawTabStripEl.addEventListener("click", function (e) {
                var target = e.target;
                while (target && target !== rawTabStripEl && !target.classList.contains("editor-raw-tab")) {
                    target = target.parentElement;
                }
                if (!target || target === rawTabStripEl) return;
                var tabId = target.getAttribute("data-tab-id");
                if (!tabId) return;
                var previousId = rawActiveTabId || "unknown";
                if (previousId === tabId) return;
                rawActiveTabId = tabId;
                renderRawTabs();
                rawUpdateTabQueryParam();
                ensureRawEditor(rawActiveTabId);
                updateRawEditorVisibility();
                if (typeof window.onRawTabChange === "function") {
                    window.onRawTabChange(previousId, tabId);
                }
            });
        }

        if (rawTabNavLeftButton && !rawTabNavLeftButton._rawNavBound) {
            rawTabNavLeftButton._rawNavBound = true;
            rawTabNavLeftButton.addEventListener("click", function () {
                rawScrollOneStep(-1);
            });
        }
        if (rawTabNavRightButton && !rawTabNavRightButton._rawNavBound) {
            rawTabNavRightButton._rawNavBound = true;
            rawTabNavRightButton.addEventListener("click", function () {
                rawScrollOneStep(1);
            });
        }

        function buildWhenPdReady() {
            buildRawTabsFromLoadedRepo();
            if (typeof window.subscribeOnEditorChange === "function" && !rawTabChangeUnsubscribe) {
                rawTabChangeUnsubscribe = window.subscribeOnEditorChange(function (repoSourceType, partialDataClass, changeIn, keypath, changedData, partialIndex) {
                    buildRawTabsFromLoadedRepo();
                    rawEditorSyncFromChange(repoSourceType, partialDataClass, changeIn, keypath, changedData, partialIndex);
                });
            }
        }

        if (window.pd && typeof window.pd.getStatic === "function") {
            buildWhenPdReady();
        } else if (typeof window.subscribeOnPdLoaded === "function" && !rawTabPdLoadedUnsubscribe) {
            rawTabPdLoadedUnsubscribe = window.subscribeOnPdLoaded(function () {
                buildWhenPdReady();
            });
        }
    }
};

function buildRawTabsFromLoadedRepo() {
    var storage = typeof window.StorageHandler !== "undefined" ? window.StorageHandler : null;
    if (!storage || typeof storage.get !== "function") {
        return;
    }

    storage.get("loadedRepo").then(function (loaded) {
        if (!loaded || typeof loaded !== "object" || !loaded.base) {
            return;
        }

        var tabs = [];

        var baseFilename = loaded.base && typeof loaded.base === "object" ? loaded.base.filename : null;
        if (!baseFilename) {
            baseFilename = "base.json";
        }
        tabs.push({
            id: "base-0",
            label: baseFilename,
            type: "base"
        });

        if (Array.isArray(loaded.partials)) {
            for (var i = 0; i < loaded.partials.length; i++) {
                var p = loaded.partials[i];
                if (!p || typeof p !== "object") continue;
                var kp = p.kp != null ? p.kp : p.keypath;
                var label = (p.filename != null && p.filename !== "") ? p.filename : (kp || "partial-" + i);
                tabs.push({
                    id: "partial-" + i,
                    label: label,
                    type: "partial",
                    keypath: kp
                });
            }
        } else if (loaded.partials && typeof loaded.partials === "object") {
            var partialKeysForTabs = Object.keys(loaded.partials);
            for (var i = 0; i < partialKeysForTabs.length; i++) {
                var kp = partialKeysForTabs[i];
                var entry = loaded.partials[kp];
                if (!entry || typeof entry !== "object") continue;
                var pFilename = entry.filename;
                if (!pFilename) {
                    pFilename = kp;
                }
                tabs.push({
                    id: "partial-" + i,
                    label: pFilename,
                    type: "partial",
                    keypath: kp
                });
            }
        }

        rawTabDescriptors = tabs;
        if (rawTabDescriptors.length > 0) {
            var desiredIndex = -1;
            try {
                var url = new URL(window.location.href);
                var qsTab = url.searchParams.get("tab");
                if (qsTab != null) {
                    var parsed = parseInt(qsTab, 10);
                    if (!isNaN(parsed) && parsed >= 0 && parsed < rawTabDescriptors.length) {
                        desiredIndex = parsed;
                    }
                }
            } catch (e) {
                // Ignore URL issues, fall back to default
            }

            if (desiredIndex >= 0) {
                rawActiveTabId = rawTabDescriptors[desiredIndex].id;
            } else if (!rawActiveTabId) {
                rawActiveTabId = rawTabDescriptors[0].id;
            }
        }
        rawScrollIndex = 0;
        renderRawTabs();
        rawUpdateTabQueryParam();
        ensureRawEditor(rawActiveTabId);
        updateRawEditorVisibility();
    }).catch(function () {
        /* ignore */
    });
}

function renderRawTabs() {
    if (!rawTabStripEl || !rawTabNavTabsContainer) {
        return;
    }

    rawTabStripEl.innerHTML = "";
    for (var i = 0; i < rawTabDescriptors.length; i++) {
        var tab = rawTabDescriptors[i];
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "editor-raw-tab";
        if (tab.id === rawActiveTabId) {
            btn.classList.add("is-active");
        }
        btn.setAttribute("data-tab-id", tab.id);
        if (tab.type === "partial" && tab.keypath) {
            btn.setAttribute("data-keypath", tab.keypath);
        }
        btn.textContent = tab.label;
        rawTabStripEl.appendChild(btn);
    }

    updateRawNavState();
}

function rawComputePrefixWidth(count) {
    if (!rawTabStripEl) return 0;
    var total = 0;
    var children = rawTabStripEl.children;
    for (var i = 0; i < count && i < children.length; i++) {
        total += children[i].offsetWidth;
    }
    return total;
}

function updateRawNavState() {
    if (!rawTabStripEl || !rawTabNavTabsContainer) return;

    var containerWidth = rawTabNavTabsContainer.clientWidth;
    var stripWidth = rawTabStripEl.scrollWidth;

    if (!rawTabNavLeftButton || !rawTabNavRightButton) {
        return;
    }

    if (stripWidth <= containerWidth + 1) {
        rawScrollIndex = 0;
        rawTabStripEl.style.transform = "translateX(0px)";
        rawTabNavLeftButton.disabled = true;
        rawTabNavRightButton.disabled = true;
        return;
    }

    var maxIndex = Math.max(0, rawTabStripEl.children.length - 1);
    if (rawScrollIndex < 0) rawScrollIndex = 0;
    if (rawScrollIndex > maxIndex) rawScrollIndex = maxIndex;

    var offset = -rawComputePrefixWidth(rawScrollIndex);
    rawTabStripEl.style.transform = "translateX(" + offset + "px)";

    rawTabNavLeftButton.disabled = rawScrollIndex <= 0;

    var visibleEnd = containerWidth - offset;
    var atEnd = visibleEnd >= stripWidth - 1;
    rawTabNavRightButton.disabled = atEnd;
}

function rawScrollOneStep(direction) {
    if (!rawTabStripEl) return;
    var children = rawTabStripEl.children;
    if (!children || !children.length) return;

    var maxIndex = Math.max(0, children.length - 1);
    if (direction > 0 && rawScrollIndex < maxIndex) {
        rawScrollIndex += 1;
    } else if (direction < 0 && rawScrollIndex > 0) {
        rawScrollIndex -= 1;
    }
    updateRawNavState();
}

function rawUpdateTabQueryParam() {
    try {
        if (!rawTabDescriptors || !rawTabDescriptors.length) {
            var urlClear = new URL(window.location.href);
            urlClear.searchParams.delete("tab");
            window.history.replaceState({}, "", urlClear.toString());
            return;
        }
        var index = -1;
        for (var i = 0; i < rawTabDescriptors.length; i++) {
            if (rawTabDescriptors[i].id === rawActiveTabId) {
                index = i;
                break;
            }
        }
        var url = new URL(window.location.href);
        if (index >= 0) {
            url.searchParams.set("tab", String(index));
        } else {
            url.searchParams.delete("tab");
        }
        window.history.replaceState({}, "", url.toString());
    } catch (e) {
        // Ignore URL issues
    }
}

/** base-0 -> -1, partial-0 -> 0, partial-1 -> 1 */
function getRawPartialIndexFromTabId(tabId) {
    if (!tabId || typeof tabId !== "string") return null;
    if (tabId.indexOf("base-") === 0) return -1;
    if (tabId.indexOf("partial-") === 0) {
        var idx = parseInt(tabId.slice("partial-".length), 10);
        return isNaN(idx) || idx < 0 ? null : idx;
    }
    return null;
}

function ensureRawEditor(tabId) {
    if (!tabId || loadedEditors[tabId]) return loadedEditors[tabId] || null;

    var container = document.getElementById("editor-mode-raw-content");
    if (!container) return null;

    var pd = window.pd;
    if (!pd) return null;

    var partialIndex = getRawPartialIndexFromTabId(tabId);
    if (partialIndex === null) return null;

    var initialData = partialIndex < 0 ? pd.base : (pd.partials[partialIndex] && pd.partials[partialIndex].loaded);
    var initialText = "";
    try {
        initialText = typeof initialData !== "undefined" && initialData !== null
            ? JSON.stringify(initialData, null, 4)
            : (partialIndex < 0 ? "{}" : "{}");
    } catch (e) {
        initialText = "{}";
    }

    var wrapper = document.createElement("div");
    wrapper.className = "editor-raw-editor-panel";
    wrapper.setAttribute("data-tab-id", tabId);
    container.appendChild(wrapper);

    var MonacoEditorClass = typeof MonacoEditor !== "undefined" ? MonacoEditor : (window.MonacoEditor || null);
    if (!MonacoEditorClass) return null;

    var editor = new MonacoEditorClass(wrapper, {
        value: initialText,
        language: "json_custom",
        theme: "auto",
        onChange: function (value, editorInstance) {
            var data;
            try {
                data = JSON.parse(value);
            } catch (e) {
                return;
            }
            if (window.pd && editorInstance._rawPartialIndex !== undefined) {
                window.pd.setPartialData(editorInstance._rawPartialIndex, data);
                window.setRepoIsModified(true);
            }
        }
    });

    editor._rawTabId = tabId;
    editor._rawPartialIndex = partialIndex;
    loadedEditors[tabId] = editor;
    return editor;
}

function updateRawEditorVisibility() {
    var container = document.getElementById("editor-mode-raw-content");
    if (!container) return;
    var panels = container.querySelectorAll(".editor-raw-editor-panel");
    for (var i = 0; i < panels.length; i++) {
        var panel = panels[i];
        var tabId = panel.getAttribute("data-tab-id");
        panel.classList.toggle("is-active", tabId === rawActiveTabId);
    }
}

function rawEditorSyncFromChange(repoSourceType, partialDataClass, changeIn, keypath, changedData, partialIndex) {
    var newText = "";
    try {
        newText = JSON.stringify(changedData, null, 4);
    } catch (e) {
        return;
    }

    if (changeIn === "base") {
        var baseEditor = loadedEditors["base-0"];
        if (baseEditor && baseEditor.getValue() !== newText) {
            baseEditor.setValue(newText);
        }
        return;
    }

    if (changeIn === "partial" && typeof partialIndex === "number" && partialIndex >= 0) {
        var tabId = "partial-" + partialIndex;
        var partialEditor = loadedEditors[tabId];
        if (partialEditor && partialEditor.getValue() !== newText) {
            partialEditor.setValue(newText);
        }
    }
}

/** Split keypath by "."; literal dots in keys are escaped as \. */
function keypathSegments(keypath) {
    var s = String(keypath).replace(/\\\./g, "\u0001");
    return s.split(".").map(function (seg) {
        return seg.replace(/\u0001/g, ".");
    });
}

/** Path is array of segments (key strings and numeric indices). Normalize to comparable form: numbers -> "[]". */
function pathToMatchSegments(path) {
    return path.map(function (p) {
        return typeof p === "number" ? "[]" : p;
    });
}

/** True if schema segments (may contain [] and *) match path segments. */
function schemaKeyMatchesPath(schemaSegs, pathSegs) {
    if (schemaSegs.length !== pathSegs.length) return false;
    for (var i = 0; i < schemaSegs.length; i++) {
        var s = schemaSegs[i];
        var p = pathSegs[i];
        if (s === "[]" && p === "[]") continue;
        if (s === "[]" || s === "*") continue;
        if (s !== p) return false;
    }
    return true;
}

/** Find best (longest) matching schema entry for path. Path = array of key/index segments. */
function getSchemaForPath(path) {
    var matchSegs = pathToMatchSegments(path);
    var best = null;
    var bestLen = -1;
    for (var key in REPO_KEYPATH_SCHEMA) {
        var segs = keypathSegments(key);
        if (schemaKeyMatchesPath(segs, matchSegs) && segs.length > bestLen) {
            best = REPO_KEYPATH_SCHEMA[key];
            bestLen = segs.length;
        }
    }
    return best;
}

window.setRepoIsModified = function (value) {
    try {
        window.localStorage.setItem(ISMODIFIED_KEY, value ? "true" : "false");
    } catch (err) {
        /* ignore */
    }
    updateRepoModifiedUI();
};

window.resetRepoIsModified = function () {
    window.setRepoIsModified(false);
};

window.isRepoModified = function () {
    try {
        lev = window.localStorage.getItem(ISMODIFIED_KEY);
        return lev === "true" || lev === true || lev === "1" || lev === 1;
    } catch (err) {
        return false;
    }
};

document.addEventListener("DOMContentLoaded", function () {
    var storage = typeof window.StorageHandler !== "undefined" ? window.StorageHandler : null;
    var popupsInstance = window.popupsInstance || (typeof Popups !== "undefined" ? new Popups() : null);
    if (popupsInstance) {
        window.popupsInstance = popupsInstance;
    }
    if (storage && typeof hasAcceptedStorage === "function") {
        storage.setPersistenceAllowed(hasAcceptedStorage());
    }
    updateRepoModifiedUI();

    function buildIndexHref() {
        var href = "../index.html";
        if (window.location.href.indexOf("ls-declined") !== -1) {
            href += href.indexOf("?") !== -1 ? "&ls-declined" : "?ls-declined";
        }
        return href;
    }

    function showNoRepoMessage() {
        var mainEl = document.getElementById("editor-main");
        var noRepoEl = document.getElementById("editor-no-repo");
        var linkEl = document.getElementById("editor-no-repo-link");
        if (mainEl) {
            mainEl.classList.add("editor-no-repo");
        }
        if (noRepoEl) {
            noRepoEl.style.display = "block";
        }
        if (linkEl) {
            linkEl.href = buildIndexHref();
        }
    }

    function hideNoRepoMessage() {
        var mainEl = document.getElementById("editor-main");
        var noRepoEl = document.getElementById("editor-no-repo");
        if (mainEl) {
            mainEl.classList.remove("editor-no-repo");
        }
        if (noRepoEl) {
            noRepoEl.style.display = "none";
        }
    }

    function tryMigrateFromSessionStorage() {
        var sessionRaw = null;
        try {
            sessionRaw = window.sessionStorage.getItem("loadedRepo");
        } catch (e) {
            return Promise.resolve(null);
        }
        if (!sessionRaw || typeof sessionRaw !== "string") {
            return Promise.resolve(null);
        }
        try {
            var content = JSON.parse(sessionRaw);
            if (content && typeof content === "object") {
                return storage.set("loadedRepo", content).then(function () {
                    return content;
                });
            }
        } catch (e) {
            /* ignore */
        }
        return Promise.resolve(null);
    }

    if (!storage || typeof storage.isset !== "function") {
        showNoRepoMessage();
    } else {
        storage.isset("loadedRepo").then(function (hasLoadedRepo) {
            if (hasLoadedRepo) {
                hideNoRepoMessage();
                storage.get("loadedRepo").then(function (content) {
                    afterLoadingRepo(content);
                });
                return;
            }
            return tryMigrateFromSessionStorage().then(function (content) {
                if (content) {
                    hideNoRepoMessage();
                    afterLoadingRepo(content);
                } else {
                    showNoRepoMessage();
                }
            });
        }).catch(function () {
            showNoRepoMessage();
        });
    }

    // Editor mode toggle
    var modeToggle = document.getElementById("editor-mode-toggle");
    var modeButtons = modeToggle ? modeToggle.querySelectorAll(".editor-mode-toggle-button") : [];

    var currentEditorMode = "unknown";

    function setEditorMode(mode) {
        var modes = ["gui", "raw", "view"];
        if (modes.indexOf(mode) === -1) {
            mode = "gui";
        }

        var mainContent = document.getElementById("editor-main-content");
        var guiSection = document.getElementById("editor-mode-gui");
        var rawSection = document.getElementById("editor-mode-raw");
        var viewSection = document.getElementById("editor-mode-view");

        if (mainContent) {
            mainContent.style.display = "block";
        }
        if (guiSection) {
            guiSection.style.display = mode === "gui" ? "block" : "none";
        }
        if (rawSection) {
            rawSection.style.display = mode === "raw" ? "block" : "none";
        }
        if (viewSection) {
            viewSection.style.display = mode === "view" ? "block" : "none";
        }

        if (modeToggle) {
            modeToggle.classList.remove("mode-gui", "mode-raw", "mode-view");
            modeToggle.classList.add("mode-" + mode);
        }

        if (modeButtons && modeButtons.length) {
            modeButtons.forEach(function (btn) {
                var btnMode = btn.getAttribute("data-mode");
                var isActive = btnMode === mode;
                btn.classList.toggle("is-active", isActive);
                btn.setAttribute("aria-pressed", isActive ? "true" : "false");
            });
        }

        if (typeof window.onEditorTabChange === "function") {
            window.onEditorTabChange(currentEditorMode, mode);
        }
        currentEditorMode = mode;

        // Persist mode in URL (?mode=gui|raw|view) without reloading
        try {
            var url = new URL(window.location.href);
            url.searchParams.set("mode", mode);
            window.history.replaceState({}, "", url.toString());
        } catch (e) {
            // Ignore URL issues
        }
    }

    if (modeButtons && modeButtons.length) {
        modeButtons.forEach(function (btn) {
            btn.addEventListener("click", function () {
                var mode = btn.getAttribute("data-mode");
                setEditorMode(mode);
            });
        });

        // Pick initial mode from ?mode=url param if valid; default to "gui"
        var initialMode = "gui";
        try {
            var initUrl = new URL(window.location.href);
            var qsMode = initUrl.searchParams.get("mode");
            if (qsMode === "gui" || qsMode === "raw" || qsMode === "view") {
                initialMode = qsMode;
            }
        } catch (e) {
            // Ignore parsing issues, fall back to default
        }
        setEditorMode(initialMode);
    }

    function clearAndGoBack() {
        if (storage && typeof storage.unsetFromAllBackends === "function") {
            storage.unsetFromAllBackends("loadedRepo").then(function () {
                window.location.href = buildIndexHref();
            });
        } else {
            window.location.href = buildIndexHref();
        }
    }

    document.addEventListener("click", function (e) {
        if (!e.target || e.target.id !== "editor-go-back") {
            return;
        }
        var isModified = window.isRepoModified();
        if (isModified && popupsInstance) {
            popupsInstance.showAsOverlay("is-modified-warn", true, false, true, false);
            var confirmBtn = document.getElementById("is-modified-confirm");
            var cancelBtn = document.getElementById("is-modified-cancel");
            if (confirmBtn) {
                confirmBtn.onclick = function () {
                    popupsInstance.hideAsOverlay("is-modified-warn");
                    window.resetRepoIsModified();
                    clearAndGoBack();
                };
            }
            if (cancelBtn) {
                cancelBtn.onclick = function () {
                    popupsInstance.hideAsOverlay("is-modified-warn");
                };
            }
        } else {
            window.resetRepoIsModified();
            clearAndGoBack();
        }
    });

    // Save button click
    document.addEventListener("click", function (e) {
        if (!e.target || e.target.id !== "editor-save") {
            return;
        }
        editorOnSave(window.repoSourceType || "unknown", window.pd || null);
    });
});

async function afterLoadingRepo(content) {
    /*
    content should be validated to be an object like
    {
        "base": {
            "text": "...",
            "data": {...}
        },
        "partials": [
            { "kp": "keypath", "text": "...", "data": {...}, "filename": "..." }
        ]
    }
    Legacy: partials may be object { "keypath": { "text", "data", "filename" } }.
    */

    if (!content || typeof content !== "object" || !content.base || !content.base.data) {
        console.error("Invalid repo data: ", content);
        return;
    }

    // Clear raw mode editors when repo is replaced (new pd instance)
    var rawContainer = document.getElementById("editor-mode-raw-content");
    if (rawContainer) {
        rawContainer.innerHTML = "";
    }
    loadedEditors = {};

    var base = content.base.data;
    var partialCount = 0;
    var partialsForPd = [];

    if (Array.isArray(content.partials)) {
        partialCount = content.partials.length;
        partialsForPd = content.partials.map(function (p, idx) {
            var kp = (p && (p.kp != null ? p.kp : p.keypath)) || "";
            var loaded = p && typeof p === "object" && p.data !== undefined ? p.data : undefined;
            return {
                keypath: kp,
                url: "",
                loaded: loaded,
                onChange: function (changedKp, changedSubtree) {
                    editorOnChange(repoSourceType, window.pd || null, "partial", changedKp, changedSubtree, idx);
                }
            };
        });
    } else if (content.partials && typeof content.partials === "object") {
        var partialKeys = Object.keys(content.partials);
        partialCount = partialKeys.length;
        partialsForPd = partialKeys.map(function (kp, idx) {
            var entry = content.partials[kp];
            var loaded = entry && typeof entry === "object" && entry.data !== undefined ? entry.data : undefined;
            return {
                keypath: kp,
                url: "",
                loaded: loaded,
                onChange: function (changedKp, changedSubtree) {
                    editorOnChange(repoSourceType, window.pd || null, "partial", changedKp, changedSubtree, idx);
                }
            };
        });
    }

    function getRepoSourceType() {
        if (!content || typeof content !== "object") return "unknown";
        if (content.type === "local") return "local";
        if (content.type === "fetched") return "fetched";
        if (content.type === "api") return "api";
        return "unknown";
    }

    var repoSourceType = getRepoSourceType();
    window.repoSourceType = repoSourceType;

    function makeBaseOnChange() {
        return function (kp, changedSubtree) {
            editorOnChange(repoSourceType, window.pd || null, "base", kp, changedSubtree);
        };
    }

    window.pd = new PartialDataClass(base, partialsForPd, makeBaseOnChange());

    // Update loaded files text
    var loadedTextEl = document.getElementById("editor-loaded-files-text");
    if (loadedTextEl) {
        var baseFilename = content.base && typeof content.base === "object" ? content.base.filename : null;
        if (!baseFilename) {
            baseFilename = "repository (json)";
        }
        if (baseFilename.length > 15) {
            baseFilename = baseFilename.slice(0, 12) + "...";
        }
        var suffix = "";
        if (partialCount > 0) {
            suffix = " (+" + partialCount + " partials)";
        }
        loadedTextEl.textContent = "Loaded: " + baseFilename;
        var existingPartialsSpan = document.getElementById("editor-loaded-files-text-partials");
        if (existingPartialsSpan) {
            existingPartialsSpan.remove();
        }
        if (suffix) {
            var span = document.createElement("span");
            span.id = "editor-loaded-files-text-partials";
            span.textContent = suffix;
            loadedTextEl.appendChild(span);
        }
    }

    // Call subscribers
    onPdLoadedSubscribers.forEach(callback => callback(window.pd));
}


var onChangeSubscribers = []; // Contains f(repoSourceType="unknown", partialDataClass=null, changeIn="unknown", keypath=null, changedData={})
var onSaveSubscribers = [];   // Contains f(repoSourceType="unknown", partialDataClass=null)
var onPdLoadedSubscribers = []; // Contains f(partialDataClass=null)

window.subscribeOnEditorChange = function (callback) {
    if (typeof callback === "function") {
        onChangeSubscribers.push(callback);
    }
    return () => onChangeSubscribers.splice(onChangeSubscribers.indexOf(callback), 1);
}

window.unSubscribeOnEditorChange = function (callback) {
    if (typeof callback === "function") {
        onChangeSubscribers.splice(onChangeSubscribers.indexOf(callback), 1);
    }
}

window.subscribeOnEditorSave = function (callback) {
    if (typeof callback === "function") {
        onSaveSubscribers.push(callback);
    }
    return () => onSaveSubscribers.splice(onSaveSubscribers.indexOf(callback), 1);
}

window.unSubscribeOnEditorSave = function (callback) {
    if (typeof callback === "function") {
        onSaveSubscribers.splice(onSaveSubscribers.indexOf(callback), 1);
    }
}

window.subscribeOnPdLoaded = function (callback) {
    if (typeof callback === "function") {
        onPdLoadedSubscribers.push(callback);
    }
    return () => onPdLoadedSubscribers.splice(onPdLoadedSubscribers.indexOf(callback), 1);
}

window.unSubscribeOnPdLoaded = function (callback) {
    if (typeof callback === "function") {
        onPdLoadedSubscribers.splice(onPdLoadedSubscribers.indexOf(callback), 1);
    }
}

async function editorOnChange(repoSourceType="unknown", partialDataClass=null, changeIn="unknown", keypath=null, changedData={}, partialIndex=undefined) {
    // repoSourceType: "fetched" (url or local file path uploaded) | "local" (a local folder is selected and file is from it, reuse handle) | "api" (api was used) | "unknown" ISSUE
    // partialDataClass: PartialDataClass instance, if null tries window.pd
    // changeIn: "base" | "partial" | "unknown" ISSUE
    // keypath: keypath of the change
    // changedData: data from that keypath and down, after the change
    // partialIndex: when changeIn==="partial", index in pd.partials (for raw editor sync)

    // This function is called when a change is made to the repository.

    window.setRepoIsModified(true);

    // For now we log
    console.log("[Editor.Event] Repo changed", repoSourceType, partialDataClass, changeIn, keypath, changedData, window.isRepoModified());

    // Call subscribers
    onChangeSubscribers.forEach(callback => callback(repoSourceType, partialDataClass, changeIn, keypath, changedData, partialIndex));

    // Is ismodified still true?
    if (window.isRepoModified()) {

    } else {
        console.log("[Editor.Event] Repo is no longer modified, subscribers handled it.");
    }
}

async function editorOnSave(repoSourceType="unknown", partialDataClass=null) {
    // repoSourceType: "fetched" (url or local file path uploaded) | "local" (a local folder is selected and file is from it, reuse handle) | "api" (api was used) | "unknown" ISSUE
    // partialDataClass: PartialDataClass instance, if null tries window.pd
    
    // This function is called when the user saves the repository.

    // For now we log
    console.log("[Editor.Event] Repo saved", repoSourceType, partialDataClass);

    // Call subscribers
    onSaveSubscribers.forEach(callback => callback(repoSourceType, partialDataClass));

    // Is ismodified still true?
    if (window.isRepoModified()) {
        var storageForSave = typeof window.StorageHandler !== "undefined" ? window.StorageHandler : null;
        if (!storageForSave || typeof storageForSave.get !== "function") {
            console.error("StorageHandler is not available for saving.");
        } else {
            var loaded = await storageForSave.get("loadedRepo");
            var pd = partialDataClass || window.pd;
            if (loaded && typeof loaded === "object" && loaded.base && pd && typeof pd.getAll === "function") {
                var all = pd.getAll();
                var updatedPayload = {
                    type: loaded.type || "unknown",
                    base: {
                        data: all.base,
                        text: JSON.stringify(all.base, null, 4),
                        filename: (loaded.base && loaded.base.filename) || "repository.json"
                    },
                    partials: all.partials.map(function (p, i) {
                        var kp = p.keypath || ("partial-" + i);
                        var data = p.loaded !== undefined ? p.loaded : {};
                        var existing = Array.isArray(loaded.partials) && loaded.partials[i]
                            ? loaded.partials[i]
                            : (loaded.partials && typeof loaded.partials === "object" ? loaded.partials[kp] : null);
                        var filename = (existing && (existing.filename != null && existing.filename !== ""))
                            ? existing.filename
                            : ("partial-" + String(kp).replace(/[^a-z0-9_\-]+/gi, "_") + ".json");
                        return {
                            kp: kp,
                            data: data,
                            text: JSON.stringify(data, null, 4),
                            filename: filename
                        };
                    })
                };
                await storageForSave.set("loadedRepo", updatedPayload);
                loaded = updatedPayload;
            }
        }

        // Switch case the repoSourceType
        switch (repoSourceType) {
            case "fetched":
                // Download all the files current data as JSON
                try {
                    var storageFetched = typeof window.StorageHandler !== "undefined" ? window.StorageHandler : null;
                    if (!storageFetched || typeof storageFetched.get !== "function") {
                        throw new Error("StorageHandler is not available for saving.");
                    }

                    var loadedForFetch = loaded != null && typeof loaded === "object" && loaded.base
                        ? loaded
                        : await storageFetched.get("loadedRepo");
                    if (!loadedForFetch || typeof loadedForFetch !== "object" || !loadedForFetch.base) {
                        throw new Error("No loadedRepo found in storage.");
                    }

                    var filesToDownload = [];

                    // Base file
                    (function () {
                        var baseObj = loadedForFetch.base || {};
                        var baseText = typeof baseObj.text === "string" ? baseObj.text : JSON.stringify(baseObj.data || {}, null, 4);
                        var baseFilename = baseObj.filename || "repository.json";
                        filesToDownload.push({
                            filename: baseFilename,
                            text: baseText
                        });
                    })();

                    // Partials
                    if (Array.isArray(loadedForFetch.partials)) {
                        loadedForFetch.partials.forEach(function (p, idx) {
                            if (!p || typeof p !== "object") return;
                            var kp = (p.kp != null ? p.kp : p.keypath) || ("partial-" + idx);
                            var pText = typeof p.text === "string" ? p.text : JSON.stringify(p.data || {}, null, 4);
                            var safeKey = String(kp).replace(/[^a-z0-9_\-]+/gi, "_");
                            var pFilename = (p.filename != null && p.filename !== "") ? p.filename : ("partial-" + safeKey + ".json");
                            filesToDownload.push({
                                filename: pFilename,
                                text: pText
                            });
                        });
                    } else if (loadedForFetch.partials && typeof loadedForFetch.partials === "object") {
                        var partialKeysForSave = Object.keys(loadedForFetch.partials);
                        partialKeysForSave.forEach(function (kp) {
                            var entry = loadedForFetch.partials[kp];
                            if (!entry || typeof entry !== "object") return;
                            var pText = typeof entry.text === "string" ? entry.text : JSON.stringify(entry.data || {}, null, 4);
                            var safeKey = kp.replace(/[^a-z0-9_\-]+/gi, "_");
                            var pFilename = entry.filename || ("partial-" + safeKey + ".json");
                            filesToDownload.push({
                                filename: pFilename,
                                text: pText
                            });
                        });
                    }

                    // Trigger downloads
                    filesToDownload.forEach(function (file) {
                        try {
                            var blob = new Blob([file.text], { type: "application/json" });
                            var url = URL.createObjectURL(blob);
                            var a = document.createElement("a");
                            a.href = url;
                            a.download = file.filename;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        } catch (downloadErr) {
                            console.error("[Editor.Event] Error downloading file", file.filename, downloadErr);
                        }
                    });

                    // set ismodified to false
                    window.setRepoIsModified(false);
                } catch (e) {
                    console.error("[Editor.Event] Error saving repo to fetched source", e);
                    break;
                }
                break;
            case "local":
                // Save the repo to the local file system in the already selected folder
                try {
                    var dirHandle = null;
                    if (typeof hasAcceptedStorage === "function" && hasAcceptedStorage() && typeof indexedDB !== "undefined") {
                        try {
                            dirHandle = await new Promise(function (resolve) {
                                var request = indexedDB.open("sharedHandles", 1);
                                request.onupgradeneeded = function (event) {
                                    var db = event.target.result;
                                    if (!db.objectStoreNames.contains("handles")) {
                                        db.createObjectStore("handles");
                                    }
                                };
                                request.onsuccess = function (event) {
                                    try {
                                        var db = event.target.result;
                                        var tx = db.transaction("handles", "readonly");
                                        var store = tx.objectStore("handles");
                                        var getReq = store.get("localFolder");
                                        getReq.onsuccess = function () {
                                            resolve(getReq.result || null);
                                        };
                                        getReq.onerror = function () {
                                            resolve(null);
                                        };
                                    } catch (e) {
                                        console.error("Failed to read folder handle", e);
                                        resolve(null);
                                    }
                                };
                                request.onerror = function () {
                                    resolve(null);
                                };
                            });
                        } catch (e) {
                            console.error("Error accessing sharedHandles database", e);
                            dirHandle = null;
                        }
                    }

                    if (!dirHandle || typeof dirHandle.requestPermission !== "function") {
                        dirHandle = await window.showDirectoryPicker();
                    } else {
                        try {
                            var perm = await dirHandle.queryPermission ? await dirHandle.queryPermission({ mode: "readwrite" }) : "prompt";
                            if (perm !== "granted") {
                                perm = await dirHandle.requestPermission({ mode: "readwrite" });
                            }
                            if (perm !== "granted") {
                                dirHandle = await window.showDirectoryPicker();
                            }
                        } catch (e) {
                            console.warn("Permission issue for existing handle, re-prompting", e);
                            dirHandle = await window.showDirectoryPicker();
                        }
                    }

                    var storageForLocalSave = typeof window.StorageHandler !== "undefined" ? window.StorageHandler : null;
                    if (!storageForLocalSave || typeof storageForLocalSave.get !== "function") {
                        throw new Error("StorageHandler is not available for saving.");
                    }

                    var loadedLocal = (loaded && typeof loaded === "object" && loaded.base)
                        ? loaded
                        : await storageForLocalSave.get("loadedRepo");
                    if (!loadedLocal || typeof loadedLocal !== "object" || !loadedLocal.base) {
                        throw new Error("No loadedRepo found in storage.");
                    }

                    var filesToWrite = [];

                    (function () {
                        var baseObj = loadedLocal.base || {};
                        var baseText = typeof baseObj.text === "string" ? baseObj.text : JSON.stringify(baseObj.data || {}, null, 4);
                        var baseFilename = baseObj.filename || "repository.json";
                        filesToWrite.push({
                            filename: baseFilename,
                            text: baseText
                        });
                    })();

                    if (Array.isArray(loadedLocal.partials)) {
                        loadedLocal.partials.forEach(function (p, idx) {
                            if (!p || typeof p !== "object") return;
                            var kp = (p.kp != null ? p.kp : p.keypath) || ("partial-" + idx);
                            var pText = typeof p.text === "string" ? p.text : JSON.stringify(p.data || {}, null, 4);
                            var safeKey = String(kp).replace(/[^a-z0-9_\-]+/gi, "_");
                            var pFilename = (p.filename != null && p.filename !== "") ? p.filename : ("partial-" + safeKey + ".json");
                            filesToWrite.push({
                                filename: pFilename,
                                text: pText
                            });
                        });
                    } else if (loadedLocal.partials && typeof loadedLocal.partials === "object") {
                        var partialKeysLocal = Object.keys(loadedLocal.partials);
                        partialKeysLocal.forEach(function (kp) {
                            var entry = loadedLocal.partials[kp];
                            if (!entry || typeof entry !== "object") return;
                            var pText = typeof entry.text === "string" ? entry.text : JSON.stringify(entry.data || {}, null, 4);
                            var safeKey = kp.replace(/[^a-z0-9_\-]+/gi, "_");
                            var pFilename = entry.filename || ("partial-" + safeKey + ".json");
                            filesToWrite.push({
                                filename: pFilename,
                                text: pText
                            });
                        });
                    }

                    for (var iFile = 0; iFile < filesToWrite.length; iFile++) {
                        var f = filesToWrite[iFile];
                        try {
                            var fileHandle = await dirHandle.getFileHandle(f.filename, { create: true });
                            var writable = await fileHandle.createWritable();
                            await writable.write(f.text);
                            await writable.close();
                        } catch (writeErr) {
                            console.error("[Editor.Event] Error writing file to local folder", f.filename, writeErr);
                        }
                    }

                    window.setRepoIsModified(false);
                } catch (e) {
                    console.error("[Editor.Event] Error saving repo to LOCAL source", e);
                    break;
                }
                break;
            case "api":
                // Call the save endpoint of the api, for base and partials
                throw new Error("Saving to API is not implemented");
                break;
            case "unknown":
                throw new Error("Unknown repo source type");
                break;
        }
    } else {
        console.log("[Editor.Event] Repo is no longer modified, subscribers handled it.");
    }
}

async function onEditorTabChange(fromMode="unknown", toMode="unknown") {
    // fromMode: "gui" | "raw" | "view" | "unknown" ISSUE
    // toMode: "gui" | "raw" | "view" | "unknown" ISSUE

    // This function is called when the user changes the tab of the editor.

    // For now we log
    console.log("[Editor.Event] Editor tab changed from", fromMode, "to", toMode);
}


//region: ViewHelpers
/**
 * Builds a node graph by recursively walking the JSON object, for use with showNodeGraph.
 * Matches keypaths to REPO_KEYPATH_SCHEMA for type, info, showUnder, collapsed.
 * Primitive values appear as a child node with type property-value, bool-value, or number-value.
 * @param {any} rootValue - Root JSON value
 * @param {string} [rootName="Root"] - Name for the root node
 * @param {boolean} [flattenArrays=false] - If true, array index nodes are skipped; array elements become direct children
 * @returns {Array} Array of node objects (single root)
 */
function getNodeGraphOf(rootValue, rootName, flattenArrays) {
    var name = rootName != null ? String(rootName) : "Root";

    var walk = function (value, nodeName, path) {
        if (!path) path = [];
        var schema = getSchemaForPath(path);
        var applySchema = function (node) {
            if (!schema) return node;
            if (schema.type != null) node.type = schema.type;
            if (schema.info != null) node.info = schema.info;
            if (schema.showUnder != null) node.showUnder = schema.showUnder;
            if (schema.collapsed != null) node.collapsed = schema.collapsed;
            return node;
        };

        if (value === null) {
            var nullNode = applySchema({
                name: nodeName,
                type: "property",
                children: [{ name: "null", type: "null" }]
            });
            return nullNode;
        }
        if (Array.isArray(value)) {
            var arrChildren = [];
            for (var i = 0; i < value.length; i++) {
                arrChildren.push(walk(value[i], String(i), path.concat(i)));
            }
            return applySchema({ name: nodeName, type: "array", children: arrChildren });
        }
        if (typeof value === "object") {
            var objChildren = [];
            for (var key in value) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    objChildren.push(walk(value[key], key, path.concat(key)));
                }
            }
            return applySchema({ name: nodeName, type: "object", children: objChildren });
        }
        if (value === "") {
            return applySchema({ name: nodeName, type: "property", children: [] });
        }
        var valueType = typeof value === "boolean"
            ? "bool-value"
            : typeof value === "number"
                ? "number-value"
                : "property-value";
        var valueNode = { name: String(value), type: valueType };
        return applySchema({
            name: nodeName,
            type: "property",
            children: [valueNode]
        });
    };

    var graph = [walk(rootValue, name, [])];

    if (flattenArrays) {
        var flatten = function (nodes) {
            if (!nodes || !Array.isArray(nodes)) return;
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                if (node.type === "array" && node.children && node.children.length > 0) {
                    node.children = node.children.flatMap(function (indexNode) {
                        return indexNode.children ? indexNode.children : [indexNode];
                    });
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

async function renderViewTab() {
    try {
        if (!window.pd || typeof window.pd.getStatic !== "function") {
            console.warn("[Editor.View] PartialDataClass is not ready");
            return;
        }
        var container = document.getElementById("editor-mode-view-graph");
        if (!container) {
            console.warn("[Editor.View] View container not found");
            return;
        }
        var data = await window.pd.getStatic(".");
        // Use filename as root name when available; fallback to a generic label
        var rootName = "Repository";
        try {
            var storageForName = typeof window.StorageHandler !== "undefined" ? window.StorageHandler : null;
            if (storageForName && typeof storageForName.get === "function") {
                var loaded = await storageForName.get("loadedRepo");
                if (loaded && loaded.base && typeof loaded.base.filename === "string" && loaded.base.filename.length > 0) {
                    rootName = loaded.base.filename;
                }
            }
        } catch (e) {
            // Ignore name lookup issues
        }
        var graph = getNodeGraphOf(data, rootName, true);
        // Re-render entire graph for root
        if (typeof updateNodeGraph === "function") {
            updateNodeGraph(".", graph, container);
        } else if (typeof showNodeGraph === "function") {
            container.innerHTML = "";
            showNodeGraph(graph, container);
        }
    } catch (e) {
        console.error("[Editor.View] Failed to render view tab", e);
    }
}
//endregion: ViewHelpers

var loadedEditors = {};

var onRawTabChangeSubscribers = [];

window.subscribeOnRawTabChange = function (callback) {
    if (typeof callback === "function") {
        onRawTabChangeSubscribers.push(callback);
    }
    return () => onRawTabChangeSubscribers.splice(onRawTabChangeSubscribers.indexOf(callback), 1);
}

window.unSubscribeOnRawTabChange = function (callback) {
    if (typeof callback === "function") {
        onRawTabChangeSubscribers.splice(onRawTabChangeSubscribers.indexOf(callback), 1);
    }
}

window.onRawTabChange = function (from="unknown", to="unknown") {
    // from / to : data-tab-id

    // call all subscribers
    onRawTabChangeSubscribers.forEach(callback => callback(from, to));

    // Log
    console.log(`[Editor.Event] Raw tab changed from '${from}' to '${to}'`);

    // Get the data from PartialDataClass (window.pd)
    let obj = {"to": to};
    let missingPartial = false;
    try {
        if (window.pd) {
            if (typeof to === "string" && to.indexOf("base-") === 0) {
                obj.type = "base";
                obj.data = window.pd.base;
            }

            if (typeof to === "string" && to.indexOf("partial-") === 0) {
                var idx = parseInt(to.slice("partial-".length), 10);
                if (isNaN(idx) || idx < 0 || !window.pd.partials || !window.pd.partials[idx]) {
                    obj.type = "partial.missing";
                    obj.partialIndex = idx;
                    missingPartial = true;
                }
                var p = window.pd.partials[idx];
                obj = {
                    type: "partial",
                    partialIndex: idx,
                    keypath: p.keypath,
                    data: p.loaded
                };
            }
        }
    } catch (e) {
        console.warn("[Editor.Event] Failed to retrive raw tab data", e);
    }

    // Log the data in PartialDataClass (window.pd)
    if (!window.pd) {
        console.log("[Editor.Event] Raw tab data (pd not ready)", obj);
    } else {
        if (typeof to === "string" && to.indexOf("base-") === 0) {
            console.log("[Editor.Event] Raw tab data", obj);
        } else if (typeof to === "string" && to.indexOf("partial-") === 0) {
            if (missingPartial) {
                console.log("[Editor.Event] Raw tab data (partial not found)", obj);
            } else {
                console.log("[Editor.Event] Raw tab data", obj);
            }
        }
    }
}