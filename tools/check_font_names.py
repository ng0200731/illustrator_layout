#!/usr/bin/env python3
"""Check font names in TTF files"""

import os
from fontTools.ttLib import TTFont

def check_font_names(font_path):
    """Extract all name records from a font file"""
    try:
        font = TTFont(font_path)
        print(f"\n{os.path.basename(font_path)}:")
        print("-" * 60)

        for record in font['name'].names:
            if record.nameID in [1, 2, 4, 6]:  # Family, Subfamily, Full, PostScript
                name_id_map = {1: "Family", 2: "Subfamily", 4: "Full Name", 6: "PostScript"}
                try:
                    value = record.toUnicode()
                    print(f"  {name_id_map[record.nameID]:12} (ID {record.nameID}): {value}")
                except:
                    pass

        font.close()
    except Exception as e:
        print(f"Error reading {font_path}: {e}")

def main():
    fonts_dir = os.path.join(os.path.dirname(__file__), '..', 'fonts')
    fonts_dir = os.path.normpath(fonts_dir)

    for filename in sorted(os.listdir(fonts_dir)):
        if filename.endswith('.ttf'):
            font_path = os.path.join(fonts_dir, filename)
            check_font_names(font_path)

if __name__ == '__main__':
    main()
