from flask import Flask, render_template, request, send_file, jsonify
import json
import os
import sys

# Import models and blueprints
from models import init_db
from blueprints.customer import customer_bp
from blueprints.layout import layout_bp

app = Flask(__name__)

# Ensure .tmp directory exists
os.makedirs('.tmp', exist_ok=True)

# Initialize database
init_db()

# Register blueprints
app.register_blueprint(customer_bp)
app.register_blueprint(layout_bp)

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

        # Debug: Print what we received
        print(f"DEBUG Flask: outlined={outlined}, separateInvisible={data.get('separateInvisible', False)}")

        # Import export tool
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'tools'))
        from export_ai import export_ai as generate_ai

        # Generate AI file (data already contains separateInvisible)
        filepath = generate_ai(data, outlined)

        return send_file(filepath, as_attachment=True, download_name='export.ai')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5001)
