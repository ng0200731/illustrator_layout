#!/usr/bin/env python3
"""Show font names in OTF files"""

import os
from fontTools.ttLib import TTFont

def show_otf_names(otf_path):
    """Show all name records from an OTF file"""
    try:
        font = TTFont(otf_path)
        print(f"\n{os.path.basename(otf_path)}:")
        print("=" * 60)

        for record in font['name'].names:
            if record.nameID in [1, 2, 4, 6] and record.platformID == 3:  # Windows platform
                name_id_map = {1: "Family", 2: "Subfamily", 4: "Full Name", 6: "PostScript"}
                try:
                    value = record.toUnicode()
                    print(f"  {name_id_map[record.nameID]:12} (ID {record.nameID}): {value}")
                except:
                    pass

        font.close()
    except Exception as e:
        print(f"Error: {e}")

def main():
    fonts_dir = os.path.join(os.path.dirname(__file__), '..', 'fonts')
    fonts_dir = os.path.normpath(fonts_dir)

    for filename in sorted(os.listdir(fonts_dir)):
        if filename.startswith('Mango') and filename.endswith('.otf'):
            otf_path = os.path.join(fonts_dir, filename)
            show_otf_names(otf_path)

if __name__ == '__main__':
    main()
