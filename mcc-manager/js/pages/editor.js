/* JS for the editor page */

var ISMODIFIED_KEY = "ismodified";

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
                    clearAndGoBack();
                };
            }
            if (cancelBtn) {
                cancelBtn.onclick = function () {
                    popupsInstance.hideAsOverlay("is-modified-warn");
                };
            }
        } else {
            clearAndGoBack();
        }
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
        "partials": {
            "keypath": {
                "text": "...",
                "data": {...}
            }
        }
    }
    */

    if (!content || typeof content !== "object" || !content.base || !content.base.data) {
        console.error("Invalid repo data: ", content);
        return;
    }

    var base = content.base.data;
    var partialsList = [];
    var partialKeys = [];
    if (content.partials && typeof content.partials === "object") {
        partialKeys = Object.keys(content.partials);
        for (var i = 0; i < partialKeys.length; i++) {
            var kp = partialKeys[i];
            var entry = content.partials[kp];
            partialsList.push({
                keypath: kp,
                url: "",
                loaded: entry && typeof entry === "object" && entry.data !== undefined ? entry.data : undefined
            });
        }
    }

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
        if (partialKeys.length > 0) {
            suffix = " (+" + partialKeys.length + " partials)";
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

    window.pd = new PartialDataClass(base, partialsList, null);
}