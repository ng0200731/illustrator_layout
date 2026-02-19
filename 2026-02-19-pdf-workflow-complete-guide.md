# PDF Import Workflow — Complete Guide (Zero to One)

*Last updated: 2026-02-19*

## Overview

This document explains the complete PDF import and component editing workflow in the Illustrator Label Management System. When a user drags a PDF file onto the canvas, the system extracts all vector paths (pdfpath components) and readable text, displays them on a canvas, and allows editing, grouping, visibility control, and export.

---

## Table of Contents

1. [User Journey](#user-journey)
2. [Technical Architecture](#technical-architecture)
3. [Step-by-Step Workflow](#step-by-step-workflow)
4. [Code Reference](#code-reference)
5. [Data Structures](#data-structures)
6. [Canvas Rendering](#canvas-rendering)
7. [Export System](#export-system)

---

## User Journey

### Entry Point

**Navigation:** Template → Create → PDF → Component

**UI Location:** `index.html` lines 200-299

### User Actions

1. **Load PDF** — Drag PDF file onto canvas OR click file input
2. **View extracted content** — All vector paths and text appear on canvas
3. **Select/Edit** — Click to select, drag to move, double-click text to edit
4. **Group/Ungroup** — Multi-select with rubber-band, group related paths
5. **Visibility/Lock** — Toggle eye/lock icons in sidebar list
6. **Save** — Save components to database (creates template if new PDF)
7. **Export** — Export as PDF, editable AI, or outlined AI

---

## Technical Architecture

### Frontend Libraries (Browser Environment)

| Library | Version | Purpose | CDN | Environment |
|---------|---------|---------|-----|-------------|
| PDF.js | 3.11.174 | PDF parsing, vector extraction | `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js` | Browser (client-side) |
| JsBarcode | 3.11.6 | Barcode rendering on canvas | `https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js` | Browser (client-side) |
| QRCode.js | 1.0.0 | QR code generation | `https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js` | Browser (client-side) |

**Purpose:** These libraries run in the user's browser to parse PDFs, extract vector paths, and render components on the HTML5 canvas.

### Backend Libraries (Python Environment)

| Library | Version | Purpose | Environment |
|---------|---------|---------|-------------|
| ReportLab | 4.4.0 | PDF/AI generation | Python 3.x (server-side) |
| fonttools | 4.56.0 | Font glyph outline extraction | Python 3.x (server-side) |
| python-barcode | 0.15.1 | Barcode image generation | Python 3.x (server-side) |
| qrcode | 7.4.2 | QR code image generation | Python 3.x (server-side) |

**Purpose:** These libraries run on the Flask server to generate PDF and AI export files from component data.

### File Structure

```
static/js/component.js    — 1,369 lines, all PDF logic (browser)
templates/index.html       — UI for component editor (browser)
tools/export_pdf.py        — PDF export backend (Python/Flask)
tools/export_ai.py         — AI export backend (Python/Flask)
tools/fonttools_outline.py — Text-to-path conversion (Python)
```

---

## Step-by-Step Workflow

### 1. PDF Drag-and-Drop

**Trigger:** User drags `.pdf` file onto `#component-preview`

**Code:** `component.js` lines 1258-1274

```javascript
preview.addEventListener("drop", function (e) {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
        var file = e.dataTransfer.files[0];
        if (file.name.toLowerCase().endsWith(".pdf")) {
            parsePdfFile(file);
            return;
        }
    }
});
```

**What happens:**
- File is passed to `parsePdfFile(file)`
- Alternative: file input at line 1312

---

### 2. PDF Parsing

**Function:** `parsePdfFile(file)` — lines 887-959

**Process:**

1. **Read file as ArrayBuffer** (FileReader)
2. **Load PDF with PDF.js** — `pdfjsLib.getDocument({ data: data })`
3. **Get first page** — `pdf.getPage(1)`
4. **Extract dimensions** — Convert PDF points to mm (72 points = 25.4mm)
5. **Extract vector paths** — `extractPdfObjects(page, pdfW, pdfH)`
6. **Extract text content** — `page.getTextContent()`
7. **Group nearby paths** — `groupPdfObjects(results[0])`
8. **Create components** — Push to `components[]` array
9. **Render canvas** — `renderCanvas()`

**Key conversions:**
- PDF points → mm: `value / 72 * 25.4`
- Y-axis flip: `pdfH - (y / 72 * 25.4)`

---

### 3. Vector Path Extraction

**Function:** `extractPdfObjects(page, pdfW, pdfH)` — lines 737-827

**How it works:**

PDF.js provides an **operator list** — a sequence of drawing commands. The function walks through these operators and builds path objects.

**Supported operators:**

| Operator | PDF.js constant | Action |
|----------|----------------|--------|
| `moveTo` | `OPS.moveTo` | Start new path segment |
| `lineTo` | `OPS.lineTo` | Draw line to point |
| `curveTo` | `OPS.curveTo` | Draw cubic Bézier curve |
| `rectangle` | `OPS.rectangle` | Draw rectangle (converted to M-L-L-L-Z) |
| `closePath` | `OPS.closePath` | Close current path |
| `stroke` | `OPS.stroke` | Stroke path (outline) |
| `fill` | `OPS.fill` | Fill path (solid) |
| `fillStroke` | `OPS.fillStroke` | Both fill and stroke |

**State tracking:**

The function maintains a graphics state stack:
- **CTM (Current Transformation Matrix)** — 6-element array `[a, b, c, d, e, f]`
- **Fill color** — RGB array `[r, g, b]` (0-1 range)
- **Stroke color** — RGB array `[r, g, b]`
- **Line width** — Stroke width in points

**Transform logic:**

```javascript
function mulMat(a, b) {
    return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
            a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
            a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}

function txPt(m, x, y) {
    return [m[0]*x+m[2]*y+m[4], m[1]*x+m[3]*y+m[5]];
}
```

**Output:**

Array of path objects:
```javascript
{
    ops: [{ o: "M", a: [x, y] }, { o: "L", a: [x, y] }, ...],
    fill: [r, g, b] or null,
    stroke: [r, g, b] or null,
    lw: lineWidth in mm,
    bbox: { x, y, w, h } in mm
}
```

---

### 4. Path Grouping

**Function:** `groupPdfObjects(objects, gap)` — lines 830-884

**Purpose:** Merge nearby paths with the same color into compound objects (reduces component count, improves performance)

**Algorithm:** Union-Find with proximity threshold

**Steps:**

1. **Color key** — Create unique key from fill/stroke RGB values
2. **Union-Find initialization** — Each object starts as its own group
3. **Proximity check** — For each pair of objects with same color:
   - If bounding boxes overlap or are within `gap` (default 1.5mm), unite them
4. **Collect groups** — Gather all objects in each group
5. **Merge paths** — Concatenate all path operations, compute combined bbox

**Example:**

Before grouping:
```
Object 1: M 10,10 L 20,10 (black stroke)
Object 2: M 20,10 L 30,10 (black stroke, adjacent)
```

After grouping:
```
Compound: M 10,10 L 20,10 M 20,10 L 30,10 (single object)
```

---

### 5. Text Extraction

**Code:** `component.js` lines 926-947

**Process:**

1. **Get text content** — `page.getTextContent()` returns array of text items
2. **Filter readable text** — Skip garbled/outlined text (private-use Unicode, replacement chars)
3. **Extract position** — Transform matrix `[a, b, c, d, e, f]` gives position and size
4. **Calculate dimensions:**
   - X: `transform[4] / 72 * 25.4`
   - Y: `pdfH - (transform[5] / 72 * 25.4)` (flip Y-axis)
   - Font size: `Math.abs(transform[0]) / 72 * 25.4 / 0.3528` (points)
   - Width: `item.width / 72 * 25.4`
   - Height: `fontSize * 0.3528 * 1.3` (line height factor)

**Readable text filter:**

```javascript
var readable = item.str.replace(/[\x00-\x1f\ufffd]/g, "");
var printable = readable.replace(/[^\x20-\x7e\u00a0-\u024f\u0400-\u04ff\u4e00-\u9fff\u3000-\u30ff\uac00-\ud7af]/g, "");
if (printable.length < readable.length * 0.5) return; // Skip if <50% printable
```

**Why filter?** Outlined fonts in PDFs use private-use Unicode ranges. These appear as garbled text. The filter skips them so only real text is extracted.

---

### 6. Component Data Structure

**Array:** `components[]` — global state in `component.js`

**Component object:**

```javascript
{
    page: 0,                    // Page number (0-indexed)
    partitionLabel: "",         // Partition label (if assigned)
    type: "pdfpath",            // "pdfpath", "text", "paragraph", "barcode", "qrcode", "image"
    content: "",                // Text content (for text/barcode/qr)
    x: 10.5,                    // X position in mm
    y: 20.3,                    // Y position in mm
    w: 50.2,                    // Width in mm
    h: 15.8,                    // Height in mm
    fontFamily: "Arial",        // Font (for text types)
    fontSize: 10,               // Font size in points
    groupId: "grp-123-abc",     // Group ID (if grouped)
    visible: true,              // Visibility flag
    locked: false,              // Lock flag (prevents editing)
    pathData: {                 // Only for pdfpath type
        ops: [...],             // Path operations
        fill: [0, 0, 0],        // Fill color RGB
        stroke: [0, 0, 0],      // Stroke color RGB
        lw: 0.5                 // Line width in mm
    }
}
```

---

### 7. Canvas Rendering

**Function:** `renderCanvas()` — lines 443-676

**Rendering strategy:**

1. **Calculate scale** — Fit canvas to preview container
2. **Draw partition outlines** — Gray reference boxes
3. **Draw pdfpath components** — Single SVG layer (preserves z-order)
4. **Draw other components** — DOM elements (text, barcode, QR, image)
5. **Add selection highlights** — Blue outline filter for selected items
6. **Add resize handles** — For selected non-pdfpath components

**SVG rendering (pdfpath):**

```javascript
var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
svg.setAttribute("viewBox", "0 0 " + compTpl.width + " " + compTpl.height);

pdfPaths.forEach(function (c) {
    var d = "";
    c.pathData.ops.forEach(function (op) {
        if (op.o === "M") d += " M" + op.a[0] + " " + op.a[1];
        else if (op.o === "L") d += " L" + op.a[0] + " " + op.a[1];
        else if (op.o === "C") d += " C" + op.a.join(" ");
        else if (op.o === "Z") d += "Z";
    });
    var pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEl.setAttribute("d", d);
    pathEl.setAttribute("fill", rgbString(c.pathData.fill));
    pathEl.setAttribute("stroke", rgbString(c.pathData.stroke));
    svg.appendChild(pathEl);
});
```

**Selection highlight filter:**

Uses SVG `<filter>` with `feMorphology` to create blue outline around selected paths (lines 535-555).

---

### 8. Interaction Features

#### A. Selection

**Single-click:** Select one component
**Ctrl+click:** Toggle multi-select
**Rubber-band:** Drag on empty canvas to select multiple pdfpath components (lines 1022-1083)

#### B. Grouping

**Group:** Select 2+ ungrouped items → click "Group" button
**Ungroup:** Select grouped items → click "Ungroup" button
**Group ID:** Generated as `"grp-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9)`

#### C. Visibility/Lock

**Eye icon:** Toggle `visible` flag (false = 15% opacity)
**Lock icon:** Toggle `locked` flag (prevents selection/editing)
**Group-level:** Toggle all items in group at once

#### D. Drag-to-Move

**Trigger:** Click selected component, drag
**Clamping:** If component has `partitionLabel`, clamp to partition bounds
**Code:** lines 678-691

#### E. Resize

**Trigger:** Drag resize handle (bottom-right corner of selected component)
**Only for:** Non-pdfpath components (text, barcode, QR, image)
**Code:** lines 617-634

#### F. Inline Editing

**Trigger:** Double-click text/paragraph component
**UI:** Replaces content with `<input>` or `<textarea>`
**Save:** On blur or Enter key
**Code:** lines 693-727

---

### 9. Save to Database

**Function:** `saveComponents()` — lines 1136-1200

**Two scenarios:**

#### A. Existing template (loaded from database)

1. **PUT** `/api/templates/{id}/components`
2. Payload: `{ components: [...] }`
3. Updates `components` column in database

#### B. New PDF import

1. **POST** `/api/templates` — Create template record
   - `source: "pdf"`
   - `width`, `height` from PDF dimensions
   - `padding`, `sewing`, `folding` all zero/none
2. **PUT** `/api/templates/{id}/components` — Save components
3. Add to `App.store.templates`

**Payload transformation:**

```javascript
components: components.map(function (c) {
    var obj = {
        page: c.page,
        partitionLabel: c.partitionLabel,
        type: c.type,
        content: c.content,
        x: c.x, y: c.y, w: c.w, h: c.h,
        fontFamily: c.fontFamily,
        fontSize: c.fontSize,
        groupId: c.groupId || null,
        visible: c.visible !== false,
        locked: !!c.locked
    };
    if (c.type === "pdfpath" && c.pathData) {
        obj.pathData = c.pathData; // Stored as JSON in DB
    }
    return obj;
})
```

---

### 10. Export System

**Buttons:**
- Export PDF
- Export AI (editable)
- Export AI (outlined)

**Code:** lines 1351-1362

**Process:**

1. **Build export data** — `buildExportData(outlined)` (lines 1229-1248)
2. **POST** to `/export/pdf` or `/export/ai`
3. **Receive blob** — Binary file response
4. **Download** — Create temporary `<a>` element, trigger click

**Export data structure:**

```javascript
{
    label: { width: 100, height: 50 },
    components: [
        {
            type: "pdfpath",
            x: 10, y: 20, width: 30, height: 15,
            pathData: { ops: [...], fill: [...], stroke: [...], lw: 0.5 },
            visible: true,  // IMPORTANT: Controls visibility in AI export
            page: 0
        },
        {
            type: "text",
            content: "Hello",
            x: 5, y: 10, width: 20, height: 5,
            fontFamily: "Arial",
            fontSize: 12,
            page: 0
        }
    ],
    outlined: false  // true for outlined AI export
}
```

**Note:** The `visible` flag is only sent for `pdfpath` components (line 1241 in component.js). When `visible: false`, the AI export tool places these paths below the red separator line in the Illustrator Layers panel.

**Backend tools:**

- `tools/export_pdf.py` — ReportLab-based PDF generation
- `tools/export_ai.py` — PDF-based AI file (Illustrator can open PDFs)
- `tools/fonttools_outline.py` — Converts text glyphs to SVG paths for outlined export

---

## Code Reference

### Key Functions

| Function | Lines | Purpose |
|----------|-------|---------|
| `parsePdfFile(file)` | 887-959 | Main PDF parsing entry point |
| `extractPdfObjects(page, pdfW, pdfH)` | 737-827 | Extract vector paths from PDF operators |
| `groupPdfObjects(objects, gap)` | 830-884 | Merge nearby paths with same color |
| `renderCanvas()` | 443-676 | Render all components on canvas |
| `renderPlacedList()` | 169-420 | Render sidebar component list |
| `saveComponents()` | 1136-1200 | Save to database |
| `buildExportData(outlined)` | 1229-1248 | Prepare export payload |
| `initPanZoom()` | 962-1090 | Pan/zoom/rubber-band selection |

### State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `compTpl` | Object | Current template metadata |
| `compPage` | Number | Active page (0-indexed) |
| `components` | Array | All components (all pages) |
| `savedComponents` | Array | Snapshot for reset |
| `selectedIdx` | Number | Single-selected component index |
| `selectedSet` | Array | Multi-selected component indices |
| `sc` | Number | Canvas scale factor (mm → px) |
| `pan` | Object | Pan/zoom state `{ x, y, zoom, spaceDown, dragging }` |

### Event Handlers

| Event | Element | Handler | Lines |
|-------|---------|---------|-------|
| `drop` | `#component-preview` | PDF file drop | 1264-1274 |
| `change` | `#comp-pdf-input` | File input | 1312-1314 |
| `click` | `#btn-comp-save` | Save components | 1339-1342 |
| `click` | `#btn-comp-reset` | Reset to saved | 1346-1348 |
| `click` | `#btn-export-pdf` | Export PDF | 1351-1354 |
| `click` | `#btn-export-ai` | Export AI (editable) | 1355-1358 |
| `click` | `#btn-export-ai-outlined` | Export AI (outlined) | 1359-1362 |
| `mousedown` | Canvas | Start drag/rubber-band | 1023-1035 |
| `mousemove` | Document | Drag/rubber-band update | 1036-1058 |
| `mouseup` | Document | End drag/rubber-band | 1059-1083 |
| `keydown` | Document | Space (pan), Delete (remove) | 966-989 |

---

## Data Structures

### PDF.js Operator List

```javascript
{
    fnArray: [OPS.moveTo, OPS.lineTo, OPS.stroke, ...],
    argsArray: [[x, y], [x, y], [], ...]
}
```

### Path Operation

```javascript
{ o: "M", a: [x, y] }       // Move to
{ o: "L", a: [x, y] }       // Line to
{ o: "C", a: [x1, y1, x2, y2, x3, y3] }  // Cubic Bézier
{ o: "Z", a: [] }           // Close path
```

### Component (Database Schema)

```sql
CREATE TABLE components (
    id INTEGER PRIMARY KEY,
    template_id INTEGER,
    page INTEGER DEFAULT 0,
    partition_label TEXT,
    type TEXT,  -- "pdfpath", "text", "paragraph", "barcode", "qrcode", "image"
    content TEXT,
    x REAL, y REAL, w REAL, h REAL,
    font_family TEXT,
    font_size INTEGER,
    path_data TEXT,  -- JSON string for pdfpath type
    group_id TEXT,
    visible INTEGER DEFAULT 1,
    locked INTEGER DEFAULT 0
);
```

---

## Canvas Rendering

### Coordinate System

- **Origin:** Top-left corner
- **Units:** Millimeters (mm)
- **Y-axis:** Downward (standard web canvas)
- **Scale factor:** `sc = min(containerWidth / labelWidth, containerHeight / labelHeight, 6)`

### Rendering Order (Z-index)

1. **Partition outlines** — Gray reference boxes (z-index: auto)
2. **SVG layer (pdfpath)** — All vector paths (z-index: 1)
3. **DOM components** — Text, barcode, QR, image (z-index: 2)
4. **Selection highlights** — Blue outline filter (SVG filter)
5. **Resize handles** — Bottom-right corner (z-index: auto)

### Pan & Zoom

- **Pan:** Hold Space, drag canvas
- **Zoom:** Mouse wheel (0.2x to 10x)
- **Fit:** Click fit button (reset to 1x, center)

---

## Export System

### PDF Export (`tools/export_pdf.py`)

**Library:** ReportLab 4.4.0

**Process:**

1. Create PDF canvas with label dimensions
2. For each component:
   - **pdfpath:** Draw SVG path using `canvas.drawPath()`
   - **text:** Draw text using `canvas.drawString()`
   - **barcode:** Generate barcode image, draw
   - **qrcode:** Generate QR image, draw
   - **image:** Draw raster image
3. Save PDF to `.tmp/`

### AI Export (`tools/export_ai.py`)

**Format:** PDF-based (Illustrator can open PDFs)

**Editable mode:**
- Text rendered as text objects (editable in Illustrator)

**Outlined mode:**
- Text converted to paths using `fonttools_outline.py`
- All elements are vector paths (no editable text)

**Invisible Path Separator:**

When exporting to AI with hidden paths (visible=false), the system adds a **red separator line** to divide layers in Illustrator:

```python
# Lines 73-82 in export_ai.py
# Draw hidden paths first (bottom of Layers panel)
for comp in hidden_paths:
    _draw_pdfpath(c, comp, page_h)

# Separator line (red, 0.1pt width, tiny 0.01mm line)
c.setStrokeColorRGB(1, 0, 0)  # Red
c.setLineWidth(0.1)
c.line(0, page_h / 2, 0.01, page_h / 2)

# Draw visible paths last (top of Layers panel)
for comp in visible_paths:
    _draw_pdfpath(c, comp, page_h)
```

**Why?** Illustrator reverses draw order: last drawn = top of Layers panel. The separator helps users identify the boundary between hidden and visible paths when opening in Illustrator.

### Font Outlining (`tools/fonttools_outline.py`)

**Library:** fonttools 4.56.0

**Process:**

1. Load font file (TTF/OTF)
2. Get glyph for each character
3. Extract glyph outline as SVG path
4. Apply font size and position transforms
5. Return SVG path string

---

## Summary

The PDF import workflow is a complete zero-to-one system:

1. **Drag PDF** → Parsed with PDF.js
2. **Extract vectors** → Walk operator list, build path objects
3. **Group paths** → Union-Find proximity grouping
4. **Extract text** → Filter readable text, calculate positions
5. **Render canvas** → SVG for paths, DOM for text/barcodes
6. **Interact** → Select, drag, group, lock, hide
7. **Save** → Store in SQLite database
8. **Export** → PDF or AI (editable/outlined)

All code is in `static/js/component.js` (1,369 lines) with backend export tools in `tools/`.
