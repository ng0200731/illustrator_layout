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
    var artboardLeft = abRect[0];

    // Detect panels read-only (no document modification)
    var detectedPanels = [];
    for (var li = 0; li < doc.layers.length; li++) {
        var rects = [];
        findLargeRects(doc.layers[li], rects);
        var panels = filterNonOverlapping(rects);
        for (var pi = 0; pi < panels.length; pi++) {
            var gb = panels[pi];
            detectedPanels.push({
                name: "Panel" + (pi + 1),
                bounds: {
                    x: gb.left - artboardLeft,
                    y: artboardTop - gb.top,
                    width: gb.right - gb.left,
                    height: gb.top - gb.bottom
                }
            });
        }
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
        result.layers.push(processLayer(doc.layers[i]));
    }

    var savePath = doc.fullName.toString().replace(/\.[^.]+$/, "") + ".json";
    var file = new File(savePath);
    file.encoding = "UTF-8";
    file.open("w");
    file.write(jsonStringify(result, 0));
    file.close();

    alert("Exported to:\n" + savePath);

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

    // ─── Panel Detection (read-only) ───

    function findLargeRects(container, results) {
        var items;
        try { items = container.pageItems; } catch(e) { return; }
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            if (item.hidden) continue;
            if (item.typename === "PathItem" && isLargeRect(item)) {
                var gb = item.geometricBounds;
                results.push({ left: gb[0], top: gb[1], right: gb[2], bottom: gb[3] });
            }
            if (item.typename === "GroupItem") {
                findLargeRects(item, results);
            }
        }
    }

    function isLargeRect(path) {
        if (!path.closed) return false;
        var gb = path.geometricBounds;
        var w = gb[2] - gb[0];
        var h = gb[1] - gb[3];
        if (w < 30 || h < 30) return false;
        try {
            var pathArea = Math.abs(path.area);
            var bboxArea = w * h;
            return pathArea > bboxArea * 0.9;
        } catch(e) {
            return false;
        }
    }

    function filterNonOverlapping(rects) {
        if (rects.length < 2) return rects;
        rects.sort(function(a, b) { return b.top - a.top; });
        var unique = [rects[0]];
        for (var i = 1; i < rects.length; i++) {
            var dominated = false;
            for (var j = 0; j < unique.length; j++) {
                if (Math.abs(rects[i].left - unique[j].left) < 2 &&
                    Math.abs(rects[i].right - unique[j].right) < 2 &&
                    Math.abs(rects[i].top - unique[j].top) < 2 &&
                    Math.abs(rects[i].bottom - unique[j].bottom) < 2) {
                    dominated = true; break;
                }
            }
            if (!dominated) unique.push(rects[i]);
        }
        return unique;
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
                var pb = detectedPanels[pi].bounds;
                if (cxAB >= pb.x && cxAB <= pb.x + pb.width && cyAB >= pb.y && cyAB <= pb.y + pb.height) {
                    return pi;
                }
            }
        } catch(e) {}
        return -1;
    }

    // ─── Layer Processing ───

    function processLayer(layer) {
        var obj = {
            name: layer.name,
            visible: layer.visible,
            locked: layer.locked,
            opacity: layer.opacity,
            children: []
        };
        // Sublayers
        for (var i = 0; i < layer.layers.length; i++) {
            obj.children.push(processLayer(layer.layers[i]));
        }
        // Direct page items (skip items belonging to sublayers)
        for (var i = 0; i < layer.pageItems.length; i++) {
            var item = layer.pageItems[i];
            if (item.parent !== layer) continue;
            var processed = processPageItem(item);
            if (processed) {
                processed.panelIndex = getPanelIndex(item);
                obj.children.push(processed);
            }
        }
        return obj;
    }

    function processPageItem(item) {
        try {
            switch (item.typename) {
                case "GroupItem": return processGroup(item);
                case "PathItem": return processPath(item);
                case "CompoundPathItem": return processCompoundPath(item);
                case "TextFrame": return processTextFrame(item);
                case "PlacedItem": return processImage(item);
                case "RasterItem": return processImage(item);
                default: return processGeneric(item);
            }
        } catch(e) { return null; }
    }

    function processGroup(grp) {
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
            var child = processPageItem(grp.pageItems[i]);
            if (child) obj.children.push(child);
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
        return {
            type: "compoundPath",
            name: cp.name || "",
            visible: !cp.hidden,
            locked: cp.locked,
            opacity: cp.opacity,
            paths: paths,
            bounds: { x: gb[0] - artboardLeft, y: artboardTop - gb[1], width: gb[2] - gb[0], height: gb[1] - gb[3] }
        };
    }

    function processTextFrame(tf) {
        var paragraphs = [];
        for (var i = 0; i < tf.paragraphs.length; i++) {
            var para = tf.paragraphs[i];
            paragraphs.push({
                alignment: extractAlignment(para),
                runs: extractRuns(para)
            });
        }
        var gb = tf.geometricBounds;
        var mat = null;
        try {
            var m = tf.matrix;
            mat = { a: m.mValueA, b: m.mValueB, c: m.mValueC, d: m.mValueD, tx: m.mValueTX - artboardLeft, ty: artboardTop - m.mValueTY };
        } catch(e) {}
        return {
            type: "text",
            name: tf.name || "",
            visible: !tf.hidden,
            locked: tf.locked,
            opacity: tf.opacity,
            kind: tf.kind == TextType.POINTTEXT ? "point" : tf.kind == TextType.AREATEXT ? "area" : "path",
            bounds: { x: gb[0] - artboardLeft, y: artboardTop - gb[1], width: gb[2] - gb[0], height: gb[1] - gb[3] },
            matrix: mat,
            paragraphs: paragraphs
        };
    }

    function extractRuns(para) {
        var runs = [];
        var curText = "";
        var curSig = "";
        var curAttrs = null;
        for (var i = 0; i < para.characters.length; i++) {
            var ch = para.characters[i];
            var attrs = ch.characterAttributes;
            var sig = attrs.textFont.name + "|" + attrs.size + "|" + attrs.tracking;
            if (sig !== curSig && curText.length > 0) {
                runs.push(makeRun(curText, curAttrs));
                curText = "";
            }
            curSig = sig;
            curAttrs = attrs;
            curText += ch.contents;
        }
        if (curText.length > 0 && curAttrs) runs.push(makeRun(curText, curAttrs));
        return runs;
    }

    function makeRun(text, attrs) {
        return {
            text: text,
            fontFamily: attrs.textFont.family,
            fontStyle: attrs.textFont.style,
            fontSize: attrs.size,
            color: extractColor(attrs.fillColor),
            leading: attrs.autoLeading ? "auto" : attrs.leading,
            tracking: attrs.tracking,
            baselineShift: attrs.baselineShift,
            underline: attrs.underline,
            strikethrough: attrs.strikeThrough
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
