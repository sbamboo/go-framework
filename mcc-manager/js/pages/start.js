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

    function buildEditorUrl() {
        var target = "./pages/editor.html";
        try {
            var url = new URL(window.location.href);
            if (url.searchParams.has("ls-declined")) {
                var sep = target.indexOf("?") === -1 ? "?" : "&";
                target += sep + "ls-declined";
            }
        } catch (e) {
            // Ignore URL parsing errors.
        }
        return target;
    }

    async function saveAndRedirectToEditor(partialsResult) {
        var payload = {
            base: {
                text: currentBaseText,
                data: currentBaseData
            },
            partials: partialsResult || {}
        };

        var savePromise = Promise.resolve();
        if (window.StorageHandler && typeof window.StorageHandler.set === "function") {
            try {
                if (typeof hasAcceptedStorage === "function" &&
                    typeof window.StorageHandler.setPersistenceAllowed === "function") {
                    window.StorageHandler.setPersistenceAllowed(hasAcceptedStorage());
                }
                savePromise = window.StorageHandler.set("current-repo", payload);
            } catch (e) {
                setRepoError("Storage error: " + (e && e.message ? e.message : String(e)));
            }
        }

        var redirect = function () {
            window.location.href = buildEditorUrl();
        };

        try {
            await Promise.race([
                savePromise,
                new Promise(function (_, reject) {
                    setTimeout(function () {
                        reject(new Error("Storage timeout"));
                    }, 5000);
                })
            ]);
        } catch (e) {
            if (repoError) {
                repoError.textContent = "";
            }
        }

        redirect();
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
        if (!repoSourceInput) {
            return false;
        }

        if (repoSourceInput.type === "file") {
            return repoSourceInput.files && repoSourceInput.files.length > 0;
        }

        if (repoSourceInput.type === "url" || repoSourceInput.type === "text") {
            return isValidUrl(repoSourceInput.value);
        }

        return false;
    }

    function updateRepoFetchState() {
        if (!repoFetchButton) {
            return;
        }
        repoFetchButton.disabled = !isRepoFetchEnabled();
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

    function buildPartialsModal(partials) {
        currentPartials = partials || null;

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
            toggleButton.textContent = "Url";
            toggleButton.setAttribute("aria-pressed", "true");

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

            var lastUrlValue = input.value || "";

            inputWrap.appendChild(input);
            fieldRow.appendChild(toggleButton);
            fieldRow.appendChild(inputWrap);

            sourceCell.appendChild(fieldRow);
            row.appendChild(sourceCell);

            toggleButton.addEventListener("click", function () {
                var isLocal = toggleButton.textContent.trim().toLowerCase() === "local";

                if (isLocal) {
                    // Switch to Url: restore previous URL value
                    toggleButton.textContent = "Url";
                    toggleButton.setAttribute("aria-pressed", "true");
                    input.type = "url";
                    input.removeAttribute("accept");
                    input.setAttribute("placeholder", "https://example.com/partial.json");
                    input.value = lastUrlValue;
                } else {
                    // Switch to Local: remember current URL before changing input type
                    if (input.type === "url") {
                        lastUrlValue = input.value || "";
                    }
                    toggleButton.textContent = "Local";
                    toggleButton.setAttribute("aria-pressed", "false");
                    input.value = "";
                    input.type = "file";
                    input.removeAttribute("placeholder");
                    input.setAttribute("accept", "application/json,.repo,.jrepo,.mccr,.mccrepo,.mrepo,.mRepo");
                }
            });

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

            return {
                text: text,
                data: data
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
                    data: data
                });
            };

            reader.onerror = function () {
                reject(new Error('Failed to read file for partial "' + key + '".'));
            };

            reader.readAsText(file);
        });
    }

    if (repoSourceToggle && repoSourceInput) {
        repoSourceToggle.addEventListener("click", function () {
            var isLocal = repoSourceToggle.textContent.trim().toLowerCase() === "local";

            setRepoError("");

            if (isLocal) {
                repoSourceToggle.textContent = "Url";
                repoSourceToggle.setAttribute("aria-pressed", "true");
                repoSourceInput.value = "";
                repoSourceInput.type = "url";
                repoSourceInput.removeAttribute("accept");
                repoSourceInput.setAttribute("placeholder", "https://example.com/repository-file.json");
            } else {
                repoSourceToggle.textContent = "Local";
                repoSourceToggle.setAttribute("aria-pressed", "false");
                repoSourceInput.value = "";
                repoSourceInput.type = "file";
                repoSourceInput.removeAttribute("placeholder");
                repoSourceInput.setAttribute("accept", repoAccept);
            }

            updateRepoFetchState();
        });

        repoSourceInput.addEventListener("change", updateRepoFetchState);
        repoSourceInput.addEventListener("input", updateRepoFetchState);
    }

    if (repoFetchButton) {
        repoFetchButton.addEventListener("click", async function () {
            setRepoError("");

            if (!repoSourceInput || repoSourceInput.type !== "file") {
                setRepoError("Fetch currently only supports Local files.");
                return;
            }

            if (!repoSourceInput.files || repoSourceInput.files.length === 0) {
                setRepoError("No file selected.");
                return;
            }

            for (var i = 0; i < repoSourceInput.files.length; i++) {
                var file = repoSourceInput.files[i];
                try {
                    var textContent = await file.text();
                    var data = JSON.parse(textContent);

                    currentBaseText = textContent;
                    currentBaseData = data;

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
                            await saveAndRedirectToEditor({});
                        }
                    } else {
                        await saveAndRedirectToEditor({});
                    }
                } catch (e) {
                    setRepoError("Failed to parse JSON: " + (e && e.message ? e.message : String(e)));
                    return;
                }
            }
        });
    }

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

                    if (!toggle || !input) {
                        continue;
                    }

                    var isLocal = toggle.textContent.trim().toLowerCase() === "local";

                    if (isLocal) {
                        var fileResult = await readPartialFromFile(key, input);
                        result[key] = fileResult;
                    } else {
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

            await saveAndRedirectToEditor(result);
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