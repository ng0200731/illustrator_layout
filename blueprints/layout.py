"""Layout blueprint for layout management routes"""
from flask import Blueprint, render_template, request, jsonify
from models.layout import Layout

layout_bp = Blueprint('layout', __name__, url_prefix='/layout')

@layout_bp.route('/create/draw', methods=['GET'])
def create_draw_page():
    """Render draw tool page (placeholder)"""
    return render_template('layout/create_draw.html')

@layout_bp.route('/create/pdf', methods=['GET'])
def create_pdf_page():
    """Render PDF manager page"""
    layout_id = request.args.get('load', '')
    return render_template('layout/create_pdf.html', layout_id=layout_id)

@layout_bp.route('/save', methods=['POST'])
def save_layout():
    """Save layout to database"""
    try:
        data = request.get_json()
        layout_id = Layout.create(
            name=data.get('name'),
            layout_type=data.get('type'),
            data=data.get('data'),
            customer_id=data.get('customer_id')
        )
        return jsonify({'success': True, 'id': layout_id}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@layout_bp.route('/check-duplicate', methods=['POST'])
def check_duplicate():
    """Check if a layout with the same customer+name already exists"""
    try:
        data = request.get_json()
        existing = Layout.find_by_customer_and_name(
            customer_id=data.get('customer_id'),
            name=data.get('name')
        )
        if existing:
            return jsonify({'success': True, 'exists': True, 'layout': existing}), 200
        return jsonify({'success': True, 'exists': False}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@layout_bp.route('/view', methods=['GET'])
def view_page():
    """Render layout list page"""
    return render_template('layout/view.html')

@layout_bp.route('/list', methods=['GET'])
def list_layouts():
    """Get all layouts as JSON with customer information"""
    try:
        layouts = Layout.get_all()
        # Add customer name for each layout
        for layout in layouts:
            if layout.get('customer_id'):
                from models.customer import Customer
                customer = Customer.get_by_id(layout['customer_id'])
                layout['customer_name'] = customer['company_name'] if customer else None
            else:
                layout['customer_name'] = None
        return jsonify({'success': True, 'layouts': layouts}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@layout_bp.route('/<layout_id>', methods=['GET'])
def get_layout(layout_id):
    """Get layout details"""
    try:
        layout = Layout.get_by_id(layout_id)
        if layout:
            return jsonify({'success': True, 'layout': layout}), 200
        else:
            return jsonify({'success': False, 'error': 'Layout not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@layout_bp.route('/<layout_id>', methods=['PUT'])
def update_layout(layout_id):
    """Update layout"""
    try:
        data = request.get_json()
        Layout.update(
            layout_id=layout_id,
            name=data.get('name'),
            data=data.get('data'),
            customer_id=data.get('customer_id')
        )
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@layout_bp.route('/<layout_id>', methods=['DELETE'])
def delete_layout(layout_id):
    """Delete layout"""
    try:
        Layout.delete(layout_id)
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400
