from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
import os

def text_to_path(text, font_family, font_size, x, y):
    """
    Convert text to SVG path operations

    Args:
        text: str, text content
        font_family: str, font family name
        font_size: float, font size in points
        x: float, x position in mm
        y: float, y position in mm

    Returns:
        list: Array of path operations [{ o: 'M', a: [x, y] }, ...]
    """
    # Map font family to system font file
    font_path = _get_font_path(font_family)

    if not font_path or not os.path.exists(font_path):
        raise Exception(f"Font file not found for {font_family}")

    # Load font
    font = TTFont(font_path)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()

    # Calculate scale factor (font units to mm)
    units_per_em = font['head'].unitsPerEm
    scale = font_size * 0.3528 / units_per_em  # Convert points to mm

    path_ops = []
    cursor_x = x

    for char in text:
        # Get glyph name from character
        if ord(char) not in cmap:
            continue

        glyph_name = cmap[ord(char)]

        if glyph_name not in glyph_set:
            continue

        # Get glyph outline
        glyph = glyph_set[glyph_name]
        pen = SVGPathPen(glyph_set)
        glyph.draw(pen)

        # Parse SVG path
        svg_path = pen.getCommands()

        # Convert SVG commands to our format
        for cmd in svg_path.split():
            if cmd.startswith('M'):
                coords = cmd[1:].split(',')
                if len(coords) >= 2:
                    px = cursor_x + float(coords[0]) * scale
                    py = y + float(coords[1]) * scale
                    path_ops.append({ 'o': 'M', 'a': [px, py] })
            elif cmd.startswith('L'):
                coords = cmd[1:].split(',')
                if len(coords) >= 2:
                    px = cursor_x + float(coords[0]) * scale
                    py = y + float(coords[1]) * scale
                    path_ops.append({ 'o': 'L', 'a': [px, py] })
            elif cmd.startswith('C'):
                coords = cmd[1:].split(',')
                if len(coords) >= 6:
                    px1 = cursor_x + float(coords[0]) * scale
                    py1 = y + float(coords[1]) * scale
                    px2 = cursor_x + float(coords[2]) * scale
                    py2 = y + float(coords[3]) * scale
                    px3 = cursor_x + float(coords[4]) * scale
                    py3 = y + float(coords[5]) * scale
                    path_ops.append({ 'o': 'C', 'a': [px1, py1, px2, py2, px3, py3] })
            elif cmd == 'Z':
                path_ops.append({ 'o': 'Z', 'a': [] })

        # Advance cursor by glyph width
        cursor_x += glyph.width * scale

    return path_ops

def _get_font_path(font_family):
    """
    Get system font file path for given font family

    Args:
        font_family: str, font family name

    Returns:
        str: Path to font file or None
    """
    # Common Windows font paths
    windows_fonts = os.path.join(os.environ.get('WINDIR', 'C:\\Windows'), 'Fonts')

    # Font mapping
    font_map = {
        'Arial': 'arial.ttf',
        'Helvetica': 'arial.ttf',
        'Times New Roman': 'times.ttf',
        'Times-Roman': 'times.ttf',
        'Courier New': 'cour.ttf',
        'Courier': 'cour.ttf'
    }

    font_file = font_map.get(font_family, 'arial.ttf')
    font_path = os.path.join(windows_fonts, font_file)

    return font_path if os.path.exists(font_path) else None
