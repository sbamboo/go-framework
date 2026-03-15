/* General JS shared across all pages - Storage handling */

var KEY_PREFIX = "mccm#";

function addPrefix(key) {
    return KEY_PREFIX + String(key);
}

function stripPrefix(key) {
    if (key.indexOf(KEY_PREFIX) === 0) {
        return key.slice(KEY_PREFIX.length);
    }
    return key;
}

function serialize(value) {
    try {
        return JSON.stringify(value);
    } catch (e) {
        return String(value);
    }
}

function deserialize(value) {
    if (typeof value !== "string") {
        return value;
    }
    try {
        return JSON.parse(value);
    } catch (e) {
        return value;
    }
}

function StorageHandler() {
    this.persistenceAllowed = false;
    this.indexedDbSupported = typeof window !== "undefined" && !!window.indexedDB;
    this._dbPromise = null;
}

StorageHandler.prototype.setPersistenceAllowed = function (allowed) {
    this.persistenceAllowed = !!allowed;
};

StorageHandler.prototype._shouldUseIndexedDb = function () {
    return this.persistenceAllowed && this.indexedDbSupported;
};

StorageHandler.prototype._getDb = function () {
    if (!this._shouldUseIndexedDb()) {
        return Promise.resolve(null);
    }

    if (this._dbPromise) {
        return this._dbPromise;
    }

    var self = this;
    this._dbPromise = new Promise(function (resolve, reject) {
        try {
            var request = window.indexedDB.open("mccm-storage", 1);

            request.onupgradeneeded = function (event) {
                var db = event.target.result;
                if (!db.objectStoreNames.contains("kv")) {
                    db.createObjectStore("kv", { keyPath: "key" });
                }
            };

            request.onsuccess = function (event) {
                resolve(event.target.result);
            };

            request.onerror = function () {
                self.indexedDbSupported = false;
                resolve(null);
            };
        } catch (e) {
            self.indexedDbSupported = false;
            resolve(null);
        }
    });

    return this._dbPromise;
};

StorageHandler.prototype._idbRun = function (mode, operation) {
    var self = this;
    return this._getDb().then(function (db) {
        if (!db) {
            // Fallback to sessionStorage if IndexedDB is not available.
            var result = operation(null);
            return result !== undefined ? result : Promise.resolve();
        }

        return new Promise(function (resolve, reject) {
            try {
                var tx = db.transaction("kv", mode);
                var store = tx.objectStore("kv");
                var resolveWhenCommit = mode === "readwrite";
                if (resolveWhenCommit) {
                    tx.oncomplete = function () {
                        resolve();
                    };
                    tx.onerror = function () {
                        reject(tx.error || new Error("Transaction failed"));
                    };
                    operation(store, reject);
                } else {
                    tx.onerror = function () {
                        reject(tx.error || new Error("Transaction failed"));
                    };
                    operation(store, resolve, reject);
                }
            } catch (e) {
                self.indexedDbSupported = false;
                resolve(operation(null));
            }
        });
    });
};

StorageHandler.prototype.list = function () {
    var self = this;

    if (!this._shouldUseIndexedDb()) {
        var keys = [];
        try {
            for (var i = 0; i < window.sessionStorage.length; i++) {
                var rawKey = window.sessionStorage.key(i);
                if (rawKey && rawKey.indexOf(KEY_PREFIX) === 0) {
                    keys.push(stripPrefix(rawKey));
                }
            }
        } catch (e) {
            return Promise.resolve([]);
        }
        return Promise.resolve(keys);
    }

    return this._idbRun("readonly", function (store, resolve, reject) {
        if (!store) {
            resolve(self.list());
            return;
        }

        var keys = [];
        var request = store.getAllKeys();

        request.onsuccess = function (event) {
            var allKeys = event.target.result || [];
            for (var i = 0; i < allKeys.length; i++) {
                var key = allKeys[i];
                if (typeof key === "string" && key.indexOf(KEY_PREFIX) === 0) {
                    keys.push(stripPrefix(key));
                }
            }
            resolve(keys);
        };

        request.onerror = function () {
            resolve([]);
        };
    });
};

StorageHandler.prototype.get = function (key) {
    var storageKey = addPrefix(key);

    if (!this._shouldUseIndexedDb()) {
        try {
            var raw = window.sessionStorage.getItem(storageKey);
            return Promise.resolve(deserialize(raw));
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    return this._idbRun("readonly", function (store, resolve, reject) {
        if (!store) {
            try {
                var raw = window.sessionStorage.getItem(storageKey);
                resolve(deserialize(raw));
            } catch (e) {
                resolve(null);
            }
            return;
        }

        var request = store.get(storageKey);

        request.onsuccess = function (event) {
            var result = event.target.result;
            if (result && typeof result.value !== "undefined") {
                resolve(deserialize(result.value));
            } else {
                resolve(null);
            }
        };

        request.onerror = function () {
            resolve(null);
        };
    });
};

StorageHandler.prototype.set = function (key, value) {
    var storageKey = addPrefix(key);
    var serialized = serialize(value);

    if (!this._shouldUseIndexedDb()) {
        try {
            window.sessionStorage.setItem(storageKey, serialized);
        } catch (e) {
            // Ignore quota or access errors.
        }
        return Promise.resolve();
    }

    return this._idbRun("readwrite", function (store, reject) {
        if (!store) {
            try {
                window.sessionStorage.setItem(storageKey, serialized);
            } catch (e) {
                // Ignore.
            }
            return;
        }

        var request = store.put({ key: storageKey, value: serialized });
        request.onerror = function () {
            reject(request.error || new Error("put failed"));
        };
    });
};

StorageHandler.prototype.unset = function (key) {
    var storageKey = addPrefix(key);

    if (!this._shouldUseIndexedDb()) {
        try {
            window.sessionStorage.removeItem(storageKey);
        } catch (e) {
            // Ignore.
        }
        return Promise.resolve();
    }

    return this._idbRun("readwrite", function (store, reject) {
        if (!store) {
            try {
                window.sessionStorage.removeItem(storageKey);
            } catch (e) {
                // Ignore.
            }
            return;
        }

        var request = store.delete(storageKey);
        request.onerror = function () {
            reject(request.error || new Error("delete failed"));
        };
    });
};

StorageHandler.prototype.getAll = function () {
    var self = this;

    if (!this._shouldUseIndexedDb()) {
        var result = {};
        try {
            for (var i = 0; i < window.sessionStorage.length; i++) {
                var rawKey = window.sessionStorage.key(i);
                if (rawKey && rawKey.indexOf(KEY_PREFIX) === 0) {
                    var key = stripPrefix(rawKey);
                    var value = deserialize(window.sessionStorage.getItem(rawKey));
                    result[key] = value;
                }
            }
        } catch (e) {
            return Promise.resolve({});
        }
        return Promise.resolve(result);
    }

    return this._idbRun("readonly", function (store, resolve, reject) {
        if (!store) {
            self.getAll().then(resolve);
            return;
        }

        var result = {};
        var request = store.getAll();

        request.onsuccess = function (event) {
            var items = event.target.result || [];
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                if (item && typeof item.key === "string" && item.key.indexOf(KEY_PREFIX) === 0) {
                    var key = stripPrefix(item.key);
                    result[key] = deserialize(item.value);
                }
            }
            resolve(result);
        };

        request.onerror = function () {
            resolve({});
        };
    });
};

window.StorageHandler = new StorageHandler();

if (typeof hasAcceptedStorage === "function" &&
    window.StorageHandler &&
    typeof window.StorageHandler.setPersistenceAllowed === "function") {
    window.StorageHandler.setPersistenceAllowed(hasAcceptedStorage());
}