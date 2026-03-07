(function () {
    var STORAGE_JSON = "mcc-editor-json";
    var STORAGE_FILENAME = "mcc-editor-filename";

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

    function goToEditor(jsonString, filename) {
        try {
            sessionStorage.setItem(STORAGE_JSON, jsonString);
            sessionStorage.setItem(STORAGE_FILENAME, filename || "config.json");
            var editorUrl = typeof appendLsDeclinedToPath === "function" ? appendLsDeclinedToPath("editor.html") : "editor.html";
            window.location.href = editorUrl;
        } catch (e) {
            showError("Could not store data: " + (e.message || String(e)));
        }
    }

    function showError(msg) {
        var err = getEl("choice-source-error");
        var errText = getEl("choice-source-error-text");
        if (err && errText) {
            errText.textContent = msg;
            show(err);
        }
    }

    function clearError() {
        var err = getEl("choice-source-error");
        if (err) hide(err);
    }

    function showInitialChoices() {
        hide(getEl("choice-repo-step"));
        show(getEl("choice-source-initial"));
        hide(getEl("choice-toolbar-back-wrap"));
        clearError();
    }

    function showUploadFetchChoices() {
        hide(getEl("choice-source-initial"));
        show(getEl("choice-repo-step"));
        show(getEl("choice-toolbar-back-wrap"));
        clearError();
    }

    function handleUploadResult(text, filename) {
        clearError();
        var stripped = stripJsonComments(text);
        try {
            var obj = JSON.parse(stripped);
            if (obj === null || typeof obj !== "object") {
                showError("JSON must be an object.");
                return;
            }
            goToEditor(text, filename || "uploaded.json");
        } catch (e) {
            showError("Invalid JSON: " + (e.message || String(e)));
        }
    }

    function init() {
        var initialCards = document.querySelector(".choice-source-cards");
        var fetchUploadCard = initialCards && initialCards.querySelector(".choice-card:not(.choice-card--coming-soon)");
        if (fetchUploadCard) {
            fetchUploadCard.addEventListener("click", function () {
                showUploadFetchChoices();
            });
        }

        var backBtn = getEl("choice-repo-back");
        if (backBtn) {
            backBtn.addEventListener("click", showInitialChoices);
        }

        var fileInput = getEl("choice-repo-file");
        if (fileInput) {
            fileInput.addEventListener("change", function () {
                var file = fileInput.files && fileInput.files[0];
                if (!file) return;
                var reader = new FileReader();
                reader.onload = function () {
                    handleUploadResult(reader.result, file.name);
                };
                reader.onerror = function () {
                    showError("Could not read file.");
                };
                reader.readAsText(file, "UTF-8");
                fileInput.value = "";
            });
        }

        var uploadCard = getEl("choice-repo-upload-card");
        if (uploadCard) {
            uploadCard.addEventListener("click", function () {
                fileInput && fileInput.click();
            });
        }

        var fetchForm = getEl("choice-repo-fetch-form");
        var fetchInput = getEl("choice-repo-url");
        if (fetchForm && fetchInput) {
            fetchForm.addEventListener("submit", function (e) {
                e.preventDefault();
                var url = (fetchInput.value || "").trim();
                if (!url) {
                    showError("Please enter a URL.");
                    return;
                }
                clearError();
                fetch(url)
                    .then(function (res) {
                        if (!res.ok) throw new Error("HTTP " + res.status);
                        return res.text();
                    })
                    .then(function (text) {
                        var filename = url.split("/").pop() || "fetched.json";
                        if (filename.indexOf(".") === -1) filename += ".json";
                        handleUploadResult(text, filename);
                    })
                    .catch(function (err) {
                        showError("Fetch failed: " + (err.message || String(err)));
                    });
            });
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
