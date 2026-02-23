from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.qu2cuPen import Qu2CuPen
import os

def text_to_path(text, font_family, font_size, x, y):
    """
    Convert text to path operations using RecordingPen + Qu2CuPen

    Args:
        text: str, text content
        font_family: str, font family name
        font_size: float, font size in points
        x: float, x position in mm
        y: float, y position in mm

    Returns:
        list: Array of path operations [{ o: 'M', a: [x, y] }, ...]
    """
    font_path = _get_font_path(font_family)

    if not font_path or not os.path.exists(font_path):
        raise Exception(f"Font file not found for {font_family}")

    font = TTFont(font_path)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()

    units_per_em = font['head'].unitsPerEm
    scale = font_size * 0.3528 / units_per_em  # points to mm

    path_ops = []
    cursor_x = x

    for char in text:
        if ord(char) not in cmap:
            continue

        glyph_name = cmap[ord(char)]
        if glyph_name not in glyph_set:
            continue

        glyph = glyph_set[glyph_name]
        raw_pen = RecordingPen()
        glyph.draw(raw_pen)
        rec_pen = RecordingPen()
        cu_pen = Qu2CuPen(rec_pen, max_err=1.0, all_cubic=True)
        raw_pen.replay(cu_pen)

        for op_type, args in rec_pen.value:
            if op_type == 'moveTo':
                px = cursor_x + args[0][0] * scale
                py = y - args[0][1] * scale
                path_ops.append({'o': 'M', 'a': [px, py]})
            elif op_type == 'lineTo':
                px = cursor_x + args[0][0] * scale
                py = y - args[0][1] * scale
                path_ops.append({'o': 'L', 'a': [px, py]})
            elif op_type == 'curveTo':
                points = []
                for pt in args:
                    points.append(cursor_x + pt[0] * scale)
                    points.append(y - pt[1] * scale)
                path_ops.append({'o': 'C', 'a': points})
            elif op_type == 'closePath' or op_type == 'endPath':
                path_ops.append({'o': 'Z', 'a': []})

        cursor_x += glyph.width * scale

    font.close()
    return path_ops

def get_text_width(text, font_family, font_size):
    """Return total advance width of text in mm"""
    font_path = _get_font_path(font_family)
    if not font_path or not os.path.exists(font_path):
        return 0

    font = TTFont(font_path)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    units_per_em = font['head'].unitsPerEm
    scale = font_size * 0.3528 / units_per_em

    total = 0
    for char in text:
        if ord(char) not in cmap:
            continue
        glyph_name = cmap[ord(char)]
        if glyph_name in glyph_set:
            total += glyph_set[glyph_name].width * scale

    font.close()
    return total

def _get_font_path(font_family):
    """
    Get font file path for given font family
    Priority: 1) Uploaded fonts, 2) System fonts, 3) Fallback

    Args:
        font_family: str, font family name

    Returns:
        str: Path to font file or None
    """
    # Check uploaded fonts first
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
    from models.font import Font

    try:
        uploaded_font = Font.get_by_name(font_family)
        if uploaded_font:
            file_path = uploaded_font['file_path']
            if not os.path.isabs(file_path):
                file_path = os.path.join(os.path.dirname(__file__), '..', file_path)
            file_path = os.path.normpath(file_path)
            file_path = file_path.replace('\\', '/')
            if os.path.exists(file_path):
                return file_path
    except Exception as e:
        print(f"Warning: Could not check uploaded fonts: {e}")

    # Fall back to system fonts
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
