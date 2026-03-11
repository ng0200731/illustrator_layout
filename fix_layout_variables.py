#!/usr/bin/env python3
"""Fix the layout by setting proper variable IDs"""

import json
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from models.database import execute_query

def fix_layout():
    # Get layout 83 data
    layout_row = execute_query("SELECT data FROM layouts WHERE id = 83", fetch_one=True)
    if not layout_row:
        print("Layout 83 not found!")
        return

    layout_data = json.loads(dict(layout_row)['data'])
    print("Original layout:")

    # Fix components
    for i, comp in enumerate(layout_data.get('components', [])):
        if comp.get('isVariable'):
            print(f"Component {i}: {comp.get('type')} - Variable ID: {comp.get('variableId')}")

            # Set proper variable IDs based on component type and position
            if comp.get('type') == 'barcoderegion':
                comp['variableId'] = 14  # Barcode digits
                print(f"  -> Fixed to Variable ID: 14")
            elif comp.get('type') == 'qrcoderegion':
                comp['variableId'] = 25  # QR URL
                print(f"  -> Fixed to Variable ID: 25")
            elif comp.get('type') == 'textregion' and '8447542484929' in str(comp.get('content', '')):
                comp['variableId'] = 26  # Barcode graphic
                print(f"  -> Fixed to Variable ID: 26")

    # Fix overlays
    for i, ov in enumerate(layout_data.get('overlays', [])):
        if ov.get('isVariable'):
            print(f"Overlay {i}: {ov.get('type')} - Variable ID: {ov.get('variableId')}")

            if ov.get('type') == 'barcoderegion':
                ov['variableId'] = 14
                print(f"  -> Fixed to Variable ID: 14")
            elif ov.get('type') == 'qrcoderegion':
                ov['variableId'] = 25
                print(f"  -> Fixed to Variable ID: 25")
            elif ov.get('type') == 'textregion' and '8447542484929' in str(ov.get('content', '')):
                ov['variableId'] = 26
                print(f"  -> Fixed to Variable ID: 26")

    # Update the layout in database
    updated_json = json.dumps(layout_data)
    execute_query("UPDATE layouts SET data = ? WHERE id = 83", (updated_json,))
    print("\nLayout updated successfully!")

if __name__ == "__main__":
    fix_layout()