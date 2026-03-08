# Text Position Fix Documentation

## Overview

This document explains the fixes applied to resolve text positioning issues when exporting Illustrator layouts to JSON and rendering them in the web application.

## Problem

Text elements (non-outlined inputs) were slightly shifted relative to the red outline overlays. Some text aligned correctly while others had a slight offset.

## Root Cause

The issue was caused by the transformation matrix being applied even when it was an identity matrix (no actual transformation). This caused unnecessary translate operations that introduced sub-pixel shifts.

## Solutions Applied

### 1. Remove Matrix Translation Components (JSX Export)

**File:** `tools/export_to_json.jsx`
**Lines:** 437-440

```javascript
// Matrix should only contain rotation, scale, and skew - NOT translation
// Translation is handled by the bounds position (x, y)
// Including tx/ty here causes double positioning in the renderer
mat = { a: m.mValueA, b: m.mValueB, c: m.mValueC, d: m.mValueD, tx: 0, ty: 0 };
```

**Why:** The text bounds already contain position information. Including translation in the matrix caused double positioning.

### 2. Skip Identity Matrix Transformation (Web Rendering)

**File:** `static/js/json_manager.js`
**Lines:** 2241-2256

```javascript
// Apply transformation matrix if present (handles rotation)
// Skip if matrix is identity (no transformation needed)
if (node.matrix) {
    var m = node.matrix;
    var isIdentity = (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.tx === 0 && m.ty === 0);
    if (!isIdentity) {
        var cx = x + w / 2;
        var cy = y + h / 2;
        c.translate(cx, cy);
        c.transform(m.a, -m.b, -m.c, m.d, m.tx * PT_TO_MM, -m.ty * PT_TO_MM);
        c.translate(-cx, -cy);
    }
}
```

**Why:** When the matrix is identity (no rotation, scale, or skew), applying the transformation is unnecessary and can introduce rounding errors. Skipping it ensures pixel-perfect positioning for non-transformed text.

## How to Add Position Offset (If Needed)

If you need to intentionally shift text positions for alignment:

### In JSX Export (tools/export_to_json.jsx, line ~499):

```javascript
// Add offset to text bounds
var OFFSET_X_PT = 28.35;  // 10mm in points (mm * 72 / 25.4)
var OFFSET_Y_PT = 0;       // No vertical offset

return {
    type: "text",
    // ... other properties ...
    bounds: {
        x: (gb[0] - artboardLeft) + OFFSET_X_PT,
        y: (artboardTop - gb[1]) + OFFSET_Y_PT,
        width: gb[2] - gb[0],
        height: gb[1] - gb[3]
    },
```

### In Python Flatten (tools/flatten_tree.py, line ~62):

```python
# Add overlay components with offset
OFFSET_X_MM = 10  # 10mm horizontal offset
OFFSET_Y_MM = 0   # No vertical offset

for ov in overlays:
    components.append({
        'type': ov.get('type', 'text'),
        'x': ov.get('x', 0) + OFFSET_X_MM,
        'y': ov.get('y', 0) + OFFSET_Y_MM,
        # ... other properties ...
    })
```

## Conversion Reference

| Millimeters | Points |
|-------------|--------|
| 1mm | 2.83pt |
| 5mm | 14.17pt |
| 10mm | 28.35pt |
| 15mm | 42.52pt |
| 20mm | 56.69pt |
| 25mm | 70.87pt |

Formula: `points = mm × 72 ÷ 25.4`

## Testing the Fix

1. Re-export your Illustrator file using the updated JSX script
2. Load the JSON in the web application
3. Verify that text aligns perfectly with red outline overlays
4. Check both simple text and any rotated/scaled text

## Related Files

- `tools/export_to_json.jsx` - JSX export script (sets matrix tx/ty to 0)
- `static/js/json_manager.js` - Web rendering (skips identity matrix transformation)
- `tools/flatten_tree.py` - Python flattening script (no offset applied)

## Notes

- Identity matrix check: `a=1, b=0, c=0, d=1, tx=0, ty=0`
- The fix preserves proper rendering of rotated/scaled text while fixing straight text positioning
- Both JSX export and web rendering were modified to ensure consistency

## Last Updated

2026-03-08
