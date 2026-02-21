"""Font model for managing uploaded fonts"""
from models.database import execute_query, get_db
import sqlite3

def init_fonts_table():
    """Create fonts table if it doesn't exist"""
    query = '''
        CREATE TABLE IF NOT EXISTS fonts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            font_name TEXT NOT NULL,
            filename TEXT UNIQUE NOT NULL,
            file_path TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    '''
    execute_query(query)

class Font:
    @staticmethod
    def create(font_name, filename, file_path):
        """Create a new font record"""
        query = '''
            INSERT INTO fonts (font_name, filename, file_path)
            VALUES (?, ?, ?)
        '''
        return execute_query(query, (font_name, filename, file_path))

    @staticmethod
    def get_all():
        """Get all fonts"""
        query = 'SELECT * FROM fonts ORDER BY created_at DESC'
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(query)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]

    @staticmethod
    def get_by_id(font_id):
        """Get font by ID"""
        query = 'SELECT * FROM fonts WHERE id = ?'
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(query, (font_id,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def get_by_filename(filename):
        """Get font by filename"""
        query = 'SELECT * FROM fonts WHERE filename = ?'
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(query, (filename,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def get_by_name(font_name):
        """Get font by name"""
        query = 'SELECT * FROM fonts WHERE font_name = ?'
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(query, (font_name,))
            row = cursor.fetchone()
            return dict(row) if row else None

    @staticmethod
    def delete(font_id):
        """Delete a font"""
        query = 'DELETE FROM fonts WHERE id = ?'
        execute_query(query, (font_id,))
