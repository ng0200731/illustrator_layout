"""Test script to create a simple AI file with just a red vertical line"""
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm

# Create a simple A4 page
page_w = 210 * mm
page_h = 297 * mm

filepath = "test_red_line.ai"
c = canvas.Canvas(filepath, pagesize=(page_w, page_h))

# Draw a thick vertical red line from top to bottom
c.saveState()
p = c.beginPath()
p.moveTo(page_w / 2, 0)  # Start at top center
p.lineTo(page_w / 2, page_h)  # End at bottom center
c.setStrokeColorRGB(1, 0, 0)  # Pure red
c.setLineWidth(10)  # 10 points thick
c.drawPath(p, stroke=1, fill=0)
c.restoreState()

c.save()
print(f"Created: {filepath}")
print("Open this file in Illustrator to see the red vertical line")
