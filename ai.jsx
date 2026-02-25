#target illustrator
#targetengine main

// Simple JSON polyfill for older Illustrator versions (safe to keep)
if (typeof JSON === 'undefined' || !JSON.stringify) {
    // Minimal Crockford-style stringify (enough for our needs)
    JSON.stringify = function(obj) {
        return obj === null ? 'null' : 
               typeof obj === 'string' ? '"' + obj.replace(/"/g,'\\"') + '"' : 
               typeof obj === 'number' ? obj.toString() : 
               Array.isArray(obj) ? '[' + obj.map(JSON.stringify).join(',') + ']' : 
               '{' + Object.keys(obj).map(function(k){return '"'+k+'":'+JSON.stringify(obj[k]);}).join(',') + '}';
    };
}

function getPathData(pathItem) {
    var d = '';
    var pts = pathItem.pathPoints;
    for (var i = 0; i < pts.length; i++) {
        var p = pts[i];
        var a = p.anchor;
        var ld = p.leftDirection;
        var rd = p.rightDirection;
        if (i === 0) {
            d += 'M ' + a[0].toFixed(2) + ',' + a[1].toFixed(2) + ' ';
        } else {
            d += 'C ' + rd[0].toFixed(2) + ',' + rd[1].toFixed(2) + ' ' +
                 ld[0].toFixed(2) + ',' + ld[1].toFixed(2) + ' ' +
                 a[0].toFixed(2) + ',' + a[1].toFixed(2) + ' ';
        }
    }
    if (pathItem.closed) d += 'Z';
    return d.trim();
}

function isRectangle(pathItem) {
    if (pathItem.pathPoints.length !== 4) return false;
    // simple axis-aligned check (you can extend for rotated rects)
    var pts = pathItem.pathPoints;
    return Math.abs(pts[0].anchor[1] - pts[1].anchor[1]) < 0.1 &&
           Math.abs(pts[1].anchor[0] - pts[2].anchor[0]) < 0.1;
}

function rgbToHex(c) {
    if (c.typename === "RGBColor") {
        return '#' + [c.red, c.green, c.blue].map(function(v){
            return ('0' + Math.round(v).toString(16)).slice(-2);
        }).join('');
    }
    return '#000000'; // fallback
}

function exportItem(item, docHeight) {
    var obj = {
        name: item.name || 'unnamed',
        visible: item.hidden !== true,
        opacity: item.opacity,
        geometricBounds: item.geometricBounds // [left, top, right, bottom] – Illustrator space
    };

    if (item.typename === "GroupItem") {
        obj.type = "group";
        obj.children = [];
        for (var i = 0; i < item.pageItems.length; i++) {
            obj.children.push(exportItem(item.pageItems[i], docHeight));
        }
    }
    else if (item.typename === "PathItem") {
        obj.type = "path";
        obj.d = getPathData(item);
        obj.fill = item.filled ? rgbToHex(item.fillColor) : 'none';
        obj.stroke = item.stroked ? rgbToHex(item.strokeColor) : 'none';
        obj.strokeWidth = item.strokeWidth;
        obj.closed = item.closed;

        if (isRectangle(item)) {
            obj.type = "rect";
            var b = item.geometricBounds;
            obj.x = b[0];
            obj.y = b[1];           // top in AI space
            obj.width = b[2] - b[0];
            obj.height = b[1] - b[3];
        }
    }
    else if (item.typename === "TextFrame") {
        obj.type = "text";
        obj.content = item.contents;
        var attr = item.textRange.characterAttributes;
        obj.fontFamily = attr.textFont ? attr.textFont.name : "Arial";
        obj.fontSize = attr.size;
        obj.fontStyle = attr.italics ? "italic" : "normal";
        obj.fontWeight = attr.bold ? "bold" : "normal";
        obj.fill = rgbToHex(attr.fillColor);
        obj.justification = item.textRange.justification.toString().replace("Justification.","").toLowerCase();
        var pos = item.position; // [x, y] bottom-left origin in AI
        obj.x = pos[0];
        obj.y = pos[1]; // will be flipped in web
    }

    return obj;
}

function main() {
    if (app.documents.length === 0) { alert("Open a document first!"); return; }
    var doc = app.activeDocument;
    var docHeight = doc.height; // for Y-flip later

    var jsonData = {
        document: {
            name: doc.name,
            width: doc.width,
            height: docHeight
        },
        layers: []
    };

    for (var i = 0; i < doc.layers.length; i++) {
        var layer = doc.layers[i];
        if (layer.locked || layer.hidden) continue; // optional: export hidden too if you want

        var layerObj = {
            type: "layer",
            name: layer.name,
            visible: layer.visible,
            locked: layer.locked,
            children: []
        };

        for (var j = 0; j < layer.pageItems.length; j++) {
            layerObj.children.push(exportItem(layer.pageItems[j], docHeight));
        }
        jsonData.layers.push(layerObj);
    }

    // Save dialog
    var file = File.saveDialog("Save JSON for web", "*.json");
    if (file) {
        file.open('w');
        file.encoding = "UTF-8";
        file.write(JSON.stringify(jsonData, null, 2));
        file.close();
        alert("✅ Exported successfully!\n" + file.fsName);
    }
}

main();