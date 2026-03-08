#!/usr/bin/env python3
"""Check TTF file headers"""

import os
from fontTools.ttLib import TTFont

def check_ttf_header(ttf_path):
    """Check the sfnt version in TTF header"""
    try:
        font = TTFont(ttf_path)

        # Check sfnt version
        sfnt_version = font.sfntVersion

        print(f"\n{os.path.basename(ttf_path)}:")
        print(f"  sfntVersion: {sfnt_version}")
        print(f"  Has CFF: {'CFF ' in font}")
        print(f"  Has glyf: {'glyf' in font}")

        # sfntVersion should be '\x00\x01\x00\x00' for TrueType
        # or 'OTTO' for OpenType with CFF
        if sfnt_version == 'OTTO':
            print("  ❌ Header says OTTO (OpenType/CFF) - ReportLab will reject this!")
        elif sfnt_version == '\x00\x01\x00\x00':
            print("  ✓ Header says TrueType")
        else:
            print(f"  ⚠ Unknown sfntVersion: {repr(sfnt_version)}")

        font.close()
    except Exception as e:
        print(f"Error: {e}")

def main():
    fonts_dir = os.path.join(os.path.dirname(__file__), '..', 'fonts')
    fonts_dir = os.path.normpath(fonts_dir)

    for filename in sorted(os.listdir(fonts_dir)):
        if filename.startswith('Mango') and filename.endswith('.ttf'):
            ttf_path = os.path.join(fonts_dir, filename)
            check_ttf_header(ttf_path)

if __name__ == '__main__':
    main()
