#!/usr/bin/env python3
"""Check what's stored in the order database"""

import json
import sys
import os

# Add the project root to the path
sys.path.insert(0, os.path.dirname(__file__))

from models.database import execute_query

def check_order_data():
    # Get order details
    order = execute_query("SELECT * FROM orders WHERE order_id = 'ORD-00046'", fetch_one=True)
    if order:
        order_dict = dict(order)
        print("Order found:")
        print(f"  ID: {order_dict.get('order_id')}")
        print(f"  Customer: {order_dict.get('customer_id')}")
        print(f"  Layout: {order_dict.get('layout_id')}")
        print()

    # Get order lines
    lines = execute_query("SELECT * FROM order_lines WHERE order_id = 'ORD-00046'", fetch_all=True)

    for i, line in enumerate(lines):
        line_dict = dict(line)
        print(f"Line {i+1}:")
        print(f"  Layout ID: {line_dict.get('layout_id')}")
        print(f"  Quantity: {line_dict.get('quantity')}")

        # Parse variable values
        vv_json = line_dict.get('variable_values')
        if vv_json:
            vv = json.loads(vv_json)
            print(f"  Variable Values: {vv}")
        else:
            print("  No variable values")
        print()

    # Get layout data
    if lines:
        layout_id = dict(lines[0]).get('layout_id')
        layout_row = execute_query("SELECT data FROM layouts WHERE id = ?", (layout_id,), fetch_one=True)
        if layout_row:
            layout_data = json.loads(dict(layout_row)['data'])
            print("Layout components with variables:")

            for comp in layout_data.get('components', []):
                if comp.get('isVariable'):
                    print(f"  Component: {comp.get('type')} - Variable ID: {comp.get('variableId')} - Content: {comp.get('content')}")

            for ov in layout_data.get('overlays', []):
                if ov.get('isVariable'):
                    print(f"  Overlay: {ov.get('type')} - Variable ID: {ov.get('variableId')} - Content: {ov.get('content')}")

if __name__ == "__main__":
    check_order_data()