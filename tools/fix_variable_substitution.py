"""
Fix for variable substitution in order generation.

The issue: generate_layout_data uses enumerated indices (0,1,2) but
variable_values contains actual variable IDs (15,26,27).
"""
import json
import copy

def fixed_generate_layout_data(layout_id, variable_values):
    """
    Fixed version of generate_layout_data that properly handles variable IDs.

    Args:
        layout_id: Layout ID to process
        variable_values: Dict with actual variable IDs as keys (e.g., {"15": "value", "26": "value"})
    """
    # This would normally query the database
    # row = execute_query("SELECT data FROM layouts WHERE id = ?", (layout_id,), fetch_one=True)
    # layout_data = json.loads(dict(row)['data'])

    # For demonstration, we'll show the fix logic
    print("=== Fixed Variable Substitution Logic ===")

    # The key fix: Use the actual variable ID from the component/overlay
    def apply_variables_correctly(components_or_overlays, variable_values):
        """Apply variables using actual variable IDs, not enumerated indices."""
        for item in components_or_overlays:
            if item.get('isVariable'):
                # Get the actual variable ID from the component
                var_id = item.get('variableId') or item.get('idx')

                if var_id is not None:
                    var_key = str(var_id)
                    if var_key in variable_values:
                        print(f"  Applying variable #{var_key}: {variable_values[var_key][:50]}...")

                        # Apply to different content types
                        if item.get('type') == 'barcoderegion':
                            item['barcodeData'] = variable_values[var_key]
                        elif item.get('type') == 'qrcoderegion':
                            item['qrData'] = variable_values[var_key]
                        else:
                            item['content'] = variable_values[var_key]
                    else:
                        print(f"  WARNING: Variable #{var_key} not found in variable_values")
                        print(f"  Available variables: {list(variable_values.keys())}")

    # Example variable values from your input
    example_variable_values = {
        "15": "8447692183473",  # barcode
        "26": "https://qr.mango.com/v1/p/m/2/27049218/01/01/08447692183949/21/17522116073",  # QR
        "27": "8447692183473"   # barcode display
    }

    print("Example variable values:")
    for var_id, value in example_variable_values.items():
        print(f"  Variable #{var_id}: {value[:50]}...")

    # Simulate components that need variable substitution
    example_components = [
        {"type": "barcoderegion", "isVariable": True, "variableId": 15, "barcodeData": "placeholder"},
        {"type": "qrcoderegion", "isVariable": True, "variableId": 26, "qrData": "placeholder"},
        {"type": "text", "isVariable": True, "variableId": 27, "content": "placeholder"}
    ]

    print("\nBefore variable substitution:")
    for comp in example_components:
        content_key = 'barcodeData' if comp['type'] == 'barcoderegion' else 'qrData' if comp['type'] == 'qrcoderegion' else 'content'
        print(f"  {comp['type']} (var #{comp['variableId']}): {comp[content_key]}")

    apply_variables_correctly(example_components, example_variable_values)

    print("\nAfter variable substitution:")
    for comp in example_components:
        content_key = 'barcodeData' if comp['type'] == 'barcoderegion' else 'qrData' if comp['type'] == 'qrcoderegion' else 'content'
        print(f"  {comp['type']} (var #{comp['variableId']}): {comp[content_key][:50]}...")

def create_fixed_order_model():
    """Create the corrected version of the order model."""
    fixed_code = '''
def generate_layout_data(layout_id, variable_values):
    """Fixed version that uses actual variable IDs instead of enumerated indices."""
    row = execute_query("SELECT data FROM layouts WHERE id = ?", (layout_id,), fetch_one=True)
    if not row:
        return None
    layout_data = json.loads(dict(row)['data'])
    data = copy.deepcopy(layout_data)

    if variable_values:
        # FIXED: Apply variable values using actual variable IDs
        for comp in data.get('components', []):
            if comp.get('isVariable'):
                # Use the actual variable ID, not enumerated index
                var_id = comp.get('variableId') or comp.get('idx')
                if var_id is not None:
                    var_key = str(var_id)
                    if var_key in variable_values:
                        if comp.get('type') == 'barcoderegion':
                            comp['barcodeData'] = variable_values[var_key]
                        elif comp.get('type') == 'qrcoderegion':
                            comp['qrData'] = variable_values[var_key]
                        else:
                            comp['content'] = variable_values[var_key]

        # FIXED: Apply to overlays using actual variable IDs
        for ov in data.get('overlays', []):
            if ov.get('isVariable'):
                # Use the actual variable ID, not enumerated index
                var_id = ov.get('variableId') or ov.get('idx')
                if var_id is not None:
                    var_key = str(var_id)
                    if var_key in variable_values:
                        if ov.get('type') == 'barcoderegion':
                            ov['barcodeData'] = variable_values[var_key]
                        elif ov.get('type') == 'qrcoderegion':
                            ov['qrData'] = variable_values[var_key]
                        else:
                            ov['content'] = variable_values[var_key]

    # Build full export-ready payload
    data['exportPayload'] = flatten_layout_for_export(data)
    return data
'''

    with open('.tmp/fixed_order_model.py', 'w', encoding='utf-8') as f:
        f.write(fixed_code)

    print(f"\nCreated fixed order model: .tmp/fixed_order_model.py")

def main():
    """Main function to demonstrate the fix."""
    print("=== Variable Substitution Fix ===")
    print("The issue: Current code uses enumerated indices (0,1,2) instead of actual variable IDs (15,26,27)")
    print()

    fixed_generate_layout_data(None, None)
    create_fixed_order_model()

    print("\n=== SOLUTION ===")
    print("1. Update models/order.py with the fixed generate_layout_data function")
    print("2. Ensure components/overlays have 'variableId' or 'idx' field with actual variable number")
    print("3. Use actual variable IDs (15,26,27) instead of enumerated indices (0,1,2)")

if __name__ == "__main__":
    main()