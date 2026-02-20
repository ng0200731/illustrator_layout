"""Layout model for database operations"""
from models.database import execute_query, get_db
import json

class Layout:
    @staticmethod
    def create(name, layout_type, data, customer_id=None):
        """Create a new layout"""
        data_json = json.dumps(data) if isinstance(data, (dict, list)) else data
        query = '''
            INSERT INTO layouts (customer_id, name, type, data)
            VALUES (?, ?, ?, ?)
        '''
        layout_id = execute_query(query, (customer_id, name, layout_type, data_json))
        return layout_id

    @staticmethod
    def get_by_id(layout_id):
        """Get layout by ID"""
        query = 'SELECT * FROM layouts WHERE id = ?'
        row = execute_query(query, (layout_id,), fetch_one=True)
        if row:
            layout = dict(row)
            # Parse JSON data
            if layout['data']:
                try:
                    layout['data'] = json.loads(layout['data'])
                except:
                    pass
            return layout
        return None

    @staticmethod
    def get_all():
        """Get all layouts"""
        query = 'SELECT * FROM layouts ORDER BY created_at DESC'
        rows = execute_query(query, fetch_all=True)
        layouts = []
        for row in rows:
            layout = dict(row)
            # Don't parse data for list view (performance)
            layouts.append(layout)
        return layouts

    @staticmethod
    def get_by_customer(customer_id):
        """Get layouts by customer ID"""
        query = 'SELECT * FROM layouts WHERE customer_id = ? ORDER BY created_at DESC'
        rows = execute_query(query, (customer_id,), fetch_all=True)
        return [dict(row) for row in rows]

    @staticmethod
    def find_by_customer_and_name(customer_id, name):
        """Find layout by customer ID and name"""
        query = 'SELECT id, name, customer_id, type, created_at, updated_at FROM layouts WHERE customer_id = ? AND name = ?'
        row = execute_query(query, (customer_id, name), fetch_one=True)
        return dict(row) if row else None

    @staticmethod
    def update(layout_id, name=None, data=None, customer_id=None):
        """Update layout"""
        data_json = json.dumps(data) if data and isinstance(data, (dict, list)) else data
        query = '''
            UPDATE layouts
            SET name = COALESCE(?, name),
                data = COALESCE(?, data),
                customer_id = COALESCE(?, customer_id),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        '''
        execute_query(query, (name, data_json, customer_id, layout_id))

    @staticmethod
    def delete(layout_id):
        """Delete layout"""
        query = 'DELETE FROM layouts WHERE id = ?'
        execute_query(query, (layout_id,))
