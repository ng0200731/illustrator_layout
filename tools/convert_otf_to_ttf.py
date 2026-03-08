#!/usr/bin/env python3
"""Convert OTF fonts to TTF format for ReportLab compatibility"""

import os
from fontTools.ttLib import TTFont

def convert_otf_to_ttf(otf_path, ttf_path):
    """Convert a single OTF font to TTF format with TrueType outlines"""
    try:
        font = TTFont(otf_path)

        # Check if it's a CFF font (PostScript outlines)
        if 'CFF ' in font:
            print(f"Converting CFF to TrueType: {os.path.basename(otf_path)}")

            # Use fonttools to convert CFF to TrueType
            from fontTools.pens.ttGlyphPen import TTGlyphPen
            from fontTools.ttLib.tables._g_l_y_f import Glyph

            # Get the CFF table
            cff = font['CFF '].cff
            top_dict = cff.topDictIndex[0]
            char_strings = top_dict.CharStrings

            # Create glyf and loca tables for TrueType
            from fontTools.ttLib.tables._g_l_y_f import table__g_l_y_f
            from fontTools.ttLib.tables._l_o_c_a import table__l_o_c_a
            from fontTools.ttLib.tables._h_m_t_x import table__h_m_t_x

            glyf_table = table__g_l_y_f()
            glyf_table.glyphs = {}
            glyf_table.glyphOrder = font.getGlyphOrder()

            # Convert each glyph from CFF to TrueType
            for glyph_name in glyf_table.glyphOrder:
                if glyph_name in char_strings:
                    t2_charstr = char_strings[glyph_name]
                    pen = TTGlyphPen(None)
                    t2_charstr.draw(pen)
                    glyf_table.glyphs[glyph_name] = pen.glyph()
                else:
                    # Empty glyph
                    glyf_table.glyphs[glyph_name] = Glyph()

            # Remove CFF table and add glyf/loca
            del font['CFF ']
            font['glyf'] = glyf_table
            font['loca'] = table__l_o_c_a()

            # Recalculate maxp table for TrueType
            font['maxp'].recalc(font)

            # CRITICAL: Change sfntVersion from 'OTTO' to TrueType
            font.sfntVersion = '\x00\x01\x00\x00'

        # Remove OTF flavor and save as TTF
        font.flavor = None
        font.save(ttf_path)
        font.close()
        print(f"Converted: {os.path.basename(otf_path)} -> {os.path.basename(ttf_path)}")
        return True
    except Exception as e:
        print(f"Error converting {otf_path}: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    fonts_dir = os.path.join(os.path.dirname(__file__), '..', 'fonts')
    fonts_dir = os.path.normpath(fonts_dir)

    if not os.path.exists(fonts_dir):
        print(f"Fonts directory not found: {fonts_dir}")
        return

    converted = 0
    for filename in os.listdir(fonts_dir):
        if filename.lower().endswith('.otf'):
            otf_path = os.path.join(fonts_dir, filename)
            ttf_filename = filename[:-4] + '.ttf'
            ttf_path = os.path.join(fonts_dir, ttf_filename)

            # Always reconvert to ensure proper TrueType format
            if convert_otf_to_ttf(otf_path, ttf_path):
                converted += 1

    print(f"\nConverted {converted} fonts")

if __name__ == '__main__':
    main()
