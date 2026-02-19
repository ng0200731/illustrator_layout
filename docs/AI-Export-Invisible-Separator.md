# AI Export: Visibility Layer Separation

## Overview

When exporting to Adobe Illustrator (.ai) format with the "Export AI (Invisible as Red Layer)" option, components with the eye toggle turned off (hidden/invisible) are exported at full opacity but separated from visible components using draw-order positioning in the Layers panel.

## Problem

PDF-based .ai files don't support named layers or layer groups like Illustrator's native format. Attempts to use PDF Optional Content Groups (OCG), Form XObjects, or marked content sequences all failed to create toggleable layer groups in Illustrator.

## Solution

Use **draw order** to separate visible and hidden components. Illustrator's Layers panel displays paths in reverse draw order (last drawn = top of panel), so we draw in this sequence:

1. Hidden paths (drawn first → bottom of Layers panel)
2. Red separator line (visual divider)
3. Visible paths (drawn last → top of Layers panel)

## Implementation

### Code Location
- Frontend: [static/js/component.js](d:\project\illustrator-layout\static\js\component.js)
- Backend: [tools/export_ai.py](d:\project\illustrator-layout\tools\export_ai.py)
- UI: [templates/index.html](d:\project\illustrator-layout\templates\index.html)

### Logic Flow

**Frontend (component.js):**
```javascript
// Add separateInvisible flag when exporting
document.getElementById('btn-export-ai-separate').addEventListener('click', function() {
    exportFile('ai-separate', false);
});

function exportFile(type, outlined) {
    var data = {
        label: { width: pdfWidth, height: pdfHeight },
        components: components.map(function(c) {
            return {
                type: c.type,
                x: c.x, y: c.y,
                width: c.w, height: c.h,
                pathData: c.pathData,
                visible: c.visible,  // Include visibility state
                page: 0
            };
        })
    };

    if (type === 'ai-separate') {
        data.separateInvisible = true;  // Flag for backend
    }

    // Send to /export/ai endpoint
}
```

**Backend (export_ai.py):**
```python
def export_ai(data, outlined=False):
    separate_invisible = data.get('separateInvisible', False)

    if separate_invisible:
        # Separate components by visibility
        visible_paths = []
        hidden_paths = []

        for comp in components:
            if comp.get("type") == "pdfpath":
                if comp.get("visible", True):
                    visible_paths.append(comp)
                else:
                    hidden_paths.append(comp)

        # Draw in reverse order (Illustrator reverses this in Layers panel)
        # 1. Hidden paths first
        for comp in hidden_paths:
            _draw_pdfpath(c, comp, page_h)

        # 2. Red separator line (0.1pt stroke, tiny horizontal line)
        if len(hidden_paths) > 0 and len(visible_paths) > 0:
            c.saveState()
            c.setStrokeColorRGB(1, 0, 0)  # Red
            c.setLineWidth(0.1)
            c.line(0, page_h / 2, 0.01 * mm, page_h / 2)
            c.restoreState()

        # 3. Visible paths last
        for comp in visible_paths:
            _draw_pdfpath(c, comp, page_h)
    else:
        # Normal export: only visible components
        for comp in components:
            if comp.get('visible', True):
                _draw_pdfpath(c, comp, page_h)
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

### Step 1: Hide Components in the App
1. Load your PDF in the Illustrator Layout Manager
2. In the COMPONENTS panel, click the eye icon (👁) to hide paths you want to keep as reference
3. Hidden paths will be dimmed on the canvas but remain in the component list

### Step 2: Export with Separator
1. Click **"Export AI (Invisible as Red Layer)"** button
2. Save the .ai file

### Step 3: Work in Illustrator
1. Open the exported .ai file in Adobe Illustrator
2. Open the Layers panel (Window → Layers)
3. You'll see all paths in Layer 1:
   - **Above the red `<Path>`**: Visible components (your main design)
   - **Red `<Path>`**: Tiny red separator line
   - **Below the red `<Path>`**: Hidden components (reference/backup)

### Step 4: Manage Hidden Paths in Illustrator
Choose one of these options:

**Option A: Hide them**
1. Select all paths below the red separator
2. Click the eye icon in the Layers panel to hide them

**Option B: Delete them**
1. Select all paths below the red separator
2. Press Delete

**Option C: Keep them visible**
- Leave them as-is for reference while working

## Export Button Comparison

| Button | Behavior | Use Case |
|--------|----------|----------|
| **Export as PDF** | Exports only visible paths as PDF | Final output for printing |
| **Export as AI (Editable)** | Exports only visible paths, text remains editable | Continue editing in Illustrator |
| **Export as AI (Outlined)** | Exports only visible paths, text converted to paths | Final artwork, no font dependencies |
| **Export AI (Invisible as Red Layer)** | Exports ALL paths (visible + hidden) with red separator | Keep hidden paths as reference layer |

## Why This Approach

**Attempted alternatives that failed:**
- PDF Optional Content Groups (OCG) → Illustrator ignores them
- Form XObjects with `beginForm`/`endForm` → Creates `<Clip Group>` but inconsistent
- Marked content sequences (`BMC`/`EMC`) → Illustrator doesn't interpret as layers
- Multiple pages → Creates separate artboards, not layer separation

**Why draw order works:**
- ✅ Reliable across all Illustrator versions
- ✅ No proprietary AI format knowledge required
- ✅ Simple to implement with ReportLab
- ✅ Clear visual separator for manual selection
- ✅ Preserves all path data at full quality

## Limitations

- Cannot create named layer groups in Illustrator (PDF limitation)
- User must manually select/hide/delete hidden paths in Illustrator
- Separator line is visible on canvas (though tiny and red for easy identification)
- Only works for `pdfpath` components (text always exports as visible)

## Technical Details

### Red Separator Specifications
- **Color**: RGB(1, 0, 0) - Pure red
- **Stroke width**: 0.1 points (nearly invisible)
- **Position**: Horizontal line at page center (y = page_h / 2)
- **Length**: 0.01mm (essentially a dot)

### Component Visibility State
Each component has a `visible` boolean property:
```javascript
component = {
    type: 'pdfpath',
    x: 10, y: 20, w: 50, h: 30,
    pathData: { ops: [...], fill: [0,0,0], stroke: null, lw: 0.5 },
    visible: true,  // true = visible, false = hidden
    locked: false,
    groupId: null
}
```

### Draw Order in ReportLab
ReportLab draws paths in the order they're called. Illustrator's Layers panel reverses this:
- First drawn path → Bottom of Layers panel
- Last drawn path → Top of Layers panel

## Related Files

- [static/js/component.js](d:\project\illustrator-layout\static\js\component.js) - Frontend export logic
- [tools/export_ai.py](d:\project\illustrator-layout\tools\export_ai.py) - Backend export logic
- [templates/index.html](d:\project\illustrator-layout\templates\index.html) - Export button UI
- [app.py](d:\project\illustrator-layout\app.py) - Flask route handler

## Example Use Cases

### Use Case 1: Design Variations
1. Create multiple design variations by hiding/showing different path groups
2. Export with separator to keep all variations in one file
3. In Illustrator, toggle visibility of paths below separator to compare designs

### Use Case 2: Client Revisions
1. Client requests changes to specific elements
2. Hide the original elements instead of deleting them
3. Create new versions above the separator
4. Export with separator so client can see both versions

### Use Case 3: Complex Layouts
1. Import PDF with 617 paths (62 cyan + 555 black)
2. Group and merge paths to create 4-8 manageable components
3. Hide some merged groups for different layout options
4. Export with separator to keep all options in one AI file

## Troubleshooting

**Q: I don't see the red separator in Illustrator**
- A: It's very small (0.01mm). Zoom in to 800%+ or look for a tiny red dot in the Layers panel

**Q: All my paths are below the separator**
- A: You exported with all paths hidden. Toggle eye icons on in the app before exporting

**Q: The separator is in the middle of my design**
- A: The separator is just a visual marker in the Layers panel. Select and delete it if needed

**Q: Can I change the separator color?**
- A: Yes, edit `export_ai.py` line 54: `c.setStrokeColorRGB(1, 0, 0)` to any RGB value

**Q: Hidden paths are still visible in Illustrator**
- A: This is intentional. They're exported at full opacity for you to manually hide/delete in Illustrator
