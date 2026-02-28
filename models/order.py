"""Order model for database operations"""
from models.database import execute_query, get_db
import json
import copy
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from tools.flatten_tree import flatten_layout_for_export


class Order:
    @staticmethod
    def _next_order_id():
        row = execute_query(
            "SELECT order_id FROM orders ORDER BY id DESC LIMIT 1",
            fetch_one=True
        )
        if row:
            num = int(dict(row)['order_id'].split('-')[1]) + 1
        else:
            num = 1
        return f"ORD-{num:05d}"

    @staticmethod
    def create(customer_id, po_number):
        order_id = Order._next_order_id()
        execute_query(
            "INSERT INTO orders (order_id, customer_id, po_number) VALUES (?, ?, ?)",
            (order_id, customer_id, po_number)
        )
        return order_id

    @staticmethod
    def get_all():
        rows = execute_query(
            """SELECT o.*, c.company_name
               FROM orders o
               JOIN customers c ON c.customer_id = o.customer_id
               ORDER BY o.created_at DESC""",
            fetch_all=True
        )
        return [dict(r) for r in rows]

    @staticmethod
    def get_by_id(order_id):
        order = execute_query(
            """SELECT o.*, c.company_name
               FROM orders o
               JOIN customers c ON c.customer_id = o.customer_id
               WHERE o.order_id = ?""",
            (order_id,), fetch_one=True
        )
        if not order:
            return None
        lines = execute_query(
            """SELECT ol.*, l.name as layout_name, l.type as layout_type
               FROM order_lines ol
               JOIN layouts l ON l.id = ol.layout_id
               WHERE ol.order_id = ?""",
            (order_id,), fetch_all=True
        )
        return {"order": dict(order), "lines": [dict(l) for l in lines]}

    @staticmethod
    def add_line(order_id, layout_id, quantity, variable_values=None):
        vv_json = json.dumps(variable_values) if variable_values else None
        execute_query(
            "INSERT INTO order_lines (order_id, layout_id, quantity, variable_values) VALUES (?, ?, ?, ?)",
            (order_id, layout_id, quantity, vv_json)
        )

    @staticmethod
    def delete(order_id):
        execute_query("DELETE FROM order_lines WHERE order_id = ?", (order_id,))
        execute_query("DELETE FROM orders WHERE order_id = ?", (order_id,))

    @staticmethod
    def generate_layout_data(layout_id, variable_values):
        row = execute_query("SELECT data FROM layouts WHERE id = ?", (layout_id,), fetch_one=True)
        if not row:
            return None
        layout_data = json.loads(dict(row)['data'])
        data = copy.deepcopy(layout_data)
        if variable_values:
            # Apply variable values to components (overlay-only, for variable indexing)
            for idx, comp in enumerate(data.get('components', [])):
                if comp.get('isVariable'):
                    idx_key = str(idx)
                    if idx_key in variable_values:
                        comp['content'] = variable_values[idx_key]
            # Apply to overlays (source of truth for export flattening)
            for idx, ov in enumerate(data.get('overlays', [])):
                if ov.get('isVariable'):
                    idx_key = str(idx)
                    if idx_key in variable_values:
                        ov['content'] = variable_values[idx_key]
        # Build full export-ready payload (flattened tree + overlays with variables applied)
        data['exportPayload'] = flatten_layout_for_export(data)
        return data

    @staticmethod
    def generate_and_store(order_id):
        # Read lines and generate data first (separate connections for reads)
        with get_db() as conn:
            lines = conn.execute(
                "SELECT id, layout_id, variable_values FROM order_lines WHERE order_id = ?",
                (order_id,)
            ).fetchall()
            lines = [dict(l) for l in lines]

        generated_pairs = []
        for line in lines:
            vv = json.loads(line['variable_values']) if line['variable_values'] else {}
            generated = Order.generate_layout_data(line['layout_id'], vv)
            generated_pairs.append((json.dumps(generated), line['id']))

        # Write all updates in one connection
        with get_db() as conn:
            for gen_json, line_id in generated_pairs:
                conn.execute(
                    "UPDATE order_lines SET generated_data = ? WHERE id = ?",
                    (gen_json, line_id)
                )
            conn.execute(
                "UPDATE orders SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE order_id = ?",
                (order_id,)
            )
            conn.commit()
