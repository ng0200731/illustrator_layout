from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
import os
import tempfile
import sys

def export_ai(data, outlined=False):
    """
    Generate AI file (PDF-based) from component data

    Args:
        data: dict with 'label' (width, height) and 'components' array
        outlined: bool, if True convert text to paths

    Returns:
        str: Path to generated AI file
    """
    label = data.get('label', {})
    components = data.get('components', [])
    separate_invisible = data.get('separateInvisible', False)

    page_w = label.get('width', 100) * mm
    page_h = label.get('height', 100) * mm

    # Create temporary file
    fd, filepath = tempfile.mkstemp(suffix='.ai', dir='.tmp')
    os.close(fd)

    # Create PDF canvas (AI can open PDFs)
    c = canvas.Canvas(filepath, pagesize=(page_w, page_h))

    if separate_invisible:
        # Separate visible and hidden paths
        visible_paths = []
        hidden_paths = []
        text_components = []

        for comp in components:
            comp_type = comp.get('type')
            visible = comp.get('visible', True)

            if comp_type == 'pdfpath':
                if visible:
                    visible_paths.append(comp)
                else:
                    hidden_paths.append(comp)
            elif comp_type == 'text':
                text_components.append(comp)

        # Debug: Print counts
        print(f"DEBUG: hidden_paths={len(hidden_paths)}, visible_paths={len(visible_paths)}")

        # Draw hidden paths first (bottom of Layers panel in Illustrator)
        for comp in hidden_paths:
            _draw_pdfpath(c, comp, page_h)

        # Draw red separator line (helps identify hidden/visible boundary)
        if len(hidden_paths) > 0 and len(visible_paths) > 0:
            print("DEBUG: Drawing red separator line")
            # Draw a thin vertical red FILLED rectangle OUTSIDE the artboard (to the right)
            p = c.beginPath()
            p.moveTo(page_w + 5, 0)  # Start 5mm to the right of artboard, at top
            p.lineTo(page_w + 5.5, 0)  # 0.5mm wide
            p.lineTo(page_w + 5.5, page_h)  # Down to bottom
            p.lineTo(page_w + 5, page_h)  # Back to left edge
            p.close()  # Close the rectangle
            c.setFillColorRGB(1, 0, 0)  # Pure red fill
            c.drawPath(p, fill=1, stroke=0)  # Fill only, no stroke
        else:
            print(f"DEBUG: Skipping red line - hidden={len(hidden_paths)}, visible={len(visible_paths)}")

        # Draw visible paths (top of Layers panel in Illustrator)
        for comp in visible_paths:
            _draw_pdfpath(c, comp, page_h)

        # Draw text components
        for comp in text_components:
            if outlined:
                _draw_text_outlined(c, comp, page_h)
            else:
                _draw_text(c, comp, page_h)
    else:
        # Normal export: draw all components (including invisible ones)
        for comp in components:
            comp_type = comp.get('type')

            if comp_type == 'pdfpath':
                _draw_pdfpath(c, comp, page_h)
            elif comp_type == 'text':
                if outlined:
                    _draw_text_outlined(c, comp, page_h)
                else:
                    _draw_text(c, comp, page_h)

    c.save()
    return filepath

def _draw_pdfpath(c, comp, page_h):
    """Draw PDF path component"""
    path_data = comp.get('pathData', {})
    ops = path_data.get('ops', [])
    fill = path_data.get('fill')
    stroke = path_data.get('stroke')
    lw = path_data.get('lw', 0.5)

    if not ops:
        return

    # Create path
    p = c.beginPath()

    for op in ops:
        o = op.get('o')
        a = op.get('a', [])

        if o == 'M' and len(a) >= 2:
            p.moveTo(a[0] * mm, page_h - (a[1] * mm))
        elif o == 'L' and len(a) >= 2:
            p.lineTo(a[0] * mm, page_h - (a[1] * mm))
        elif o == 'C' and len(a) >= 6:
            p.curveTo(
                a[0] * mm, page_h - (a[1] * mm),
                a[2] * mm, page_h - (a[3] * mm),
                a[4] * mm, page_h - (a[5] * mm)
            )
        elif o == 'Z':
            p.close()

    # Set colors
    if fill:
        c.setFillColorRGB(fill[0], fill[1], fill[2])

    if stroke:
        c.setStrokeColorRGB(stroke[0], stroke[1], stroke[2])
        c.setLineWidth(lw * mm)

    # Draw path
    if fill and stroke:
        c.drawPath(p, fill=1, stroke=1)
    elif fill:
        c.drawPath(p, fill=1, stroke=0)
    elif stroke:
        c.drawPath(p, fill=0, stroke=1)

def _draw_text(c, comp, page_h):
    """Draw text component (editable)"""
    content = comp.get('content', '')
    x = comp.get('x', 0) * mm
    y = page_h - (comp.get('y', 0) * mm) - (comp.get('height', 0) * mm * 0.8)
    font_family = comp.get('fontFamily', 'Helvetica')
    font_size = comp.get('fontSize', 12)

    # Map common font names to ReportLab fonts
    font_map = {
        'Arial': 'Helvetica',
        'Times New Roman': 'Times-Roman',
        'Courier New': 'Courier'
    }

    font_family = font_map.get(font_family, 'Helvetica')

    c.setFont(font_family, font_size)
    c.setFillColorRGB(0, 0, 0)
    c.drawString(x, y, content)

def _draw_text_outlined(c, comp, page_h):
    """Draw text as outlined paths"""
    # Import fonttools outline converter
    sys.path.insert(0, os.path.dirname(__file__))
    from fonttools_outline import text_to_path

    content = comp.get('content', '')
    x = comp.get('x', 0)
    y = comp.get('y', 0)
    font_family = comp.get('fontFamily', 'Helvetica')
    font_size = comp.get('fontSize', 12)

    try:
        path_ops = text_to_path(content, font_family, font_size, x, y)

        # Draw the path operations
        p = c.beginPath()

        for op in path_ops:
            o = op.get('o')
            a = op.get('a', [])

            if o == 'M' and len(a) >= 2:
                p.moveTo(a[0] * mm, page_h - (a[1] * mm))
            elif o == 'L' and len(a) >= 2:
                p.lineTo(a[0] * mm, page_h - (a[1] * mm))
            elif o == 'C' and len(a) >= 6:
                p.curveTo(
                    a[0] * mm, page_h - (a[1] * mm),
                    a[2] * mm, page_h - (a[3] * mm),
                    a[4] * mm, page_h - (a[5] * mm)
                )
            elif o == 'Z':
                p.close()

        c.setFillColorRGB(0, 0, 0)
        c.drawPath(p, fill=1, stroke=0)

    except Exception as e:
        # Fallback to regular text if outlining fails
        print(f"Warning: Text outlining failed, using regular text: {e}")
        _draw_text(c, comp, page_h)
