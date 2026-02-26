from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.graphics import renderPDF
from reportlab.graphics.shapes import Drawing, Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os
import sys
import tempfile

def export_pdf(data):
    """
    Generate PDF from component data

    Args:
        data: dict with 'label' (width, height) and 'components' array

    Returns:
        str: Path to generated PDF file
    """
    label = data.get('label', {})
    components = data.get('components', [])

    page_w = label.get('width', 100) * mm
    page_h = label.get('height', 100) * mm

    # Create temporary file
    fd, filepath = tempfile.mkstemp(suffix='.pdf', dir='.tmp')
    os.close(fd)

    # Create PDF canvas
    c = canvas.Canvas(filepath, pagesize=(page_w, page_h))

    # Draw each component
    for comp in components:
        comp_type = comp.get('type')
        x = comp.get('x', 0) * mm
        y = page_h - (comp.get('y', 0) * mm)  # Flip Y-axis
        width = comp.get('width', 0) * mm
        height = comp.get('height', 0) * mm

        if comp_type == 'pdfpath':
            _draw_pdfpath(c, comp, page_h)
        elif comp_type in ('text', 'textregion'):
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
    """Draw text component with alignment, multi-line, custom fonts"""
    content = comp.get('content', '')
    if not content:
        return

    x = comp.get('x', 0) * mm
    w = comp.get('width', 0) * mm
    h = comp.get('height', 0) * mm
    font_family = comp.get('fontFamily', 'Helvetica')
    font_size = comp.get('fontSize', 12)
    font_id = comp.get('fontId', None)
    color = comp.get('color', '#000000')
    letter_spacing = comp.get('letterSpacing', 0)
    align_h = comp.get('alignH', 'left')
    align_v = comp.get('alignV', 'top')

    # Register custom font if available
    resolved_font = _register_custom_font(font_family, font_id)
    c.setFont(resolved_font, font_size)

    # Parse hex color
    r, g, b = _hex_to_rgb(color)
    c.setFillColorRGB(r, g, b)

    # Multi-line support
    lines = content.split('\n')
    line_height = font_size * 1.2 + letter_spacing
    total_text_h = len(lines) * line_height
    comp_y = comp.get('y', 0) * mm

    # Vertical alignment
    if align_v == 'bottom':
        first_line_y = page_h - comp_y - h + (total_text_h - line_height) + (font_size * 0.2)
    elif align_v == 'center':
        first_line_y = page_h - comp_y - (h / 2) - (total_text_h / 2) + (font_size * 0.2) + (total_text_h - line_height)
    else:  # top
        first_line_y = page_h - comp_y - (font_size * 0.8)

    for i, line in enumerate(lines):
        y = first_line_y - (i * line_height)
        if not line:
            continue
        if align_h == 'center':
            c.drawCentredString(x + w / 2, y, line)
        elif align_h == 'right':
            c.drawRightString(x + w, y, line)
        else:
            c.drawString(x, y, line)


def _register_custom_font(font_family, font_id=None):
    """Register custom font if available, return resolved font name"""
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from models.font import Font

    try:
        uploaded_font = None
        if font_id:
            uploaded_font = Font.get_by_id(int(font_id))
        if not uploaded_font and font_family:
            uploaded_font = Font.get_by_name(font_family)

        if uploaded_font:
            file_path = uploaded_font['file_path']
            if not os.path.isabs(file_path):
                file_path = os.path.join(os.path.dirname(__file__), '..', file_path)
            file_path = os.path.normpath(file_path).replace('\\', '/')

            if os.path.exists(file_path):
                reg_name = uploaded_font['font_name'] or font_family
                try:
                    pdfmetrics.getFont(reg_name)
                    return reg_name
                except:
                    pass
                try:
                    font = TTFont(reg_name, file_path)
                    font.substitutionFonts = []
                    pdfmetrics.registerFont(font)
                    return reg_name
                except Exception as e:
                    print(f"Warning: Could not register font {reg_name}: {e}")
    except Exception as e:
        print(f"Warning: Could not check uploaded fonts: {e}")

    font_map = {
        'Arial': 'Helvetica',
        'Times New Roman': 'Times-Roman',
        'Courier New': 'Courier'
    }
    return font_map.get(font_family, 'Helvetica')


def _hex_to_rgb(hex_color):
    """Convert hex color string to RGB tuple (0-1 range)"""
    hex_color = hex_color.lstrip('#')
    if len(hex_color) != 6:
        return (0, 0, 0)
    r = int(hex_color[0:2], 16) / 255.0
    g = int(hex_color[2:4], 16) / 255.0
    b = int(hex_color[4:6], 16) / 255.0
    return (r, g, b)
