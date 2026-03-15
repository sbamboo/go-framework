class Serializer {
    static encode(value) {
        return JSON.stringify(value, (_, v) => {
            if (v instanceof Date)
                return {
                    __type: "Date",
                    value: v.toISOString()
                }

            if (v instanceof Map)
                return {
                    __type: "Map",
                    value: [...v.entries()]
                }

            if (v instanceof Set)
                return {
                    __type: "Set",
                    value: [...v.values()]
                }

            if (v instanceof Uint8Array)
                return {
                    __type: "Uint8Array",
                    value: [...v]
                }

            return v
        })
    }

    static decode(str) {
        if (str === null || str === undefined) return undefined

        return JSON.parse(str, (_, v) => {
            if (!v || !v.__type) return v

            switch (v.__type) {
                case "Date":
                    return new Date(v.value)

                case "Map":
                    return new Map(v.value)

                case "Set":
                    return new Set(v.value)

                case "Uint8Array":
                    return new Uint8Array(v.value)

                default:
                    return v
            }
        })
    }
}

class IndexedDBBackend {
    constructor() {
        this.db = null
        this.dbName = "StorageHandlerDB"
        this.storeName = "kv"
    }

    async init() {
        this.db = await new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, 1)

            req.onupgradeneeded = () => {
                req.result.createObjectStore(this.storeName)
            }

            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error)
        })
    }

    store(mode = "readonly") {
        return this.db.transaction(this.storeName, mode).objectStore(this.storeName)
    }

    async get(key) {
        return new Promise((res, rej) => {
            const r = this.store().get(key)
            r.onsuccess = () => res(Serializer.decode(r.result))
            r.onerror = () => rej(r.error)
        })
    }

    async set(key, value) {
        const encoded = Serializer.encode(value)

        return new Promise((res, rej) => {
            const r = this.store("readwrite").put(encoded, key)
            r.onsuccess = () => res()
            r.onerror = () => rej(r.error)
        })
    }

    async unset(key) {
        return new Promise((res, rej) => {
            const r = this.store("readwrite").delete(key)
            r.onsuccess = () => res()
            r.onerror = () => rej(r.error)
        })
    }

    async keys() {
        return new Promise((res, rej) => {
            const r = this.store().getAllKeys()
            r.onsuccess = () => res(r.result)
            r.onerror = () => rej(r.error)
        })
    }

    async values() {
        return new Promise((res, rej) => {
            const r = this.store().getAll()
            r.onsuccess = () => res(r.result.map(v => Serializer.decode(v)))
            r.onerror = () => rej(r.error)
        })
    }

    async isset(key) {
        const v = await this.get(key)
        return v !== undefined
    }

    async clearAll() {
        return new Promise((res, rej) => {
            const r = this.store("readwrite").clear()
            r.onsuccess = () => res()
            r.onerror = () => rej(r.error)
        })
    }

    async getAll() {
        const keys = await this.keys()
        const values = await this.values()

        const obj = {}
        keys.forEach((k, i) => obj[k] = values[i])
        return obj
    }
}

class LocalStorageBackend {
    constructor(storage = localStorage) {
        this.storage = storage
    }

    async get(key) {
        return Serializer.decode(this.storage.getItem(key))
    }

    async set(key, value) {
        this.storage.setItem(key, Serializer.encode(value))
    }

    async unset(key) {
        this.storage.removeItem(key)
    }

    async keys() {
        return Object.keys(this.storage)
    }

    async values() {
        return Object.values(this.storage).map(v => Serializer.decode(v))
    }

    async isset(key) {
        return this.storage.getItem(key) !== null
    }

    async clearAll() {
        this.storage.clear()
    }

    async getAll() {
        const obj = {}

        for (const k of Object.keys(this.storage)) {
            obj[k] = Serializer.decode(this.storage.getItem(k))
        }

        return obj
    }
}

class SessionStorageBackend extends LocalStorageBackend {
    constructor() {
        super(sessionStorage)
    }
}

class StorageHandler {
    constructor() {
        this.persistenceAllowed = false
        this.backend = null
    }

    _backendName(backend) {
        if (!backend) return null
        if (backend instanceof IndexedDBBackend) return "IndexedDB"
        if (backend instanceof SessionStorageBackend) return "sessionStorage"
        if (backend instanceof LocalStorageBackend) return "localStorage"
        return "unknown"
    }

    async setPersistenceAllowed(v) {
        this.persistenceAllowed = !!v
        await this.init()
    }

    async init() {
        const oldBackend = this.backend
        const oldName = this._backendName(oldBackend)
        let oldData = {}
        if (oldBackend) {
            try {
                oldData = await oldBackend.getAll()
            } catch (e) {
                /* ignore */
            }
        }

        if (!this.persistenceAllowed) {
            this.backend = new SessionStorageBackend()
        } else {
            try {
                const idb = new IndexedDBBackend()
                await idb.init()
                this.backend = idb
            } catch (e) {
                this.backend = new LocalStorageBackend()
            }
        }

        const newName = this.getBackendName()
        if (oldName && oldName !== newName && Object.keys(oldData).length > 0) {
            try {
                for (const [key, value] of Object.entries(oldData)) {
                    await this.backend.set(key, value)
                }
                try {
                    await oldBackend.clearAll()
                } catch (e) {
                    /* ignore */
                }
            } catch (e) {
                const isQuota = e && (e.name === "QuotaExceededError" || e.code === 22)
                if (isQuota) {
                    console.error("Migration skipped: quota exceeded (data larger than allowed).", e)
                } else {
                    throw e
                }
            }
        }
    }

    async get(key) {
        return this.backend.get(key)
    }

    async set(key, value) {
        return this.backend.set(key, value)
    }

    async keys() {
        return this.backend.keys()
    }

    async values() {
        return this.backend.values()
    }

    async isset(key) {
        return this.backend.isset(key)
    }

    async unset(key) {
        return this.backend.unset(key)
    }

    async clearAll() {
        return this.backend.clearAll()
    }

    async getAll() {
        return this.backend.getAll()
    }

    getBackendName() {
        if (!this.backend) return "not initialized"
        return this._backendName(this.backend)
    }

    async getAllBackends() {
        const result = {}
        try {
            const idb = new IndexedDBBackend()
            await idb.init()
            result.IndexedDB = await idb.getAll()
        } catch (e) {
            result.IndexedDB = {}
        }
        try {
            const session = new SessionStorageBackend()
            result.sessionStorage = await session.getAll()
        } catch (e) {
            result.sessionStorage = {}
        }
        try {
            const local = new LocalStorageBackend()
            result.localStorage = await local.getAll()
        } catch (e) {
            result.localStorage = {}
        }
        return result
    }

    async clearAllBackends() {
        try {
            const idb = new IndexedDBBackend()
            await idb.init()
            await idb.clearAll()
        } catch (e) {
            /* ignore */
        }
        try {
            sessionStorage.clear()
        } catch (e) {
            /* ignore */
        }
        try {
            localStorage.clear()
        } catch (e) {
            /* ignore */
        }
    }
}

window.StorageHandler = new StorageHandler()