/* General JS shared across all pages - Cookies / storage consent handling */

const STORAGE_CONSENT_KEY = "storage-accepted";

function hasAcceptedStorage() {
    try {
        return window.localStorage.getItem(STORAGE_CONSENT_KEY) === "true";
    } catch {
        return false;
    }
}

function markStorageAccepted() {
    try {
        window.localStorage.setItem(STORAGE_CONSENT_KEY, "true");
    } catch {
        // Ignore storage errors (e.g. disabled storage)
    }

    if (typeof localstorageSetAccepted === "function") {
        localstorageSetAccepted(true);
    }
}

function markStorageDeclined() {
    if (typeof localstorageSetAccepted === "function") {
        localstorageSetAccepted(false);
    }
}

function appendStorageDeclinedParam() {
    try {
        const href = window.location.href;
        const hasQuery = href.includes("?");
        const hasDeclined =
            href.includes("?ls-declined") || href.includes("&ls-declined");

        if (!hasDeclined) {
            const newHref = hasQuery ? `${href}&ls-declined` : `${href}?ls-declined`;
            window.history.replaceState({}, "", newHref);
        }
    } catch {
        // If URL API is not available, silently skip
    }
}

function resetStorageConsent() {
    try {
        window.localStorage.removeItem(STORAGE_CONSENT_KEY);
    } catch {
        // Ignore storage errors
    }

    try {
        const url = new URL(window.location.href);
        if (url.searchParams.has("ls-declined")) {
            url.searchParams.delete("ls-declined");
            window.history.replaceState({}, "", url.toString());
        }
    } catch {
        // Ignore URL API errors
    }

    if (typeof localstorageSetAccepted === "function") {
        localstorageSetAccepted(false);
    }
}

function initStorageConsent() {
    if (hasAcceptedStorage()) {
        markStorageAccepted();
        return;
    }

    const url = new URL(window.location.href);
    const hasDeclined = url.searchParams.has("ls-declined");

    if (hasDeclined) {
        markStorageDeclined();
        return;
    }

    let consentEl = document.querySelector("#localstorage-consent[data-bind=\"true\"]");

    if (!consentEl) {
        consentEl = document.createElement("div");
        consentEl.id = "localstorage-consent";
        consentEl.className = "localstorage-consent hidden";
        consentEl.setAttribute("role", "dialog");
        consentEl.setAttribute("aria-label", "Storage preference");
        consentEl.setAttribute("data-bind", "true");

        consentEl.innerHTML = `
            <p class="localstorage-consent-text"></p>
            <div class="localstorage-consent-actions">
                <button type="button" class="localstorage-consent-btn" data-consent-accept>Accept</button>
                <button type="button" class="localstorage-consent-btn" data-consent-decline>Decline</button>
            </div>
        `;

        document.body.appendChild(consentEl);
    }

    const textEl = consentEl.querySelector(".localstorage-consent-text");
    if (textEl) {
        textEl.textContent = "Do you allow this site to save preferences and currently opened projects across sessions?";
    }

    const hideConsent = () => {
        consentEl.classList.add("hidden");
    };

    const showConsent = () => {
        consentEl.classList.remove("hidden");
    };

    const acceptBtn = consentEl.querySelector("[data-consent-accept]");
    const declineBtn = consentEl.querySelector("[data-consent-decline]");

    if (acceptBtn) {
        acceptBtn.addEventListener("click", () => {
            markStorageAccepted();
            hideConsent();
        });
    }

    if (declineBtn) {
        declineBtn.addEventListener("click", () => {
            appendStorageDeclinedParam();
            markStorageDeclined();
            hideConsent();
        });
    }

    showConsent();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStorageConsent);
} else {
    initStorageConsent();
}