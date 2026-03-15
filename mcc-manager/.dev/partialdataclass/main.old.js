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
class PartialDataClassReadonly {
    constructor(base = {}, partials = []) {
        this.base = structuredClone(base);
        this.partials = partials.map(p => ({
            keypath: this._normalize(p.keypath),
            url: p.url,
            onChange: p.onChange || null
        }));

        this.cache = new Map();
        this.doCache = true;
        // When true (default, backwards compatible), fetched partial data is
        // merged into this.base at the partial keypath. When false, base is
        // treated as immutable and partial data lives only in cache / fetches.
        this.patchBase = false;
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

    async _fetchPartial(partial) {
        const key = partial.keypath.join(".");

        if (this.doCache && this.cache.has(key)) {
            return this.cache.get(key);
        }

        const data = await fetch(partial.url).then(r => r.json());

        if (this.doCache) this.cache.set(key, data);

        if (this.patchBase) {
            const loc = this._traverse(this.base, partial.keypath, true);
            loc.parent[loc.key] = data;
        }

        return data;
    }

    async _ensurePath(path) {
        const ancestor = this._findAncestorPartial(path);

        if (ancestor) {
            await this._fetchPartial(ancestor);
        }

        if (this._isSubtreeRequest(path)) {
            const descendants = this._findDescendantPartials(path);

            for (const p of descendants) {
                await this._fetchPartial(p);
            }
        }
    }

    /* -------------------------
        Public API
    --------------------------*/

    async get(kp = ".") {
        const path = this._normalize(kp);

        await this._ensurePath(path);

        // Default behaviour (patchBase=true): work directly against this.base,
        // which has been progressively filled with partial data.
        if (this.patchBase) {
            let cur = this.base;

            for (const k of path) {
                if (cur == null) return undefined;
                cur = cur[k];
            }

            return cur;
        }

        // patchBase=false: base remains immutable. We resolve reads by
        // overlaying partial data (from cache or refetch) on top of base.

        // 1) If there's an ancestor partial, read from that partial root.
        const ancestor = this._findAncestorPartial(path);
        if (ancestor) {
            const key = ancestor.keypath.join(".");
            let root;

            if (this.doCache && this.cache.has(key)) {
                root = this.cache.get(key);
            } else {
                root = await this._fetchPartial(ancestor);
            }

            const rel = path.slice(ancestor.keypath.length);
            let cur = root;

            for (const k of rel) {
                if (cur == null) return undefined;
                cur = cur[k];
            }

            return cur;
        }

        // 2) No ancestor partial: start from the base subtree and merge in any
        //    descendant partials that affect this subtree.
        const descendants = this._findDescendantPartials(path);
        const baseSubtree = this._getFromBase(path);

        if (!descendants.length) {
            return baseSubtree;
        }

        // Clone baseSubtree (or use {} when it is null/undefined) so that we do
        // not mutate the original base.
        let result =
            baseSubtree == null ? {} : structuredClone(baseSubtree);

        for (const p of descendants) {
            const key = p.keypath.join(".");
            let pdata;

            if (this.doCache && this.cache.has(key)) {
                pdata = this.cache.get(key);
            } else {
                pdata = await this._fetchPartial(p);
            }

            const rel = p.keypath.slice(path.length);

            let locParent = result;
            for (let i = 0; i < rel.length - 1; i++) {
                const seg = rel[i];

                if (locParent[seg] === undefined) {
                    locParent[seg] =
                        typeof rel[i + 1] === "number" ? [] : {};
                }

                locParent = locParent[seg];
            }

            const leafKey = rel[rel.length - 1];
            locParent[leafKey] = pdata;
        }

        return result;
    }

    async set(kp, value) {
        const path = this._normalize(kp);

        await this._ensurePath(path);

        const loc = this._traverse(this.base, path, true);
        loc.parent[loc.key] = value;

        this._triggerChange(path);
    }

    async unset(kp) {
        const path = this._normalize(kp);

        await this._ensurePath(path);

        const loc = this._traverse(this.base, path);
        if (!loc) return;

        if (Array.isArray(loc.parent)) {
            loc.parent.splice(loc.key, 1);
        } else {
            delete loc.parent[loc.key];
        }

        this._triggerChange(path);
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

    async getStatic(kp = ".") {
        const val = await this.get(kp);
        return structuredClone(val);
    }

    /* -------------------------
        Change propagation
    --------------------------*/

    _triggerChange(path) {
        for (const p of this.partials) {
            if (!p.onChange) continue;

            if (this._isPrefix(p.keypath, path)) {
                const key = p.keypath.join(".");
                const data = this.cache.get(key);
                p.onChange?.(structuredClone(data));
            }
        }
    }
}