"""Customer blueprint for customer management routes"""
from flask import Blueprint, render_template, request, jsonify
from models.customer import Customer

customer_bp = Blueprint('customer', __name__, url_prefix='/customer')

@customer_bp.route('/create', methods=['GET'])
def create_page():
    """Render customer creation form"""
    return render_template('customer/create.html')

@customer_bp.route('/create', methods=['POST'])
def create_customer():
    """Create a new customer"""
    try:
        data = request.get_json()
        customer_id = Customer.create(
            company_name=data.get('company_name'),
            email_domain=data.get('email_domain'),
            email=data.get('email'),
            phone=data.get('phone'),
            address=data.get('address'),
            notes=data.get('notes')
        )
        return jsonify({'success': True, 'customer_id': customer_id}), 201
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@customer_bp.route('/view', methods=['GET'])
def view_page():
    """Render customer list page"""
    return render_template('customer/view.html')

@customer_bp.route('/list', methods=['GET'])
def list_customers():
    """Get all customers as JSON"""
    try:
        customers = Customer.get_all()
        return jsonify({'success': True, 'customers': customers}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@customer_bp.route('/<customer_id>', methods=['GET'])
def get_customer(customer_id):
    """Get customer details"""
    try:
        customer = Customer.get_by_id(customer_id)
        if customer:
            return jsonify({'success': True, 'customer': customer}), 200
        else:
            return jsonify({'success': False, 'error': 'Customer not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@customer_bp.route('/<customer_id>', methods=['PUT'])
def update_customer(customer_id):
    """Update customer"""
    try:
        data = request.get_json()
        Customer.update(
            customer_id=customer_id,
            company_name=data.get('company_name'),
            email_domain=data.get('email_domain'),
            email=data.get('email'),
            phone=data.get('phone'),
            address=data.get('address'),
            notes=data.get('notes')
        )
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400

@customer_bp.route('/<customer_id>', methods=['DELETE'])
def delete_customer(customer_id):
    """Delete customer"""
    try:
        Customer.delete(customer_id)
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400
