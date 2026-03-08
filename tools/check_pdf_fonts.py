#!/usr/bin/env python3
"""Check what fonts are embedded in a PDF file"""

import sys
from PyPDF2 import PdfReader

def check_pdf_fonts(pdf_path):
    """Extract font information from a PDF"""
    try:
        reader = PdfReader(pdf_path)
        print(f"Checking: {pdf_path}")
        print("=" * 60)

        fonts_found = set()

        for page_num, page in enumerate(reader.pages):
            if '/Font' in page['/Resources']:
                fonts = page['/Resources']['/Font']
                for font_name in fonts:
                    font_obj = fonts[font_name]
                    if '/BaseFont' in font_obj:
                        base_font = str(font_obj['/BaseFont'])
                        fonts_found.add(base_font)

        if fonts_found:
            print("\nFonts found in PDF:")
            for font in sorted(fonts_found):
                print(f"  - {font}")
        else:
            print("\nNo fonts found in PDF")

    except Exception as e:
        print(f"Error reading PDF: {e}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        # Find most recent AI file
        import os
        import glob
        files = glob.glob('.tmp/*.ai')
        if files:
            latest = max(files, key=os.path.getmtime)
            check_pdf_fonts(latest)
        else:
            print("No AI files found in .tmp/")
    else:
        check_pdf_fonts(sys.argv[1])
