#!/usr/bin/env python3
"""Fix TTF font names to match OTF naming convention"""

import os
from fontTools.ttLib import TTFont

def fix_font_name(ttf_path, new_ps_name):
    """Change the PostScript name in a TTF font"""
    try:
        font = TTFont(ttf_path)

        # Update PostScript name (nameID 6) for all platforms
        for record in font['name'].names:
            if record.nameID == 6:  # PostScript name
                # Update the name
                if record.platformID == 3:  # Windows
                    record.string = new_ps_name.encode('utf-16-be')
                elif record.platformID == 1:  # Mac
                    record.string = new_ps_name.encode('mac-roman')

        # Save the modified font
        font.save(ttf_path)
        font.close()
        print(f"Updated: {os.path.basename(ttf_path)} -> PostScript name: {new_ps_name}")
        return True
    except Exception as e:
        print(f"Error updating {ttf_path}: {e}")
        return False

def main():
    fonts_dir = os.path.join(os.path.dirname(__file__), '..', 'fonts')
    fonts_dir = os.path.normpath(fonts_dir)

    # Map: filename -> desired PostScript name (matching database names)
    font_mapping = {
        'Mango_New-Bold.ttf': 'Mango New-Bold',
        'Mango_New-Medium.ttf': 'Mango New-Medium',
        'Mango_New-Regular.ttf': 'Mango New',  # Database has "Mango New", not "Mango New-Regular"
        'Mango_New-SemiBold.ttf': 'Mango New-SemiBold',
    }

    for filename, ps_name in font_mapping.items():
        ttf_path = os.path.join(fonts_dir, filename)
        if os.path.exists(ttf_path):
            fix_font_name(ttf_path, ps_name)
        else:
            print(f"Not found: {filename}")

if __name__ == '__main__':
    main()
