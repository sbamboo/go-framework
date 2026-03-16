/* JS for the start page */

document.addEventListener("DOMContentLoaded", function () {
    var repoSourceToggle = document.getElementById("repo-source-toggle");
    var repoSourceInput = document.getElementById("repo-source-input");
    var repoFetchButton = document.getElementById("repo-fetch");
    var repoError = document.getElementById("repo-error");
    var apiAddressInput = document.getElementById("api-address");
    var apiConnectButton = document.getElementById("api-connect");
    var partialsTableBody = document.getElementById("partials-table-body");
    var partialsError = document.getElementById("partials-error");
    var partialsOkButton = document.getElementById("partials-ok");
    var partialsCancelButton = document.getElementById("partials-cancel");
    var repoAccept = "application/json,.repo,.jrepo,.mccr,.mccrepo,.mrepo,.mRepo";
    var popupsInstance = window.popupsInstance || (typeof Popups !== "undefined" ? new Popups() : null);
    if (popupsInstance) {
        window.popupsInstance = popupsInstance;
    }

    var currentPartials = null;
    var currentBaseText = null;
    var currentBaseData = null;
    var currentBaseFilename = null;
    var currentFolderHandle = null;
    var currentFolderFileNames = [];
    var currentPartialsFolderHandle = null;
    var currentSaveType = "fetched";

    var storage = typeof window.StorageHandler !== "undefined" ? window.StorageHandler : null;
    if (storage && typeof hasAcceptedStorage === "function") {
        storage.setPersistenceAllowed(hasAcceptedStorage());
    }

    function buildEditorHref() {
        var href = "./pages/editor.html";
        if (window.location.href.indexOf("ls-declined") !== -1) {
            href += href.indexOf("?") !== -1 ? "&ls-declined" : "?ls-declined";
        }
        return href;
    }

    if (storage) {
        storage.get("loadedRepo").then(function (loadedRepo) {
            if (loadedRepo) {
                window.location.href = buildEditorHref();
            }
        });
    }

    function saveAndRedirectToEditor(payload) {
        if (!storage) {
            window.location.href = "./pages/editor.html";
            return;
        }
        storage.set("loadedRepo", payload).then(function () {
            window.location.href = buildEditorHref();
        });
    }

    function isValidUrl(value) {
        if (!value || typeof value !== "string") {
            return false;
        }
        try {
            // Allow relative and absolute URLs by requiring protocol or leading "/"
            var url = new URL(value, window.location.origin);
            return typeof url.href === "string" && url.href.length > 0;
        } catch (e) {
            return false;
        }
    }

    function isRepoFetchEnabled() {
        var input = document.getElementById("repo-source-input");
        if (!input) {
            return false;
        }
        if (input.type === "file") {
            return input.files && input.files.length > 0;
        }
        if (input.type === "url" || input.type === "text") {
            return isValidUrl(input.value);
        }
        return false;
    }

    function updateRepoFetchState() {
        var btn = document.getElementById("repo-fetch");
        if (btn) {
            btn.disabled = !isRepoFetchEnabled();
        }
    }

    function setRepoError(message) {
        if (!repoError) {
            return;
        }
        repoError.textContent = message || "";
    }

    function updateApiConnectState() {
        if (!apiConnectButton || !apiAddressInput) {
            return;
        }
        apiConnectButton.disabled = !isValidUrl(apiAddressInput.value);
    }

    function setPartialsError(message) {
        if (!partialsError) {
            return;
        }
        partialsError.textContent = message || "";
    }

    var repoFileExtensions = [".json", ".repo", ".jrepo", ".mccr", ".mccrepo", ".mrepo", ".mRepo"];

    function isRepoFileName(name) {
        if (!name || typeof name !== "string") return false;
        var lower = name.toLowerCase();
        return repoFileExtensions.some(function (ext) {
            return lower === ext.toLowerCase() || lower.endsWith(ext.toLowerCase());
        });
    }

    function buildPartialsModal(partials, options) {
        currentPartials = partials || null;
        var folderFileNames = (options && options.folderFileNames) || [];
        var hasFolder = folderFileNames.length > 0 && (options && options.folderHandle);
        currentPartialsFolderHandle = hasFolder ? options.folderHandle : null;
        currentSaveType = hasFolder ? "local" : "fetched";

        if (!partialsTableBody) {
            return;
        }

        setPartialsError("");
        partialsTableBody.innerHTML = "";

        if (!currentPartials || typeof currentPartials !== "object") {
            return;
        }

        var keys = Object.keys(currentPartials);
        keys.forEach(function (key) {
            var row = document.createElement("tr");

            var keyCell = document.createElement("td");
            keyCell.textContent = key;
            row.appendChild(keyCell);

            var sourceCell = document.createElement("td");

            var fieldRow = document.createElement("div");
            fieldRow.className = "start-field-row start-field-row-repo";

            var prefixSpan = document.createElement("span");
            prefixSpan.className = "start-field-prefix";
            prefixSpan.textContent = "From:";
            fieldRow.appendChild(prefixSpan);

            var toggleButton = document.createElement("button");
            toggleButton.type = "button";
            toggleButton.className = "start-toggle partials-source-toggle";

            var inputWrap = document.createElement("div");
            inputWrap.className = "start-input-wrap";

            var input = document.createElement("input");
            input.className = "start-input partials-source-input";
            input.type = "url";
            input.placeholder = "https://example.com/partial.json";

            var partialUrl = currentPartials[key];
            if (typeof partialUrl === "string" && partialUrl.length > 0) {
                input.value = partialUrl;
            }

            var selectEl = null;
            if (hasFolder) {
                selectEl = document.createElement("select");
                selectEl.className = "start-input partials-source-select";
                folderFileNames.forEach(function (fileName) {
                    var opt = document.createElement("option");
                    opt.value = fileName;
                    opt.textContent = fileName;
                    selectEl.appendChild(opt);
                });
            }

            var lastUrlValue = input.value || "";

            fieldRow.appendChild(toggleButton);
            fieldRow.appendChild(inputWrap);
            if (selectEl) {
                inputWrap.appendChild(selectEl);
            }
            inputWrap.appendChild(input);

            sourceCell.appendChild(fieldRow);
            row.appendChild(sourceCell);

            function setMode(mode) {
                var isFile = mode === "file";
                var isLocal = mode === "local";
                var isUrl = mode === "url";
                if (selectEl) {
                    selectEl.style.display = isFile ? "block" : "none";
                }
                if (input) {
                    input.style.display = isFile ? "none" : "block";
                    input.type = isUrl ? "url" : "file";
                    if (isUrl) {
                        input.value = lastUrlValue;
                        input.setAttribute("placeholder", "https://example.com/partial.json");
                    } else {
                        if (input.type === "url") lastUrlValue = input.value || "";
                        input.value = "";
                        input.removeAttribute("placeholder");
                        input.setAttribute("accept", repoAccept);
                    }
                }
                toggleButton.textContent = isFile ? "File" : (isLocal ? "Local" : "Url");
            }

            var hasUrl = typeof partialUrl === "string" && partialUrl.length > 0;
            var initialMode;
            if (hasUrl) {
                initialMode = "url";
            } else if (hasFolder) {
                initialMode = "file";
            } else {
                initialMode = "local";
            }

            setMode(initialMode);

            toggleButton.addEventListener("click", function () {
                var label = toggleButton.textContent.trim().toLowerCase();
                if (hasFolder) {
                    if (label === "file") {
                        lastUrlValue = input.value || "";
                        setMode("local");
                    } else if (label === "local") {
                        setMode("url");
                    } else {
                        if (input.type === "url") lastUrlValue = input.value || "";
                        setMode("file");
                    }
                } else {
                    var isLocal = label === "local";
                    if (isLocal) {
                        toggleButton.textContent = "Url";
                        toggleButton.setAttribute("aria-pressed", "true");
                        input.type = "url";
                        input.removeAttribute("accept");
                        input.setAttribute("placeholder", "https://example.com/partial.json");
                        input.value = lastUrlValue;
                    } else {
                        if (input.type === "url") lastUrlValue = input.value || "";
                        toggleButton.textContent = "Local";
                        toggleButton.setAttribute("aria-pressed", "false");
                        input.value = "";
                        input.type = "file";
                        input.removeAttribute("placeholder");
                        input.setAttribute("accept", repoAccept);
                    }
                }
            });

            if (hasFolder) {
                setMode("file");
            }

            partialsTableBody.appendChild(row);
        });
    }

    async function fetchPartialFromUrl(key, url) {
        try {
            var response = await fetch(url);
            if (!response || !response.ok) {
                throw new Error("HTTP " + (response ? response.status : "unknown"));
            }

            var text = await response.text();
            var data = null;

            try {
                data = JSON.parse(text);
            } catch (e) {
                data = null;
            }

            var filename = null;
            try {
                var urlObj = new URL(url, window.location.origin);
                var parts = urlObj.pathname.split("/").filter(Boolean);
                filename = parts.length > 0 ? parts[parts.length - 1] : urlObj.href;
            } catch (e) {
                filename = url;
            }

            return {
                text: text,
                data: data,
                filename: filename
            };
        } catch (e) {
            throw new Error('Failed to fetch partial "' + key + '": ' + (e && e.message ? e.message : String(e)));
        }
    }

    function readPartialFromFile(key, input) {
        return new Promise(function (resolve, reject) {
            if (!input || input.type !== "file" || !input.files || input.files.length === 0) {
                reject(new Error('No file selected for partial "' + key + '".'));
                return;
            }

            var file = input.files[0];
            var reader = new FileReader();

            reader.onload = function (evt) {
                var text = String(evt.target && evt.target.result ? evt.target.result : "");
                var data = null;

                try {
                    data = JSON.parse(text);
                } catch (e) {
                    data = null;
                }

                resolve({
                    text: text,
                    data: data,
                    filename: file && file.name ? file.name : null
                });
            };

            reader.onerror = function () {
                reject(new Error('Failed to read file for partial "' + key + '".'));
            };

            reader.readAsText(file);
        });
    }

    function readPartialFromFolder(key, folderHandle, fileName) {
        return folderHandle.getFileHandle(fileName).then(function (fileHandle) {
            return fileHandle.getFile();
        }).then(function (file) {
            return file.text();
        }).then(function (text) {
            var data = null;
            try {
                data = JSON.parse(text);
            } catch (e) {
                data = null;
            }
            return { text: text, data: data, filename: fileName };
        }).catch(function (e) {
            throw new Error('Failed to read partial "' + key + '" from folder: ' + (e && e.message ? e.message : String(e)));
        });
    }

    document.addEventListener("click", function (e) {
        if (!e.target || e.target.id !== "repo-source-toggle") {
            return;
        }
        var toggle = e.target;
        var input = document.getElementById("repo-source-input");
        if (!input) {
            return;
        }
        setRepoError("");
        var isLocal = toggle.getAttribute("aria-pressed") === "false";

        if (isLocal) {
            toggle.textContent = "Url";
            toggle.setAttribute("aria-pressed", "true");
            input.value = "";
            input.type = "url";
            input.removeAttribute("accept");
            input.setAttribute("placeholder", "https://example.com/repository-file.json");
        } else {
            toggle.textContent = "Local";
            toggle.setAttribute("aria-pressed", "false");
            input.value = "";
            input.type = "file";
            input.removeAttribute("placeholder");
            input.setAttribute("accept", repoAccept);
        }
        updateRepoFetchState();
    });

    document.addEventListener("change", function (e) {
        if (e.target && e.target.id === "repo-source-input") {
            updateRepoFetchState();
        }
    });
    document.addEventListener("input", function (e) {
        if (e.target && e.target.id === "repo-source-input") {
            updateRepoFetchState();
        }
    });

    document.addEventListener("click", function (e) {
        if (!e.target || e.target.id !== "repo-fetch") {
            return;
        }
        var repoSourceInputEl = document.getElementById("repo-source-input");
        if (!repoSourceInputEl || repoSourceInputEl.type !== "file") {
            setRepoError("Fetch currently only supports Local files.");
            return;
        }
        if (!repoSourceInputEl.files || repoSourceInputEl.files.length === 0) {
            setRepoError("No file selected.");
            return;
        }
        setRepoError("");

        var runFetch = async function () {
            for (var i = 0; i < repoSourceInputEl.files.length; i++) {
                var file = repoSourceInputEl.files[i];
                try {
                    var textContent = await file.text();
                    var data = JSON.parse(textContent);

                    currentBaseText = textContent;
                    currentBaseData = data;
                    currentBaseFilename = file && file.name ? file.name : null;

                    if (data && typeof data === "object" && data.partials && typeof data.partials === "object") {
                        var partialKeys = Object.keys(data.partials);
                        if (partialKeys.length > 0) {
                            buildPartialsModal(data.partials);

                            if (popupsInstance) {
                                popupsInstance.showAsOverlay("partials-modal", true, false, true, false);

                                var closer = document.getElementById("settings-closer");
                                if (closer) {
                                    closer.onclick = function () {
                                        popupsInstance.hideAsOverlay("partials-modal");
                                    };
                                }
                            }
                        } else {
                            saveAndRedirectToEditor({
                                base: { text: currentBaseText, data: currentBaseData, filename: currentBaseFilename },
                                partials: {},
                                type: "fetched"
                            });
                        }
                    } else {
                        saveAndRedirectToEditor({
                            base: { text: currentBaseText, data: currentBaseData, filename: currentBaseFilename },
                            partials: {},
                            type: "fetched"
                        });
                    }
                } catch (e) {
                    setRepoError("Failed to parse JSON: " + (e && e.message ? e.message : String(e)));
                    return;
                }
            }
        };
        runFetch();
    });

    var folderOpenSupported = typeof window.showDirectoryPicker === "function";
    var folderOpenBtn = document.getElementById("folder-open");
    if (folderOpenBtn) {
        folderOpenBtn.disabled = !folderOpenSupported;
    }

    document.addEventListener("click", function (e) {
        if (!e.target || e.target.id !== "folder-open") {
            return;
        }
        window.showDirectoryPicker().then(function (dirHandle) {
            currentFolderHandle = dirHandle;
            return (async function () {
                var list = [];
                var iter = dirHandle.values();
                while (true) {
                    var entry = await iter.next();
                    if (entry.done) break;
                    var item = entry.value;
                    if (item.kind === "file" && isRepoFileName(item.name)) {
                        list.push(item.name);
                    }
                }
                return list;
            })();
        }).then(function (list) {
            currentFolderFileNames = list || [];
            currentFolderFileNames.sort();
            var baseRow = document.getElementById("folder-base-row");
            var loadWrap = document.getElementById("folder-load-wrap");
            var selectEl = document.getElementById("folder-base-select");
            if (baseRow) baseRow.style.display = "block";
            if (loadWrap) loadWrap.style.display = "flex";
            if (selectEl) {
                selectEl.innerHTML = "";
                currentFolderFileNames.forEach(function (name) {
                    var opt = document.createElement("option");
                    opt.value = name;
                    opt.textContent = name;
                    selectEl.appendChild(opt);
                });
            }
        }).catch(function (err) {
            if (err && err.name !== "AbortError") {
                setRepoError(err.message || "Failed to open folder.");
            }
        });
    });

    document.addEventListener("click", function (e) {
        if (!e.target || e.target.id !== "folder-load") {
            return;
        }
        var selectEl = document.getElementById("folder-base-select");
        if (!currentFolderHandle || !selectEl || !selectEl.value) {
            setRepoError("Select a base repo file.");
            return;
        }
        setRepoError("");
        var fileName = selectEl.value;
        currentBaseFilename = fileName;
        currentFolderHandle.getFileHandle(fileName).then(function (fileHandle) {
            return fileHandle.getFile();
        }).then(function (file) {
            return file.text();
        }).then(function (textContent) {
            var data = JSON.parse(textContent);
            currentBaseText = textContent;
            currentBaseData = data;

            if (data && typeof data === "object" && data.partials && typeof data.partials === "object") {
                var partialKeys = Object.keys(data.partials);
                if (partialKeys.length > 0) {
                    buildPartialsModal(data.partials, {
                        folderFileNames: currentFolderFileNames,
                        folderHandle: currentFolderHandle
                    });
                    if (popupsInstance) {
                        popupsInstance.showAsOverlay("partials-modal", true, false, true, false);
                        var closer = document.getElementById("settings-closer");
                        if (closer) {
                            closer.onclick = function () {
                                popupsInstance.hideAsOverlay("partials-modal");
                            };
                        }
                    }
                } else {
                    saveAndRedirectToEditor({
                        base: { text: currentBaseText, data: currentBaseData, filename: currentBaseFilename },
                        partials: {},
                        type: "local"
                    });
                }
            } else {
                saveAndRedirectToEditor({
                    base: { text: currentBaseText, data: currentBaseData, filename: currentBaseFilename },
                    partials: {},
                    type: "local"
                });
            }
        }).catch(function (err) {
            setRepoError(err && err.message ? err.message : "Failed to load file.");
        });
    });

    if (partialsOkButton && partialsTableBody) {
        partialsOkButton.addEventListener("click", async function () {
            if (!currentPartials || typeof currentPartials !== "object") {
                setPartialsError("No partials to load.");
                return;
            }

            setPartialsError("");

            var rows = partialsTableBody.querySelectorAll("tr");
            var keys = Object.keys(currentPartials);
            var result = {};

            try {
                for (var i = 0; i < keys.length; i++) {
                    var key = keys[i];
                    var row = rows[i];
                    if (!row) {
                        continue;
                    }

                    var toggle = row.querySelector(".partials-source-toggle");
                    var input = row.querySelector(".partials-source-input");
                    var select = row.querySelector(".partials-source-select");

                    if (!toggle) {
                        continue;
                    }

                    var mode = toggle.textContent.trim().toLowerCase();

                    if (mode === "file" && select && currentPartialsFolderHandle) {
                        var fileName = select.value;
                        if (!fileName) {
                            throw new Error('No file selected for partial "' + key + '".');
                        }
                        var folderResult = await readPartialFromFolder(key, currentPartialsFolderHandle, fileName);
                        result[key] = folderResult;
                    } else if (mode === "local" && input) {
                        var fileResult = await readPartialFromFile(key, input);
                        result[key] = fileResult;
                    } else if ((mode === "url" || !mode) && input) {
                        if (!isValidUrl(input.value)) {
                            throw new Error('Invalid URL for partial "' + key + '".');
                        }
                        var urlResult = await fetchPartialFromUrl(key, input.value);
                        result[key] = urlResult;
                    }
                }
            } catch (e) {
                setPartialsError(e && e.message ? e.message : String(e));
                return;
            }

            if (popupsInstance) {
                popupsInstance.hideAsOverlay("partials-modal");
            }

            saveAndRedirectToEditor({
                base: { text: currentBaseText, data: currentBaseData, filename: currentBaseFilename },
                partials: result,
                type: currentSaveType
            });
        });
    }

    if (partialsCancelButton) {
        partialsCancelButton.addEventListener("click", function () {
            setPartialsError("");
            if (popupsInstance) {
                popupsInstance.hideAsOverlay("partials-modal");
            }
        });
    }

    if (apiAddressInput) {
        apiAddressInput.addEventListener("input", updateApiConnectState);
        apiAddressInput.addEventListener("change", updateApiConnectState);
    }

    if (repoSourceInput && repoSourceInput.type === "file") {
        repoSourceInput.setAttribute("accept", repoAccept);
    }

    updateRepoFetchState();
    updateApiConnectState();
});