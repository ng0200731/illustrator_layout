"""Member model for database operations"""
import uuid
from models.database import execute_query

class Member:
    @staticmethod
    def generate_member_id():
        """Generate unique member ID"""
        return f"MEM-{uuid.uuid4().hex[:8].upper()}"

    @staticmethod
    def create(customer_id, name=None, title=None, email=None, phone=None):
        """Create a new member"""
        member_id = Member.generate_member_id()
        query = '''
            INSERT INTO members (member_id, customer_id, name, title, email, phone)
            VALUES (?, ?, ?, ?, ?, ?)
        '''
        execute_query(query, (member_id, customer_id, name, title, email, phone))
        return member_id

    @staticmethod
    def get_by_id(member_id):
        """Get member by ID"""
        query = 'SELECT * FROM members WHERE member_id = ?'
        row = execute_query(query, (member_id,), fetch_one=True)
        return dict(row) if row else None

    @staticmethod
    def get_by_customer(customer_id):
        """Get all members for a customer"""
        query = 'SELECT * FROM members WHERE customer_id = ? ORDER BY created_at'
        rows = execute_query(query, (customer_id,), fetch_all=True)
        return [dict(row) for row in rows] if rows else []

    @staticmethod
    def get_all():
        """Get all members"""
        query = 'SELECT * FROM members ORDER BY created_at DESC'
        rows = execute_query(query, fetch_all=True)
        return [dict(row) for row in rows] if rows else []

    @staticmethod
    def update(member_id, name=None, title=None, email=None, phone=None):
        """Update member information"""
        query = '''
            UPDATE members
            SET name = ?, title = ?, email = ?, phone = ?, updated_at = CURRENT_TIMESTAMP
            WHERE member_id = ?
        '''
        execute_query(query, (name, title, email, phone, member_id))

    @staticmethod
    def delete(member_id):
        """Delete member"""
        query = 'DELETE FROM members WHERE member_id = ?'
        execute_query(query, (member_id,))
