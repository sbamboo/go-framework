/* General JS shared across all pages - PartialDataClass implementation */



/**
 * PartialDataClass
 *
 * A lazy-loading JSON document wrapper that supports "partials" mounted at
 * specific keypaths. A partial represents a subtree that can be fetched
 * remotely and transparently merged into the main document.
 *
 * Key ideas:
 *
 * 1. Keypaths
 *    Paths like "a.b[2].c" are normalized into arrays like:
 *      ["a","b",2,"c"]
 *
 * 2. Partial mounting
 *    A partial definition:
 *      { keypath: "key.sub[2].grand", url: "/grand.json", onChange?: fn }
 *
 *    means the subtree at that location can be fetched from the URL.
 *
 * 3. Fetch resolution rules
 *
 *    When resolving a request R:
 *
 *    CASE A — Request is deeper than partials
 *      partials: key.sub , key.sub[2].grand
 *      request:  key.sub[2].grand
 *
 *      Fetch the MOST SPECIFIC ancestor partial:
 *          /grand.json
 *
 *    CASE B — Request is a parent of deeper partials
 *      partials: key.sub , key.sub[2].grand
 *      request:  key.sub
 *
 *      Fetch:
 *          /sub.json
 *          /grand.json
 *
 *      because deeper partials modify the subtree.
 *
 *    CASE C — Request lies between partial levels
 *      partials: key.sub , key.sub[2].grand
 *      request:  key.sub[1]
 *
 *      Fetch only:
 *          /sub.json
 *
 *      because the deeper partial does not affect the subtree.
 *
 * 4. Lazy loading
 *    Partials are fetched only when needed.
 *
 * 5. Caching
 *    If doCache=true, each partial is fetched only once.
 *
 * 6. Change propagation
 *    If a mutation happens inside a partial boundary, its onChange callback
 *    is triggered with the updated subtree.
 *
 * Public API
 *
 *      get(kp)
 *      set(kp,value)
 *      unset(kp)
 *      keys(kp)
 *      values(kp)
 *      getStatic(kp)
 *
 * The class abstracts partials so consumers interact with the data as if it
 * were a normal JSON document.
 */

class PartialDataClass {
    constructor(base = {}, partials = [], onChange = null) {
        this.base = structuredClone(base);
        this.partials = partials.map(p => ({
            keypath: this._normalize(p.keypath),
            url: p.url,
            onChange: p.onChange || null,
            loaded: p.loaded ?? undefined
        }));
        this.onChange = onChange || null;
    }

    /* -------------------------
        Keypath utilities
    --------------------------*/

    _normalize(kp) {
        if (!kp || kp === ".") return [];
        return kp
            .replace(/\[(\d+)\]/g, ".$1")
            .split(".")
            .filter(Boolean)
            .map(v => (isNaN(v) ? v : Number(v)));
    }

    _kpToString(kp) {
        return kp
            .map(v => (typeof v === "number" ? `[${v}]` : `.${v}`))
            .join("")
            .replace(/^\./, "");
    }

    _isPrefix(a, b) {
        if (a.length > b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }
        return true;
    }

    _isInside(a, b) {
        return this._isPrefix(b, a);
    }

    _traverse(obj, path, create = false) {
        if (path.length === 0) return { parent: { root: obj }, key: "root" };

        let cur = obj;

        for (let i = 0; i < path.length - 1; i++) {
            const k = path[i];

            if (cur[k] === undefined) {
                if (!create) return undefined;
                cur[k] = typeof path[i + 1] === "number" ? [] : {};
            }

            cur = cur[k];
        }

        return { parent: cur, key: path[path.length - 1] };
    }

    _getFromBase(path) {
        if (path.length === 0) return this.base;

        let cur = this.base;

        for (const k of path) {
            if (cur == null) return undefined;
            cur = cur[k];
        }

        return cur;
    }

    /* -------------------------
        Partial resolution
    --------------------------*/

    _findAncestorPartial(path) {
        let best = null;

        for (const p of this.partials) {
            if (this._isPrefix(p.keypath, path)) {
                if (!best || p.keypath.length > best.keypath.length) {
                    best = p;
                }
            }
        }

        return best;
    }

    _findDescendantPartials(path) {
        return this.partials.filter(p =>
            this._isInside(p.keypath, path) && p.keypath.length > path.length
        );
    }

    _isSubtreeRequest(path) {
        for (const p of this.partials) {
            if (this._isInside(p.keypath, path) && p.keypath.length > path.length) {
                return true;
            }
        }
        return false;
    }

    async _loadPartial(partial) {
        if (partial.loaded !== undefined) {
            return partial.loaded;
        }

        const data = await fetch(partial.url).then(r => r.json());
        partial.loaded = data;
        return data;
    }

    async _ensurePartialLoadedForPath(path) {
        const ancestor = this._findAncestorPartial(path);
        if (!ancestor) return null;
        await this._loadPartial(ancestor);
        return ancestor;
    }

    _cloneWithDepth(value, depth) {
        if (depth == null) {
            return structuredClone(value);
        }

        if (depth <= 0 || value == null || typeof value !== "object") {
            return structuredClone(value);
        }

        if (Array.isArray(value)) {
            return value.map(v => this._cloneWithDepth(v, depth - 1));
        }

        const out = {};
        for (const k of Object.keys(value)) {
            out[k] = this._cloneWithDepth(value[k], depth - 1);
        }
        return out;
    }

    /* -------------------------
        Public API
    --------------------------*/

    async get(kp = ".", depth = null) {
        const path = this._normalize(kp);
        let result;

        const ancestor = await this._ensurePartialLoadedForPath(path);
        if (ancestor) {
            const rel = path.slice(ancestor.keypath.length);
            let cur = ancestor.loaded;

            for (const k of rel) {
                if (cur == null) return undefined;
                cur = cur[k];
            }

            result = cur;
        } else {
            const baseSubtree = this._getFromBase(path);
            const descendants = this._findDescendantPartials(path);

            if (!descendants.length) {
                result = baseSubtree;
            } else {
                let merged =
                    baseSubtree == null ? {} : structuredClone(baseSubtree);

                for (const p of descendants) {
                    await this._loadPartial(p);
                    const rel = p.keypath.slice(path.length);

                    let locParent = merged;
                    for (let i = 0; i < rel.length - 1; i++) {
                        const seg = rel[i];

                        if (locParent[seg] === undefined) {
                            locParent[seg] =
                                typeof rel[i + 1] === "number" ? [] : {};
                        }

                        locParent = locParent[seg];
                    }

                    const leafKey = rel[rel.length - 1];
                    locParent[leafKey] = p.loaded;
                }

                result = merged;
            }
        }

        if (depth == null) {
            return result;
        }

        return this._cloneWithDepth(result, depth);
    }

    async set(kp, value) {
        const path = this._normalize(kp);

        const ancestor = await this._ensurePartialLoadedForPath(path);

        if (ancestor) {
            const rel = path.slice(ancestor.keypath.length);
            const loc = this._traverse(ancestor.loaded, rel, true);
            loc.parent[loc.key] = value;

            ancestor.onChange?.(kp, structuredClone(ancestor.loaded));
            return;
        }

        const loc = this._traverse(this.base, path, true);
        loc.parent[loc.key] = value;

        this.onChange?.(kp, structuredClone(this.base));
    }

    async rename(kp, newName) {
        const path = this._normalize(kp);

        if (!Array.isArray(path) || path.length === 0) {
            // Do not support renaming the root
            return;
        }

        const ancestor = await this._ensurePartialLoadedForPath(path);

        if (ancestor) {
            const rel = path.slice(ancestor.keypath.length);
            const loc = this._traverse(ancestor.loaded, rel, false);
            if (!loc) return;

            const parent = loc.parent;
            const oldKey = loc.key;

            if (Array.isArray(parent)) {
                // Renaming array indices is not supported here
                return;
            }

            const trimmed = typeof newName === "string" ? newName.trim() : "";
            if (!trimmed || trimmed === oldKey) return;

            if (!(oldKey in parent)) return;

            const value = parent[oldKey];
            delete parent[oldKey];
            parent[trimmed] = value;

            ancestor.onChange?.(kp, structuredClone(ancestor.loaded));
            return;
        }

        const loc = this._traverse(this.base, path, false);
        if (!loc) return;

        const parent = loc.parent;
        const oldKey = loc.key;

        if (Array.isArray(parent)) {
            // Renaming array indices is not supported here
            return;
        }

        const trimmed = typeof newName === "string" ? newName.trim() : "";
        if (!trimmed || trimmed === oldKey) return;

        if (!(oldKey in parent)) return;

        const value = parent[oldKey];
        delete parent[oldKey];
        parent[trimmed] = value;

        this.onChange?.(kp, structuredClone(this.base));
    }

    async unset(kp) {
        const path = this._normalize(kp);

        const ancestor = await this._ensurePartialLoadedForPath(path);

        if (ancestor) {
            const rel = path.slice(ancestor.keypath.length);
            const loc = this._traverse(ancestor.loaded, rel, false);
            if (!loc) return;

            if (Array.isArray(loc.parent)) {
                loc.parent.splice(loc.key, 1);
            } else {
                delete loc.parent[loc.key];
            }

            ancestor.onChange?.(kp, structuredClone(ancestor.loaded));
            return;
        }

        const loc = this._traverse(this.base, path, false);
        if (!loc) return;

        if (Array.isArray(loc.parent)) {
            loc.parent.splice(loc.key, 1);
        } else {
            delete loc.parent[loc.key];
        }

        this.onChange?.(kp, structuredClone(this.base));
    }

    async keys(kp = ".") {
        const obj = await this.get(kp);

        if (Array.isArray(obj)) {
            return obj.map((_, i) => `[${i}]`);
        }

        return Object.keys(obj || {});
    }

    async values(kp = ".") {
        const obj = await this.get(kp);

        if (Array.isArray(obj)) return [...obj];

        return Object.values(obj || {});
    }

    async getStatic(kp = ".", depth = null) {
        const val = await this.get(kp, depth);
        return structuredClone(val);
    }

    getAll() {
        return {
            base: structuredClone(this.base),
            partials: this.partials.map(p => ({
                url: p.url,
                keypath: this._kpToString(p.keypath),
                loaded:
                    p.loaded !== undefined
                        ? structuredClone(p.loaded)
                        : undefined
            }))
        };
    }

    async setPartialData(partialIndex, data, noOnChange=false) {
        // if partialIndex < 0 its base, else index in partials array, updates text and data/loaded and calls onChange if defined
        if (partialIndex < 0) {
            this.base = data;
            // if this.onChange is defined and a function call it like onChange("base", structuredClone(this.base));
            if (typeof this.onChange === "function" && !noOnChange) {
                this.onChange("base", structuredClone(this.base));
            }
        } else {
            if (partialIndex < this.partials.length) {
                this.partials[partialIndex].loaded = data;
                if (typeof this.partials[partialIndex].onChange === "function" && !noOnChange) {
                    // Call like onChange(this.partials[partialIndex].keypath, structuredClone(this.partials[partialIndex].loaded));
                    this.partials[partialIndex].onChange(this.partials[partialIndex].keypath, structuredClone(this.partials[partialIndex].loaded));
                }

            } else {
                console.error("PartialDataClass.setPartialData: partialIndex out of bounds", partialIndex);
            }
        }
    }
}
