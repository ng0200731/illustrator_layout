#!/usr/bin/env python3
"""Test the API generate endpoint to see what data it returns"""

import requests
import json

# Test the API endpoint
try:
    response = requests.post('http://localhost:5000/api/ORD-00046/generate')
    print(f"Status: {response.status_code}")

    if response.status_code == 200:
        data = response.json()
        print(f"Response keys: {data.keys()}")

        if 'lines' in data and len(data['lines']) > 0:
            first_line = data['lines'][0]
            print(f"First line keys: {first_line.keys()}")

            # Check components
            if 'components' in first_line:
                print(f"Number of components: {len(first_line['components'])}")

                # Look for barcode/QR components
                for i, comp in enumerate(first_line['components']):
                    if comp.get('type') in ['barcoderegion', 'qrcoderegion']:
                        print(f"Component {i}: {comp.get('type')}")
                        print(f"  - content: {comp.get('content')}")
                        print(f"  - barcodeData: {comp.get('barcodeData')}")
                        print(f"  - qrData: {comp.get('qrData')}")
                        print(f"  - isVariable: {comp.get('isVariable')}")
                        print(f"  - variableId: {comp.get('variableId')}")
                        print()

            # Check overlays
            if 'overlays' in first_line:
                print(f"Number of overlays: {len(first_line['overlays'])}")

                for i, ov in enumerate(first_line['overlays']):
                    if ov.get('type') in ['barcoderegion', 'qrcoderegion']:
                        print(f"Overlay {i}: {ov.get('type')}")
                        print(f"  - content: {ov.get('content')}")
                        print(f"  - barcodeData: {ov.get('barcodeData')}")
                        print(f"  - qrData: {ov.get('qrData')}")
                        print(f"  - isVariable: {ov.get('isVariable')}")
                        print(f"  - variableId: {ov.get('variableId')}")
                        print()
        else:
            print("No lines found in response")
    else:
        print(f"Error: {response.text}")

except Exception as e:
    print(f"Error: {e}")