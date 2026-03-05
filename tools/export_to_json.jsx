// export_to_json.jsx — Illustrator ExtendScript
// Run from: File > Scripts > Other Script...
// Exports the active document to JSON preserving full layer hierarchy.
// Read-only: does NOT modify the document.

(function() {
    if (!app.documents.length) {
        alert("No document open.");
        return;
    }

    var doc = app.activeDocument;
    var abIdx = doc.artboards.getActiveArtboardIndex();
    var abRect = doc.artboards[abIdx].artboardRect; // [left, top, right, bottom]
    var artboardTop = abRect[1];
    var artboardBottom = abRect[3];
    var artboardLeft = abRect[0];

    // Coordinate conversion constant (points to millimeters)
    var PT_TO_MM = 25.4 / 72;

    // DIAGNOSTIC: Log artboard coordinates
    var diagnosticLog = "=== ARTBOARD INFO ===\n";
    diagnosticLog += "artboardRect: [" + abRect[0] + ", " + abRect[1] + ", " + abRect[2] + ", " + abRect[3] + "]\n";
    diagnosticLog += "artboardLeft: " + artboardLeft + "\n";
    diagnosticLog += "artboardTop: " + artboardTop + "\n";
    diagnosticLog += "artboardBottom: " + artboardBottom + "\n";
    diagnosticLog += "artboardRight: " + abRect[2] + "\n";
    diagnosticLog += "width: " + (abRect[2] - abRect[0]) + "\n";
    diagnosticLog += "height: " + (abRect[1] - abRect[3]) + "\n";
    diagnosticLog += "PT_TO_MM: " + PT_TO_MM + "\n\n";

    // Detect panels from compound paths (read-only)
    var detectedPanels = [];
    for (var li = 0; li < doc.layers.length; li++) {
        findCompoundPathPanels(doc.layers[li], detectedPanels);
    }

    var result = {
        version: "1.0",
        metadata: extractMetadata(doc),
        layers: [],
        swatches: extractSwatches(doc)
    };

    // Add detected panels to metadata
    result.metadata.panels = detectedPanels;

    for (var i = 0; i < doc.layers.length; i++) {
        if (doc.layers[i].visible) {
            result.layers.push(processLayer(doc.layers[i]));
        }
    }

    // Inject __bounds__ path nodes for compound path panels
    injectBoundsNodes(result.layers);

    var savePath = doc.fullName.toString().replace(/\.[^.]+$/, "") + ".json";
    var file = new File(savePath);
    file.encoding = "UTF-8";
    file.open("w");
    file.write(jsonStringify(result, 0));
    file.close();

    // Save diagnostic log
    var logPath = doc.fullName.toString().replace(/\.[^.]+$/, "") + "_diagnostic.txt";
    var logFile = new File(logPath);
    logFile.encoding = "UTF-8";
    logFile.open("w");
    logFile.write(diagnosticLog);
    logFile.close();

    alert("Exported to:\n" + savePath + "\n\nDiagnostic log:\n" + logPath);

    // ─── Metadata ───

    function extractMetadata(doc) {
        var boards = [];
        for (var i = 0; i < doc.artboards.length; i++) {
            var ab = doc.artboards[i];
            var r = ab.artboardRect;
            boards.push({
                name: ab.name,
                rect: { x: r[0] - artboardLeft, y: artboardTop - r[1], width: r[2] - r[0], height: r[1] - r[3] }
            });
        }
        return {
            name: doc.name,
            width: abRect[2] - abRect[0],
            height: abRect[1] - abRect[3],
            colorSpace: doc.documentColorSpace == DocumentColorSpace.RGB ? "RGB" : "CMYK",
            units: "pt",
            artboards: boards
        };
    }

    function extractSwatches(doc) {
        var sw = [];
        for (var i = 0; i < doc.swatches.length; i++) {
            try { sw.push(extractColor(doc.swatches[i].color)); } catch(e) {}
        }
        return sw;
    }

    // ─── Compound Path Panel Detection (read-only) ───

    // Check if two bounding rects overlap or touch (within tolerance).
    // Illustrator coords: top > bottom (Y increases upward).
    function boundsOverlap(a, b, tolerance) {
        if (typeof tolerance === "undefined") tolerance = 2;
        return !(a.right + tolerance < b.left ||
                 b.right + tolerance < a.left ||
                 a.bottom - tolerance > b.top ||
                 b.bottom - tolerance > a.top);
    }

    // Cluster sub-paths of a CompoundPathItem by spatial overlap.
    // Returns array of cluster bounding rects in artboard-relative coords.
    function clusterSubPaths(cp) {
        var n = cp.pathItems.length;
        if (n === 0) return [];

        // Gather bounds and assign initial cluster IDs
        var subs = [];
        for (var i = 0; i < n; i++) {
            var gb = cp.pathItems[i].geometricBounds; // [left, top, right, bottom]
            subs.push({ left: gb[0], top: gb[1], right: gb[2], bottom: gb[3], cluster: i });
        }

        // Iterative merge: merge clusters whose sub-path bounds overlap
        var changed = true;
        while (changed) {
            changed = false;
            for (var i = 0; i < n; i++) {
                for (var j = i + 1; j < n; j++) {
                    if (subs[i].cluster !== subs[j].cluster && boundsOverlap(subs[i], subs[j])) {
                        var oldC = subs[j].cluster;
                        var newC = subs[i].cluster;
                        for (var k = 0; k < n; k++) {
                            if (subs[k].cluster === oldC) subs[k].cluster = newC;
                        }
                        changed = true;
                    }
                }
            }
        }

        // Group by cluster ID, compute union bounding rect per cluster
        var clusters = {};
        for (var i = 0; i < n; i++) {
            var cid = subs[i].cluster;
            if (!clusters[cid]) {
                clusters[cid] = { left: subs[i].left, top: subs[i].top, right: subs[i].right, bottom: subs[i].bottom };
            } else {
                var c = clusters[cid];
                if (subs[i].left < c.left) c.left = subs[i].left;
                if (subs[i].top > c.top) c.top = subs[i].top;
                if (subs[i].right > c.right) c.right = subs[i].right;
                if (subs[i].bottom < c.bottom) c.bottom = subs[i].bottom;
            }
        }

        // Convert to artboard-relative coords array
        var result = [];
        for (var cid in clusters) {
            if (!clusters.hasOwnProperty(cid)) continue;
            var c = clusters[cid];
            result.push({
                x: c.left - artboardLeft,
                y: artboardTop - c.top,
                width: c.right - c.left,
                height: c.top - c.bottom
            });
        }
        return result;
    }

    // Check if a compound path qualifies for panel detection
    function shouldAnalyzeForPanels(cp) {
        try {
            if (cp.pathItems.length < 2) return false;
            var gb = cp.geometricBounds;
            var w = gb[2] - gb[0];
            var h = gb[1] - gb[3];
            return (w >= 30 && h >= 30);
        } catch(e) { return false; }
    }

    // Find compound paths in a container and detect panels from them
    function findCompoundPathPanels(container, results) {
        var items;
        try { items = container.pageItems; } catch(e) { return; }
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.hidden) continue;
            if (item.typename === "CompoundPathItem" && shouldAnalyzeForPanels(item)) {
                var clusters = clusterSubPaths(item);
                for (var ci = 0; ci < clusters.length; ci++) {
                    results.push(clusters[ci]);
                }
            }
            if (item.typename === "GroupItem") {
                findCompoundPathPanels(item, results);
            }
        }
    }

    // Create a synthetic __bounds__ path node from panel bounds
    function makeBoundsNode(name, b) {
        return {
            type: "path",
            name: "__bounds__" + name,
            visible: true,
            locked: false,
            opacity: 100,
            closed: true,
            pathData: [
                { x: b.x, y: b.y, handleIn: null, handleOut: null },
                { x: b.x + b.width, y: b.y, handleIn: null, handleOut: null },
                { x: b.x + b.width, y: b.y + b.height, handleIn: null, handleOut: null },
                { x: b.x, y: b.y + b.height, handleIn: null, handleOut: null }
            ],
            fill: { type: "none" },
            stroke: { type: "none" },
            strokeWidth: 0,
            bounds: { x: b.x, y: b.y, width: b.width, height: b.height }
        };
    }

    // Walk the document tree and inject __bounds__ nodes for compound path panels
    function injectBoundsNodes(layers) {
        for (var li = 0; li < layers.length; li++) {
            injectBoundsInChildren(layers[li].children);
        }
    }

    function injectBoundsInChildren(children) {
        if (!children) return;
        var toInsert = [];
        for (var i = 0; i < children.length; i++) {
            var child = children[i];
            if (child._panelClusters) {
                for (var ci = 0; ci < child._panelClusters.length; ci++) {
                    var panelName = child.name || "Panel";
                    if (child._panelClusters.length > 1) {
                        panelName += "_" + (ci + 1);
                    }
                    toInsert.push({ insertAfter: i, node: makeBoundsNode(panelName, child._panelClusters[ci]) });
                }
                delete child._panelClusters;
            }
            if (child.children) {
                injectBoundsInChildren(child.children);
            }
        }
        // Insert in reverse order to preserve indices
        for (var j = toInsert.length - 1; j >= 0; j--) {
            children.splice(toInsert[j].insertAfter + 1, 0, toInsert[j].node);
        }
    }

    // ─── Panel Index Assignment ───

    function getPanelIndex(item) {
        if (detectedPanels.length === 0) return -1;
        try {
            var gb = item.geometricBounds;
            var cx = (gb[0] + gb[2]) / 2;
            var cy = (gb[1] + gb[3]) / 2;
            // Convert to artboard coords for comparison
            var cxAB = cx - artboardLeft;
            var cyAB = artboardTop - cy;
            for (var pi = 0; pi < detectedPanels.length; pi++) {
                var pb = detectedPanels[pi];
                if (cxAB >= pb.x && cxAB <= pb.x + pb.width && cyAB >= pb.y && cyAB <= pb.y + pb.height) {
                    return pi;
                }
            }
        } catch(e) {}
        return -1;
    }

    // ─── Layer Processing ───

    function processLayer(layer) {
        // Skip invisible layers
        if (!layer.visible) return null;

        var obj = {
            name: layer.name,
            visible: layer.visible,
            locked: layer.locked,
            opacity: layer.opacity,
            children: []
        };
        // Sublayers - only process visible ones
        for (var i = 0; i < layer.layers.length; i++) {
            if (layer.layers[i].visible) {
                var sublayer = processLayer(layer.layers[i]);
                if (sublayer) obj.children.push(sublayer);
            }
        }
        // Direct page items (skip items belonging to sublayers)
        try {
            for (var i = 0; i < layer.pageItems.length; i++) {
                try {
                    var item = layer.pageItems[i];
                    if (item.parent !== layer) continue;
                    // Skip hidden items
                    if (item.hidden) continue;

                    // Extra safety check for text frames with potential font issues
                    if (item.typename === "TextFrame") {
                        try {
                            // Test basic accessibility before processing
                            var test = item.geometricBounds;
                            if (!test) continue;
                        } catch(e) {
                            // Skip inaccessible text frames
                            continue;
                        }
                    }

                    var processed = processPageItem(item);
                    if (processed) {
                        processed.panelIndex = getPanelIndex(item);
                        obj.children.push(processed);
                    }
                } catch(e) {
                    // Skip problematic items and continue with the rest
                }
            }
        } catch(e) {
            // If pageItems iteration fails completely, continue without them
        }
        return obj;
    }

    function processPageItem(item) {
        try {
            // Pre-check: ensure item is accessible
            var itemType = item.typename;
            if (!itemType) return null;

            // For text frames, do an extra safety check
            if (itemType === "TextFrame") {
                try {
                    // Test if we can safely access the text frame
                    var testAccess = item.geometricBounds;
                    if (!testAccess) return null;
                } catch(e) {
                    // Text frame is not accessible, skip it
                    return null;
                }
            }

            switch (itemType) {
                case "GroupItem": return processGroup(item);
                case "PathItem": return processPath(item);
                case "CompoundPathItem": return processCompoundPath(item);
                case "TextFrame": return processTextFrame(item);
                case "PlacedItem": return processImage(item);
                case "RasterItem": return processImage(item);
                default: return processGeneric(item);
            }
        } catch(e) {
            // If anything fails, return null to skip this item
            return null;
        }
    }

    function processGroup(grp) {
        // Skip hidden groups
        if (grp.hidden) return null;

        var obj = {
            type: "group",
            name: grp.name || "Group",
            visible: !grp.hidden,
            locked: grp.locked,
            opacity: grp.opacity,
            clipped: grp.clipped,
            children: []
        };
        for (var i = 0; i < grp.pageItems.length; i++) {
            // Only process visible items
            if (!grp.pageItems[i].hidden) {
                var child = processPageItem(grp.pageItems[i]);
                if (child) obj.children.push(child);
            }
        }
        return obj;
    }

    function processPath(path) {
        var anchors = [];
        for (var i = 0; i < path.pathPoints.length; i++) {
            var pt = path.pathPoints[i];
            anchors.push({
                x: pt.anchor[0] - artboardLeft,
                y: artboardTop - pt.anchor[1],
                handleIn: { x: pt.leftDirection[0] - artboardLeft, y: artboardTop - pt.leftDirection[1] },
                handleOut: { x: pt.rightDirection[0] - artboardLeft, y: artboardTop - pt.rightDirection[1] }
            });
        }
        var gb = path.geometricBounds;

        // DIAGNOSTIC: Log path coordinates
        diagnosticLog += "PATH: " + (path.name || "unnamed") + "\n";
        diagnosticLog += "  geometricBounds (raw): [" + gb[0] + ", " + gb[1] + ", " + gb[2] + ", " + gb[3] + "]\n";
        diagnosticLog += "  converted bounds (pt): x=" + (gb[0] - artboardLeft) + ", y=" + (artboardTop - gb[1]) + ", w=" + (gb[2] - gb[0]) + ", h=" + (gb[1] - gb[3]) + "\n";
        if (anchors.length > 0) {
            diagnosticLog += "  first anchor (raw): [" + path.pathPoints[0].anchor[0] + ", " + path.pathPoints[0].anchor[1] + "]\n";
            diagnosticLog += "  first anchor (converted): x=" + anchors[0].x + ", y=" + anchors[0].y + "\n";
        }
        diagnosticLog += "\n";

        return {
            type: "path",
            name: path.name || "",
            visible: !path.hidden,
            locked: path.locked,
            opacity: path.opacity,
            closed: path.closed,
            pathData: anchors,
            fill: path.filled ? extractColor(path.fillColor) : { type: "none" },
            stroke: path.stroked ? extractColor(path.strokeColor) : { type: "none" },
            strokeWidth: path.strokeWidth,
            strokeCap: path.strokeCap == StrokeCap.BUTTENDCAP ? "butt" : path.strokeCap == StrokeCap.ROUNDENDCAP ? "round" : "square",
            strokeJoin: path.strokeJoin == StrokeJoin.MITERENDJOIN ? "miter" : path.strokeJoin == StrokeJoin.ROUNDENDJOIN ? "round" : "bevel",
            miterLimit: path.miterLimit,
            strokeDashes: path.strokeDashes || [],
            bounds: { x: gb[0] - artboardLeft, y: artboardTop - gb[1], width: gb[2] - gb[0], height: gb[1] - gb[3] }
        };
    }

    function processCompoundPath(cp) {
        var paths = [];
        for (var i = 0; i < cp.pathItems.length; i++) {
            paths.push(processPath(cp.pathItems[i]));
        }
        var gb = cp.geometricBounds;
        var obj = {
            type: "compoundPath",
            name: cp.name || "",
            visible: !cp.hidden,
            locked: cp.locked,
            opacity: cp.opacity,
            paths: paths,
            bounds: { x: gb[0] - artboardLeft, y: artboardTop - gb[1], width: gb[2] - gb[0], height: gb[1] - gb[3] }
        };

        // Attach panel clusters for __bounds__ injection
        if (shouldAnalyzeForPanels(cp)) {
            obj._panelClusters = clusterSubPaths(cp);
        }

        return obj;
    }

    function processTextFrame(tf) {
        // Simplified text processing - get text content first, then try to get font info safely
        var gb = [0, 0, 0, 0];
        var mat = null;
        var kind = "point";
        var name = "";
        var visible = true;
        var locked = false;
        var opacity = 100;
        var textContent = "";
        var fontFamily = "Unknown";
        var fontStyle = "Regular";
        var fontSize = 12;
        var textColor = { type: "rgb", r: 0, g: 0, b: 0 };

        // Extract only safe, basic properties
        try { gb = tf.geometricBounds; } catch(e) {}
        try { name = tf.name || ""; } catch(e) {}
        try { visible = !tf.hidden; } catch(e) {}
        try { locked = tf.locked; } catch(e) {}
        try { opacity = tf.opacity; } catch(e) {}
        try {
            kind = tf.kind == TextType.POINTTEXT ? "point" : tf.kind == TextType.AREATEXT ? "area" : "path";
        } catch(e) {}
        try {
            var m = tf.matrix;
            mat = { a: m.mValueA, b: m.mValueB, c: m.mValueC, d: m.mValueD, tx: m.mValueTX - artboardLeft, ty: artboardTop - m.mValueTY };
        } catch(e) {}

        // Get text content using the safest method
        try {
            textContent = tf.contents || "";
        } catch(e) {
            textContent = "[Text]";
        }

        // Try to get font information from the first character only (safer than iterating all)
        try {
            if (tf.textRange && tf.textRange.characterAttributes) {
                var attrs = tf.textRange.characterAttributes;
                try {
                    fontFamily = attrs.textFont.family;
                } catch(e) {}
                try {
                    fontStyle = attrs.textFont.style;
                } catch(e) {}
                try {
                    fontSize = attrs.size;
                } catch(e) {}
                try {
                    textColor = extractColor(attrs.fillColor);
                } catch(e) {}
            }
        } catch(e) {
            // If textRange approach fails, try getting from first paragraph/character
            try {
                if (tf.paragraphs && tf.paragraphs.length > 0 && tf.paragraphs[0].characters && tf.paragraphs[0].characters.length > 0) {
                    var firstChar = tf.paragraphs[0].characters[0];
                    var attrs = firstChar.characterAttributes;
                    try {
                        fontFamily = attrs.textFont.family;
                    } catch(e) {}
                    try {
                        fontStyle = attrs.textFont.style;
                    } catch(e) {}
                    try {
                        fontSize = attrs.size;
                    } catch(e) {}
                    try {
                        textColor = extractColor(attrs.fillColor);
                    } catch(e) {}
                }
            } catch(e) {
                // Use defaults if all font extraction methods fail
            }
        }

        // Return text object with captured font info
        return {
            type: "text",
            name: name,
            visible: visible,
            locked: locked,
            opacity: opacity,
            kind: kind,
            bounds: { x: gb[0] - artboardLeft, y: artboardTop - gb[1], width: gb[2] - gb[0], height: gb[1] - gb[3] },
            matrix: mat,
            content: textContent,
            paragraphs: [{
                alignment: "left",
                runs: [{
                    text: textContent,
                    fontFamily: fontFamily,
                    fontStyle: fontStyle,
                    fontSize: fontSize,
                    color: textColor,
                    leading: "auto",
                    tracking: 0,
                    baselineShift: 0,
                    underline: false,
                    strikethrough: false
                }]
            }]
        };
    }

    function extractRuns(para) {
        var runs = [];
        var curText = "";
        var curSig = "";
        var curAttrs = null;
        try {
            for (var i = 0; i < para.characters.length; i++) {
                try {
                    var ch = para.characters[i];
                    var attrs = ch.characterAttributes;
                    var fontName = "Unknown";
                    var fontSize = 12;
                    var tracking = 0;
                    try {
                        fontName = attrs.textFont.name;
                    } catch(e) {}
                    try {
                        fontSize = attrs.size;
                    } catch(e) {}
                    try {
                        tracking = attrs.tracking;
                    } catch(e) {}
                    var sig = fontName + "|" + fontSize + "|" + tracking;
                    if (sig !== curSig && curText.length > 0) {
                        runs.push(makeRun(curText, curAttrs));
                        curText = "";
                    }
                    curSig = sig;
                    curAttrs = attrs;
                    curText += ch.contents;
                } catch(e) {
                    // Skip problematic characters
                }
            }
            if (curText.length > 0 && curAttrs) runs.push(makeRun(curText, curAttrs));
        } catch(e) {
            // If character iteration fails completely, return empty runs
        }
        return runs;
    }

    function makeRun(text, attrs) {
        var fontFamily = "Arial";
        var fontStyle = "Regular";
        var fontSize = 12;
        var color = { type: "rgb", r: 0, g: 0, b: 0 };
        var leading = "auto";
        var tracking = 0;
        var baselineShift = 0;
        var underline = false;
        var strikethrough = false;

        try {
            fontFamily = attrs.textFont.family;
        } catch(e) {}
        try {
            fontStyle = attrs.textFont.style;
        } catch(e) {}
        try {
            fontSize = attrs.size;
        } catch(e) {}
        try {
            color = extractColor(attrs.fillColor);
        } catch(e) {}
        try {
            leading = attrs.autoLeading ? "auto" : attrs.leading;
        } catch(e) {}
        try {
            tracking = attrs.tracking;
        } catch(e) {}
        try {
            baselineShift = attrs.baselineShift;
        } catch(e) {}
        try {
            underline = attrs.underline;
        } catch(e) {}
        try {
            strikethrough = attrs.strikeThrough;
        } catch(e) {}

        return {
            text: text,
            fontFamily: fontFamily,
            fontStyle: fontStyle,
            fontSize: fontSize,
            color: color,
            leading: leading,
            tracking: tracking,
            baselineShift: baselineShift,
            underline: underline,
            strikethrough: strikethrough
        };
    }

    function processImage(item) {
        var gb = item.geometricBounds;
        var obj = {
            type: "image",
            name: item.name || "",
            visible: !item.hidden,
            locked: item.locked,
            opacity: item.opacity,
            bounds: { x: gb[0] - artboardLeft, y: artboardTop - gb[1], width: gb[2] - gb[0], height: gb[1] - gb[3] },
            embedded: item.typename === "RasterItem"
        };
        if (item.typename === "PlacedItem") {
            try { obj.filePath = item.file.fsName; } catch(e) {}
        }
        return obj;
    }

    function processGeneric(item) {
        var gb = item.geometricBounds;
        return {
            type: "path",
            name: item.name || item.typename,
            visible: !item.hidden,
            locked: item.locked,
            opacity: item.opacity || 100,
            closed: true,
            pathData: [
                { x: gb[0] - artboardLeft, y: artboardTop - gb[1], handleIn: null, handleOut: null },
                { x: gb[2] - artboardLeft, y: artboardTop - gb[1], handleIn: null, handleOut: null },
                { x: gb[2] - artboardLeft, y: artboardTop - gb[3], handleIn: null, handleOut: null },
                { x: gb[0] - artboardLeft, y: artboardTop - gb[3], handleIn: null, handleOut: null }
            ],
            fill: { type: "rgb", r: 200, g: 200, b: 200 },
            stroke: { type: "rgb", r: 150, g: 150, b: 150 },
            strokeWidth: 0.5,
            bounds: { x: gb[0] - artboardLeft, y: artboardTop - gb[1], width: gb[2] - gb[0], height: gb[1] - gb[3] }
        };
    }

    // ─── Color Extraction ───

    function extractColor(c) {
        if (!c) return { type: "none" };
        switch (c.typename) {
            case "RGBColor":
                return { type: "rgb", r: Math.round(c.red), g: Math.round(c.green), b: Math.round(c.blue) };
            case "CMYKColor":
                return { type: "cmyk", c: round3(c.cyan), m: round3(c.magenta), y: round3(c.yellow), k: round3(c.black) };
            case "SpotColor":
                return { type: "spot", name: c.spot.name, tint: c.tint, fallback: extractColor(c.spot.color) };
            case "GradientColor":
                return extractGradient(c);
            case "GrayColor":
                var v = Math.round(255 * (1 - c.gray / 100));
                return { type: "rgb", r: v, g: v, b: v };
            default:
                return { type: "none" };
        }
    }

    function extractGradient(gc) {
        var grad = gc.gradient;
        var stops = [];
        for (var i = 0; i < grad.gradientStops.length; i++) {
            var gs = grad.gradientStops[i];
            stops.push({ offset: gs.rampPoint, color: extractColor(gs.color), midpoint: gs.midPoint });
        }
        return {
            type: "gradient",
            gradientType: grad.type == GradientType.LINEAR ? "linear" : "radial",
            angle: gc.angle,
            origin: { x: gc.origin[0] - artboardLeft, y: artboardTop - gc.origin[1] },
            stops: stops
        };
    }

    function extractAlignment(para) {
        try {
            var j = para.paragraphAttributes.justification;
            if (j == Justification.LEFT) return "left";
            if (j == Justification.CENTER) return "center";
            if (j == Justification.RIGHT) return "right";
            return "justify";
        } catch(e) { return "left"; }
    }

    function round3(n) { return Math.round(n * 100000) / 100000; }

    // ─── JSON Serializer (ExtendScript lacks JSON.stringify) ───

    function jsonStringify(obj, indent) {
        if (obj === null || obj === undefined) return "null";
        if (typeof obj === "boolean") return obj ? "true" : "false";
        if (typeof obj === "number") {
            if (isNaN(obj)) return "null";
            return round3(obj) + "";
        }
        if (typeof obj === "string") {
            return '"' + obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t") + '"';
        }
        if (obj instanceof Array) {
            if (obj.length === 0) return "[]";
            var items = [];
            for (var i = 0; i < obj.length; i++) {
                items.push(jsonStringify(obj[i], (indent || 0) + 1));
            }
            return "[" + items.join(",") + "]";
        }
        if (typeof obj === "object") {
            var keys = [];
            for (var k in obj) {
                if (obj.hasOwnProperty(k)) keys.push(k);
            }
            if (keys.length === 0) return "{}";
            var pairs = [];
            for (var i = 0; i < keys.length; i++) {
                var val = obj[keys[i]];
                if (val === undefined) continue;
                pairs.push('"' + keys[i] + '":' + jsonStringify(val, (indent || 0) + 1));
            }
            return "{" + pairs.join(",") + "}";
        }
        return "null";
    }

})();
