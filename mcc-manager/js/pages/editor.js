/* JS for the editor page */

document.addEventListener("DOMContentLoaded", function () {
    if (!window.StorageHandler || typeof window.StorageHandler.get !== "function") {
        return;
    }

    window.StorageHandler.get("current-repo")
        .then(function (payload) {
            console.log("Loaded editor payload:", payload);
        })
        .catch(function (e) {
            console.error("Failed to load editor payload:", e);
        });
});