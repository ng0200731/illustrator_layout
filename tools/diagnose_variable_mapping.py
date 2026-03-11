"""
Tool to diagnose and fix variable mapping issues in barcode/QR processing.

The issue: Input has unique values per row, but output shows same values for all items.
This indicates variable mapping or processing is not preserving individual row data.
"""
import json
import os
import sys

def analyze_variable_mapping_issue():
    """Analyze the variable mapping issue with barcode/QR data."""
    print("=== Variable Mapping Issue Analysis ===")

    # Your actual input data
    input_data = [
        {
            "row": 1,
            "qty": 11,
            "barcode_input": "8447692183473",
            "qr_input": "https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116073",
            "variables": "#15: 8447692183473, #26: https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116073, #27: 8447692183473"
        },
        {
            "row": 2,
            "qty": 22,
            "barcode_input": "8447692183702",
            "qr_input": "https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116074",
            "variables": "#15: 8447692183702, #26: https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116074"
        }
    ]

    # What you're getting in output
    output_data = [
        {
            "row": 1,
            "qr_scan_result": "3036039B3011F684146645E9",
            "barcode_scan_result": "8447692183949"
        },
        {
            "row": 2,
            "qr_scan_result": "3036039B3011F684146645E9",  # Same as row 1!
            "barcode_scan_result": "8447692183949"          # Same as row 1!
        }
    ]

    print("INPUT DATA:")
    for item in input_data:
        print(f"Row {item['row']}: Barcode={item['barcode_input']}, QR ends with ...{item['qr_input'][-4:]}")

    print("\nOUTPUT DATA:")
    for item in output_data:
        print(f"Row {item['row']}: Barcode={item['barcode_scan_result']}, QR={item['qr_scan_result']}")

    print("\n=== ISSUES IDENTIFIED ===")
    print("1. All QR codes scan to same value despite different URLs")
    print("2. All barcodes show same number despite different input numbers")
    print("3. Variable mapping is not preserving row-specific data")

    return input_data, output_data

def diagnose_qr_url_issue():
    """Diagnose why different QR URLs produce the same scan result."""
    print("\n=== QR URL Analysis ===")

    qr_urls = [
        "https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116073",
        "https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116074"
    ]

    print("QR URLs:")
    for i, url in enumerate(qr_urls, 1):
        print(f"Row {i}: {url}")
        # Extract the unique part (last segment)
        parts = url.split('/')
        unique_id = parts[-1] if parts else "unknown"
        print(f"  Unique ID: {unique_id}")

    print("\nThe URLs are different (ending in 073 vs 074)")
    print("But both scan to: 3036039B3011F684146645E9")
    print("\nPOSSIBLE CAUSES:")
    print("1. QR code generation is using wrong variable")
    print("2. All QR codes point to same base product (08447692183949)")
    print("3. Variable substitution not working correctly")

def diagnose_barcode_issue():
    """Diagnose why different barcode numbers produce the same result."""
    print("\n=== Barcode Analysis ===")

    input_barcodes = ["8447692183473", "8447692183702"]
    output_barcode = "8447692183949"

    print("Input barcodes:")
    for i, bc in enumerate(input_barcodes, 1):
        print(f"Row {i}: {bc}")

    print(f"\nOutput barcode (both rows): {output_barcode}")

    print("\nPOSSIBLE CAUSES:")
    print("1. Barcode variable is using a fixed value instead of row-specific data")
    print("2. Variable mapping is pointing to wrong field")
    print("3. Layout has hardcoded barcode value")

def create_debug_variable_mapping():
    """Create proper variable mapping to fix the issue."""
    print("\n=== Correct Variable Mapping ===")

    # Based on your variable numbers: #15, #26, #27
    correct_mapping = [
        {
            "row": 1,
            "variable_values": {
                "15": "8447692183473",  # Barcode for row 1
                "26": "https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116073",  # QR for row 1
                "27": "8447692183473"   # Barcode display for row 1
            },
            "quantity": 11
        },
        {
            "row": 2,
            "variable_values": {
                "15": "8447692183702",  # Barcode for row 2
                "26": "https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116074",  # QR for row 2
                "27": "8447692183702"   # Barcode display for row 2
            },
            "quantity": 22
        }
    ]

    print("Correct variable mapping:")
    for item in correct_mapping:
        print(f"Row {item['row']}:")
        for var_id, value in item['variable_values'].items():
            if len(str(value)) > 50:
                print(f"  Variable #{var_id}: {str(value)[:50]}...")
            else:
                print(f"  Variable #{var_id}: {value}")
        print(f"  Quantity: {item['quantity']}")

    return correct_mapping

def generate_excel_with_correct_mapping():
    """Generate Excel file with correct variable mapping."""
    print("\n=== Generating Corrected Excel File ===")

    # Your actual data
    data_rows = [
        {"barcode": "8447692183473", "qr": "https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116073", "qty": 11},
        {"barcode": "8447692183702", "qr": "https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116074", "qty": 22}
    ]

    # Create CSV (since Excel might not be available)
    csv_content = "barcode_digits,qr_data,barcode_display,qty\n"

    for row in data_rows:
        csv_content += f"{row['barcode']},{row['qr']},{row['barcode']},{row['qty']}\n"

    output_file = ".tmp/mango_corrected_mapping.csv"

    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(csv_content)
        print(f"Created corrected CSV: {output_file}")
        print("This file has separate columns for each variable to ensure proper mapping")
        return True
    except Exception as e:
        print(f"Error creating CSV: {e}")
        return False

def check_layout_variables():
    """Check what variables the layout expects."""
    print("\n=== Layout Variable Check ===")
    print("Based on your output, the layout uses:")
    print("Variable #15: Barcode number")
    print("Variable #26: QR code URL")
    print("Variable #27: Barcode display (might be same as #15)")
    print("\nTo fix the issue:")
    print("1. Ensure each row has unique values for variables #15, #26, #27")
    print("2. Check that variable mapping preserves row-specific data")
    print("3. Verify the layout doesn't have hardcoded values")

def main():
    """Main diagnostic function."""
    print("=== Barcode/QR Variable Mapping Diagnostic Tool ===")

    analyze_variable_mapping_issue()
    diagnose_qr_url_issue()
    diagnose_barcode_issue()
    create_debug_variable_mapping()
    generate_excel_with_correct_mapping()
    check_layout_variables()

    print("\n=== SOLUTION SUMMARY ===")
    print("1. The issue is variable mapping not preserving row-specific data")
    print("2. Use the corrected CSV file: .tmp/mango_corrected_mapping.csv")
    print("3. Ensure variables #15, #26, #27 get unique values per row")
    print("4. Check layout for hardcoded values that override variables")

if __name__ == "__main__":
    main()