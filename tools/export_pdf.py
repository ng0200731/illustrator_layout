from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
from reportlab.graphics import renderPDF
from reportlab.graphics.shapes import Drawing, Path
import os
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
        elif comp_type == 'text':
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
    """Draw text component"""
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
