# _AI Export: Visibility Layer Separation

## Overview

When exporting to Adobe Illustrator (.ai) format, components with the eye toggle turned off (hidden/invisible) are exported at full opacity but separated from visible components using draw-order positioning in the Layers panel.

## Problem

PDF-based .ai files don't support named layers or layer groups like Illustrator's native format. Attempts to use PDF Optional Content Groups (OCG), Form XObjects, or marked content sequences all failed to create toggleable layer groups in Illustrator.

## Solution

Use **draw order** to separate visible and hidden components. Illustrator's Layers panel displays paths in reverse draw order (last drawn = top of panel), so we draw in this sequence:

1. Hidden paths (drawn first → bottom of Layers panel)
2. Red separator line (visual divider)
3. Visible paths (drawn last → top of Layers panel)

## Implementation

### Code Location
[tools/export_ai.py:50-65](d:\project\illustrator-layout\tools\export_ai.py#L50-L65)

### Logic Flow

```python
# Separate components by visibility
visible_paths = []
hidden_paths = []
other_comps = []
for comp in components:
    if comp.get("type") == "pdfpath":
        if comp.get("visible", True):
            visible_paths.append(comp)
        else:
            hidden_paths.append(comp)
    else:
        other_comps.append(comp)

# If no hidden paths, skip separator logic
if not hidden_paths:
    # Simple export: visible paths + other components
    return

# Draw in reverse order (Illustrator reverses this in Layers panel)
# 1. Hidden paths first
for comp in hidden_paths:
    _draw_pdfpath(c, comp, page_h)

# 2. Red separator line (full-width horizontal line)
if len(hidden_paths) > 0 and len(visible_paths) > 0:
    c.saveState()
    c.setStrokeColorRGB(1, 0, 0)
    c.setLineWidth(0.5)  # 0.5pt stroke
    c.line(0, page_h / 2, page_w, page_h / 2)  # Full page width
    c.restoreState()

# 3. Visible paths last
for comp in visible_paths:
    _draw_pdfpath(c, comp, page_h)

# 4. Other components (text, barcode, qrcode, image)
_draw_other_comps(c, other_comps, page_h, outlined)
```

## Result in Illustrator

When opened in Illustrator, the Layers panel shows:

```
Layer 1
├── <Path> (visible component 1)
├── <Path> (visible component 2)
├── <Path> (visible component 3)
├── <Path> ← RED SEPARATOR (tiny red line)
├── <Path> (hidden component 1)
├── <Path> (hidden component 2)
└── <Path> (hidden component 3)
```

## Usage Workflow

1. **In the app**: Toggle eye icon off for components you want to keep as reference but not in final output
2. **Export to AI**: Hidden components export at full opacity below the red separator
3. **In Illustrator**:
   - All paths above the red `<Path>` are visible components
   - All paths below the red `<Path>` are hidden components
   - Select all paths below separator and toggle eye off in Illustrator, or delete them

## Why This Approach

**Attempted alternatives that failed:**
- PDF Optional Content Groups (OCG) → Illustrator ignores them
- Form XObjects with `beginForm`/`endForm` → Creates `<Clip Group>` but inconsistent
- Marked content sequences (`BMC`/`EMC`) → Illustrator doesn't interpret as layers
- Multiple pages → Creates separate artboards, not layer separation

**Why draw order works:**
- Reliable across all Illustrator versions
- No proprietary AI format knowledge required
- Simple to implement with ReportLab
- Clear visual separator for manual selection

## Limitations

- Cannot create named layer groups in Illustrator
- User must manually select/hide/delete hidden paths in Illustrator
- Separator line is visible on canvas (full-width red line for easy identification)
- Only works for `pdfpath` components (text, barcode, qrcode, image always export as visible)

## Database Schema

Hidden state persists in the `components` table:

```sql
CREATE TABLE components (
    ...
    visible INTEGER DEFAULT 1,  -- 1 = visible, 0 = hidden
    ...
);
```

## Related Files

- [tools/export_ai.py](d:\project\illustrator-layout\tools\export_ai.py) - Export logic
- [static/js/component.js](d:\project\illustrator-layout\static\js\component.js) - Eye toggle UI
- [how-red-separator-line-works.md](d:\project\illustrator-layout\how-red-separator-line-works.md) - Detailed explanation of separator implementation
