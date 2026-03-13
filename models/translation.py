"""Translation model for managing translation tables"""
from models.database import execute_query, get_db
import json

class Translation:
    @staticmethod
    def create(table_name, data, customer_id=None):
        """Create a new translation table"""
        query = '''
            INSERT INTO translations (table_name, data, customer_id)
            VALUES (?, ?, ?)
        '''
        data_json = json.dumps(data)
        return execute_query(query, (table_name, data_json, customer_id))

    @staticmethod
    def get_by_id(translation_id):
        """Get translation table by ID"""
        query = '''
            SELECT t.*, c.company_name as customer_name
            FROM translations t
            LEFT JOIN customers c ON t.customer_id = c.customer_id
            WHERE t.id = ?
        '''
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(query, (translation_id,))
            row = cursor.fetchone()
            if row:
                result = dict(row)
                result['data'] = json.loads(result['data'])
                return result
            return None

    @staticmethod
    def get_all():
        """Get all translation tables with customer name"""
        query = '''
            SELECT t.*, c.company_name as customer_name
            FROM translations t
            LEFT JOIN customers c ON t.customer_id = c.customer_id
            ORDER BY t.updated_at DESC
        '''
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(query)
            rows = cursor.fetchall()
            results = []
            for row in rows:
                result = dict(row)
                result['data'] = json.loads(result['data'])
                results.append(result)
            return results

    @staticmethod
    def get_by_customer(customer_id):
        """Get translation tables for a specific customer and public tables"""
        query = '''
            SELECT t.*, c.company_name as customer_name
            FROM translations t
            LEFT JOIN customers c ON t.customer_id = c.customer_id
            WHERE t.customer_id = ? OR t.customer_id IS NULL
            ORDER BY t.updated_at DESC
        '''
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(query, (customer_id,))
            rows = cursor.fetchall()
            results = []
            for row in rows:
                result = dict(row)
                result['data'] = json.loads(result['data'])
                results.append(result)
            return results

    @staticmethod
    def update(translation_id, data):
        """Update translation table data"""
        query = '''
            UPDATE translations
            SET data = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        '''
        data_json = json.dumps(data)
        execute_query(query, (data_json, translation_id))

    @staticmethod
    def rename(translation_id, new_name):
        """Rename a translation table"""
        query = '''
            UPDATE translations
            SET table_name = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        '''
        execute_query(query, (new_name, translation_id))

    @staticmethod
    def delete(translation_id):
        """Delete a translation table"""
        query = 'DELETE FROM translations WHERE id = ?'
        execute_query(query, (translation_id,))
