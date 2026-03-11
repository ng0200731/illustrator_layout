"""
Tool to validate and fix order consistency between input data and Illustrator export.

This tool helps ensure that the order of items in the input matches the export output,
particularly for barcode/QR code data processing.
"""
import json
import os
import sys
from collections import OrderedDict

def analyze_json_structure(json_file_path):
    """Analyze the structure of a JSON file to understand ordering."""
    try:
        with open(json_file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        print(f"=== JSON Structure Analysis: {os.path.basename(json_file_path)} ===")

        # Check if it's tabular data (like your barcode data)
        if isinstance(data, list) and len(data) > 0:
            print(f"Data type: List with {len(data)} items")
            if isinstance(data[0], dict):
                print("Sample item keys:", list(data[0].keys()))
                # Look for barcode/QR related fields
                barcode_fields = []
                for key in data[0].keys():
                    if any(term in key.lower() for term in ['barcode', 'qr', 'code', 'digits']):
                        barcode_fields.append(key)
                if barcode_fields:
                    print("Barcode-related fields found:", barcode_fields)

        elif isinstance(data, dict):
            print("Data type: Dictionary")
            print("Top-level keys:", list(data.keys()))

            # Check for Illustrator-specific structure
            if 'layers' in data:
                print("This appears to be an Illustrator export file")
                layers = data.get('layers', [])
                print(f"Number of layers: {len(layers)}")

                # Analyze layer structure for ordering
                for i, layer in enumerate(layers):
                    if 'children' in layer:
                        print(f"Layer {i}: {len(layer['children'])} children")

        return data

    except Exception as e:
        print(f"Error analyzing JSON: {e}")
        return None

def extract_barcode_sequence(data):
    """Extract barcode sequence from various data formats."""
    sequence = []

    if isinstance(data, list):
        # Tabular data format
        for i, item in enumerate(data):
            if isinstance(item, dict):
                # Look for barcode/QR fields
                barcode_data = None
                qr_data = None

                for key, value in item.items():
                    key_lower = key.lower()
                    if 'barcode' in key_lower and 'digit' in key_lower:
                        barcode_data = value
                    elif 'qr' in key_lower:
                        qr_data = value

                sequence.append({
                    'index': i + 1,
                    'barcode': barcode_data,
                    'qr': qr_data,
                    'raw_item': item
                })

    elif isinstance(data, dict) and 'layers' in data:
        # Illustrator format - extract paths/elements in order
        layers = data.get('layers', [])
        element_count = 0

        def extract_from_children(children, parent_name=""):
            nonlocal element_count
            for child in children:
                element_count += 1
                if child.get('type') == 'path':
                    sequence.append({
                        'index': element_count,
                        'type': 'path',
                        'name': child.get('name', ''),
                        'bounds': child.get('bounds', {}),
                        'parent': parent_name
                    })
                elif 'children' in child:
                    extract_from_children(child['children'], child.get('name', parent_name))

        for layer in layers:
            if 'children' in layer:
                extract_from_children(layer['children'], layer.get('name', 'Layer'))

    return sequence

def compare_sequences(input_sequence, export_sequence):
    """Compare two sequences to identify ordering mismatches."""
    print("\n=== Sequence Comparison ===")
    print(f"Input sequence length: {len(input_sequence)}")
    print(f"Export sequence length: {len(export_sequence)}")

    mismatches = []

    # Simple length check
    if len(input_sequence) != len(export_sequence):
        mismatches.append(f"Length mismatch: input={len(input_sequence)}, export={len(export_sequence)}")

    # Compare items by index
    min_len = min(len(input_sequence), len(export_sequence))
    for i in range(min_len):
        input_item = input_sequence[i]
        export_item = export_sequence[i]

        # Check if indices match expected order
        if input_item.get('index') != export_item.get('index'):
            mismatches.append(f"Index {i}: input_index={input_item.get('index')}, export_index={export_item.get('index')}")

    return mismatches

def create_corrected_sequence(input_data, target_order):
    """Create a corrected sequence based on target order."""
    if not isinstance(input_data, list):
        print("Cannot correct non-list data")
        return input_data

    corrected = []
    for target_index in target_order:
        if 0 <= target_index - 1 < len(input_data):
            corrected.append(input_data[target_index - 1])
        else:
            print(f"Warning: target index {target_index} out of range")

    return corrected

def validate_order_consistency(input_file, export_file=None):
    """Main function to validate order consistency."""
    print("=== Order Consistency Validation ===")

    # Analyze input file
    input_data = analyze_json_structure(input_file)
    if not input_data:
        return False

    input_sequence = extract_barcode_sequence(input_data)
    print(f"\nExtracted {len(input_sequence)} items from input")

    # Show first few items for verification
    print("\nFirst 5 input items:")
    for i, item in enumerate(input_sequence[:5]):
        print(f"  {i+1}: {item}")

    if export_file and os.path.exists(export_file):
        # Analyze export file
        export_data = analyze_json_structure(export_file)
        export_sequence = extract_barcode_sequence(export_data)

        # Compare sequences
        mismatches = compare_sequences(input_sequence, export_sequence)

        if mismatches:
            print("\n=== MISMATCHES FOUND ===")
            for mismatch in mismatches:
                print(f"  - {mismatch}")
            return False
        else:
            print("\n=== ORDER CONSISTENCY VERIFIED ===")
            return True
    else:
        print("\nNo export file provided for comparison")
        return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: py validate_order_consistency.py <input_file> [export_file]")
        sys.exit(1)

    input_file = sys.argv[1]
    export_file = sys.argv[2] if len(sys.argv) > 2 else None

    validate_order_consistency(input_file, export_file)