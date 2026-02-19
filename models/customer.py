"""Customer model for database operations"""
from models.database import execute_query, get_db
import uuid
from datetime import datetime

class Customer:
    @staticmethod
    def generate_customer_id():
        """Generate unique customer ID"""
        return f"CUST-{uuid.uuid4().hex[:8].upper()}"

    @staticmethod
    def create(company_name, email_domain, email=None, phone=None, address=None, notes=None):
        """Create a new customer"""
        customer_id = Customer.generate_customer_id()
        query = '''
            INSERT INTO customers (customer_id, company_name, email_domain, email, phone, address, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        '''
        execute_query(query, (customer_id, company_name, email_domain, email, phone, address, notes))
        return customer_id

    @staticmethod
    def get_by_id(customer_id):
        """Get customer by ID"""
        query = 'SELECT * FROM customers WHERE customer_id = ?'
        row = execute_query(query, (customer_id,), fetch_one=True)
        return dict(row) if row else None

    @staticmethod
    def get_all():
        """Get all customers"""
        query = 'SELECT * FROM customers ORDER BY created_at DESC'
        rows = execute_query(query, fetch_all=True)
        return [dict(row) for row in rows]

    @staticmethod
    def update(customer_id, company_name=None, email_domain=None, email=None, phone=None, address=None, notes=None):
        """Update customer"""
        query = '''
            UPDATE customers
            SET company_name = COALESCE(?, company_name),
                email_domain = COALESCE(?, email_domain),
                email = COALESCE(?, email),
                phone = COALESCE(?, phone),
                address = COALESCE(?, address),
                notes = COALESCE(?, notes),
                updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = ?
        '''
        execute_query(query, (company_name, email_domain, email, phone, address, notes, customer_id))

    @staticmethod
    def delete(customer_id):
        """Delete customer"""
        query = 'DELETE FROM customers WHERE customer_id = ?'
        execute_query(query, (customer_id,))
