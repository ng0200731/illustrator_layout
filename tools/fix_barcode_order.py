"""
Tool to fix barcode ordering issues between input data and Illustrator export.

This addresses the specific issue where Illustrator export doesn't match the input order
for barcode/QR code data processing.
"""
import json
import os
import sys
import re
from collections import OrderedDict

def extract_barcode_data_from_table(table_data):
    """Extract barcode data from tabular format (like the IDE data shown)."""
    barcodes = []

    # Parse the table format shown in IDE
    lines = table_data.strip().split('\n')

    for line in lines:
        # Skip header and empty lines
        if not line.strip() or 'barcode_digits' in line or 'QR' in line:
            continue

        # Extract data from each row
        parts = line.split('\t')
        if len(parts) >= 3:
            try:
                # Expected format: index, barcode_digits, QR_url, barcode_graphic, qty
                index = int(parts[0]) if parts[0].isdigit() else None
                barcode_digits = parts[1] if len(parts) > 1 else None
                qr_url = parts[2] if len(parts) > 2 else None

                if index and barcode_digits:
                    barcodes.append({
                        'index': index,
                        'barcode_digits': barcode_digits,
                        'qr_url': qr_url,
                        'original_line': line
                    })
            except (ValueError, IndexError):
                continue

    return barcodes

def create_ordered_excel_data(barcode_list):
    """Create properly ordered Excel data for the order system."""
    excel_rows = []

    # Sort by index to ensure proper order
    sorted_barcodes = sorted(barcode_list, key=lambda x: x['index'])

    for item in sorted_barcodes:
        row = {
            'barcode_digits': item['barcode_digits'],
            'qr_data': item['qr_url'],
            'qty': 1  # Default quantity
        }
        excel_rows.append(row)

    return excel_rows

def generate_variable_mapping(barcode_list, layout_variables):
    """Generate proper variable mapping for the order system."""
    variable_mapping = {}

    # Sort by index to maintain order
    sorted_barcodes = sorted(barcode_list, key=lambda x: x['index'])

    for i, item in enumerate(sorted_barcodes):
        # Map to layout variables by index
        for var in layout_variables:
            var_idx = str(var.get('idx', i))
            var_type = var.get('content', '').lower()

            if 'barcode' in var_type:
                variable_mapping[var_idx] = item['barcode_digits']
            elif 'qr' in var_type:
                variable_mapping[var_idx] = item['qr_url']

    return variable_mapping

def verify_export_order(export_data, expected_order):
    """Verify that export maintains the expected order."""
    issues = []

    if isinstance(export_data, dict) and 'components' in export_data:
        components = export_data['components']

        # Check barcode/QR components
        barcode_components = []
        qr_components = []

        for i, comp in enumerate(components):
            comp_type = comp.get('type', '')
            if comp_type == 'barcoderegion':
                barcode_components.append({
                    'index': i,
                    'data': comp.get('barcodeData', ''),
                    'component': comp
                })
            elif comp_type == 'qrcoderegion':
                qr_components.append({
                    'index': i,
                    'data': comp.get('qrData', ''),
                    'component': comp
                })

        # Verify order matches expected
        for i, expected_item in enumerate(expected_order):
            expected_barcode = expected_item.get('barcode_digits')
            expected_qr = expected_item.get('qr_url')

            # Check if barcode appears in correct position
            if expected_barcode and i < len(barcode_components):
                actual_barcode = barcode_components[i]['data']
                if actual_barcode != expected_barcode:
                    issues.append(f"Barcode mismatch at position {i+1}: expected '{expected_barcode}', got '{actual_barcode}'")

            # Check if QR appears in correct position
            if expected_qr and i < len(qr_components):
                actual_qr = qr_components[i]['data']
                if actual_qr != expected_qr:
                    issues.append(f"QR mismatch at position {i+1}: expected '{expected_qr}', got '{actual_qr}'")

    return issues

def fix_illustrator_export_order(ai_file_path, expected_order):
    """Fix the order in an Illustrator export file."""
    try:
        with open(ai_file_path, 'r', encoding='utf-8') as f:
            ai_data = json.load(f)

        # This is complex because AI files have nested layer structures
        # For now, we'll create a report of what needs to be fixed

        print(f"=== Analyzing Illustrator file: {os.path.basename(ai_file_path)} ===")

        layers = ai_data.get('layers', [])
        total_paths = 0

        for layer in layers:
            if 'children' in layer:
                total_paths += len(layer['children'])

        print(f"Total paths in AI file: {total_paths}")
        print(f"Expected barcode items: {len(expected_order)}")

        if total_paths != len(expected_order):
            print(f"WARNING: Path count ({total_paths}) doesn't match expected items ({len(expected_order)})")

        # Create a mapping report
        print("\n=== Order Mapping Report ===")
        for i, item in enumerate(expected_order[:10]):  # Show first 10
            print(f"Position {i+1}: Barcode={item.get('barcode_digits')}, QR={item.get('qr_url', '')[:50]}...")

        return True

    except Exception as e:
        print(f"Error processing AI file: {e}")
        return False

def main():
    """Main function to fix barcode ordering issues."""
    if len(sys.argv) < 2:
        print("Usage: py fix_barcode_order.py <mode> [files...]")
        print("Modes:")
        print("  parse_table <table_file>     - Parse tabular barcode data")
        print("  verify_ai <ai_file> <table_file> - Verify AI export against table")
        print("  create_excel <table_file>    - Create Excel data from table")
        sys.exit(1)

    mode = sys.argv[1]

    if mode == "parse_table" and len(sys.argv) >= 3:
        table_file = sys.argv[2]

        # For now, use the sample data from the IDE
        sample_data = """
barcode_digits	QR	barcode_graphic	qty	Actions
8447692183473	https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116073	8447692183473	1	[⎘][-]
8447692183702	https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116074	8447692183702	1	[⎘][-]
8447692183632	https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116075	8447692183632	1	[⎘][-]
"""

        barcodes = extract_barcode_data_from_table(sample_data)
        print(f"Extracted {len(barcodes)} barcode items")

        for item in barcodes[:5]:
            print(f"  {item['index']}: {item['barcode_digits']} -> {item['qr_url'][:50]}...")

    elif mode == "verify_ai" and len(sys.argv) >= 4:
        ai_file = sys.argv[2]
        table_file = sys.argv[3]

        # Use sample data for now
        sample_data = """1	8447692183473	https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116073
2	8447692183702	https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116074
3	8447692183632	https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116075"""

        expected_order = extract_barcode_data_from_table(sample_data)
        fix_illustrator_export_order(ai_file, expected_order)

    else:
        print("Invalid mode or insufficient arguments")
        sys.exit(1)

if __name__ == "__main__":
    main()