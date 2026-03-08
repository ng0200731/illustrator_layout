#!/usr/bin/env python3
"""Check if TTF files have TrueType or PostScript outlines"""

import os
from fontTools.ttLib import TTFont

def check_ttf_format(ttf_path):
    """Check what kind of outlines a TTF file has"""
    try:
        font = TTFont(ttf_path)
        has_cff = 'CFF ' in font
        has_glyf = 'glyf' in font

        print(f"\n{os.path.basename(ttf_path)}:")
        print(f"  Has CFF (PostScript): {has_cff}")
        print(f"  Has glyf (TrueType): {has_glyf}")

        if has_cff:
            print("  ❌ This file has PostScript outlines - ReportLab won't work!")
        elif has_glyf:
            print("  ✓ This file has TrueType outlines - ReportLab should work")
        else:
            print("  ⚠ Unknown outline format")

        font.close()
    except Exception as e:
        print(f"Error checking {ttf_path}: {e}")

def main():
    fonts_dir = os.path.join(os.path.dirname(__file__), '..', 'fonts')
    fonts_dir = os.path.normpath(fonts_dir)

    for filename in sorted(os.listdir(fonts_dir)):
        if filename.startswith('Mango') and filename.endswith('.ttf'):
            ttf_path = os.path.join(fonts_dir, filename)
            check_ttf_format(ttf_path)

if __name__ == '__main__':
    main()
