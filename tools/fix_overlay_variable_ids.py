"""Fix missing variableId for overlay variables in existing layouts"""
import sys
import os
import json
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from models.database import get_db

def fix_overlay_variable_ids():
    """Add variableId to all overlays that have isVariable but no variableId"""
    with get_db() as conn:
        # Get all layouts
        layouts = conn.execute("SELECT id, name, data FROM layouts").fetchall()

        fixed_count = 0
        for layout in layouts:
            layout_id = layout['id']
            layout_name = layout['name']
            data = json.loads(layout['data'])

            overlays = data.get('overlays', [])
            modified = False

            for i, ov in enumerate(overlays):
                if ov.get('isVariable') and not ov.get('variableId'):
                    # Assign a unique variableId
                    ov['variableId'] = f'ov_{i}_{int(time.time() * 1000)}'
                    modified = True
                    print(f"Layout {layout_id} ({layout_name}): Fixed overlay {i} - assigned variableId: {ov['variableId']}")

            if modified:
                # Update the layout
                conn.execute(
                    "UPDATE layouts SET data = ? WHERE id = ?",
                    (json.dumps(data), layout_id)
                )
                fixed_count += 1

        conn.commit()
        print(f"\nFixed {fixed_count} layouts")

if __name__ == '__main__':
    fix_overlay_variable_ids()
