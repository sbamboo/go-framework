let localstorageAcceptedTheme = false;
const THEME_STORAGE_KEY = "theme-preference";
let currentThemeSetting = "auto";

const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");

const themeSubscribers = new Set();

function subscribeToThemeChange(callback) {
    if (typeof callback === "function") {
        themeSubscribers.add(callback);
    }
    return () => themeSubscribers.delete(callback);
}

function unSubscribeToThemeChange(callback) {
    themeSubscribers.delete(callback);
}

function _notifySubscribers(theme) {
    themeSubscribers.forEach(cb => {
        try {
            cb(theme);
        } catch (e) {
            console.error("Theme subscriber error:", e);
        }
    });
}

function getCurrentTheme() {
    return currentThemeSetting === "auto" ?
        (systemThemeQuery.matches ? "dark" : "light") :
        currentThemeSetting;
}

function _applyTheme(theme) {
    const appliedTheme = getCurrentTheme();
    document.documentElement.setAttribute("data-theme", appliedTheme);
    _notifySubscribers(appliedTheme);
}

function _saveTheme(theme) {
    if (localstorageAcceptedTheme) {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
}

function localstorageSetAccepted(accepted = true) {
    localstorageAcceptedTheme = accepted;

    if (!accepted) return;

    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "auto") {
        setTheme(stored);
    }
}

function setTheme(theme = "auto") {
    if (!["auto", "light", "dark"].includes(theme)) {
        theme = "auto";
    }

    currentThemeSetting = theme;

    _applyTheme(theme);
    _saveTheme(theme);
}

function hasAcceptedLocalstorage() {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "auto";
}

systemThemeQuery.addEventListener("change", () => {
    if (currentThemeSetting === "auto") {
        _applyTheme("auto");
    }
});

if (hasAcceptedLocalstorage()) {
    localstorageAcceptedTheme = true;

    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    setTheme(stored ?? "auto");
} else {
    setTheme("auto");
}