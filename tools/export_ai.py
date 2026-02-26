from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
import os
import tempfile
import sys
import math

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
    bounds_rects = data.get('boundsRects', [])
    separate_invisible = data.get('separateInvisible', False)

    print(f"DEBUG export_ai: bounds_rects={bounds_rects}")
    print(f"DEBUG export_ai: num_components={len(components)}")

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
            elif comp_type in ('text', 'textregion'):
                text_components.append(comp)

        # Debug: Print counts
        print(f"DEBUG: hidden_paths={len(hidden_paths)}, visible_paths={len(visible_paths)}")

        # Draw hidden paths first (bottom of Layers panel in Illustrator)
        for comp in hidden_paths:
            _apply_rotation(c, comp, bounds_rects, page_h)
            _draw_pdfpath(c, comp, page_h)
            _restore_rotation(c, comp, bounds_rects)

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
            _apply_rotation(c, comp, bounds_rects, page_h)
            _draw_pdfpath(c, comp, page_h)
            _restore_rotation(c, comp, bounds_rects)

        # Draw text components
        for comp in text_components:
            _apply_rotation(c, comp, bounds_rects, page_h)
            if outlined:
                _draw_text_outlined(c, comp, page_h)
            else:
                _draw_text(c, comp, page_h)
            _restore_rotation(c, comp, bounds_rects)
    else:
        # Normal export: draw all components (including invisible ones)
        for comp in components:
            comp_type = comp.get('type')
            _apply_rotation(c, comp, bounds_rects, page_h)

            if comp_type == 'pdfpath':
                _draw_pdfpath(c, comp, page_h)
            elif comp_type in ('text', 'textregion'):
                if outlined:
                    _draw_text_outlined(c, comp, page_h)
                else:
                    _draw_text(c, comp, page_h)

            _restore_rotation(c, comp, bounds_rects)

    # Draw bounds rect borders (green dotted lines)
    _draw_bounds_rects(c, bounds_rects, page_h)

    # Embed full fonts (not subsetted) so Illustrator can match local fonts
    # Only for fonts under 2MB to avoid huge file sizes
    if not outlined:
        from reportlab.pdfbase.ttfonts import TTFontFile
        _orig_makeSubset = TTFontFile.makeSubset
        _max_full_embed_size = 2 * 1024 * 1024  # 2MB limit
        def _full_makeSubset(self, subset):
            try:
                fn = self.filename
                if fn and os.path.exists(fn):
                    fsize = os.path.getsize(fn)
                    if fsize <= _max_full_embed_size:
                        with open(fn, 'rb') as f:
                            return f.read()
            except Exception as e:
                print(f"Warning: Full font embed failed, using subset: {e}")
            return _orig_makeSubset(self, subset)
        TTFontFile.makeSubset = _full_makeSubset
        try:
            c.save()
        finally:
            TTFontFile.makeSubset = _orig_makeSubset
    else:
        c.save()
    return filepath

def _apply_rotation(c, comp, bounds_rects, page_h):
    """Apply bounds rect rotation + overlay rotation, matching canvas logic"""
    br_idx = comp.get('boundsRectIdx', -1)
    br_rot = 0
    if 0 <= br_idx < len(bounds_rects):
        br_rot = bounds_rects[br_idx].get('rotation', 0)
    ov_rot = comp.get('rotation', 0)

    print(f"DEBUG _apply_rotation: type={comp.get('type')} br_idx={br_idx} br_rot={br_rot} ov_rot={ov_rot}")

    if br_rot != 0:
        br = bounds_rects[br_idx]
        # Rotate around bounds rect center (in PDF coords)
        cx = (br['x'] + br['w'] / 2) * mm
        cy = page_h - (br['y'] + br['h'] / 2) * mm
        c.saveState()
        c.translate(cx, cy)
        c.rotate(-br_rot)  # negative because PDF Y is flipped vs canvas
        c.translate(-cx, -cy)

    if ov_rot != 0:
        # Rotate around overlay center (in PDF coords)
        ox = (comp.get('x', 0) + comp.get('width', 0) / 2) * mm
        oy = page_h - (comp.get('y', 0) + comp.get('height', 0) / 2) * mm
        c.saveState()
        c.translate(ox, oy)
        c.rotate(-ov_rot)  # negative because PDF Y is flipped vs canvas
        c.translate(-ox, -oy)

def _restore_rotation(c, comp, bounds_rects):
    """Restore canvas state after rotation"""
    ov_rot = comp.get('rotation', 0)
    br_idx = comp.get('boundsRectIdx', -1)
    br_rot = 0
    if 0 <= br_idx < len(bounds_rects):
        br_rot = bounds_rects[br_idx].get('rotation', 0)

    if ov_rot != 0:
        c.restoreState()
    if br_rot != 0:
        c.restoreState()

def _draw_bounds_rects(c, bounds_rects, page_h):
    """Draw green dotted bounds rect borders matching the web app"""
    if not bounds_rects:
        return
    for br in bounds_rects:
        x = br['x'] * mm
        y = page_h - (br['y'] + br['h']) * mm
        w = br['w'] * mm
        h = br['h'] * mm
        c.saveState()
        c.setStrokeColorRGB(0, 0, 0)  # black like canvas
        c.setLineWidth(0.3 * mm)
        c.setDash(1.5 * mm, 1 * mm)
        c.rect(x, y, w, h, fill=0, stroke=1)
        c.restoreState()

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

    # Draw path (use even-odd fill for compound paths to preserve holes)
    is_compound = comp.get('isCompound', False)
    fill_mode = 0 if is_compound else None
    if fill and stroke:
        c.drawPath(p, fill=1, stroke=1, fillMode=fill_mode)
    elif fill:
        c.drawPath(p, fill=1, stroke=0, fillMode=fill_mode)
    elif stroke:
        c.drawPath(p, fill=0, stroke=1)

def _draw_text(c, comp, page_h):
    """Draw text component (editable if font is embedded)"""
    content = comp.get('content', '')
    if not content:
        return

    x = comp.get('x', 0) * mm
    w = comp.get('width', 0) * mm
    h = comp.get('height', 0) * mm
    font_family = comp.get('fontFamily', 'Helvetica')
    font_size = comp.get('fontSize', 12)
    font_id = comp.get('fontId', None)
    bold = comp.get('bold', False)
    italic = comp.get('italic', False)
    color = comp.get('color', '#000000')
    letter_spacing = comp.get('letterSpacing', 0)
    align_h = comp.get('alignH', 'left')
    align_v = comp.get('alignV', 'top')

    # Try to register custom font
    resolved_font, is_custom = _register_custom_font(c, font_family, font_id)

    c.setFont(resolved_font, font_size)

    # Parse hex color to RGB
    r, g, b = _hex_to_rgb(color)
    c.setFillColorRGB(r, g, b)

    # Split into lines for multi-line support
    lines = content.split('\n')
    line_height = font_size * 1.2 + letter_spacing  # match canvas: fontSize * 1.2 + letterSpacing

    # Calculate vertical start based on alignV
    total_text_h = len(lines) * line_height
    comp_y = comp.get('y', 0) * mm

    if align_v == 'bottom':
        first_line_y = page_h - comp_y - h + (total_text_h - line_height) + (font_size * 0.2)
    elif align_v == 'center':
        first_line_y = page_h - comp_y - (h / 2) - (total_text_h / 2) + (font_size * 0.2) + (total_text_h - line_height)
    else:  # top
        first_line_y = page_h - comp_y - (font_size * 0.8)

    # Draw each line
    for i, line in enumerate(lines):
        y = first_line_y - (i * line_height)
        if not line:
            continue
        if letter_spacing and letter_spacing != 0:
            _draw_text_with_spacing(c, line, x, y, w, font_size, letter_spacing, align_h, resolved_font)
        else:
            if align_h == 'center':
                c.drawCentredString(x + w / 2, y, line)
            elif align_h == 'right':
                c.drawRightString(x + w, y, line)
            else:
                c.drawString(x, y, line)

def _draw_text_outlined(c, comp, page_h):
    """Draw text as outlined paths"""
    # Import fonttools outline converter
    sys.path.insert(0, os.path.dirname(__file__))
    from fonttools_outline import text_to_path, get_text_width

    content = comp.get('content', '')
    if not content:
        return

    x = comp.get('x', 0)
    y = comp.get('y', 0)
    w = comp.get('width', 0)
    h = comp.get('height', 0)
    font_family = comp.get('fontFamily', 'Helvetica')
    font_size = comp.get('fontSize', 12)
    color = comp.get('color', '#000000')
    align_h = comp.get('alignH', 'left')
    align_v = comp.get('alignV', 'top')

    # Split into lines for multi-line support
    lines = content.split('\n')
    letter_spacing = comp.get('letterSpacing', 0)
    line_height_mm = font_size * 0.3528 * 1.2 + letter_spacing * 0.3528  # match canvas: fontSizeMm * 1.2 + letterSpacing * PT_TO_MM
    total_text_h = len(lines) * line_height_mm

    # Calculate vertical start for first line baseline
    if align_v == 'bottom':
        first_baseline_y = y + h - total_text_h + (font_size * 0.3528 * 0.8)
    elif align_v == 'center':
        first_baseline_y = y + (h - total_text_h) / 2 + (font_size * 0.3528 * 0.8)
    else:  # top
        first_baseline_y = y + (font_size * 0.3528 * 0.8)

    try:
        p = c.beginPath()

        for i, line in enumerate(lines):
            if not line:
                continue
            baseline_y = first_baseline_y + i * line_height_mm

            # Adjust X for horizontal alignment per line
            if align_h == 'center':
                text_w = get_text_width(line, font_family, font_size)
                start_x = x + (w - text_w) / 2
            elif align_h == 'right':
                text_w = get_text_width(line, font_family, font_size)
                start_x = x + w - text_w
            else:
                start_x = x

            path_ops = text_to_path(line, font_family, font_size, start_x, baseline_y)

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

        r, g, b = _hex_to_rgb(color)
        c.setFillColorRGB(r, g, b)
        c.drawPath(p, fill=1, stroke=0, fillMode=0)  # even-odd fill for correct winding

    except Exception as e:
        # Fallback to regular text if outlining fails
        print(f"Warning: Text outlining failed, using regular text: {e}")
        _draw_text(c, comp, page_h)

def _register_custom_font(c, font_family, font_id=None):
    """
    Register custom font with ReportLab if available
    Returns: (font_name, is_custom) tuple
    """
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    # Check if font is uploaded
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from models.font import Font

    try:
        uploaded_font = None

        # Try by ID first (more reliable)
        if font_id:
            uploaded_font = Font.get_by_id(int(font_id))

        # Fallback to name lookup
        if not uploaded_font and font_family:
            uploaded_font = Font.get_by_name(font_family)

        if uploaded_font:
            file_path = uploaded_font['file_path']
            # Ensure absolute path
            if not os.path.isabs(file_path):
                file_path = os.path.join(os.path.dirname(__file__), '..', file_path)
            file_path = os.path.normpath(file_path)
            # ReportLab needs forward slashes on Windows
            file_path = file_path.replace('\\', '/')

            if os.path.exists(file_path):
                # Read font's full name from font file for Illustrator compatibility
                reg_name = uploaded_font['font_name'] or font_family
                try:
                    from fontTools.ttLib import TTFont as FTFont
                    ft_font = FTFont(file_path)
                    full_name = None
                    ps_name = None
                    for record in ft_font['name'].names:
                        if record.nameID == 4 and record.platformID == 3:  # Full name (Windows)
                            try:
                                full_name = record.toUnicode()
                            except:
                                pass
                        elif record.nameID == 6 and record.platformID == 3:  # PostScript name
                            try:
                                ps_name = record.toUnicode()
                            except:
                                pass
                    ft_font.close()
                    # Prefer full name (matches local installed font), fallback to PostScript name
                    if full_name:
                        reg_name = full_name
                    elif ps_name:
                        reg_name = ps_name
                except Exception as e:
                    print(f"Warning: Could not read font name: {e}")

                # Check if already registered
                try:
                    pdfmetrics.getFont(reg_name)
                    return (reg_name, True)
                except:
                    pass

                # Register TTF with ReportLab
                try:
                    font = TTFont(reg_name, file_path)
                    font.substitutionFonts = []
                    pdfmetrics.registerFont(font)
                    print(f"Font registered: {reg_name} from {file_path}")
                    return (reg_name, True)
                except Exception as e:
                    print(f"Warning: Could not register font {reg_name}: {e}")
            else:
                print(f"Warning: Font file not found: {file_path}")
    except Exception as e:
        print(f"Warning: Could not check uploaded fonts: {e}")

    # Fall back to standard fonts
    font_map = {
        'Arial': 'Helvetica',
        'Times New Roman': 'Times-Roman',
        'Courier New': 'Courier'
    }
    return (font_map.get(font_family, 'Helvetica'), False)

def _hex_to_rgb(hex_color):
    """Convert hex color string to RGB tuple (0-1 range)"""
    hex_color = hex_color.lstrip('#')
    if len(hex_color) != 6:
        return (0, 0, 0)
    r = int(hex_color[0:2], 16) / 255.0
    g = int(hex_color[2:4], 16) / 255.0
    b = int(hex_color[4:6], 16) / 255.0
    return (r, g, b)

def _draw_text_with_spacing(c, content, x, y, w, font_size, letter_spacing, align_h, font_name):
    """Draw text character by character with letter spacing"""
    # Calculate total width with spacing
    chars = list(content)
    char_widths = []
    for ch in chars:
        char_widths.append(c.stringWidth(ch, font_name, font_size))
    total_w = sum(char_widths) + letter_spacing * mm * (len(chars) - 1) if chars else 0

    # Calculate starting x based on alignment
    if align_h == 'center':
        cx = x + (w - total_w) / 2
    elif align_h == 'right':
        cx = x + w - total_w
    else:
        cx = x

    # Draw each character
    for i, ch in enumerate(chars):
        c.drawString(cx, y, ch)
        cx += char_widths[i] + letter_spacing * mm
