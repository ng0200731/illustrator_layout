"""Models package"""
from models.database import init_db, get_db
from models.customer import Customer
from models.layout import Layout
from models.font import Font, init_fonts_table

# Initialize fonts table on import
init_fonts_table()

__all__ = ['init_db', 'get_db', 'Customer', 'Layout', 'Font']
