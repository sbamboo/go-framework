let globalListenersAttached = false;
const instances = new Set();
const autoThemeInstances = new Set();

// Use theme.js for app theme (must be loaded before this script)
const themeJsSubscribe = typeof subscribeToThemeChange !== "undefined" ? subscribeToThemeChange : null;
const themeJsGetCurrent = typeof getCurrentTheme !== "undefined" ? getCurrentTheme : () => "light";

function attachGlobalListeners() {

    if (globalListenersAttached) return;
    globalListenersAttached = true;

    document.addEventListener("keydown", e => {

        instances.forEach(instance => {

            if (!instance.isFocused()) return;

            if (e.key === "Enter" && instance.onEnter) {
                instance.onEnter(instance);
            }

            if (e.key === "Escape" && instance.onEsc) {
                instance.onEsc(instance);
            }

        });

    });

    document.addEventListener("click", e => {

        const surface = e.target.closest(".monaco-surface");

        instances.forEach(instance => {

            if (!instance.isFocused()) return;

            if (!surface || surface !== instance.root) {
                if (instance.onClickOutside) {
                    instance.onClickOutside(instance);
                }
            }

        });

    });

}

function ensureLanguagesRegistered() {

    if (ensureLanguagesRegistered.done) return;
    ensureLanguagesRegistered.done = true;

    ////////////////////////////////////////////////////////////
    // JSON CUSTOM
    ////////////////////////////////////////////////////////////

    monaco.languages.register({ id: "json_custom" });

    monaco.languages.setMonarchTokensProvider("json_custom", {

        defaultToken: "",
        tokenPostfix: ".json",

        brackets: [
            { open: "{", close: "}", token: "delimiter.curly" },
            { open: "[", close: "]", token: "delimiter.square" }
        ],

        tokenizer: {

            root: [
                { include: "@whitespace" },
                [/{/, "delimiter.bracket", "@object"],
                [/\[/, "delimiter.bracket", "@array"]
            ],

            object: [
                [/"([^"\\]|\\.)*"/, "string"],
                [/:/, "delimiter"],
                [/,/, "delimiter"],
                [/\{/, "delimiter.bracket", "@push"],
                [/\}/, "delimiter.bracket", "@pop"],
                { include: "@whitespace" },
                [/\b(true|false|null)\b/, "keyword"],
                [/-?\d+(\.\d+)?([eE][\-+]?\d+)?/, "number"]
            ],

            array: [
                [/\]/, "delimiter.bracket", "@pop"],
                [/,/, "delimiter"],
                [/\{/, "delimiter.bracket", "@object"],
                [/\[/, "delimiter.bracket", "@push"],
                [/"([^"\\]|\\.)*"/, "string"],
                [/\b(true|false|null)\b/, "keyword"],
                [/-?\d+(\.\d+)?([eE][\-+]?\d+)?/, "number"],
                { include: "@whitespace" }
            ],

            whitespace: [
                [/[ \t\r\n]+/, "white"]
            ]

        }

    });

}

function getEffectiveTheme(instanceTheme) {
    if (instanceTheme && instanceTheme !== "auto") return instanceTheme;
    return themeJsGetCurrent();
}

function applyTheme(themeOverride = null) {
    const theme = getEffectiveTheme(themeOverride);

    const base = theme === "dark" ? "vs-dark" : "vs";

    monaco.editor.defineTheme("monacoSurfaceTheme", {
        base,
        inherit: true,
        rules: [
            { token: "comment", foreground: "008000", fontStyle: "italic" },
            { token: "dbn.value", foreground: "FF00FF" },
            { token: "dbn.meta", foreground: "CC5500" },
            { token: "dbn.desc", foreground: "008B8B" },
            { token: "csv.col0", foreground: "9CDCFE" },
            { token: "csv.col1", foreground: "C586C0" },
            { token: "csv.col2", foreground: "B5CEA8" },
            { token: "csv.col3", foreground: "D7BA7D" },
            { token: "csv.col4", foreground: "4EC9B0" },
            { token: "csv.col5", foreground: "FFD700" },
            { token: "csv.col6", foreground: "FF69B4" },
            { token: "csv.col7", foreground: "FFA500" },
            { token: "csv.col8", foreground: "00CED1" },
            { token: "csv.col9", foreground: "ADFF2F" },
            { token: "csv.delim", foreground: "666666" }
        ],
        colors: {}
    });

    instances.forEach(inst => {
        const instTheme = inst._theme || "auto";
        if (instTheme === "auto" || instTheme === themeOverride) {
            inst.editor.updateOptions({ theme: "monacoSurfaceTheme" });
        }
    });
}

// Subscribe to theme.js so editors update when app theme changes
function attachThemeSubscription() {
    if (!themeJsSubscribe || themeSubscriptionAttached) return;
    themeSubscriptionAttached = true;
    themeJsSubscribe(() => applyTheme());
}
let themeSubscriptionAttached = false;

class MonacoEditor {

    constructor(parent, options = {}) {

        attachGlobalListeners();
        ensureLanguagesRegistered();

        this.root = document.createElement("div");
        this.root.className = "monaco-surface";

        parent.appendChild(this.root);

        this._theme = options.theme || "auto";

        this.editor = monaco.editor.create(this.root, {
            value: options.value || "",
            language: options.language,
            theme: "monacoSurfaceTheme",
            automaticLayout: true
        });

        this.onEnter = options.onEnter || null;
        this.onEsc = options.onEsc || null;
        this.onChange = options.onChange || null;
        this.onClickOutside = options.onClickOutside || null;

        if (this.onChange) {
            this.editor.onDidChangeModelContent(() => {
                this.onChange(this.getValue(), this);
            });
        }

        instances.add(this);

        // register for auto theme updates
        if (this._theme === "auto") {
            autoThemeInstances.add(this);
            if (autoThemeInstances.size === 1) {
                attachThemeSubscription();
            }
        }

        applyTheme(this._theme);
    }

    setValue(v) {
        this.editor.setValue(v);
    }

    getValue() {
        return this.editor.getValue();
    }

    isFocused() {
        return this.editor.hasTextFocus();
    }

    setLanguage(lang) {
        monaco.editor.setModelLanguage(this.editor.getModel(), lang);
    }

    setTheme(theme) {
        // remove from auto instances if needed
        if (this._theme === "auto") autoThemeInstances.delete(this);

        this._theme = theme || "auto";

        if (this._theme === "auto") autoThemeInstances.add(this);
        applyTheme(this._theme);
    }

    setOnChange(fn) {
        this.onChange = fn;
    }

    setOnEnter(fn) {
        this.onEnter = fn;
    }

    setOnEsc(fn) {
        this.onEsc = fn;
    }

    setOnClickOutside(fn) {
        this.onClickOutside = fn;
    }

}