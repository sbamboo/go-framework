/* General JS shared across all pages - Node graph rendering */


/**
 * Renders a tree of nodes with collapsible children, weak/parent connectors,
 * showUnder virtual parents, and DOM-inspector style.
 * @param {Object[]} nodes - Array of node objects
 * @param {HTMLElement} container - Element to append to
 * @param {(node: Object, event: MouseEvent) => void} [onClick] - Optional click handler per node
 */
function showNodeGraph(nodes, container, onClick) {
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
        if (node.keypath !== undefined) {
            wrap.setAttribute('data-keypath', typeof node.keypath === 'string' ? node.keypath : String(node.keypath));
        }

        const isExpandable = typeof onClick === "function"
            && node.value === undefined
            && (!node.children || node.children.length === 0);
        if (isExpandable) {
            wrap.classList.add("node-clickable");
            wrap.addEventListener("click", function (event) {
                onClick(node, event);
            });
        }

        const connector = document.createElement('span');
        connector.className = 'node-connector' + connectorClass;
        connector.setAttribute('aria-hidden', 'true');
        wrap.appendChild(connector);

        const label = document.createElement('span');
        label.className = 'node-label';
        label.textContent = node.value !== undefined
            ? (node.name ?? '') + ' = ' + String(node.value)
            : (node.name ?? '');

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
            buildAndAppendChildren(node.children, childrenBox, onClick);
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
 * Updates an existing node graph.
 *
 * When keypath is empty or ".", the entire graph in the container is
 * re-rendered from the provided nodes.
 *
 * When keypath is a specific path, this tries to update only the
 * corresponding root node in-place:
 *   - If a node element with that keypath already exists, its label is
 *     updated and its children container is cleared and rebuilt, but the
 *     root DOM element is kept (preserving state like expanded/collapsed).
 *   - If no such node element exists, the new node is created and appended.
 *
 * @param {string} keypath
 * @param {Object[]} nodes
 * @param {HTMLElement} container
 * @param {(node: Object, event: MouseEvent) => void} [onClick]
 */
function updateNodeGraph(keypath, nodes, container, onClick) {
    // Full re-render for root / whole tree
    if (!keypath || keypath === ".") {
        container.innerHTML = "";
        showNodeGraph(nodes, container, onClick);
        return;
    }

    if (!nodes || !nodes.length) return;

    // We expect the first node in `nodes` to represent the subtree root
    // for this keypath.
    const rootNode = nodes[0];
    const kp = rootNode.keypath != null ? String(rootNode.keypath) : keypath;

    // Find existing DOM element for this keypath, if any.
    const existing = container.querySelector(`.node[data-keypath="${kp}"]`);

    // If there is no existing node element, create it now.
    if (!existing) {
        showNodeGraph([rootNode], container, onClick);
        return;
    }

    // Keep the existing wrapper element to preserve state (e.g. details.open).
    // Just update its keypath attribute, label, and children.
    existing.setAttribute("data-keypath", kp);

    // Update the label text to match showNodeGraph's logic.
    const labelEl = existing.querySelector(".node-label");
    if (labelEl) {
        labelEl.textContent =
            rootNode.value !== undefined
                ? (rootNode.name ?? "") + " = " + String(rootNode.value)
                : (rootNode.name ?? "");
    }

    // If the node has a children container, clear and rebuild its children.
    const childrenBox = existing.querySelector(".node-children");
    if (childrenBox) {
        childrenBox.innerHTML = "";
        if (rootNode.children && rootNode.children.length) {
            buildAndAppendChildren(rootNode.children, childrenBox, onClick);
        }
    }
}

/**
 * Updates non-structural properties of a single node in-place, without
 * recreating the DOM element, so state like expanded/collapsed is preserved.
 *
 * @param {string} keypath - Keypath identifying the node (matches data-keypath)
 * @param {HTMLElement} container - Root container that holds the node graph
 * @param {Object} properties - Plain object of properties to apply. Supported:
 *    - name: updates the node label's name part
 *    - value: updates the node label's value part
 *    - type: updates the node-type-* CSS class on the wrapper
 *    - collapsed: if the node is a parent with <details>, controls details.open
 *    - weak: toggles the 'node-connector-weak' class on the connector
 *    - info: updates/creates/removes the info icon and tooltip
 */
function updateNode(keypath, container, properties) {
    if (!keypath || !container || !properties) return;

    const nodeEl = container.querySelector(`.node[data-keypath="${keypath}"]`);
    if (!nodeEl) return;

    // Ensure data-keypath is present and in sync for this node
    nodeEl.setAttribute("data-keypath", keypath);

    // Update type class if provided
    if ("type" in properties) {
        // Remove any existing node-type-* classes
        nodeEl.className = nodeEl.className
            .split(/\s+/)
            .filter(cls => !cls.startsWith("node-type-"))
            .join(" ")
            .trim() || "node";
        if (properties.type != null && properties.type !== "") {
            nodeEl.classList.add("node-type-" + String(properties.type));
        }
    }

    // Update label text if name and/or value are provided
    if ("name" in properties || "value" in properties) {
        const labelEl = nodeEl.querySelector(".node-label");
        if (labelEl) {
            // Parse existing label into name/value parts so we can
            // preserve whichever part is not being updated.
            let oldName = "";
            let oldValue = null;
            const current = labelEl.textContent || "";
            const eqIndex = current.indexOf(" = ");
            if (eqIndex >= 0) {
                oldName = current.slice(0, eqIndex);
                oldValue = current.slice(eqIndex + 3);
            } else {
                oldName = current;
                oldValue = null;
            }

            const newName =
                "name" in properties ? (properties.name ?? "") : oldName;
            const hasValue = "value" in properties;
            const newValue = hasValue ? properties.value : oldValue;

            if (newValue !== null && newValue !== undefined) {
                labelEl.textContent =
                    String(newName ?? "") + " = " + String(newValue);
            } else {
                labelEl.textContent = String(newName ?? "");
            }
        }
    }

    // Update collapsed / expanded state for parent nodes with <details>
    if ("collapsed" in properties) {
        const details = nodeEl.querySelector("details");
        if (details) {
            const collapsed = !!properties.collapsed;
            details.open = !collapsed;
        }
    }

    // Update weak flag on the connector
    if ("weak" in properties) {
        const connector = nodeEl.querySelector(".node-connector");
        if (connector) {
            connector.classList.toggle("node-connector-weak", !!properties.weak);
        }
    }

    // Update info icon / tooltip
    if ("info" in properties) {
        const infoText = properties.info;
        const existingInfo = nodeEl.querySelector(".node-info");
        const labelEl = nodeEl.querySelector(".node-label");

        if (infoText == null || infoText === "") {
            // Remove info icon if present
            if (existingInfo && existingInfo.parentNode) {
                existingInfo.parentNode.removeChild(existingInfo);
            }
        } else {
            if (existingInfo) {
                existingInfo.title = String(infoText);
                existingInfo.textContent = "\uD83D\uDEC8";
            } else if (labelEl && labelEl.parentNode) {
                const infoIcon = document.createElement("span");
                infoIcon.className = "node-info";
                infoIcon.title = String(infoText);
                infoIcon.textContent = "\uD83D\uDEC8";
                infoIcon.setAttribute("aria-label", "info");
                labelEl.parentNode.appendChild(infoIcon);
            }
        }
    }
}

/**
 * Returns the keypath of the node element that contains nodeElem (or is nodeElem),
 * if that element is inside container. Keypath must be set on nodes via data-keypath
 * when rendering (e.g. node.keypath in showNodeGraph).
 * @param {Element} nodeElem - The clicked element or a descendant of a .node
 * @param {HTMLElement} container - Root container that holds the node graph
 * @returns {string|null} - The keypath string or null if not found / not in container
 */
function getKeypathOfNode(nodeElem, container) {
    const nodeEl = nodeElem && nodeElem.closest ? nodeElem.closest('.node') : null;
    if (!nodeEl || (container && !container.contains(nodeEl))) return null;
    const kp = nodeEl.getAttribute('data-keypath');
    return kp != null ? kp : null;
}

/**
 * Groups children by showUnder and builds virtual nodes where needed,
 * then appends the resulting node list to container.
 */
function buildAndAppendChildren(children, container, onClick) {
    if (!children || children.length === 0) return;

    const byShowUnder = new Map(); // undefined -> direct, "B" -> [nodes with showUnder "B"]
    for (const c of children) {
        const key = c.showUnder;
        if (!byShowUnder.has(key)) byShowUnder.set(key, []);
        byShowUnder.get(key).push(c);
    }

    // Direct children (no showUnder)
    const direct = byShowUnder.get(undefined);
    if (direct && direct.length) showNodeGraph(direct, container, onClick);

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
        showNodeGraph([virtualNode], container, onClick);
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

