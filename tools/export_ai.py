from reportlab.pdfgen import canvas
from reportlab.lib.units import mm
import os
import tempfile
import sys
import math
import subprocess
import json

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
    page_w = label.get('width', 100) * mm
    page_h = label.get('height', 100) * mm

    # Create temporary file
    fd, filepath = tempfile.mkstemp(suffix='.ai', dir='.tmp')
    os.close(fd)

    # Create PDF canvas (AI can open PDFs)
    c = canvas.Canvas(filepath, pagesize=(page_w, page_h))

    _draw_page(c, data, outlined, page_w, page_h)

    _save_with_fonts(c, outlined)
    return filepath


def _draw_page(c, data, outlined, page_w, page_h):
    """Draw a single page of components onto the canvas."""
    components = data.get('components', [])
    bounds_rects = data.get('boundsRects', [])
    separate_invisible = data.get('separateInvisible', False)

    if separate_invisible:
        # Separate visible and hidden paths while preserving order within each group
        hidden_paths = []
        visible_and_text = []

        for comp in components:
            comp_type = comp.get('type')
            visible = comp.get('visible', True)

            if comp_type == 'pdfpath':
                if visible:
                    visible_and_text.append(comp)
                else:
                    hidden_paths.append(comp)
            elif comp_type in ('text', 'textregion', 'barcoderegion', 'qrcoderegion'):
                visible_and_text.append(comp)

        # Debug: Print counts
        print(f"DEBUG: hidden_paths={len(hidden_paths)}, visible_and_text={len(visible_and_text)}")

        # Draw hidden paths first (bottom of Layers panel in Illustrator)
        for comp in hidden_paths:
            _apply_rotation(c, comp, bounds_rects, page_h)
            _draw_pdfpath(c, comp, page_h)
            _restore_rotation(c, comp, bounds_rects)

        # Draw red separator line (helps identify hidden/visible boundary)
        if len(hidden_paths) > 0 and len(visible_and_text) > 0:
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
            print(f"DEBUG: Skipping red line - hidden={len(hidden_paths)}, visible={len(visible_and_text)}")

        # Draw visible paths and text components in the order they were sent
        # This preserves the z-index: manual overlays -> auto overlays -> document tree
        for comp in visible_and_text:
            comp_type = comp.get('type')
            _apply_rotation(c, comp, bounds_rects, page_h)

            if comp_type == 'pdfpath':
                _draw_pdfpath(c, comp, page_h)
            elif comp_type in ('barcoderegion', 'qrcoderegion'):
                _draw_barcode_or_qr(c, comp, page_h)
            elif comp_type in ('text', 'textregion'):
                if outlined:
                    _draw_text_outlined(c, comp, page_h)
                else:
                    _draw_text(c, comp, page_h)

            _restore_rotation(c, comp, bounds_rects)
    else:
        # Normal export: draw all components in order (preserves z-index)
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
            elif comp_type in ('barcoderegion', 'qrcoderegion'):
                _draw_barcode_or_qr(c, comp, page_h)

            _restore_rotation(c, comp, bounds_rects)

    # Draw bounds rect borders (green dotted lines)
    _draw_bounds_rects(c, bounds_rects, page_h)


def _save_with_fonts(c, outlined):
    """Save canvas with full font embedding when not outlined."""
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


def export_ai_batch(pages_data, outlined=False):
    """Generate a multi-page AI file. Each item in pages_data is a single-page payload."""
    if not pages_data:
        raise ValueError("No pages to export")

    first_label = pages_data[0].get('label', {})
    page_w = first_label.get('width', 100) * mm
    page_h = first_label.get('height', 100) * mm

    fd, filepath = tempfile.mkstemp(suffix='.ai', dir='.tmp')
    os.close(fd)

    c = canvas.Canvas(filepath, pagesize=(page_w, page_h))

    for i, data in enumerate(pages_data):
        label = data.get('label', {})
        pw = label.get('width', 100) * mm
        ph = label.get('height', 100) * mm
        c.setPageSize((pw, ph))
        _draw_page(c, data, outlined, pw, ph)
        if i < len(pages_data) - 1:
            c.showPage()

    _save_with_fonts(c, outlined)
    return filepath

def _apply_rotation(c, comp, bounds_rects, page_h):
    """Apply bounds rect rotation + overlay rotation, matching canvas logic"""
    br_idx = comp.get('boundsRectIdx', -1)
    br_rot = 0
    if 0 <= br_idx < len(bounds_rects):
        br_rot = bounds_rects[br_idx].get('rotation', 0)
    ov_rot = comp.get('rotation', 0)

    if br_rot != 0:
        br = bounds_rects[br_idx]
        # Rotate around bounds rect center (in PDF coords)
        cx = (br['x'] + br['w'] / 2) * mm
        cy = page_h - (br['y'] + br['h'] / 2) * mm
        c.saveState()
        c.translate(cx, cy)
        c.rotate(br_rot)  # PDF CCW positive matches canvas CW positive (Y flipped)
        c.translate(-cx, -cy)

    if ov_rot != 0:
        # Rotate around overlay center (in PDF coords)
        ox = (comp.get('x', 0) + comp.get('width', 0) / 2) * mm
        oy = page_h - (comp.get('y', 0) + comp.get('height', 0) / 2) * mm
        c.saveState()
        c.translate(ox, oy)
        c.rotate(ov_rot)  # PDF CCW positive matches canvas CW positive (Y flipped)
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

def _draw_barcode_or_qr(c, comp, page_h):
    """Draw barcode or QR code as vector paths (not raster)"""
    comp_type = comp.get('type')
    x = comp.get('x', 0) * mm
    w = comp.get('width', 0) * mm
    h = comp.get('height', 0) * mm
    comp_y = comp.get('y', 0) * mm
    y = page_h - comp_y - h  # PDF Y-axis flip
    color_hex = comp.get('color', '#000000')
    fr, fg, fb = _hex_to_rgb(color_hex)

    if comp_type == 'qrcoderegion':
        qr_data = comp.get('qrData', '')
        if not qr_data:
            return
        try:
            import qrcode
            qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=1, border=0)
            qr.add_data(qr_data)
            qr.make(fit=True)
            mc = qr.modules_count
            cw = w / mc
            ch = h / mc
            # White background
            c.setFillColorRGB(1, 1, 1)
            c.rect(x, y, w, h, fill=1, stroke=0)
            # Colored modules as vector rects
            c.setFillColorRGB(fr, fg, fb)
            for row in range(mc):
                for col in range(mc):
                    if qr.modules[row][col]:
                        rx = x + col * cw
                        ry = y + h - (row + 1) * ch  # flip row order
                        c.rect(rx, ry, cw, ch, fill=1, stroke=0)
        except Exception as e:
            print(f"Warning: Could not render QR code: {e}")

    elif comp_type == 'barcoderegion':
        barcode_data = comp.get('barcodeData', '')
        barcode_format = comp.get('barcodeFormat', 'code128')
        if not barcode_data:
            return
        try:
            import barcode as python_barcode
            fmt_map = {
                'code128': 'code128',
                'ean13': 'ean13',
                'code39': 'code39',
                'upc': 'upca'
            }
            fmt = fmt_map.get(barcode_format, 'code128')
            bc_class = python_barcode.get_barcode_class(fmt)
            bc = bc_class(barcode_data)
            encoded = bc.build()
            if not encoded:
                return
            bars = ''.join(encoded)
            num_modules = len(bars)
            if num_modules == 0:
                return
            bar_w = w / num_modules
            # White background
            c.setFillColorRGB(1, 1, 1)
            c.rect(x, y, w, h, fill=1, stroke=0)
            # Colored bars as vector rects
            c.setFillColorRGB(fr, fg, fb)
            for i, bit in enumerate(bars):
                if bit == '1':
                    c.rect(x + i * bar_w, y, bar_w, h, fill=1, stroke=0)
        except Exception as e:
            print(f"Warning: Could not render barcode: {e}")

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

    sub_path_open = False
    for op in ops:
        o = op.get('o')
        a = op.get('a', [])

        if o == 'M' and len(a) >= 2:
            if sub_path_open:
                p.close()
            p.moveTo(a[0] * mm, page_h - (a[1] * mm))
            sub_path_open = True
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
            sub_path_open = False

    if sub_path_open:
        p.close()

    # Set colors
    if fill:
        c.setFillColorRGB(fill[0], fill[1], fill[2])

    if stroke:
        c.setStrokeColorRGB(stroke[0], stroke[1], stroke[2])
        c.setLineWidth(lw * mm)

    # Use the original fill rule from the PDF (even-odd vs non-zero winding)
    fill_mode = 0 if comp.get('isEvenOdd', False) else None
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
    font_family = comp.get('fontFamily', '')
    font_size = comp.get('fontSize', 12)
    font_id = comp.get('fontId', None)
    font_style = comp.get('fontStyle') or comp.get('aiFontStyle') or ''
    bold = comp.get('bold', False)
    italic = comp.get('italic', False)
    color = comp.get('color', '#000000')
    letter_spacing = comp.get('letterSpacing', 0)
    align_h = comp.get('alignH', 'left')
    align_v = comp.get('alignV', 'top')

    # Try to register custom font
    resolved_font, is_custom = _register_custom_font(c, font_family, font_id, font_style)

    print(f"DEBUG: fontFamily='{font_family}', resolved_font='{resolved_font}', is_custom={is_custom}")

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
    font_family = comp.get('fontFamily', '')
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

def _register_custom_font(c, font_family, font_id=None, font_style=''):
    """
    Register custom font with ReportLab if available
    Returns: (font_name, is_custom) tuple
    """
    import re
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    # Handle problematic fonts gracefully
    if not font_family or not isinstance(font_family, str):
        return ('Helvetica', False)

    def _normalize_font_name(name):
        if not name:
            return ''
        return re.sub(r'[\s\-_]+', '', str(name).lower())

    def _build_font_name_candidates(family, style):
        """Build list of possible font file names to search for"""
        candidates = []
        fam = (family or '').strip()
        sty = (style or '').strip()

        # Replace spaces with underscores for file names (e.g., "Mango New" -> "Mango_New")
        fam_file = fam.replace(' ', '_')

        if fam and sty and sty.lower() != 'regular':
            # Try hyphen separator (matches file naming: "Mango_New-Bold.ttf")
            candidates.append(f"{fam_file}-{sty}")
            # Try space separator (matches internal font name: "Mango New Bold")
            candidates.append(f"{fam} {sty}")
            # Try no separator
            candidates.append(f"{fam}{sty}")

        # When no style or style is "Regular", try with -Regular suffix
        if fam:
            candidates.append(f"{fam_file}-Regular")
            candidates.append(f"{fam} Regular")
            candidates.append(fam)
            candidates.append(fam_file)

        # Deduplicate while preserving order
        uniq = []
        seen = set()
        for c in candidates:
            key = _normalize_font_name(c)
            if key and key not in seen:
                seen.add(key)
                uniq.append(c)
        return uniq

    def _find_font_file(font_name):
        """Search for font file in fonts directory and system fonts"""
        # First check local fonts directory
        fonts_dir = os.path.join(os.path.dirname(__file__), '..', 'fonts')
        if os.path.exists(fonts_dir):
            # Normalize search name
            target = _normalize_font_name(font_name)
            if target:
                # Search for TTF files first (preferred), then OTF
                for ext in ['.ttf', '.otf']:
                    for filename in os.listdir(fonts_dir):
                        if not filename.lower().endswith(ext):
                            continue

                        # Check if filename matches (without extension)
                        file_base = os.path.splitext(filename)[0]
                        if _normalize_font_name(file_base) == target:
                            return os.path.join(fonts_dir, filename)

        # If not found in local fonts, check system fonts (Windows)
        if os.name == 'nt':  # Windows
            system_font_dirs = [
                r'C:\Windows\Fonts',
                os.path.expanduser(r'~\AppData\Local\Microsoft\Windows\Fonts')
            ]

            for sys_dir in system_font_dirs:
                if not os.path.exists(sys_dir):
                    continue

                try:
                    for filename in os.listdir(sys_dir):
                        if not filename.lower().endswith(('.ttf', '.otf', '.ttc')):
                            continue

                        # For Chinese fonts like 微软雅黑, check the actual font name
                        font_path = os.path.join(sys_dir, filename)
                        try:
                            from fontTools.ttLib import TTFont as FTFont
                            ft_font = FTFont(font_path)
                            for record in ft_font['name'].names:
                                if record.nameID == 1:  # Font family name
                                    try:
                                        family_name = record.toUnicode()
                                        if family_name == font_name:
                                            ft_font.close()
                                            return font_path
                                    except:
                                        pass
                            ft_font.close()
                        except:
                            pass
                except Exception as e:
                    print(f"DEBUG: Error scanning system fonts in {sys_dir}: {e}")
                    continue

        return None

    try:
        # Build candidate font names
        candidates = _build_font_name_candidates(font_family, font_style)
        print(f"DEBUG: Font lookup for '{font_family}' + '{font_style}'")
        print(f"DEBUG: Candidates: {candidates}")

        # Search for font file
        file_path = None

        # First try direct lookup by exact font name (for system fonts like 微软雅黑)
        try:
            file_path = _find_font_file(font_family)
            if file_path:
                print(f"DEBUG: Found font file by direct lookup: {font_family} -> {file_path}")
        except Exception as e:
            print(f"DEBUG: Error in direct font lookup for '{font_family}': {e}")

        # If direct lookup failed, try candidates
        if not file_path:
            for candidate in candidates:
                try:
                    file_path = _find_font_file(candidate)
                    if file_path:
                        print(f"DEBUG: Found font file: {candidate} -> {file_path}")
                        break
                    else:
                        print(f"DEBUG: No file found for: {candidate}")
                except Exception as e:
                    print(f"DEBUG: Error searching for font '{candidate}': {e}")
                    continue

        if file_path and os.path.exists(file_path):
            # Normalize path
            file_path = os.path.normpath(file_path)

            # ReportLab needs forward slashes on Windows
            file_path_rl = file_path.replace('\\', '/')

            # Read font's PostScript name from font file for Illustrator compatibility
            reg_name = None
            try:
                from fontTools.ttLib import TTFont as FTFont
                ft_font = FTFont(file_path)
                ps_name = None
                full_name = None
                for record in ft_font['name'].names:
                    if record.nameID == 6 and record.platformID == 3:  # PostScript name (Windows)
                        try:
                            ps_name = record.toUnicode()
                        except Exception as unicode_err:
                            print(f"DEBUG: Unicode error reading PostScript name: {unicode_err}")
                            pass
                    elif record.nameID == 4 and record.platformID == 3:  # Full name
                        try:
                            full_name = record.toUnicode()
                        except Exception as unicode_err:
                            print(f"DEBUG: Unicode error reading full name: {unicode_err}")
                            pass
                ft_font.close()
                # Prefer PostScript name (matches web font naming: "MangoNew-Bold")
                # Fallback to full name if PostScript name not available
                if ps_name:
                    reg_name = ps_name
                elif full_name:
                    reg_name = full_name
            except Exception as e:
                print(f"Warning: Could not read font name from '{file_path}': {e}")
                # Use a safe fallback name
                reg_name = f"CustomFont_{hash(font_family) % 10000}"
                print(f"Warning: Could not read font name: {e}")

            # Fallback to font_family if we couldn't read from file
            if not reg_name:
                # For problematic fonts like Chinese fonts, use a safe ASCII name
                try:
                    reg_name = font_family.encode('ascii', 'ignore').decode('ascii')
                    if not reg_name:
                        reg_name = f"Font_{hash(font_family) % 10000}"
                except:
                    reg_name = f"Font_{hash(font_family) % 10000}"

            # Check if already registered
            try:
                existing = pdfmetrics.getFont(reg_name)
                print(f"DEBUG: Font '{reg_name}' already registered, reusing")
                return (reg_name, True)
            except:
                print(f"DEBUG: Font '{reg_name}' not yet registered")

            # Register TTF with ReportLab
            try:
                print(f"DEBUG: Attempting to register font '{reg_name}' from {file_path}")
                font = TTFont(reg_name, file_path_rl)
                font.substitutionFonts = []
                pdfmetrics.registerFont(font)
                print(f"Font registered: {reg_name} from {file_path}")
                return (reg_name, True)
            except Exception as e:
                print(f"ERROR: Could not register font {reg_name}: {e}")
                import traceback
                traceback.print_exc()

                # Fallback: use Helvetica metrics but keep a safe font name
                # This allows Illustrator to see the font name and substitute locally
                try:
                    from reportlab.pdfbase.pdfmetrics import Font as RLFont
                    safe_name = f"SafeFont_{hash(font_family) % 10000}"
                    try:
                        pdfmetrics.getFont(safe_name)
                    except:
                        pdfmetrics.registerFont(RLFont(safe_name, 'Helvetica', 'WinAnsiEncoding'))
                    print(f"Using Helvetica metrics for font: {safe_name}")
                    return (safe_name, False)
                except Exception as e2:
                    print(f"Warning: Could not register fallback font: {e2}")
                    return ('Helvetica', False)
        else:
            print(f"Warning: Font file not found for '{font_family}'")
    except Exception as e:
        print(f"Warning: Font registration error for '{font_family}': {e}")
        import traceback
        traceback.print_exc()

    # If font couldn't be found/registered, return Helvetica as safe fallback
    print(f"Warning: Font '{font_family}' not available, using Helvetica")
    return ('Helvetica', False)

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
