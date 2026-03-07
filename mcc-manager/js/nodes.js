/**
 * Renders a tree of nodes with collapsible children, weak/parent connectors,
 * showUnder virtual parents, and DOM-inspector style.
 * @param {Object[]} nodes - Array of node objects
 * @param {HTMLElement} container - Element to append to
 */
function showNodeGraph(nodes, container) {
    container.classList.add("node-graph");

    if (!nodes || !Array.isArray(nodes)) return;

    for (const node of nodes) {
        const isParent = node.children && node.children.length > 0;
        const type = node.type != null ? String(node.type) : '';
        const typeClass = type ? ' node-type-' + type : '';
        const parentClass = isParent ? ' node-parent' : '';
        const connectorClass = (node.weak === true) ? ' node-connector-weak' : '';

        const wrap = document.createElement('div');
        wrap.className = 'node' + parentClass + typeClass;

        const connector = document.createElement('span');
        connector.className = 'node-connector' + connectorClass;
        connector.setAttribute('aria-hidden', 'true');
        wrap.appendChild(connector);

        const label = document.createElement('span');
        label.className = 'node-label';
        label.textContent = node.name ?? '';

        if (isParent) {
            const details = document.createElement('details');
            if (node.collapsed !== true) details.open = true;
            const summary = document.createElement('summary');
            summary.appendChild(label);
            if (node.info) {
                const infoIcon = document.createElement('span');
                infoIcon.className = 'node-info';
                infoIcon.title = node.info;
                infoIcon.textContent = '\uD83D\uDEC8';
                infoIcon.setAttribute('aria-label', 'info');
                summary.appendChild(infoIcon);
            }
            details.appendChild(summary);
            const childrenBox = document.createElement('div');
            childrenBox.className = 'node-children';
            buildAndAppendChildren(node.children, childrenBox);
            details.appendChild(childrenBox);
            wrap.appendChild(details);
        } else {
            wrap.appendChild(label);
            if (node.info) {
                const infoIcon = document.createElement('span');
                infoIcon.className = 'node-info';
                infoIcon.title = node.info;
                infoIcon.textContent = '\uD83D\uDEC8';
                infoIcon.setAttribute('aria-label', 'info');
                wrap.appendChild(infoIcon);
            }
        }

        container.appendChild(wrap);
    }
}

/**
 * Groups children by showUnder and builds virtual nodes where needed,
 * then appends the resulting node list to container.
 */
function buildAndAppendChildren(children, container) {
    if (!children || children.length === 0) return;

    const byShowUnder = new Map(); // undefined -> direct, "B" -> [nodes with showUnder "B"]
    for (const c of children) {
        const key = c.showUnder;
        if (!byShowUnder.has(key)) byShowUnder.set(key, []);
        byShowUnder.get(key).push(c);
    }

    // Direct children (no showUnder)
    const direct = byShowUnder.get(undefined);
    if (direct && direct.length) showNodeGraph(direct, container);

    // Virtual parents (showUnder "X") – strip showUnder so children don't re-group infinitely
    byShowUnder.forEach((group, key) => {
        if (key === undefined) return;
        const virtualNode = {
            name: key,
            type: 'virtual',
            children: group.map(function (c) {
                var copy = Object.assign({}, c);
                delete copy.showUnder;
                return copy;
            }),
            weak: false,
            collapsed: false
        };
        showNodeGraph([virtualNode], container);
    });
}

/**
 * Recursively builds a node graph representing the prototype chain of an object
 * @param {object} obj - The object to inspect
 * @param {string} name - Optional name for the root node
 * @returns {Array} - Node graph array
 */
function nodeGraphOf(obj, name = "Object") {
    if (obj === null) return [];

    const children = [];

    // Get own properties
    Object.getOwnPropertyNames(obj).forEach(key => {
        try {
            const descriptor = Object.getOwnPropertyDescriptor(obj, key);
            const value = descriptor?.value;
            let type = typeof value;

            // Simplify type classification
            if (type === "function") type = "method";
            else if (value !== null && type === "object") type = "object";
            else type = "property";

            // Avoid recursing on primitives
            const childNode = {
                name: key,
                type,
                info: descriptor?.writable ? "writable" : "read-only"
            };

            if (value && (typeof value === "object" || typeof value === "function")) {
                // Recurse into nested objects/functions
                childNode.children = nodeGraphOf(value, key);
            }

            children.push(childNode);
        } catch (e) {
            children.push({
                name: key,
                type: "unknown",
                info: "Cannot inspect"
            });
        }
    });

    // Add prototype chain
    const proto = Object.getPrototypeOf(obj);
    if (proto && proto !== Object.prototype) {
        children.push({
            name: "__proto__",
            type: "prototype",
            info: proto.constructor?.name || "anonymous",
            children: nodeGraphOf(proto, "__proto__")
        });
    }

    return [{
        name,
        type: "object",
        info: obj.constructor?.name || "Object",
        children
    }];
}

/**
 * Builds a node graph asynchronously in chunks to avoid freezing the UI.
 * Calls onDone(graph) when finished instead of returning.
 * @param {object} obj - The object to inspect
 * @param {(graph: Array) => void} onDone - Called with the node graph when done
 * @param {string} name - Root node name
 * @param {number} chunkSize - How many properties to process per "frame"
 */
function nodeGraphOfChunked(obj, onDone, name = "Object", chunkSize = 50) {
    if (obj === null) {
        onDone([]);
        return;
    }

    const rootNode = {
        name,
        type: "object",
        info: obj.constructor?.name || "Object",
        children: []
    };

    const stack = [{ node: rootNode, object: obj, keys: Object.getOwnPropertyNames(obj), index: 0 }];

    function runChunk() {
        if (stack.length === 0) {
            finishWithProto();
            return;
        }

        const frame = stack[stack.length - 1];
        const { node, object, keys } = frame;
        let processed = 0;

        while (frame.index < keys.length && processed < chunkSize) {
            const key = keys[frame.index++];
            processed++;

            try {
                const descriptor = Object.getOwnPropertyDescriptor(object, key);
                const value = descriptor?.value;
                let type = typeof value;

                if (type === "function") type = "method";
                else if (value !== null && type === "object") type = "object";
                else type = "property";

                const childNode = {
                    name: key,
                    type,
                    info: descriptor?.writable ? "writable" : "read-only"
                };

                if (value && (typeof value === "object" || typeof value === "function")) {
                    childNode.children = [];
                    stack.push({
                        node: childNode,
                        object: value,
                        keys: Object.getOwnPropertyNames(value),
                        index: 0
                    });
                }

                node.children.push(childNode);
            } catch (e) {
                node.children.push({
                    name: key,
                    type: "unknown",
                    info: "Cannot inspect"
                });
            }
        }

        if (frame.index < keys.length) {
            setTimeout(runChunk, 0);
        } else {
            stack.pop();
            setTimeout(runChunk, 0);
        }
    }

    function finishWithProto() {
        const proto = Object.getPrototypeOf(obj);
        if (proto && proto !== Object.prototype) {
            nodeGraphOfChunked(proto, (protoGraph) => {
                const protoRoot = protoGraph[0];
                rootNode.children.push({
                    name: "__proto__",
                    type: "prototype",
                    info: proto.constructor?.name || "anonymous",
                    children: protoRoot ? protoRoot.children : []
                });
                onDone([rootNode]);
            }, "__proto__", chunkSize);
        } else {
            onDone([rootNode]);
        }
    }

    runChunk();
}

