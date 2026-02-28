from flask import Blueprint, render_template, request, jsonify
from models.order import Order
from models.database import execute_query

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
        Order.generate_and_store(order_id)
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
                for c in layout_data.get('components', []):
                    if c.get('isVariable'):
                        var_count += 1
            except Exception:
                pass
        d['var_count'] = var_count
        results.append(d)
    return jsonify(results)
