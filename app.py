from flask import Flask, render_template, request, send_file, jsonify
import json
import os
import sys

# Import models and blueprints
from models import init_db
from blueprints.customer import customer_bp
from blueprints.layout import layout_bp
from blueprints.font import font_bp
from blueprints.order import order_bp

app = Flask(__name__)

# Ensure .tmp and fonts directories exist
os.makedirs('.tmp', exist_ok=True)
os.makedirs('fonts', exist_ok=True)

# Initialize database
init_db()

# Register blueprints
app.register_blueprint(customer_bp)
app.register_blueprint(layout_bp)
app.register_blueprint(font_bp)
app.register_blueprint(order_bp)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/export/pdf', methods=['POST'])
def export_pdf():
    try:
        data = request.get_json()

        # Import export tool
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'tools'))
        from export_pdf import export_pdf as generate_pdf

        # Generate PDF
        filepath = generate_pdf(data)

        return send_file(filepath, as_attachment=True, download_name='export.pdf')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/export/ai', methods=['POST'])
def export_ai():
    try:
        data = request.get_json()
        outlined = data.get('outlined', False)

        # Import export tool (reload to pick up changes)
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'tools'))
        import importlib
        import export_ai as _export_ai_mod
        importlib.reload(_export_ai_mod)
        generate_ai = _export_ai_mod.export_ai

        # Generate AI file (data already contains separateInvisible)
        filepath = generate_ai(data, outlined)

        return send_file(filepath, as_attachment=True, download_name='export.ai')
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/export/ai/batch', methods=['POST'])
def export_ai_batch():
    try:
        data = request.get_json()
        pages = data.get('pages', [])
        outlined = data.get('outlined', False)

        if not pages:
            return jsonify({'error': 'No pages provided'}), 400

        for p in pages:
            p['outlined'] = outlined
            p['separateInvisible'] = True

        sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'tools'))
        import importlib
        import export_ai as _export_ai_mod
        importlib.reload(_export_ai_mod)

        filepath = _export_ai_mod.export_ai_batch(pages, outlined)

        return send_file(filepath, as_attachment=True, download_name='export_all.ai')
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)
