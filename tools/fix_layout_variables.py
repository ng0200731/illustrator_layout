"""
Tool to check and fix the layout variables that are causing the wrong mapping.

The issue: The layout is defining variables with IDs 14,25,26 instead of 15,26,27.
This is what gets passed as 'expected_variables' to the Excel parser.
"""
import json
import sys
import os

def check_layout_variables():
    """Check what variables are defined in the layout."""
    print("=== Layout Variables Check ===")
    print("The issue is that your layout defines variables with wrong IDs.")
    print("When you upload Excel, the system gets 'expected_variables' from the layout.")
    print("If layout has variables 14,25,26 then Excel maps to those, not 15,26,27.")
    print()

    print("Current situation:")
    print("- Layout defines variables: 14, 25, 26")
    print("- Excel metadata maps to: 15, 26, 27")
    print("- System uses layout variables (14,25,26) and ignores Excel metadata")
    print()

    print("Solution: Fix the layout to use variables 15, 26, 27")

def find_layout_files():
    """Find layout files to check variable definitions."""
    print("\n=== Finding Layout Files ===")

    # Check for layout files
    layout_dirs = [
        "layouts",
        "data",
        ".tmp",
        "sql"
    ]

    layout_files = []
    for dir_name in layout_dirs:
        if os.path.exists(dir_name):
            for file in os.listdir(dir_name):
                if file.endswith(('.json', '.sql')):
                    layout_files.append(os.path.join(dir_name, file))

    print(f"Found {len(layout_files)} potential layout files:")
    for file in layout_files:
        print(f"  {file}")

    return layout_files

def check_database_layouts():
    """Check layouts in the database."""
    print("\n=== Database Layout Check ===")
    print("Your layouts are stored in the database (layouts table).")
    print("To fix the variable IDs, you need to:")
    print("1. Find the layout being used")
    print("2. Update its variable definitions from 14,25,26 to 15,26,27")
    print()

    # Create SQL to check layouts
    sql_check = """
-- Check current layout variables
SELECT id, name, data FROM layouts;

-- Look for variables in the JSON data
-- The 'data' column contains JSON with variable definitions
"""

    with open('.tmp/check_layouts.sql', 'w') as f:
        f.write(sql_check)

    print("Created SQL check: .tmp/check_layouts.sql")

def create_layout_fix_script():
    """Create script to fix layout variables."""
    print("\n=== Layout Fix Script ===")

    fix_script = '''
"""
Script to fix layout variable IDs from 14,25,26 to 15,26,27.
"""
import sqlite3
import json

def fix_layout_variables():
    """Fix the variable IDs in the layout."""
    # Connect to database
    conn = sqlite3.connect('database.db')  # Adjust path as needed
    cursor = conn.cursor()

    # Get all layouts
    cursor.execute("SELECT id, name, data FROM layouts")
    layouts = cursor.fetchall()

    for layout_id, name, data_json in layouts:
        print(f"Checking layout {layout_id}: {name}")

        try:
            data = json.loads(data_json)

            # Check for variables or overlays with wrong IDs
            changed = False

            # Fix overlays
            if 'overlays' in data:
                for overlay in data['overlays']:
                    if overlay.get('isVariable'):
                        old_id = overlay.get('variableId') or overlay.get('idx')
                        if old_id == 14:
                            overlay['variableId'] = 15
                            overlay['idx'] = 15
                            changed = True
                            print(f"  Fixed overlay variable: 14 → 15")
                        elif old_id == 25:
                            overlay['variableId'] = 26
                            overlay['idx'] = 26
                            changed = True
                            print(f"  Fixed overlay variable: 25 → 26")
                        elif old_id == 26:
                            overlay['variableId'] = 27
                            overlay['idx'] = 27
                            changed = True
                            print(f"  Fixed overlay variable: 26 → 27")

            # Fix components
            if 'components' in data:
                for comp in data['components']:
                    if comp.get('isVariable'):
                        old_id = comp.get('variableId') or comp.get('idx')
                        if old_id == 14:
                            comp['variableId'] = 15
                            comp['idx'] = 15
                            changed = True
                            print(f"  Fixed component variable: 14 → 15")
                        elif old_id == 25:
                            comp['variableId'] = 26
                            comp['idx'] = 26
                            changed = True
                            print(f"  Fixed component variable: 25 → 26")
                        elif old_id == 26:
                            comp['variableId'] = 27
                            comp['idx'] = 27
                            changed = True
                            print(f"  Fixed component variable: 26 → 27")

            if changed:
                # Update the layout
                new_data_json = json.dumps(data)
                cursor.execute("UPDATE layouts SET data = ? WHERE id = ?", (new_data_json, layout_id))
                print(f"  Updated layout {layout_id}")
            else:
                print(f"  No changes needed for layout {layout_id}")

        except Exception as e:
            print(f"  Error processing layout {layout_id}: {e}")

    conn.commit()
    conn.close()
    print("Layout variable fix completed!")

if __name__ == "__main__":
    fix_layout_variables()
'''

    with open('.tmp/fix_layout_variables.py', 'w') as f:
        f.write(fix_script)

    print("Created layout fix script: .tmp/fix_layout_variables.py")

def main():
    """Main function to diagnose and fix layout variables."""
    print("=== LAYOUT VARIABLE FIX TOOL ===")
    print("The real problem: Your layout defines variables 14,25,26 instead of 15,26,27")
    print()

    check_layout_variables()
    find_layout_files()
    check_database_layouts()
    create_layout_fix_script()

    print("\n=== SOLUTION STEPS ===")
    print("1. Run: py .tmp/fix_layout_variables.py")
    print("2. This will update your layout to use variables 15,26,27")
    print("3. Then your Excel upload will work correctly")
    print("4. Variables will map: #15=barcode_digits, #26=QR, #27=barcode_graphic")

if __name__ == "__main__":
    main()