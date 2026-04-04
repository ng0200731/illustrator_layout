from flask import Blueprint, render_template, request, jsonify, send_file
from models.order import Order
from models.database import execute_query
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), 'tools'))
from excel_order import generate_template, generate_dummy, parse_upload
from jsonl_parser import parse_jsonl_file

order_bp = Blueprint('order', __name__, url_prefix='/order')


@order_bp.route('/create')
def create_page():
    return render_template('order/create.html')


@order_bp.route('/view')
def view_page():
    return render_template('order/view.html')


@order_bp.route('/detail/<order_id>')
def detail_page(order_id):
    return render_template('order/detail.html', order_id=order_id)


@order_bp.route('/json')
def json_page():
    return render_template('order/json.html')


@order_bp.route('/api/create', methods=['POST'])
def api_create():
    data = request.get_json()
    customer_id = data.get('customer_id')
    po_number = data.get('po_number')
    lines = data.get('lines', [])

    if not customer_id or not po_number or not lines:
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        order_id = Order.create(customer_id, po_number)
        for line in lines:
            Order.add_line(
                order_id,
                line['layout_id'],
                line['quantity'],
                line.get('variable_values')
            )
        return jsonify({'order_id': order_id}), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@order_bp.route('/api/list')
def api_list():
    orders = Order.get_all()
    return jsonify(orders)


@order_bp.route('/api/<order_id>')
def api_detail(order_id):
    result = Order.get_by_id(order_id)
    if not result:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(result)


@order_bp.route('/api/<order_id>', methods=['DELETE'])
def api_delete(order_id):
    try:
        Order.delete(order_id)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@order_bp.route('/api/<order_id>', methods=['PUT'])
def api_update(order_id):
    data = request.get_json()
    customer_id = data.get('customer_id')
    po_number = data.get('po_number')
    lines = data.get('lines', [])

    if not customer_id or not po_number or not lines:
        return jsonify({'error': 'Missing required fields'}), 400

    try:
        # Delete existing lines
        execute_query("DELETE FROM order_lines WHERE order_id = ?", (order_id,))

        # Update order
        execute_query(
            "UPDATE orders SET customer_id = ?, po_number = ? WHERE order_id = ?",
            (customer_id, po_number, order_id)
        )

        # Add new lines
        for line in lines:
            Order.add_line(
                order_id,
                line['layout_id'],
                line['quantity'],
                line.get('variable_values')
            )

        return jsonify({'ok': True, 'order_id': order_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@order_bp.route('/api/<order_id>/confirm', methods=['POST'])
def api_confirm(order_id):
    try:
        Order.generate_and_store(order_id)
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@order_bp.route('/api/<order_id>/generate', methods=['POST'])
def api_generate(order_id):
    """Generate layout data for all lines without changing order status."""
    try:
        result = Order.get_by_id(order_id)
        if not result:
            return jsonify({'error': 'Not found'}), 404
        import json
        generated = []
        for line in result['lines']:
            vv = json.loads(line['variable_values']) if line['variable_values'] else {}
            data = Order.generate_layout_data(line['layout_id'], vv)
            generated.append(data)
        return jsonify({'lines': generated})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@order_bp.route('/api/layouts/<customer_id>')
def api_layouts(customer_id):
    rows = execute_query(
        "SELECT id, name, type, data, created_at FROM layouts WHERE customer_id = ? ORDER BY created_at DESC",
        (customer_id,), fetch_all=True
    )
    import json
    results = []
    for r in rows:
        d = dict(r)
        var_count = 0
        if d.get('data'):
            try:
                layout_data = json.loads(d['data']) if isinstance(d['data'], str) else d['data']
                # Count variables in components
                for c in layout_data.get('components', []):
                    if c.get('isVariable'):
                        var_count += 1
                # Count variables in overlays
                for ov in layout_data.get('overlays', []):
                    if ov.get('isVariable'):
                        var_count += 1
            except Exception:
                pass
        d['var_count'] = var_count
        results.append(d)
    return jsonify(results)


@order_bp.route('/api/excel/template', methods=['POST'])
def api_excel_template():
    data = request.get_json()
    variables = data.get('variables', [])
    layout_name = data.get('layout_name', 'template')
    if not variables:
        return jsonify({'error': 'No variables provided'}), 400
    try:
        filepath = generate_template(variables)
        return send_file(filepath, as_attachment=True,
                         download_name=f'{layout_name}_template.xlsx')
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@order_bp.route('/api/excel/dummy', methods=['POST'])
def api_excel_dummy():
    data = request.get_json()
    variables = data.get('variables', [])
    layout_name = data.get('layout_name', 'dummy')
    row_count = data.get('row_count', 10)
    if not variables:
        return jsonify({'error': 'No variables provided'}), 400
    try:
        filepath = generate_dummy(variables, row_count=row_count)
        return send_file(filepath, as_attachment=True,
                         download_name=f'{layout_name}_dummy.xlsx')
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@order_bp.route('/api/excel/upload', methods=['POST'])
def api_excel_upload():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext != 'xlsx':
        return jsonify({'error': 'Only .xlsx files are allowed'}), 400

    try:
        variables_json = request.form.get('variables', '[]')
        expected_variables = json.loads(variables_json)

        result = parse_upload(file, expected_variables)
        if result['success']:
            return jsonify({'success': True, 'rows': result['rows']})
        else:
            return jsonify({'success': False, 'error': result['error']}), 400
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Server error: {str(e)}'}), 500


@order_bp.route('/api/jsonl/get-mappings/<label_type>', methods=['GET'])
def api_get_jsonl_mappings(label_type):
    """Get saved field mappings for a label type"""
    try:
        query = '''
            SELECT field_name, field_part, overlay_number
            FROM jsonl_field_mappings
            WHERE label_type = ?
            ORDER BY field_name, field_part
        '''
        rows = execute_query(query, (label_type,), fetch_all=True)

        # Group by field_name
        mappings = {}
        for row in rows:
            field_name = row['field_name']
            field_part = row['field_part']
            overlay_number = row['overlay_number']

            if field_part == 0:
                # Simple field
                mappings[field_name] = overlay_number
            else:
                # Concatenated field
                if field_name not in mappings:
                    mappings[field_name] = []
                mappings[field_name].append(overlay_number)

        return jsonify({'success': True, 'mappings': mappings})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Server error: {str(e)}'}), 500


@order_bp.route('/api/jsonl/save-mappings', methods=['POST'])
def api_save_jsonl_mappings():
    """Save field mappings for a label type"""
    try:
        data = request.get_json()
        label_type = data.get('label_type')
        mappings = data.get('mappings', {})

        if not label_type:
            return jsonify({'success': False, 'error': 'label_type is required'}), 400

        # Delete existing mappings for this label type
        delete_query = 'DELETE FROM jsonl_field_mappings WHERE label_type = ?'
        execute_query(delete_query, (label_type,))

        # Insert new mappings
        insert_query = '''
            INSERT INTO jsonl_field_mappings (label_type, field_name, field_part, overlay_number)
            VALUES (?, ?, ?, ?)
        '''

        for field_name, overlay_value in mappings.items():
            if isinstance(overlay_value, list):
                # Concatenated field
                for part_index, overlay_num in enumerate(overlay_value, start=1):
                    if overlay_num:  # Only save if overlay number is provided
                        execute_query(insert_query, (label_type, field_name, part_index, overlay_num))
            else:
                # Simple field
                if overlay_value:  # Only save if overlay number is provided
                    execute_query(insert_query, (label_type, field_name, 0, overlay_value))

        return jsonify({'success': True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Server error: {str(e)}'}), 500


@order_bp.route('/api/jsonl/parse', methods=['POST'])
def api_jsonl_parse():
    """Parse uploaded JSONL file and return matched data"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in ['jsonl', 'json']:
        return jsonify({'error': 'Only .jsonl or .json files are allowed'}), 400

    try:
        # Read file content
        file_content = file.read().decode('utf-8')

        # Parse JSONL
        result = parse_jsonl_file(file_content)

        if result['success']:
            return jsonify({'success': True, 'rows': result['rows']})
        else:
            return jsonify({'success': False, 'error': result['error']}), 400

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Server error: {str(e)}'}), 500


@order_bp.route('/api/jsonl/preview-layout/<label_type>', methods=['GET'])
def api_preview_layout(label_type):
    """Get layout data that matches the given label type for preview"""
    try:
        rows = execute_query(
            "SELECT id, name, data FROM layouts WHERE type = 'json' ORDER BY updated_at DESC",
            (), fetch_all=True
        )

        for r in rows:
            if not r['data']:
                continue
            try:
                layout_data = json.loads(r['data']) if isinstance(r['data'], str) else r['data']
            except Exception:
                continue

            mlt = layout_data.get('matchingLabelType') or ''
            # Match if matchingLabelType equals or starts with the label type
            if mlt == label_type or mlt.startswith(label_type + '_') or mlt.startswith(label_type):
                return jsonify({
                    'success': True,
                    'layout': {
                        'id': r['id'],
                        'name': r['name'],
                        'overlays': layout_data.get('overlays', []),
                        'matchingMappings': layout_data.get('matchingMappings', {}),
                        'matchingLabelType': layout_data.get('matchingLabelType', ''),
                        'documentTree': layout_data.get('documentTree'),
                        'docMetadata': layout_data.get('docMetadata'),
                        'docSwatches': layout_data.get('docSwatches', []),
                        'docWidth': layout_data.get('docWidth', 0),
                        'docHeight': layout_data.get('docHeight', 0),
                        'edges': layout_data.get('edges', []),
                        'boundsRectRotations': layout_data.get('boundsRectRotations', {})
                    }
                })

        return jsonify({'success': False, 'error': 'No layout found for ' + label_type})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500
