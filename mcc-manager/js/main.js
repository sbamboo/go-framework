(function () {
    function updateThemeToggle() {
        var btn = document.getElementById("theme-toggle");
        if (!btn) return;
        var sun = btn.querySelector(".theme-icon-sun");
        var moon = btn.querySelector(".theme-icon-moon");
        if (!sun || !moon) return;
        var theme = typeof getCurrentTheme === "function" ? getCurrentTheme() : document.documentElement.getAttribute("data-theme") || "dark";
        if (theme === "light") {
            sun.removeAttribute("hidden");
            moon.setAttribute("hidden", "");
        } else {
            sun.setAttribute("hidden", "");
            moon.removeAttribute("hidden");
        }
    }

    function initThemeToggle() {
        var btn = document.getElementById("theme-toggle");
        if (!btn) return;
        btn.addEventListener("click", function () {
            var theme = typeof getCurrentTheme === "function" ? getCurrentTheme() : document.documentElement.getAttribute("data-theme") || "dark";
            if (typeof setTheme === "function") {
                setTheme(theme === "light" ? "dark" : "light");
            } else {
                var next = theme === "light" ? "dark" : "light";
                document.documentElement.setAttribute("data-theme", next);
            }
            updateThemeToggle();
        });
        updateThemeToggle();
        if (typeof subscribeToThemeChange === "function") {
            subscribeToThemeChange(updateThemeToggle);
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initThemeToggle);
    } else {
        initThemeToggle();
    }
})();
