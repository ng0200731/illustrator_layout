# PDF to Canvas — Detailed Code Walkthrough

*Last updated: 2026-02-19*

## Overview

This document provides a complete, line-by-line explanation of how a PDF file is read and all pdfpath components are displayed on the canvas.

---

## Complete Flow: PDF File → Canvas Display

### Step 1: User Drops PDF File

**Location:** `component.js` lines 1264-1274

```javascript
preview.addEventListener("drop", function (e) {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
        var file = e.dataTransfer.files[0];
        if (file.name.toLowerCase().endsWith(".pdf")) {
            parsePdfFile(file);  // ← Entry point
            return;
        }
    }
});
```

**What happens:**
- User drags PDF onto `#component-preview` div
- Browser fires `drop` event
- Code checks if file ends with `.pdf`
- Calls `parsePdfFile(file)` with the File object

---

### Step 2: Read PDF File as Binary Data

**Location:** `component.js` lines 887-959

```javascript
function parsePdfFile(file) {
    // Check if PDF.js library is loaded
    if (typeof pdfjsLib === "undefined") {
        App.showToast("PDF.js not loaded", true);
        return;
    }

    // Read file as ArrayBuffer (binary data)
    var reader = new FileReader();
    reader.onload = function (e) {
        var data = new Uint8Array(e.target.result);  // Convert to Uint8Array

        // Load PDF with PDF.js
        pdfjsLib.getDocument({ data: data }).promise.then(function (pdf) {
            return pdf.getPage(1);  // Get first page
        }).then(function (page) {
            // ... continue processing
        });
    };
    reader.readAsArrayBuffer(file);  // Start reading
}
```

**What happens:**
1. `FileReader` reads the PDF file as binary `ArrayBuffer`
2. Convert to `Uint8Array` (PDF.js requirement)
3. `pdfjsLib.getDocument()` parses the PDF structure
4. `pdf.getPage(1)` gets the first page object

---

### Step 3: Extract PDF Dimensions

**Location:** `component.js` lines 898-902

```javascript
var vp = page.getViewport({ scale: 1 });
var pdfW = vp.width / 72 * 25.4;   // Convert points to mm
var pdfH = vp.height / 72 * 25.4;  // Convert points to mm

compTpl = {
    id: null,
    name: file.name.replace(/\.pdf$/i, ""),
    width: pdfW,
    height: pdfH,
    partitions: []
};
```

**Conversion formula:**
- PDF uses **points** (72 points = 1 inch)
- System uses **millimeters** (25.4 mm = 1 inch)
- Formula: `mm = points / 72 * 25.4`

**Example:**
- PDF page: 595.28 × 841.89 points (A4)
- Converted: 210 × 297 mm

---

### Step 4: Extract Vector Paths and Text

**Location:** `component.js` lines 910-924

```javascript
return Promise.all([
    extractPdfObjects(page, pdfW, pdfH),  // Extract vector paths
    page.getTextContent()                  // Extract text
]).then(function (results) {
    var pdfObjs = groupPdfObjects(results[0]);  // Group nearby paths
    var textContent = results[1];

    // Create pdfpath components from vector paths
    pdfObjs.forEach(function (obj) {
        components.push({
            page: 0,
            partitionLabel: "",
            type: "pdfpath",
            content: "",
            x: obj.bbox.x,
            y: obj.bbox.y,
            w: obj.bbox.w,
            h: obj.bbox.h,
            pathData: {
                ops: obj.ops,      // Path operations [M, L, C, Z]
                fill: obj.fill,    // Fill color [r, g, b]
                stroke: obj.stroke, // Stroke color [r, g, b]
                lw: obj.lw         // Line width in mm
            }
        });
    });
});
```

**What happens:**
1. Run two operations in parallel:
   - `extractPdfObjects()` — Walk operator list, extract paths
   - `page.getTextContent()` — Extract text items
2. Group nearby paths with same color
3. Create component objects and push to `components[]` array

---

### Step 5: Extract Vector Paths (Detailed)

**Location:** `component.js` lines 737-827

```javascript
function extractPdfObjects(page, pdfW, pdfH) {
    return page.getOperatorList().then(function (opList) {
        var fnArray = opList.fnArray;    // Operator codes
        var argsArray = opList.argsArray; // Operator arguments

        var results = [];
        var currentPath = null;
        var currentOps = [];
        var ctmStack = [[1, 0, 0, 1, 0, 0]];  // Transformation matrix stack
        var fillColor = null;
        var strokeColor = null;
        var lineWidth = 0.5;

        for (var i = 0; i < fnArray.length; i++) {
            var fn = fnArray[i];
            var args = argsArray[i];

            // Handle each operator type
            if (fn === pdfjsLib.OPS.moveTo) {
                var pt = txPt(ctmStack[ctmStack.length - 1], args[0], args[1]);
                currentOps.push({ o: "M", a: [pt[0], pt[1]] });
            }
            else if (fn === pdfjsLib.OPS.lineTo) {
                var pt = txPt(ctmStack[ctmStack.length - 1], args[0], args[1]);
                currentOps.push({ o: "L", a: [pt[0], pt[1]] });
            }
            else if (fn === pdfjsLib.OPS.curveTo) {
                var ctm = ctmStack[ctmStack.length - 1];
                var p1 = txPt(ctm, args[0], args[1]);
                var p2 = txPt(ctm, args[2], args[3]);
                var p3 = txPt(ctm, args[4], args[5]);
                currentOps.push({ o: "C", a: [p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]] });
            }
            else if (fn === pdfjsLib.OPS.closePath) {
                currentOps.push({ o: "Z", a: [] });
            }
            else if (fn === pdfjsLib.OPS.stroke || fn === pdfjsLib.OPS.fill || fn === pdfjsLib.OPS.fillStroke) {
                // Save completed path
                if (currentOps.length > 0) {
                    var bbox = computeBbox(currentOps);
                    results.push({
                        ops: currentOps,
                        fill: (fn === pdfjsLib.OPS.fill || fn === pdfjsLib.OPS.fillStroke) ? fillColor : null,
                        stroke: (fn === pdfjsLib.OPS.stroke || fn === pdfjsLib.OPS.fillStroke) ? strokeColor : null,
                        lw: lineWidth,
                        bbox: bbox
                    });
                    currentOps = [];
                }
            }
            else if (fn === pdfjsLib.OPS.setFillRGBColor) {
                fillColor = [args[0], args[1], args[2]];
            }
            else if (fn === pdfjsLib.OPS.setStrokeRGBColor) {
                strokeColor = [args[0], args[1], args[2]];
            }
            else if (fn === pdfjsLib.OPS.setLineWidth) {
                lineWidth = args[0] / 72 * 25.4;  // Convert to mm
            }
        }

        return results;
    });
}
```

**Key concepts:**

**Operator List:**
PDF.js provides a low-level list of drawing commands:
- `fnArray` — Array of operator codes (e.g., `OPS.moveTo`, `OPS.lineTo`)
- `argsArray` — Array of arguments for each operator

**Transformation Matrix (CTM):**
6-element array `[a, b, c, d, e, f]` that transforms coordinates:
```
x' = a*x + c*y + e
y' = b*x + d*y + f
```

**Path Operations:**
- `M x y` — Move to point (start new subpath)
- `L x y` — Line to point
- `C x1 y1 x2 y2 x3 y3` — Cubic Bézier curve
- `Z` — Close path (line back to start)

**Example operator sequence:**
```
moveTo(10, 10)    → M 10 10
lineTo(50, 10)    → L 50 10
lineTo(50, 50)    → L 50 50
closePath()       → Z
fill()            → Save path with fill color
```

---

### Step 6: Group Nearby Paths

**Location:** `component.js` lines 830-884

```javascript
function groupPdfObjects(objects, gap) {
    gap = gap || 1.5;  // Default 1.5mm proximity threshold

    // Create color key for each object
    var colorKey = function (obj) {
        var f = obj.fill || [];
        var s = obj.stroke || [];
        return f.join(",") + "|" + s.join(",");
    };

    // Union-Find data structure
    var parent = [];
    for (var i = 0; i < objects.length; i++) parent[i] = i;

    function find(x) {
        if (parent[x] !== x) parent[x] = find(parent[x]);
        return parent[x];
    }

    function unite(x, y) {
        parent[find(x)] = find(y);
    }

    // Group objects with same color that are close together
    for (var i = 0; i < objects.length; i++) {
        for (var j = i + 1; j < objects.length; j++) {
            if (colorKey(objects[i]) !== colorKey(objects[j])) continue;

            var b1 = objects[i].bbox;
            var b2 = objects[j].bbox;

            // Check if bounding boxes overlap or are within gap distance
            var dx = Math.max(0, Math.max(b1.x, b2.x) - Math.min(b1.x + b1.w, b2.x + b2.w));
            var dy = Math.max(0, Math.max(b1.y, b2.y) - Math.min(b1.y + b1.h, b2.y + b2.h));

            if (dx <= gap && dy <= gap) {
                unite(i, j);
            }
        }
    }

    // Collect groups
    var groups = {};
    for (var i = 0; i < objects.length; i++) {
        var root = find(i);
        if (!groups[root]) groups[root] = [];
        groups[root].push(objects[i]);
    }

    // Merge paths in each group
    var merged = [];
    for (var key in groups) {
        var group = groups[key];
        var allOps = [];
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        group.forEach(function (obj) {
            allOps = allOps.concat(obj.ops);
            minX = Math.min(minX, obj.bbox.x);
            minY = Math.min(minY, obj.bbox.y);
            maxX = Math.max(maxX, obj.bbox.x + obj.bbox.w);
            maxY = Math.max(maxY, obj.bbox.y + obj.bbox.h);
        });

        merged.push({
            ops: allOps,
            fill: group[0].fill,
            stroke: group[0].stroke,
            lw: group[0].lw,
            bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
        });
    }

    return merged;
}
```

**Why group?**
- Reduces component count (improves performance)
- Merges disconnected parts of same shape (e.g., letter "i" has dot and stem)
- Keeps related paths together

**Example:**
```
Before grouping:
  Path 1: M 10,10 L 20,10 (black stroke)
  Path 2: M 20,10 L 30,10 (black stroke, adjacent)

After grouping:
  Compound: M 10,10 L 20,10 M 20,10 L 30,10 (single component)
```

---

### Step 7: Render Canvas

**Location:** `component.js` lines 443-542

```javascript
function renderCanvas() {
    var preview = document.getElementById("component-preview");
    if (!preview || !compTpl) return;

    // Calculate scale factor to fit canvas in preview container
    var rect = preview.getBoundingClientRect();
    sc = Math.min(
        (rect.width - 20) / compTpl.width,
        (rect.height - 20) / compTpl.height,
        6  // Max scale 6x
    );

    // Create canvas container
    var canvas = document.createElement("div");
    canvas.className = "label-canvas";
    canvas.style.width = (compTpl.width * sc) + "px";
    canvas.style.height = (compTpl.height * sc) + "px";

    // Get all pdfpath components for current page
    var pdfPaths = getPageComponents().filter(function (c) {
        return c.type === "pdfpath";
    });

    if (pdfPaths.length) {
        // Create single SVG element for ALL pdfpath components
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.style.position = "absolute";
        svg.style.left = "0";
        svg.style.top = "0";
        svg.style.width = (compTpl.width * sc) + "px";
        svg.style.height = (compTpl.height * sc) + "px";
        svg.style.zIndex = "1";
        svg.setAttribute("viewBox", "0 0 " + compTpl.width + " " + compTpl.height);

        // Helper to round coordinates
        function r(v) { return +v.toFixed(3); }

        // Draw each pdfpath component as SVG <path>
        pdfPaths.forEach(function (c) {
            var idx = components.indexOf(c);

            // Build SVG path data string
            var d = "";
            c.pathData.ops.forEach(function (op) {
                var a = op.a;
                if (op.o === "M") {
                    d += " M" + r(a[0]) + " " + r(a[1]);
                }
                else if (op.o === "L") {
                    d += " L" + r(a[0]) + " " + r(a[1]);
                }
                else if (op.o === "C") {
                    d += " C" + r(a[0]) + " " + r(a[1]) + " " +
                         r(a[2]) + " " + r(a[3]) + " " +
                         r(a[4]) + " " + r(a[5]);
                }
                else if (op.o === "Z") {
                    d += "Z";
                }
            });

            // Create SVG path element
            var pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
            pathEl.setAttribute("d", d);

            // Set fill color
            var fl = c.pathData.fill;
            if (fl) {
                pathEl.setAttribute("fill",
                    "rgb(" + Math.round(fl[0]*255) + "," +
                            Math.round(fl[1]*255) + "," +
                            Math.round(fl[2]*255) + ")");
            } else {
                pathEl.setAttribute("fill", "none");
            }

            // Set stroke color
            var sl = c.pathData.stroke;
            if (sl) {
                pathEl.setAttribute("stroke",
                    "rgb(" + Math.round(sl[0]*255) + "," +
                            Math.round(sl[1]*255) + "," +
                            Math.round(sl[2]*255) + ")");
                pathEl.setAttribute("stroke-width", String(r(c.pathData.lw || 0.3)));
            } else {
                pathEl.setAttribute("stroke", "none");
            }

            // Stroke styling
            pathEl.setAttribute("stroke-linecap", "round");
            pathEl.setAttribute("stroke-linejoin", "round");

            // Cursor and visibility
            pathEl.style.cursor = c.locked ? "not-allowed" : "pointer";
            if (c.visible === false) {
                pathEl.style.opacity = "0.15";  // Hidden paths are semi-transparent
            }

            // Selection highlight
            if (idx === selectedIdx || selectedSet.indexOf(idx) >= 0) {
                pathEl.setAttribute("filter", "url(#sel-outline)");
            }

            // Store component index for click handling
            pathEl.dataset.compIndex = String(idx);

            // Click handler
            pathEl.addEventListener("mousedown", function (e) {
                e.stopPropagation();
                var clickedComp = components[idx];
                if (clickedComp.locked) return;

                if (clickedComp && clickedComp.groupId) {
                    // Select entire group
                    selectGroup(clickedComp.groupId);
                } else {
                    // Select single component
                    selectedIdx = idx;
                    selectedSet = [];
                }
                renderCanvas();
                renderPlacedList();
                updateGroupToolbar();
            });

            // Add path to SVG
            svg.appendChild(pathEl);
        });

        // Add selection highlight filter definition
        var defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
        var filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
        filter.setAttribute("id", "sel-outline");
        // ... filter definition (blue outline effect)

        svg.appendChild(defs);
        canvas.appendChild(svg);
    }

    preview.appendChild(canvas);
}
```

**Key rendering concepts:**

**Single SVG Layer:**
- All pdfpath components are rendered in ONE `<svg>` element
- Preserves z-order (draw order = layer order)
- More efficient than individual SVG elements

**ViewBox:**
```html
<svg viewBox="0 0 100 50">
```
- Defines coordinate system in mm
- SVG automatically scales to fit container
- Paths use mm coordinates directly

**Path Data String:**
```
M 10 20 L 30 20 L 30 40 Z
```
- M = moveTo
- L = lineTo
- C = curveTo (cubic Bézier)
- Z = closePath

**Color Conversion:**
- PDF.js returns RGB as 0-1 range: `[0.5, 0.2, 0.8]`
- SVG needs 0-255 range: `rgb(127, 51, 204)`
- Formula: `Math.round(value * 255)`

---

## Complete Example

### Input: Simple PDF with Rectangle

**PDF operators:**
```
setFillRGBColor(1, 0, 0)     // Red fill
rectangle(10, 10, 40, 20)    // x, y, w, h in points
fill()
```

### Step-by-step processing:

**1. Extract operators:**
```javascript
{
    ops: [
        { o: "M", a: [3.53, 3.53] },      // Top-left (10pt → 3.53mm)
        { o: "L", a: [17.64, 3.53] },     // Top-right
        { o: "L", a: [17.64, 10.58] },    // Bottom-right
        { o: "L", a: [3.53, 10.58] },     // Bottom-left
        { o: "Z", a: [] }                 // Close
    ],
    fill: [1, 0, 0],                      // Red
    stroke: null,
    lw: 0.5,
    bbox: { x: 3.53, y: 3.53, w: 14.11, h: 7.05 }
}
```

**2. Create component:**
```javascript
{
    page: 0,
    partitionLabel: "",
    type: "pdfpath",
    content: "",
    x: 3.53,
    y: 3.53,
    w: 14.11,
    h: 7.05,
    pathData: {
        ops: [...],
        fill: [1, 0, 0],
        stroke: null,
        lw: 0.5
    }
}
```

**3. Render SVG:**
```html
<svg viewBox="0 0 210 297">
    <path
        d="M 3.53 3.53 L 17.64 3.53 L 17.64 10.58 L 3.53 10.58 Z"
        fill="rgb(255, 0, 0)"
        stroke="none"
    />
</svg>
```

**4. Display on canvas:**
- Red rectangle appears at position (3.53mm, 3.53mm)
- Size: 14.11mm × 7.05mm
- User can click to select, drag to move

---

## Summary

**Complete flow:**

1. **Drop PDF** → `parsePdfFile(file)`
2. **Read binary** → `FileReader.readAsArrayBuffer()`
3. **Parse PDF** → `pdfjsLib.getDocument()`
4. **Get page** → `pdf.getPage(1)`
5. **Extract operators** → `page.getOperatorList()`
6. **Walk operators** → Build path objects with M/L/C/Z operations
7. **Group paths** → Union-Find algorithm merges nearby paths
8. **Create components** → Push to `components[]` array
9. **Render SVG** → Single `<svg>` with multiple `<path>` elements
10. **Display** → Canvas shows all pdfpath components

**Key data structures:**

- **Operator:** `{ o: "M", a: [x, y] }`
- **Path object:** `{ ops: [...], fill: [r,g,b], stroke: [r,g,b], lw: 0.5, bbox: {...} }`
- **Component:** `{ type: "pdfpath", x, y, w, h, pathData: {...} }`
- **SVG path:** `<path d="M x y L x y Z" fill="..." stroke="..." />`

All code is in `static/js/component.js` with PDF.js library loaded from CDN.
