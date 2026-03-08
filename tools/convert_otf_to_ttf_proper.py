#!/usr/bin/env python3
"""Convert OTF (CFF) fonts to TTF (TrueType) fonts with proper glyph conversion"""

import sys
import os
from fontTools.ttLib import TTFont

def convert_otf_to_ttf(otf_path, ttf_path):
    """Convert OTF with CFF outlines to TTF with TrueType outlines"""
    print(f"Loading {otf_path}...")
    font = TTFont(otf_path)

    # Check if it's actually an OTF with CFF outlines
    if 'CFF ' not in font:
        print(f"  Not a CFF font, skipping")
        font.close()
        return False

    print(f"  Converting CFF to TrueType outlines using cu2qu...")

    # Use fonttools' transformers to convert CFF to glyf
    from fontTools.ttLib.tables import _g_l_y_f, _l_o_c_a
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    from fontTools.pens.cu2quPen import Cu2QuPen

    cff = font['CFF '].cff
    top_dict = cff[cff.fontNames[0]]
    charstrings = top_dict.CharStrings
    glyphOrder = font.getGlyphOrder()

    # Create glyf and loca tables
    glyf_table = _g_l_y_f.table__g_l_y_f()
    glyf_table.glyphs = {}
    glyf_table.glyphOrder = glyphOrder

    # Convert each glyph from cubic (CFF) to quadratic (TrueType)
    for glyph_name in glyphOrder:
        if glyph_name in charstrings:
            try:
                # Create TT glyph pen with cu2qu wrapper for cubic-to-quadratic conversion
                tt_pen = TTGlyphPen(None)
                cu2qu_pen = Cu2QuPen(tt_pen, max_err=1.0, reverse_direction=False)

                # Draw CFF charstring through cu2qu pen to convert curves
                charstrings[glyph_name].draw(cu2qu_pen)

                # Get the converted glyph
                glyf_table.glyphs[glyph_name] = tt_pen.glyph()
            except Exception as e:
                print(f"    Warning: Could not convert glyph '{glyph_name}': {e}")
                glyf_table.glyphs[glyph_name] = _g_l_y_f.Glyph()
        else:
            glyf_table.glyphs[glyph_name] = _g_l_y_f.Glyph()

    # Add tables
    font['glyf'] = glyf_table
    font['loca'] = _l_o_c_a.table__l_o_c_a()

    # Remove CFF table
    del font['CFF ']

    # Update head and maxp for TrueType
    font['head'].glyphDataFormat = 0

    # Fix maxp table - must be version 1.0 for TrueType with glyf table
    maxp = font['maxp']
    maxp.tableVersion = 0x00010000  # Version 1.0 (65536 in decimal)
    maxp.numGlyphs = len(glyphOrder)
    # Set required fields for version 1.0
    maxp.maxPoints = 0
    maxp.maxContours = 0
    maxp.maxCompositePoints = 0
    maxp.maxCompositeContours = 0
    maxp.maxZones = 2
    maxp.maxTwilightPoints = 0
    maxp.maxStorage = 0
    maxp.maxFunctionDefs = 0
    maxp.maxInstructionDefs = 0
    maxp.maxStackElements = 0
    maxp.maxSizeOfInstructions = 0
    maxp.maxComponentElements = 0
    maxp.maxComponentDepth = 0

    # CRITICAL: Change sfntVersion from 'OTTO' to '\x00\x01\x00\x00' for proper TTF
    font.sfntVersion = '\x00\x01\x00\x00'

    print(f"  Saving to {ttf_path}...")
    font.save(ttf_path)
    font.close()

    print(f"  Converted successfully")
    return True

if __name__ == '__main__':
    # Convert all Mango_New OTF files
    fonts_dir = os.path.join(os.path.dirname(__file__), '..', 'fonts')

    for filename in os.listdir(fonts_dir):
        if filename.startswith('Mango_New-') and filename.endswith('.otf'):
            otf_path = os.path.join(fonts_dir, filename)
            ttf_path = os.path.join(fonts_dir, filename.replace('.otf', '.ttf'))

            try:
                convert_otf_to_ttf(otf_path, ttf_path)
            except Exception as e:
                print(f"ERROR converting {filename}: {e}")
                import traceback
                traceback.print_exc()
