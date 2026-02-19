# PDF Grouping Code Template — Template → Create → PDF

*Last updated: 2026-02-19*

## Overview

This document shows the complete code flow for how PDF paths are extracted and grouped into `pdfpath` components when loading a PDF in **Template → Create → PDF → Component**.

---

## Complete Flow Diagram

```
User drops PDF file
    ↓
parsePdfFile(file)
    ↓
FileReader.readAsArrayBuffer()
    ↓
PDF.js: pdfjsLib.getDocument()
    ↓
pdf.getPage(1)
    ↓
extractPdfObjects(page, pdfW, pdfH)  ← Extract individual paths
    ↓
groupPdfObjects(objects)              ← Group nearby paths
    ↓
Create pdfpath components
    ↓
Render on canvas
```

---

## Step 1: Entry Point — parsePdfFile()

**Location:** `component.js` lines 887-959

```javascript
function parsePdfFile(file) {
    // Check if PDF.js is loaded
    if (typeof pdfjsLib === "undefined") {
        App.showToast("PDF.js not loaded", true);
        return;
    }

    // Read PDF file as binary
    var reader = new FileReader();
    reader.onload = function (e) {
        var data = new Uint8Array(e.target.result);

        // Parse PDF with PDF.js
        pdfjsLib.getDocument({ data: data }).promise
            .then(function (pdf) {
                return pdf.getPage(1);  // Get first page
            })
            .then(function (page) {
                // Get page dimensions
                var vp = page.getViewport({ scale: 1 });
                var pdfW = vp.width / 72 * 25.4;   // Points → mm
                var pdfH = vp.height / 72 * 25.4;

                // Initialize template
                compTpl = {
                    id: null,
                    name: file.name.replace(/\.pdf$/i, ""),
                    width: pdfW,
                    height: pdfH,
                    partitions: []
                };
                pdfFileName = compTpl.name;
                compPage = 0;
                components = [];
                savedComponents = [];
                selectedIdx = -1;
                pan.x = 0; pan.y = 0; pan.zoom = 1;

                // Extract paths and text in parallel
                return Promise.all([
                    extractPdfObjects(page, pdfW, pdfH),  // ← Extract paths
                    page.getTextContent()                  // ← Extract text
                ]);
            })
            .then(function (results) {
                var pdfObjs = groupPdfObjects(results[0]);  // ← GROUP PATHS HERE
                var textContent = results[1];

                // Create pdfpath components from grouped objects
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

                // Create text components (non-outlined text)
                var textCount = 0;
                textContent.items.forEach(function (item) {
                    if (!item.str || !item.str.trim()) return;

                    // Skip garbled text from outlined fonts
                    var readable = item.str.replace(/[\x00-\x1f\ufffd]/g, "");
                    var printable = readable.replace(/[^\x20-\x7e\u00a0-\u024f\u0400-\u04ff\u4e00-\u9fff\u3000-\u30ff\uac00-\ud7af]/g, "");
                    if (printable.length < readable.length * 0.5) return;

                    var tx = item.transform;
                    var xMm = tx[4] / 72 * 25.4;
                    var yMm = pdfH - (tx[5] / 72 * 25.4);
                    var fontSize = Math.abs(tx[0]) / 72 * 25.4 / 0.3528;
                    var wMm = (item.width || 0) / 72 * 25.4;
                    var hMm = fontSize * 0.3528 * 1.3;

                    components.push({
                        page: 0,
                        partitionLabel: "",
                        type: "text",
                        content: item.str,
                        x: xMm,
                        y: yMm,
                        w: Math.max(wMm, 10),
                        h: Math.max(hMm, 3),
                        fontFamily: "Arial",
                        fontSize: Math.round(fontSize) || 8
                    });
                    textCount++;
                });

                savedComponents = JSON.parse(JSON.stringify(components));
                App.showToast("Imported " + pdfObjs.length + " paths" +
                             (textCount ? ", " + textCount + " text" : ""));
                renderPageTabs();
                renderCanvas();
            })
            .catch(function (err) {
                App.showToast("PDF parse error: " + err.message, true);
            });
    };

    reader.readAsArrayBuffer(file);
}
```

**Key points:**
- Reads PDF as `ArrayBuffer`
- Extracts paths and text in parallel
- **Calls `groupPdfObjects()` to merge nearby paths**
- Creates `pdfpath` components from grouped objects
- Creates `text` components from readable text

---

## Step 2: Extract Individual Paths — extractPdfObjects()

**Location:** `component.js` lines 737-827

```javascript
function extractPdfObjects(page, pdfW, pdfH) {
    var OPS = pdfjsLib.OPS;

    return page.getOperatorList().then(function (opList) {
        var objects = [];           // Output: array of path objects
        var path = [];              // Current path being built
        var stack = [];             // Graphics state stack
        var st = {                  // Current graphics state
            ctm: [1, 0, 0, 1, 0, 0], // Transformation matrix
            fill: [0, 0, 0],         // Fill color (black)
            stroke: [0, 0, 0],       // Stroke color (black)
            lw: 1                    // Line width
        };

        // Normalize RGB (PDF.js may return 0-255 or 0-1)
        function nc(arr) {
            var mx = Math.max(arr[0], arr[1], arr[2]);
            return mx > 1 ? [arr[0]/255, arr[1]/255, arr[2]/255] : arr;
        }

        // Snapshot current state
        function snap() {
            return {
                ctm: st.ctm.slice(),
                fill: st.fill.slice(),
                stroke: st.stroke.slice(),
                lw: st.lw
            };
        }

        // Transform point and convert to mm
        function addPathPt(x, y) {
            var p = txPt(st.ctm, x, y);
            var mm = pt2mm(p[0], p[1], pdfH);
            return mm;
        }

        // Finish current path and save as object
        function finishPath(doFill, doStroke) {
            if (!path.length) return;

            // Calculate bounding box
            var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
            path.forEach(function (op) {
                for (var i = 0; i < op.a.length; i += 2) {
                    var px = op.a[i], py = op.a[i+1];
                    if (px < minX) minX = px;
                    if (px > maxX) maxX = px;
                    if (py < minY) minY = py;
                    if (py > maxY) maxY = py;
                }
            });

            // Ensure minimum size
            if (maxX - minX < 0.1) maxX = minX + 0.5;
            if (maxY - minY < 0.1) maxY = minY + 0.5;

            // Save path object
            objects.push({
                ops: path.slice(),
                fill: doFill ? st.fill.slice() : null,
                stroke: doStroke ? st.stroke.slice() : null,
                lw: st.lw / 72 * 25.4,  // Convert to mm
                bbox: {
                    x: minX,
                    y: minY,
                    w: maxX - minX,
                    h: maxY - minY
                }
            });

            path = [];  // Reset for next path
        }

        // Walk through all PDF operators
        for (var i = 0; i < opList.fnArray.length; i++) {
            var fn = opList.fnArray[i];
            var args = opList.argsArray[i];

            // Graphics state operators
            if (fn === OPS.save) {
                stack.push(snap());
            }
            else if (fn === OPS.restore) {
                if (stack.length) st = stack.pop();
            }
            else if (fn === OPS.transform) {
                st.ctm = mulMat(st.ctm, args);
            }
            else if (fn === OPS.paintFormXObjectBegin) {
                stack.push(snap());
                if (args && args[0] && args[0].length === 6) {
                    st.ctm = mulMat(st.ctm, args[0]);
                }
            }
            else if (fn === OPS.paintFormXObjectEnd) {
                if (stack.length) st = stack.pop();
            }

            // Color operators
            else if (fn === OPS.setLineWidth) {
                st.lw = args[0];
            }
            else if (fn === OPS.setStrokeRGBColor) {
                st.stroke = nc([args[0], args[1], args[2]]);
            }
            else if (fn === OPS.setFillRGBColor) {
                st.fill = nc([args[0], args[1], args[2]]);
            }
            else if (fn === OPS.setStrokeGray) {
                var g = args[0] > 1 ? args[0]/255 : args[0];
                st.stroke = [g, g, g];
            }
            else if (fn === OPS.setFillGray) {
                var g = args[0] > 1 ? args[0]/255 : args[0];
                st.fill = [g, g, g];
            }
            else if (fn === OPS.setStrokeCMYKColor) {
                var c = args[0], m = args[1], y2 = args[2], k = args[3];
                st.stroke = [(1-c)*(1-k), (1-m)*(1-k), (1-y2)*(1-k)];
            }
            else if (fn === OPS.setFillCMYKColor) {
                var c = args[0], m = args[1], y2 = args[2], k = args[3];
                st.fill = [(1-c)*(1-k), (1-m)*(1-k), (1-y2)*(1-k)];
            }

            // Path construction operators
            else if (fn === OPS.constructPath) {
                var subOps = args[0];
                var coords = args[1];
                var ci = 0;  // Coordinate index

                for (var j = 0; j < subOps.length; j++) {
                    var so = subOps[j];

                    if (so === OPS.moveTo) {
                        var p = addPathPt(coords[ci], coords[ci+1]);
                        path.push({ o: "M", a: p });
                        ci += 2;
                    }
                    else if (so === OPS.lineTo) {
                        var p = addPathPt(coords[ci], coords[ci+1]);
                        path.push({ o: "L", a: p });
                        ci += 2;
                    }
                    else if (so === OPS.curveTo) {
                        var p1 = addPathPt(coords[ci], coords[ci+1]);
                        var p2 = addPathPt(coords[ci+2], coords[ci+3]);
                        var p3 = addPathPt(coords[ci+4], coords[ci+5]);
                        path.push({
                            o: "C",
                            a: [p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]]
                        });
                        ci += 6;
                    }
                    else if (so === OPS.rectangle) {
                        var x0 = coords[ci];
                        var y0 = coords[ci+1];
                        var rw = coords[ci+2];
                        var rh = coords[ci+3];
                        var p1 = addPathPt(x0, y0);
                        var p2 = addPathPt(x0+rw, y0);
                        var p3 = addPathPt(x0+rw, y0+rh);
                        var p4 = addPathPt(x0, y0+rh);
                        path.push(
                            { o: "M", a: p1 },
                            { o: "L", a: p2 },
                            { o: "L", a: p3 },
                            { o: "L", a: p4 },
                            { o: "Z", a: [] }
                        );
                        ci += 4;
                    }
                    else if (so === OPS.closePath) {
                        path.push({ o: "Z", a: [] });
                    }
                }
            }
            else if (fn === OPS.moveTo) {
                var p = addPathPt(args[0], args[1]);
                path.push({ o: "M", a: p });
            }
            else if (fn === OPS.lineTo) {
                var p = addPathPt(args[0], args[1]);
                path.push({ o: "L", a: p });
            }
            else if (fn === OPS.curveTo) {
                var p1 = addPathPt(args[0], args[1]);
                var p2 = addPathPt(args[2], args[3]);
                var p3 = addPathPt(args[4], args[5]);
                path.push({
                    o: "C",
                    a: [p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]]
                });
            }
            else if (fn === OPS.closePath) {
                path.push({ o: "Z", a: [] });
            }

            // Path painting operators (finish and save path)
            else if (fn === OPS.stroke || fn === OPS.closeStroke) {
                finishPath(false, true);  // Stroke only
            }
            else if (fn === OPS.fill || fn === OPS.eoFill) {
                finishPath(true, false);  // Fill only
            }
            else if (fn === OPS.fillStroke || fn === OPS.eoFillStroke ||
                     fn === OPS.closeFillStroke || fn === OPS.closeEoFillStroke) {
                finishPath(true, true);   // Both fill and stroke
            }
            else if (fn === OPS.endPath) {
                path = [];  // Discard path without painting
            }
        }

        return objects;  // Array of individual path objects
    });
}
```

**Output format:**

Each object in the returned array:

```javascript
{
    ops: [
        { o: "M", a: [10.5, 20.3] },
        { o: "L", a: [30.2, 20.3] },
        { o: "Z", a: [] }
    ],
    fill: [1, 0, 0],        // Red fill (or null)
    stroke: [0, 0, 0],      // Black stroke (or null)
    lw: 0.5,                // Line width in mm
    bbox: {
        x: 10.5,
        y: 20.3,
        w: 19.7,
        h: 5.2
    }
}
```

---

## Step 3: Group Nearby Paths — groupPdfObjects()

**Location:** `component.js` lines 830-884

```javascript
function groupPdfObjects(objects, gap) {
    if (!gap) gap = 1.5;  // Default: 1.5mm proximity threshold

    // Create color key for each object
    function colorKey(obj) {
        var f = obj.fill
            ? obj.fill.map(function(v) { return Math.round(v*100); }).join(",")
            : "n";
        var s = obj.stroke
            ? obj.stroke.map(function(v) { return Math.round(v*100); }).join(",")
            : "n";
        return f + "|" + s;
    }

    // Union-Find data structure
    var parent = [];
    for (var i = 0; i < objects.length; i++) {
        parent[i] = i;  // Each object starts in its own group
    }

    // Find root of set (with path compression)
    function find(x) {
        while (parent[x] !== x) {
            parent[x] = parent[parent[x]];  // Path compression
            x = parent[x];
        }
        return x;
    }

    // Unite two sets
    function unite(a, b) {
        parent[find(a)] = find(b);
    }

    // Group objects with same color whose bboxes overlap or are within gap
    for (var i = 0; i < objects.length; i++) {
        var ki = colorKey(objects[i]);
        var bi = objects[i].bbox;

        for (var j = i + 1; j < objects.length; j++) {
            // Skip if different colors
            if (colorKey(objects[j]) !== ki) continue;

            var bj = objects[j].bbox;

            // Check if bounding boxes are within gap distance
            // Boxes overlap or are close if:
            // - Horizontal: bi.x - gap <= bj.x + bj.w AND bi.x + bi.w + gap >= bj.x
            // - Vertical: bi.y - gap <= bj.y + bj.h AND bi.y + bi.h + gap >= bj.y
            if (bi.x - gap <= bj.x + bj.w &&
                bi.x + bi.w + gap >= bj.x &&
                bi.y - gap <= bj.y + bj.h &&
                bi.y + bi.h + gap >= bj.y) {
                unite(i, j);  // Merge into same group
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

    // Merge each group into one compound object
    var result = [];
    Object.keys(groups).forEach(function (k) {
        var g = groups[k];  // Array of objects in this group

        // Concatenate all path operations
        var allOps = [];
        var minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;

        g.forEach(function (obj) {
            allOps = allOps.concat(obj.ops);

            // Expand bounding box
            if (obj.bbox.x < minX) minX = obj.bbox.x;
            if (obj.bbox.y < minY) minY = obj.bbox.y;
            if (obj.bbox.x + obj.bbox.w > maxX) maxX = obj.bbox.x + obj.bbox.w;
            if (obj.bbox.y + obj.bbox.h > maxY) maxY = obj.bbox.y + obj.bbox.h;
        });

        // Create merged object
        result.push({
            ops: allOps,              // All operations concatenated
            fill: g[0].fill,          // Use first object's colors
            stroke: g[0].stroke,
            lw: g[0].lw,
            bbox: {
                x: minX,
                y: minY,
                w: maxX - minX,
                h: maxY - minY
            }
        });
    });

    return result;  // Array of grouped objects
}
```

**Grouping algorithm:**

1. **Color Key:** Create unique key for each color combination
   - Example: `"100,0,0|n"` = red fill, no stroke
   - Example: `"n|0,0,0"` = no fill, black stroke

2. **Union-Find:** Efficient data structure for grouping
   - Each object starts in its own set
   - `unite(a, b)` merges two sets
   - `find(x)` returns root of set

3. **Proximity Check:** Two objects are grouped if:
   - Same color (fill + stroke)
   - Bounding boxes overlap OR within 1.5mm gap

4. **Merge:** Concatenate all path operations in each group

**Example:**

```javascript
// Input: 3 separate paths
[
    { ops: [M 10,10 L 20,10], fill: [1,0,0], bbox: {x:10, y:10, w:10, h:1} },
    { ops: [M 20,10 L 30,10], fill: [1,0,0], bbox: {x:20, y:10, w:10, h:1} },
    { ops: [M 50,50 L 60,50], fill: [0,0,1], bbox: {x:50, y:50, w:10, h:1} }
]

// Output: 2 grouped paths
[
    {
        ops: [M 10,10 L 20,10, M 20,10 L 30,10],  // First two merged
        fill: [1,0,0],
        bbox: {x:10, y:10, w:20, h:1}
    },
    {
        ops: [M 50,50 L 60,50],  // Third stays separate (different color)
        fill: [0,0,1],
        bbox: {x:50, y:50, w:10, h:1}
    }
]
```

---

## Complete Example

### Input PDF: Letter "i" (dot + stem)

**PDF operators:**
```
setFillRGBColor(0, 0, 0)
moveTo(10, 30)
lineTo(12, 30)
lineTo(12, 10)
lineTo(10, 10)
closePath()
fill()                    ← Stem

moveTo(10, 35)
lineTo(12, 35)
lineTo(12, 33)
lineTo(10, 33)
closePath()
fill()                    ← Dot
```

### Step 1: extractPdfObjects() output

```javascript
[
    {
        ops: [
            { o: "M", a: [3.53, 10.58] },
            { o: "L", a: [4.23, 10.58] },
            { o: "L", a: [4.23, 3.53] },
            { o: "L", a: [3.53, 3.53] },
            { o: "Z", a: [] }
        ],
        fill: [0, 0, 0],
        stroke: null,
        lw: 0.5,
        bbox: { x: 3.53, y: 3.53, w: 0.7, h: 7.05 }
    },
    {
        ops: [
            { o: "M", a: [3.53, 12.35] },
            { o: "L", a: [4.23, 12.35] },
            { o: "L", a: [4.23, 11.64] },
            { o: "L", a: [3.53, 11.64] },
            { o: "Z", a: [] }
        ],
        fill: [0, 0, 0],
        stroke: null,
        lw: 0.5,
        bbox: { x: 3.53, y: 11.64, w: 0.7, h: 0.71 }
    }
]
```

### Step 2: groupPdfObjects() processing

**Color keys:**
- Object 0: `"0,0,0|n"` (black fill, no stroke)
- Object 1: `"0,0,0|n"` (black fill, no stroke)
- **Same color!**

**Proximity check:**
```javascript
bi = { x: 3.53, y: 3.53, w: 0.7, h: 7.05 }   // Stem
bj = { x: 3.53, y: 11.64, w: 0.7, h: 0.71 }  // Dot

// Check horizontal overlap
bi.x - 1.5 <= bj.x + bj.w  →  2.03 <= 4.23  ✓
bi.x + bi.w + 1.5 >= bj.x  →  5.73 >= 3.53  ✓

// Check vertical overlap
bi.y - 1.5 <= bj.y + bj.h  →  2.03 <= 12.35  ✓
bi.y + bi.h + 1.5 >= bj.y  →  12.08 >= 11.64  ✓

// Within gap! Unite(0, 1)
```

**Merge result:**
```javascript
{
    ops: [
        // Stem operations
        { o: "M", a: [3.53, 10.58] },
        { o: "L", a: [4.23, 10.58] },
        { o: "L", a: [4.23, 3.53] },
        { o: "L", a: [3.53, 3.53] },
        { o: "Z", a: [] },
        // Dot operations
        { o: "M", a: [3.53, 12.35] },
        { o: "L", a: [4.23, 12.35] },
        { o: "L", a: [4.23, 11.64] },
        { o: "L", a: [3.53, 11.64] },
        { o: "Z", a: [] }
    ],
    fill: [0, 0, 0],
    stroke: null,
    lw: 0.5,
    bbox: { x: 3.53, y: 3.53, w: 0.7, h: 8.82 }  // Combined bbox
}
```

### Step 3: Create pdfpath component

```javascript
{
    page: 0,
    partitionLabel: "",
    type: "pdfpath",
    content: "",
    x: 3.53,
    y: 3.53,
    w: 0.7,
    h: 8.82,
    pathData: {
        ops: [...],  // All operations from merged object
        fill: [0, 0, 0],
        stroke: null,
        lw: 0.5
    }
}
```

### Step 4: Render on canvas

```html
<svg viewBox="0 0 210 297">
    <path
        d="M 3.53 10.58 L 4.23 10.58 L 4.23 3.53 L 3.53 3.53 Z
           M 3.53 12.35 L 4.23 12.35 L 4.23 11.64 L 3.53 11.64 Z"
        fill="rgb(0, 0, 0)"
        stroke="none"
    />
</svg>
```

**Result:** Letter "i" appears as a single selectable component with both dot and stem.

---

## Key Benefits of Grouping

### 1. Reduces Component Count

**Without grouping:**
- 100 small paths = 100 components
- Slow rendering, cluttered UI

**With grouping:**
- 100 small paths → 10 grouped components
- Fast rendering, clean UI

### 2. Keeps Related Shapes Together

**Examples:**
- Letter "i" → dot + stem = 1 component
- Dashed line → 20 dashes = 1 component
- Icon → multiple shapes = 1 component

### 3. Preserves Visual Integrity

**Same color + proximity = related:**
- User can move entire letter/icon as one unit
- No accidental separation of parts

---

## Adjusting Grouping Behavior

### Change Proximity Threshold

```javascript
// Default: 1.5mm gap
var pdfObjs = groupPdfObjects(results[0]);

// Tighter grouping: 0.5mm gap
var pdfObjs = groupPdfObjects(results[0], 0.5);

// Looser grouping: 3mm gap
var pdfObjs = groupPdfObjects(results[0], 3);
```

### Disable Grouping

```javascript
// Skip grouping entirely
var pdfObjs = results[0];  // Use raw extracted objects
```

### Group by Position Only (Ignore Color)

```javascript
function colorKey(obj) {
    return "all";  // All objects have same key
}
```

---

## Summary

**Complete flow:**

1. **parsePdfFile()** — Entry point, reads PDF file
2. **extractPdfObjects()** — Walk operator list, extract individual paths
3. **groupPdfObjects()** — Merge nearby paths with same color using Union-Find
4. **Create components** — Push grouped objects to `components[]` array
5. **renderCanvas()** — Display as SVG paths on canvas

**Key algorithm: Union-Find grouping**
- Same color + proximity (1.5mm) = merge
- Reduces component count
- Keeps related shapes together
- User-friendly selection and manipulation

All code is in `static/js/component.js` lines 737-959.
