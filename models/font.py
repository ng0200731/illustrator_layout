"""Font model for managing uploaded fonts"""
from models.database import execute_query, get_db
import sqlite3

def init_fonts_table():
    """Create fonts table if it doesn't exist, and migrate if needed"""
    from models.database import get_db

    with get_db() as conn:
        cursor = conn.cursor()

        # Check if table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='fonts'")
        table_exists = cursor.fetchone()

        if table_exists:
            # Check if we need to migrate (old table has UNIQUE on filename alone)
            cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='fonts'")
            create_sql = cursor.fetchone()[0]

            needs_migrate = 'filename TEXT UNIQUE' in create_sql

            if needs_migrate:
                # Recreate table without the UNIQUE constraint
                cursor.execute('ALTER TABLE fonts RENAME TO fonts_old')
                cursor.execute('''
                    CREATE TABLE fonts (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        font_name TEXT NOT NULL,
                        filename TEXT NOT NULL,
                        file_path TEXT NOT NULL,
                        customer_id TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                ''')
                cursor.execute('''
                    INSERT INTO fonts (id, font_name, filename, file_path, customer_id, created_at)
                    SELECT id, font_name, filename, file_path, customer_id, created_at
                    FROM fonts_old
                ''')
                cursor.execute('DROP TABLE fonts_old')
                conn.commit()
            else:
                # Just ensure customer_id column exists
                cursor.execute("PRAGMA table_info(fonts)")
                columns = [row[1] for row in cursor.fetchall()]
                if 'customer_id' not in columns:
                    cursor.execute("ALTER TABLE fonts ADD COLUMN customer_id TEXT")
                    conn.commit()
        else:
            cursor.execute('''
                CREATE TABLE fonts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    font_name TEXT NOT NULL,
                    filename TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    customer_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            conn.commit()

class Font:
    @staticmethod
    def create(font_name, filename, file_path, customer_id=None):
        """Create a new font record"""
        query = '''
            INSERT INTO fonts (font_name, filename, file_path, customer_id)
            VALUES (?, ?, ?, ?)
        '''
        return execute_query(query, (font_name, filename, file_path, customer_id))

    @staticmethod
    def get_all():
        """Get all fonts with customer name"""
        query = '''
            SELECT f.*, c.company_name as customer_name
            FROM fonts f
            LEFT JOIN customers c ON f.customer_id = c.customer_id
            ORDER BY f.created_at DESC
        '''
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
    def get_by_filename_and_customer(filename, customer_id):
        """Get font by filename and customer_id"""
        if customer_id:
            query = 'SELECT * FROM fonts WHERE filename = ? AND customer_id = ?'
            params = (filename, customer_id)
        else:
            query = 'SELECT * FROM fonts WHERE filename = ? AND customer_id IS NULL'
            params = (filename,)
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
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
    def rename(font_id, new_name):
        """Rename a font"""
        query = 'UPDATE fonts SET font_name = ? WHERE id = ?'
        execute_query(query, (new_name, font_id))

    @staticmethod
    def delete(font_id):
        """Delete a font"""
        query = 'DELETE FROM fonts WHERE id = ?'
        execute_query(query, (font_id,))
