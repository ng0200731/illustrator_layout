#!/usr/bin/env python3
"""Register TTF versions of fonts in the database"""

import os
import sys
from fontTools.ttLib import TTFont

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from models.font import Font

def get_font_full_name(font_path):
    """Extract the full font name from a font file"""
    try:
        font = TTFont(font_path)
        for record in font['name'].names:
            if record.nameID == 4 and record.platformID == 3:  # Full name (Windows)
                try:
                    full_name = record.toUnicode()
                    font.close()
                    return full_name
                except:
                    pass
        font.close()
    except Exception as e:
        print(f"Error reading font name from {font_path}: {e}")
    return None

def main():
    fonts_dir = os.path.join(os.path.dirname(__file__), '..', 'fonts')
    fonts_dir = os.path.normpath(fonts_dir)

    added = 0
    for filename in os.listdir(fonts_dir):
        if filename.startswith('Mango') and filename.endswith('.ttf'):
            font_path = os.path.join(fonts_dir, filename)
            full_name = get_font_full_name(font_path)

            if not full_name:
                print(f"Skipped (no name): {filename}")
                continue

            # Check if already exists
            existing = Font.get_by_name(full_name)
            if existing:
                print(f"Already exists: {full_name}")
                continue

            # Add to database
            relative_path = os.path.join('fonts', filename)
            Font.create(full_name, filename, relative_path)
            print(f"Added: {full_name} -> {relative_path}")
            added += 1

    print(f"\nAdded {added} TTF fonts to database")

if __name__ == '__main__':
    main()
