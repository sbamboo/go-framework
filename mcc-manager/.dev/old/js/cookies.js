(function () {
    var LS_DECLINED_PARAM = "ls-declined";
    var BANNER_ID = "localstorage-consent";

    function urlHasLsDeclined() {
        var params = new URLSearchParams(window.location.search);
        return params.has(LS_DECLINED_PARAM);
    }

    /**
     * Returns path with ls-declined query param appended if current page URL has it.
     * Use when building links to index.html or editor.html to keep declined state.
     */
    function appendLsDeclinedToPath(path) {
        if (!urlHasLsDeclined()) return path;
        var sep = path.indexOf("?") !== -1 ? "&" : "?";
        return path + sep + LS_DECLINED_PARAM;
    }

    function hideBanner() {
        var el = document.getElementById(BANNER_ID);
        if (el) el.classList.add("hidden");
    }

    function showBanner() {
        var el = document.getElementById(BANNER_ID);
        if (el) el.classList.remove("hidden");
    }

    function onAccept() {
        if (typeof localstorageSetAccepted === "function") {
            localstorageSetAccepted(true);
        }
        hideBanner();
    }

    function onDecline() {
        var search = window.location.search;
        var newSearch = search ? search + "&" + LS_DECLINED_PARAM : "?" + LS_DECLINED_PARAM;
        var newUrl = window.location.pathname + newSearch;
        if (window.history && window.history.replaceState) {
            window.history.replaceState(null, "", newUrl);
        } else {
            window.location.search = newSearch;
        }
        hideBanner();
    }

    function init() {
        var tryAgainLink = document.getElementById("editor-error-try-again-link");
        if (tryAgainLink) tryAgainLink.href = appendLsDeclinedToPath("index.html");

        var banner = document.getElementById(BANNER_ID);
        if (!banner) return;

        if (typeof hasAcceptedLocalstorage === "function" && hasAcceptedLocalstorage()) {
            return;
        }
        if (urlHasLsDeclined()) {
            return;
        }

        showBanner();
        var acceptBtn = banner.querySelector("[data-consent-accept]");
        var declineBtn = banner.querySelector("[data-consent-decline]");
        if (acceptBtn) acceptBtn.addEventListener("click", onAccept);
        if (declineBtn) declineBtn.addEventListener("click", onDecline);
    }

    window.urlHasLsDeclined = urlHasLsDeclined;
    window.appendLsDeclinedToPath = appendLsDeclinedToPath;

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
