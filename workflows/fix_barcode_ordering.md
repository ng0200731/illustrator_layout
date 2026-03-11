# Fix Barcode Ordering Issues

*Last updated: 2026-03-11*

## Problem

When processing barcode/QR code data for Illustrator export, the output order doesn't match the input order. This happens because:

1. Illustrator exports break down barcodes into individual vector paths
2. The order system processes data sequentially but export flattening can change order
3. Variable mapping doesn't preserve the original sequence

## Solution

### Step 1: Prepare Ordered Input Data

Use the `mango_barcode_fix.py` tool to create properly ordered input:

```bash
py tools/mango_barcode_fix.py create_csv .tmp/ordered_barcodes.csv
```

This creates a CSV with:
- `barcode_digits`: The barcode number
- `qr_data`: The QR code URL
- `qty`: Quantity (default 1)

### Step 2: Upload to Order System

1. Use the CSV file with the Excel upload feature
2. Ensure variables are mapped in the correct sequence:
   - Variable 0: barcode_digits
   - Variable 1: qr_data
   - Continue alternating for multiple barcode/QR pairs

### Step 3: Verify Export Order

Use the verification tool:

```bash
py tools/mango_barcode_fix.py verify_ai exported_file.json
```

### Step 4: Fix Issues if Found

If order mismatches are detected:

1. Check variable mapping in the layout
2. Ensure `flatten_layout_for_export()` preserves order
3. Verify the export process maintains sequence

## Key Files

- `tools/mango_barcode_fix.py`: Main ordering tool
- `tools/validate_order_consistency.py`: General validation
- `tools/flatten_tree.py`: Export flattening logic
- `tools/export_ai.py`: Illustrator export with barcode rendering

## Prevention

1. Always use the ordering tools for barcode data
2. Test with small batches first
3. Verify export order before final processing
4. Keep input data in sequential order (1, 2, 3...)

## Notes

- The system expects 42 barcode items for Mango orders
- Each barcode has a corresponding QR code
- Order is critical for matching physical labels to data
