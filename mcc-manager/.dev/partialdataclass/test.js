// Ad‑hoc test suite for PartialDataClass
// Uses ./repo.json as base and ./sub1.json / ./sub2.json as partials.
// Loaded by index.html after main.js, runs in the browser (no test framework).

(function () {
    /* -------------
       Small helpers
    ---------------*/

    function cloneDeep(obj) {
        if (typeof structuredClone === "function") return structuredClone(obj);
        return JSON.parse(JSON.stringify(obj));
    }

    function assert(cond, msg) {
        if (!cond) {
            console.error("✗ ASSERTION FAILED:", msg);
            throw new Error(msg);
        }
    }

    function assertEqual(actual, expected, msg) {
        const a = JSON.stringify(actual);
        const e = JSON.stringify(expected);
        if (a !== e) {
            console.error("✗ ASSERT EQUAL FAILED:", msg, "\n  expected:", expected, "\n  actual:  ", actual);
            throw new Error(msg);
        }
        console.log("✓", msg);
    }

    function section(name) {
        console.log("-----", name, "-----");
    }

    async function loadJson(url) {
        const res = await fetch(url);
        return res.json();
    }

    /* -------------
       Expected data from JSON files (to verify load-from-file)
    ---------------*/
    const REPO_ROOT = {
        root: {
            info: "base document for PartialDataClass tests",
            version: 1
        }
    };
    const SUB1_GRAND_CHILD = { foo: 1, bar: "from-sub1-partial" };
    const SUB2_NESTED = { initial: 42, label: "from-sub2-partial" };

    /* -------------
       Individual tests
    ---------------*/

    async function testInitFromRepoAndPartialLoadFromFiles() {
        section("Init from repo.json and partial data from sub1.json / sub2.json");
        const baseFromRepo = await loadJson("./repo.json");
        const pd = new PartialDataClass(baseFromRepo, [
            { keypath: "sub1", url: "./sub1.json" },
            { keypath: "sub2", url: "./sub2.json" }
        ]);

        // On init, base data is from repo.json
        const rootAtInit = await pd.get("root");
        assertEqual(rootAtInit, REPO_ROOT.root, "base data at init is loaded from repo.json (get root)");
        const fullAtInit = await pd.get(".");
        assertEqual(fullAtInit.root, REPO_ROOT.root, "base data at init is loaded from repo.json (get .)");

        // First access partial sub1, then get(kp) must match sub1.json content
        await pd.get("sub1");
        const sub1GrandChild = await pd.get("sub1.grand.child");
        assertEqual(sub1GrandChild, SUB1_GRAND_CHILD, "after first access of sub1 partial, get(sub1.grand.child) equals data from sub1.json");

        // First access partial sub2, then get(kp) must match sub2.json content
        await pd.get("sub2");
        const sub2Nested = await pd.get("sub2.nested");
        assertEqual(sub2Nested, SUB2_NESTED, "after first access of sub2 partial, get(sub2.nested) equals data from sub2.json");
    }

    async function testKeypathUtilities(baseFromRepo) {
        section("Keypath utilities");
        const base = Object.assign({ a: { b: [{ c: 42 }] } }, cloneDeep(baseFromRepo || {}));
        const pd = new PartialDataClass(base, []);

        const kp = pd._normalize("a.b[0].c");
        assertEqual(kp, ["a", "b", 0, "c"], "_normalize should parse arrays and dots");

        const s = pd._kpToString(kp);
        assertEqual(s, "a.b[0].c", "_kpToString should invert normalize for simple paths");

        assert(pd._isPrefix(["a"], ["a", "b"]), "_isPrefix identifies prefix");
        assert(!pd._isPrefix(["a", "b"], ["a"]), "_isPrefix detects non-prefix");

        assert(pd._isInside(["a", "b"], ["a"]), "_isInside detects descendant");
        assert(!pd._isInside(["x"], ["a"]), "_isInside detects non-descendant");

        const loc = pd._traverse(pd.base, kp, false);
        assertEqual(loc.parent.c, 42, "_traverse should find correct parent");
        assertEqual(loc.key, "c", "_traverse key should be last segment");
    }

    async function testGetSetUnsetAndStatics(baseFromRepo) {
        section("get/set/unset/keys/values/getStatic");
        const base = cloneDeep(baseFromRepo || {});
        base.config = { enabled: true, threshold: 5 };
        base.arr = [10, 20];

        const pd = new PartialDataClass(base, []);

        // get / set
        await pd.set("config.threshold", 10);
        const val = await pd.get("config.threshold");
        assertEqual(val, 10, "set followed by get should see updated value");

        // unset on object
        await pd.unset("config.threshold");
        const afterUnset = await pd.get("config");
        assert(!("threshold" in afterUnset), "unset on object property removes the key");

        // unset on array index
        await pd.unset("arr[0]");
        const arrAfterUnset = await pd.get("arr");
        assertEqual(arrAfterUnset, [20], "unset on array index should splice element");

        // keys / values on object
        const objKeys = await pd.keys("config");
        objKeys.sort();
        assert(objKeys.includes("enabled"), "keys() returns object keys");

        const objValues = await pd.values("config");
        assert(objValues.includes(true), "values() returns object values");

        // keys / values on array
        const arrKeys = await pd.keys("arr");
        assertEqual(arrKeys, ["[0]"], "keys() on array returns index tokens");
        const arrValues = await pd.values("arr");
        assertEqual(arrValues, [20], "values() on array returns elements");

        // getStatic returns a deep clone
        await pd.set("config.deep", { inner: 1 });
        const staticCopy = await pd.getStatic("config.deep");
        staticCopy.inner = 999;
        const afterMutatingCopy = await pd.get("config.deep");
        assertEqual(afterMutatingCopy, { inner: 1 }, "getStatic returns a defensive clone");
    }

    async function testPartialsFetchingAndCaching(baseFromRepo) {
        section("Partials loading (loaded once, then reused)");
        const base = cloneDeep(baseFromRepo || {});

        const originalFetch = window.fetch || fetch;

        const calls = [];
        window.fetch = async function (...args) {
            calls.push(args[0]);
            return originalFetch.apply(this, args);
        };

        const pd = new PartialDataClass(base, [
            { keypath: "sub1", url: "./sub1.json" }
        ]);

        const first = await pd.get("sub1");
        assert(typeof first === "object", "partial sub1 should resolve to an object");
        const callCountAfterFirst = calls.length;

        const second = await pd.get("sub1");
        assert(typeof second === "object", "second read of cached partial still returns object");
        assertEqual(calls.length, callCountAfterFirst, "partial should not refetch once loaded");

        // Test ancestor / descendant / subtree resolution using existing JSON files
        const pdTree = new PartialDataClass(base, [
            { keypath: "sub1", url: "./sub1.json" },
            { keypath: "sub1.grand", url: "./sub1.json" }
        ]);

        const pathGrand = pdTree._normalize("sub1.grand.child");
        const ancestor = pdTree._findAncestorPartial(pathGrand);
        assertEqual(pdTree._kpToString(ancestor.keypath), "sub1.grand", "_findAncestorPartial chooses most specific ancestor");

        const descendantsOfSub1 = pdTree._findDescendantPartials(pdTree._normalize("sub1"));
        assertEqual(descendantsOfSub1.length, 1, "_findDescendantPartials finds deeper partials");
        assert(pdTree._isSubtreeRequest(pdTree._normalize("sub1")), "_isSubtreeRequest detects subtree needing descendants");

        // Request deeper than partials: use a separate instance whose data shape matches sub1.json
        const pdDeep = new PartialDataClass(base, [
            { keypath: "sub1", url: "./sub1.json" }
        ]);
        const deep = await pdDeep.get("sub1.grand.child");
        assert(typeof deep === "object", "request deeper than partial should succeed after ancestor fetch");

        // Request parent of deeper partial: subtree fetch should give grand subtree
        const subtree = await pdTree.get("sub1");
        assert(subtree && typeof subtree === "object" && "grand" in subtree, "subtree request should include descendant partial data");

        // Restore fetch before leaving this test
        window.fetch = originalFetch;
    }

    async function testChangePropagation(baseFromRepo) {
        section("Change propagation via onChange");
        const base = cloneDeep(baseFromRepo || {});

        let changeCount = 0;
        let lastPayload = null;

        const pd = new PartialDataClass(base, [
            {
                keypath: "sub2",
                url: "./sub2.json",
                onChange: (changedKeypath, data) => {
                    changeCount++;
                    lastPayload = data;
                    assertEqual(changedKeypath, "sub2.nested.value", "partial onChange receives the changed keypath");
                }
            }
        ]);

        // Ensure partial is loaded so cache has an entry, then mutate inside it
        await pd.get("sub2");
        await pd.set("sub2.nested.value", 123);
        await pd.unset("sub2.nested.value");

        // Two mutations inside the partial boundary should trigger onChange twice
        assertEqual(changeCount, 2, "onChange should fire exactly twice (set and unset inside partial boundary)");
        assert(lastPayload !== null, "onChange should receive payload from cached subtree");

        // The payload should reflect the final state of the cached subtree
        const finalSub2 = await pd.get("sub2");
        assertEqual(lastPayload, finalSub2, "onChange payload should equal the final cached subtree for sub2");
    }

    /* -------------
       Test runner
    ---------------*/

    async function runTests() {
        console.log("=== Running PartialDataClass tests ===");
        const baseFromRepo = await loadJson("./repo.json").catch(() => ({}));

        await testInitFromRepoAndPartialLoadFromFiles();
        await testKeypathUtilities(baseFromRepo);
        await testGetSetUnsetAndStatics(baseFromRepo);
        await testPartialsFetchingAndCaching(baseFromRepo);
        await testChangePropagation(baseFromRepo);

        console.log("=== All PartialDataClass tests completed successfully ===");
    }

    // Kick off tests immediately after script load.
    // They are self-contained and log to the console.
    runTests().catch(err => {
        console.error("Test run aborted due to failure:", err);
    });

})();

