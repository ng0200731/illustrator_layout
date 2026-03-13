"""Add sequence numbers to overlay variables in existing layouts"""
import sys
import os
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from models.database import get_db

def sort_overlays_by_spatial_position(overlays, indices):
    """Sort overlay indices by spatial position (top to bottom, left to right)"""
    def get_sort_key(idx):
        ov = overlays[idx]
        y = ov.get('y', 0)
        x = ov.get('x', 0)
        return (y, x)
    
    return sorted(indices, key=get_sort_key)

def fix_overlay_seq_numbers():
    """Add seq field to all overlays in components array"""
    with get_db() as conn:
        # Get all layouts
        layouts = conn.execute("SELECT id, name, data FROM layouts WHERE type = 'json'").fetchall()

        fixed_count = 0
        for layout in layouts:
            layout_id = layout['id']
            layout_name = layout['name']
            data = json.loads(layout['data'])

            overlays = data.get('overlays', [])
            components = data.get('components', [])
            
            if not overlays or not components:
                continue

            # Calculate sequence numbers (same logic as jRenderOverlayList)
            all_indices = list(range(len(overlays)))
            sorted_indices = sort_overlays_by_spatial_position(overlays, all_indices)
            
            display_number_map = {}
            for j, idx in enumerate(sorted_indices):
                display_number_map[idx] = j + 1

            # Update components array with seq numbers
            modified = False
            for idx, comp in enumerate(components):
                if idx < len(overlays):
                    seq = display_number_map.get(idx, idx + 1)
                    if comp.get('seq') != seq:
                        comp['seq'] = seq
                        modified = True

            if modified:
                # Update the layout
                conn.execute(
                    "UPDATE layouts SET data = ? WHERE id = ?",
                    (json.dumps(data), layout_id)
                )
                fixed_count += 1
                print(f"Layout {layout_id} ({layout_name}): Added sequence numbers to {len(components)} overlays")

        conn.commit()
        print(f"\nFixed {fixed_count} layouts")

if __name__ == '__main__':
    fix_overlay_seq_numbers()
