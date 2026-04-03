"""
JSONL Parser for Order Import
Parses JSONL files containing LabelData and StyleColor information
"""

import json


def parse_jsonl_file(file_content):
    """
    Parse JSONL file content and extract display rows

    Args:
        file_content: String content of the JSONL file

    Returns:
        dict with 'success', 'rows', and optional 'error' keys
    """
    try:
        rows = []

        # First, try to parse as a single JSON object/array
        try:
            json_data = json.loads(file_content)

            # Handle array format
            if isinstance(json_data, list):
                for item in json_data:
                    rows.extend(process_json_object(item))
            else:
                rows.extend(process_json_object(json_data))

            return {
                'success': True,
                'rows': rows
            }
        except json.JSONDecodeError:
            # If that fails, try line-by-line JSONL format
            pass

        # Parse as JSONL (line by line)
        lines = file_content.strip().split('\n')

        for line_num, line in enumerate(lines, 1):
            if not line.strip():
                continue

            try:
                json_obj = json.loads(line)

                # Handle array format (file contains array of objects)
                if isinstance(json_obj, list):
                    for item in json_obj:
                        rows.extend(process_json_object(item))
                else:
                    rows.extend(process_json_object(json_obj))

            except json.JSONDecodeError as e:
                return {
                    'success': False,
                    'error': f'Invalid JSON on line {line_num}: {str(e)}'
                }

        return {
            'success': True,
            'rows': rows
        }

    except Exception as e:
        return {
            'success': False,
            'error': f'Error parsing file: {str(e)}'
        }


def process_json_object(json_obj):
    """
    Process a single JSON object and extract rows

    Args:
        json_obj: JSON object to process

    Returns:
        List of row dicts
    """
    rows = []

    # Extract LabelOrder
    label_order = json_obj.get('LabelOrder', {})
    order_id = label_order.get('Id', '')

    # Extract Supplier
    supplier = json_obj.get('Supplier', {})
    supplier_code = supplier.get('SupplierCode', '')

    # Extract StyleColor array
    style_colors = json_obj.get('StyleColor', [])

    # Process each StyleColor entry
    for style_color in style_colors:
        # Get LabelData from within StyleColor
        label_data_list = style_color.get('LabelData', [])

        # If no LabelData, skip this StyleColor
        if not label_data_list:
            continue

        # Process each LabelData entry
        for label_entry in label_data_list:
            # Format display rows (one per ItemData entry)
            display_rows = format_display_rows(
                label_entry,
                style_color,
                order_id,
                supplier_code
            )
            rows.extend(display_rows)

    return rows


def format_display_rows(label_entry, style_color, order_id, supplier_code):
    """
    Format display rows for a LabelData entry
    Creates one row per ItemData entry
    Different LabelIDs have different field mappings

    Args:
        label_entry: LabelData entry dict
        style_color: StyleColor dict
        order_id: Order ID string
        supplier_code: Supplier code string

    Returns:
        List of row dicts
    """
    rows = []

    label_id = label_entry.get('LabelID', '')

    # Get ItemData array
    item_data_list = style_color.get('ItemData', [])

    # Different field mappings based on LabelID
    if label_id == 'GI001BAW':
        rows.extend(format_gi001baw_rows(label_entry, style_color, order_id, item_data_list, supplier_code))
    elif label_id == 'ADHEDIST':
        rows.extend(format_adhedist_rows(label_entry, style_color, order_id, item_data_list, supplier_code))
    elif label_id == 'PVP002XG':
        rows.extend(format_pvp002xg_rows(label_entry, style_color, order_id, item_data_list, supplier_code))
    elif label_id == 'GI000PRO':
        rows.extend(format_gi000pro_rows(label_entry, style_color, order_id, item_data_list, supplier_code))
    else:
        # For unknown label types, still create rows but with a generic format
        rows.extend(format_generic_rows(label_entry, style_color, order_id, item_data_list, supplier_code, label_id))

    return rows


def format_generic_rows(label_entry, style_color, order_id, item_data_list, supplier_code, label_id):
    """Format rows for unknown label types"""
    rows = []
    vendor = label_entry.get('Vendor', '')

    if not item_data_list:
        rows.append({
            'label_type': label_id,
            'label_id': label_id,
            'vendor': vendor,
            'supplier_code': supplier_code,
            'order_id': order_id,
            'note': 'Unknown label type - using generic format'
        })
        return rows

    for item in item_data_list:
        rows.append({
            'label_type': label_id,
            'label_id': label_id,
            'vendor': vendor,
            'supplier_code': supplier_code,
            'order_id': order_id,
            'note': 'Unknown label type - using generic format'
        })

    return rows


def format_gi000pro_rows(label_entry, style_color, order_id, item_data_list, supplier_code):
    """Format rows for GI000PRO label type - add specific fields as needed"""
    rows = []
    label_id = label_entry.get('LabelID', '')
    vendor = label_entry.get('Vendor', '')

    # For now, use same format as GI001BAW - update with specific fields if different
    return format_gi001baw_rows(label_entry, style_color, order_id, item_data_list, supplier_code)


def format_gi001baw_rows(label_entry, style_color, order_id, item_data_list, supplier_code):
    """Format rows for GI001BAW label type"""
    rows = []
    label_id = label_entry.get('LabelID', '')
    vendor = label_entry.get('Vendor', '')

    # Extract fields
    product_type = style_color.get('ProductTypeCodeLegacy', '')
    line = style_color.get('Line', '')
    age = style_color.get('Age', '')
    gender = style_color.get('Gender', '')
    reference_id = style_color.get('ReferenceID', '')
    ref_first_4 = reference_id[:4] if reference_id else ''
    ref_last_4 = reference_id[-4:] if reference_id else ''
    mango_color_code = style_color.get('MangoColorCode', '')
    color = style_color.get('Color', '')
    color_display = f"{mango_color_code}:{color}" if mango_color_code or color else ''
    product_type_full = style_color.get('ProductType', '')
    generic = style_color.get('Generic', '')
    full_product = f"{product_type_full}{product_type}{generic}"

    if not item_data_list:
        rows.append({
            'label_type': label_id,  # Use actual label_id instead of hardcoded 'GI001BAW'
            'label_id': label_id,
            'vendor': vendor,
            'order_id': order_id,
            'item_qty': '',
            'product_type': product_type,
            'line': line,
            'age': age,
            'gender': gender,
            'ref_first_4': ref_first_4,
            'ref_last_4': ref_last_4,
            'color': color_display,
            'size': '',
            'full_product': full_product
        })
        return rows

    for item in item_data_list:
        item_qty = item.get('itemQty', '')
        size_name = item.get('SizeNameES', '')

        rows.append({
            'label_type': label_id,  # Use actual label_id instead of hardcoded 'GI001BAW'
            'label_id': label_id,
            'vendor': vendor,
            'order_id': order_id,
            'item_qty': str(item_qty) if item_qty else '',
            'product_type': product_type,
            'line': line,
            'age': age,
            'gender': gender,
            'ref_first_4': ref_first_4,
            'ref_last_4': ref_last_4,
            'color': color_display,
            'size': size_name,
            'full_product': full_product
        })

    return rows


def format_adhedist_rows(label_entry, style_color, order_id, item_data_list, supplier_code):
    """Format rows for ADHEDIST label type"""
    rows = []
    label_id = label_entry.get('LabelID', '')

    # Extract fields specific to ADHEDIST
    reference_id = style_color.get('ReferenceID', '')
    ref_first_4 = reference_id[:4] if reference_id else ''
    ref_last_4 = reference_id[-4:] if reference_id else ''
    mango_color_code = style_color.get('MangoColorCode', '')
    color = style_color.get('Color', '')
    color_display = f"{mango_color_code}:{color}" if mango_color_code or color else ''
    product_type = style_color.get('ProductTypeCodeLegacy', '')
    line = style_color.get('Line', '')
    age = style_color.get('Age', '')
    gender = style_color.get('Gender', '')
    origin = style_color.get('Origin', {})
    country_origin = origin.get('countryorigin', '')
    product_type_full = style_color.get('ProductType', '')
    iconic = style_color.get('Iconic', '')

    if not item_data_list:
        rows.append({
            'label_type': 'ADHEDIST',
            'label_id': label_id,
            'supplier_code': supplier_code,
            'order_id': order_id,
            'total_size_pack_qty': '',
            'ref_first_4': ref_first_4,
            'ref_last_4': ref_last_4,
            'color': color_display,
            'size_barcode': '',
            'product_type': product_type,
            'line': line,
            'age': age,
            'gender': gender,
            'size': '',
            'size_pack_qty': '',
            'country_origin': country_origin,
            'product_type_full': product_type_full,
            'iconic': iconic
        })
        return rows

    for item in item_data_list:
        size_pack = item.get('SizePack', {})
        total_size_pack_qty = size_pack.get('TotalSizePackQty', '')
        size_barcode = size_pack.get('SizeBarCode', '')
        size_pack_qty = size_pack.get('SizePackQty', '')
        size_name = item.get('SizeNameES', '')

        rows.append({
            'label_type': 'ADHEDIST',
            'label_id': label_id,
            'supplier_code': supplier_code,
            'order_id': order_id,
            'total_size_pack_qty': str(total_size_pack_qty) if total_size_pack_qty else '',
            'ref_first_4': ref_first_4,
            'ref_last_4': ref_last_4,
            'color': color_display,
            'size_barcode': size_barcode,
            'product_type': product_type,
            'line': line,
            'age': age,
            'gender': gender,
            'size': size_name,
            'size_pack_qty': str(size_pack_qty) if size_pack_qty else '',
            'country_origin': country_origin,
            'product_type_full': product_type_full,
            'iconic': iconic
        })

    return rows


def format_pvp002xg_rows(label_entry, style_color, order_id, item_data_list, supplier_code):
    """Format rows for PVP002XG label type"""
    rows = []
    label_id = label_entry.get('LabelID', '')

    # Extract fields specific to PVP002XG
    product_type = style_color.get('ProductTypeCodeLegacy', '')
    line = style_color.get('Line', '')
    iconic = style_color.get('Iconic', '')
    reference_id = style_color.get('ReferenceID', '')
    style_id = style_color.get('StyleID', '')
    color = style_color.get('Color', '')
    destination = style_color.get('Destination', {})
    de_code = destination.get('de_code', '')
    product_type_es = style_color.get('ProductTypeES', '')

    if not item_data_list:
        rows.append({
            'label_type': 'PVP002XG',
            'label_id': label_id,
            'supplier_code': supplier_code,
            'order_id': order_id,
            'item_qty': '',
            'product_type': product_type,
            'line': line,
            'iconic': iconic,
            'reference_id': reference_id,
            'style_id': style_id,
            'color': color,
            'product_type_dup': product_type,
            'de_code': de_code,
            'ean13': '',
            'size_name': '',
            'size_name_it': '',
            'size_name_uk': '',
            'size_name_us': '',
            'size_name_mx': '',
            'size_name_cn': '',
            'product_type_es': product_type_es
        })
        return rows

    for item in item_data_list:
        item_qty = item.get('itemQty', '')
        ean13 = item.get('EAN13', '')
        size_name = item.get('SizeName', '')
        size_name_it = item.get('SizeNameIT', '')
        size_name_uk = item.get('SizeNameUK', '')
        size_name_us = item.get('SizeNameUS', '')
        size_name_mx = item.get('SizeNameMX', '')
        size_name_cn = item.get('SizeNameCN', '')

        rows.append({
            'label_type': 'PVP002XG',
            'label_id': label_id,
            'supplier_code': supplier_code,
            'order_id': order_id,
            'item_qty': str(item_qty) if item_qty else '',
            'product_type': product_type,
            'line': line,
            'iconic': iconic,
            'reference_id': reference_id,
            'style_id': style_id,
            'color': color,
            'product_type_dup': product_type,
            'de_code': de_code,
            'ean13': ean13,
            'size_name': size_name,
            'size_name_it': size_name_it,
            'size_name_uk': size_name_uk,
            'size_name_us': size_name_us,
            'size_name_mx': size_name_mx,
            'size_name_cn': size_name_cn,
            'product_type_es': product_type_es
        })

    return rows
