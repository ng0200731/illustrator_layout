"""Flatten a JSON layout's document tree + overlays into export-ready components.

Replicates the JS logic in json_manager.js (jFlattenForExport, jPathToExportComponent, etc.)
so the order system can produce export-ready payloads server-side.
"""

PT_TO_MM = 25.4 / 72


def flatten_layout_for_export(layout_data):
    """
    Build a full export payload from layout data.

    Args:
        layout_data: dict with documentTree, overlays, docWidth, docHeight, boundsRects, etc.

    Returns:
        dict with 'label', 'components', 'boundsRects' ready for export_ai / export_pdf
    """
    doc_tree = layout_data.get('documentTree', [])
    overlays = layout_data.get('overlays', [])
    doc_w = layout_data.get('docWidth', layout_data.get('label_width', 0))
    doc_h = layout_data.get('docHeight', layout_data.get('label_height', 0))

    # 1. Flatten document tree into pdfpath/text components
    components = []
    _flatten_tree(doc_tree, components, 1.0)

    # 2. Build boundsRects from layout data
    bounds_rects = []
    raw_brs = layout_data.get('boundsRects', [])
    br_rotations = layout_data.get('boundsRectRotations', [])
    if isinstance(raw_brs, list):
        for bi, br in enumerate(raw_brs):
            rot = 0
            if bi < len(br_rotations):
                rot = br_rotations[bi] or 0
            # boundsRects may come as overlay-style (x,y,w,h) or already export-style
            bounds_rects.append({
                'x': br.get('x', 0), 'y': br.get('y', 0),
                'w': br.get('w', br.get('width', 0)), 'h': br.get('h', br.get('height', 0)),
                'rotation': br.get('_rotation', br.get('rotation', rot))
            })

    # 3. Assign boundsRectIdx to flattened components based on center point
    for comp in components:
        if comp.get('_isBoundsRect'):
            continue
        cx = comp.get('x', 0) + comp.get('width', 0) / 2
        cy = comp.get('y', 0) + comp.get('height', 0) / 2
        comp['boundsRectIdx'] = -1
        for bi, tbr in enumerate(bounds_rects):
            if (cx >= tbr['x'] and cx <= tbr['x'] + tbr['w'] and
                    cy >= tbr['y'] and cy <= tbr['y'] + tbr['h']):
                comp['boundsRectIdx'] = bi
                break

    # 4. Filter out pdfpath components that fall inside an overlay region
    def _inside_overlay(comp):
        if comp.get('type') != 'pdfpath':
            return False
        cx = comp.get('x', 0) + comp.get('width', 0) / 2
        cy = comp.get('y', 0) + comp.get('height', 0) / 2
        for ov in overlays:
            if (cx >= ov.get('x', 0) and cx <= ov.get('x', 0) + ov.get('w', 0) and
                    cy >= ov.get('y', 0) and cy <= ov.get('y', 0) + ov.get('h', 0)):
                return True
        return False

    components = [c for c in components if not _inside_overlay(c)]
    # 5. Add overlay components
    for ov in overlays:
        components.append({
            'type': ov.get('type', 'text'),
            'x': ov.get('x', 0), 'y': ov.get('y', 0),
            'width': ov.get('w', 0), 'height': ov.get('h', 0),
            'content': ov.get('content', ''),
            'fontFamily': ov.get('fontFamily', ''),
            'fontId': ov.get('fontId'),
            'fontSize': ov.get('fontSize', 12),
            'bold': ov.get('bold', False),
            'italic': ov.get('italic', False),
            'color': ov.get('color', '#000000'),
            'letterSpacing': ov.get('letterSpacing', 0),
            'alignH': ov.get('alignH', 'left'),
            'alignV': ov.get('alignV', 'top'),
            'visible': ov.get('visible', True),
            'imageUrl': ov.get('imageUrl', ''),
            'imageFit': ov.get('imageFit', 'contain'),
            'qrData': ov.get('qrData', ''),
            'barcodeData': ov.get('barcodeData', ''),
            'barcodeFormat': ov.get('barcodeFormat', 'code128'),
            'isVariable': ov.get('isVariable', False),
            'rotation': ov.get('_rotation', ov.get('rotation', 0)),
            'boundsRectIdx': ov.get('_boundsRectIdx', ov.get('boundsRectIdx', -1)),
        })

    return {
        'label': {'width': doc_w, 'height': doc_h},
        'components': components,
        'boundsRects': bounds_rects,
    }


# ---------------------------------------------------------------------------
# Tree flattening helpers (port of JS jFlattenForExport / jPathToExportComponent)
# ---------------------------------------------------------------------------

def _flatten_tree(nodes, out, parent_opacity=1.0):
    if not nodes:
        return
    for node in reversed(nodes):
        if node.get('_isBoundsRect') or node.get('_isDoubledText'):
            continue
        opacity = parent_opacity * (node.get('opacity', 100) / 100)
        if node.get('children'):
            _flatten_tree(node['children'], out, opacity)
        elif node.get('type') == 'path':
            comp = _path_to_component(node, opacity)
            if comp:
                out.append(comp)
        elif node.get('type') == 'compoundPath':
            _flatten_compound(node, out, opacity)
        elif node.get('type') == 'text':
            comp = _text_to_component(node, opacity)
            if comp:
                out.append(comp)


def _flatten_compound(node, out, opacity):
    paths = node.get('paths', [])
    if not paths:
        return
    all_ops = []
    for sub in paths:
        sub_comp = _path_to_component(sub, opacity, node)
        if sub_comp and sub_comp.get('pathData', {}).get('ops'):
            all_ops.extend(sub_comp['pathData']['ops'])
    fill = node.get('fill') or (paths[0].get('fill') if paths else None)
    stroke = node.get('stroke') or (paths[0].get('stroke') if paths else None)
    b = node.get('bounds', {'x': 0, 'y': 0, 'width': 0, 'height': 0})
    out.append({
        'type': 'pdfpath',
        'x': b['x'] * PT_TO_MM, 'y': b['y'] * PT_TO_MM,
        'width': b['width'] * PT_TO_MM, 'height': b['height'] * PT_TO_MM,
        'visible': node.get('visible', True),
        'isCompound': True,
        'pathData': {
            'ops': all_ops,
            'fill': _color_to_rgb(fill),
            'stroke': _color_to_rgb(stroke),
            'lw': node.get('strokeWidth', 0) * PT_TO_MM,
        },
    })


def _path_to_component(node, opacity, parent=None):
    pts = node.get('pathData', [])
    if not pts:
        return None
    ops = [{'o': 'M', 'a': [pts[0]['x'] * PT_TO_MM, pts[0]['y'] * PT_TO_MM]}]
    for i in range(1, len(pts)):
        prev = pts[i - 1]
        pt = pts[i]
        ho = prev.get('handleOut')
        hi = pt.get('handleIn')
        if (ho and hi and
                (ho['x'] != prev['x'] or ho['y'] != prev['y'] or
                 hi['x'] != pt['x'] or hi['y'] != pt['y'])):
            ops.append({'o': 'C', 'a': [
                ho['x'] * PT_TO_MM, ho['y'] * PT_TO_MM,
                hi['x'] * PT_TO_MM, hi['y'] * PT_TO_MM,
                pt['x'] * PT_TO_MM, pt['y'] * PT_TO_MM,
            ]})
        else:
            ops.append({'o': 'L', 'a': [pt['x'] * PT_TO_MM, pt['y'] * PT_TO_MM]})
    if node.get('closed'):
        ops.append({'o': 'Z', 'a': []})

    fill = node.get('fill') or (parent.get('fill') if parent else None)
    stroke = node.get('stroke') or (parent.get('stroke') if parent else None)
    b = node.get('bounds', {'x': 0, 'y': 0, 'width': 0, 'height': 0})
    return {
        'type': 'pdfpath',
        'x': b['x'] * PT_TO_MM, 'y': b['y'] * PT_TO_MM,
        'width': b['width'] * PT_TO_MM, 'height': b['height'] * PT_TO_MM,
        'visible': node.get('visible', True),
        'pathData': {
            'ops': ops,
            'fill': _color_to_rgb(fill),
            'stroke': _color_to_rgb(stroke),
            'lw': node.get('strokeWidth', 0) * PT_TO_MM,
        },
    }


def _text_to_component(node, opacity):
    b = node.get('bounds', {'x': 0, 'y': 0, 'width': 0, 'height': 0})
    content = ''
    font_family = 'Arial'
    font_size = 12
    color = '#000000'
    alignment = 'left'

    paragraphs = node.get('paragraphs', [])
    if paragraphs:
        texts = []
        for para in paragraphs:
            if para.get('alignment'):
                alignment = para['alignment']
            for run in para.get('runs', []):
                texts.append(run.get('text', ''))
                if run.get('fontFamily'):
                    font_family = run['fontFamily']
                if run.get('fontSize'):
                    font_size = run['fontSize']
                if run.get('color'):
                    color = _color_to_css(run['color']) or '#000000'
        content = ''.join(texts)

    return {
        'type': 'textregion',
        'x': b['x'] * PT_TO_MM, 'y': b['y'] * PT_TO_MM,
        'width': b['width'] * PT_TO_MM, 'height': b['height'] * PT_TO_MM,
        'content': content,
        'fontFamily': font_family,
        'fontSize': font_size,
        'color': color,
        'alignH': alignment,
        'alignV': 'top',
        'bold': False, 'italic': False,
        'letterSpacing': 0,
        'visible': node.get('visible', True),
    }


def _color_to_rgb(color):
    if not color or color.get('type') == 'none':
        return None
    t = color['type']
    if t == 'rgb':
        return [color['r'] / 255, color['g'] / 255, color['b'] / 255]
    if t == 'cmyk':
        return [
            (1 - color['c'] / 100) * (1 - color['k'] / 100),
            (1 - color['m'] / 100) * (1 - color['k'] / 100),
            (1 - color['y'] / 100) * (1 - color['k'] / 100),
        ]
    if t == 'spot' and color.get('fallback'):
        return _color_to_rgb(color['fallback'])
    if t == 'gradient' and color.get('stops'):
        return _color_to_rgb(color['stops'][0].get('color'))
    return None


def _color_to_css(color):
    if not color or color.get('type') == 'none':
        return None
    t = color['type']
    if t == 'rgb':
        return 'rgb(%d,%d,%d)' % (color['r'], color['g'], color['b'])
    if t == 'cmyk':
        r = round(255 * (1 - color['c'] / 100) * (1 - color['k'] / 100))
        g = round(255 * (1 - color['m'] / 100) * (1 - color['k'] / 100))
        b = round(255 * (1 - color['y'] / 100) * (1 - color['k'] / 100))
        return 'rgb(%d,%d,%d)' % (r, g, b)
    if t == 'spot' and color.get('fallback'):
        return _color_to_css(color['fallback'])
    return None
