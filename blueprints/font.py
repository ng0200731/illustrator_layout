"""Font blueprint for font management routes"""
from flask import Blueprint, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
from models.font import Font
import os

font_bp = Blueprint('font', __name__, url_prefix='/font')

FONTS_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'fonts')
ALLOWED_EXTENSIONS = {'ttf', 'otf'}

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@font_bp.route('/manage', methods=['GET'])
def manage_page():
    """Render font management page"""
    return render_template('font/manage.html')

@font_bp.route('/upload-page', methods=['GET'])
def upload_page():
    """Render font upload page"""
    return render_template('font/upload.html')

@font_bp.route('/view', methods=['GET'])
def view_page():
    """Render font view page"""
    return render_template('font/view.html')

@font_bp.route('/test', methods=['GET'])
def test_page():
    """Render font test page"""
    return render_template('font/test.html')

@font_bp.route('/upload', methods=['POST'])
def upload_font():
    """Upload a font file"""
    try:
        if 'font' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['font']

        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400

        if not allowed_file(file.filename):
            return jsonify({'success': False, 'error': 'Only .ttf and .otf files are allowed'}), 400

        # Secure the filename
        filename = secure_filename(file.filename)

        # Get font name and customer from request
        font_name = request.form.get('font_name', filename.rsplit('.', 1)[0])
        customer_id = request.form.get('customer_id', None)
        if customer_id == '':
            customer_id = None

        # Check if same font already exists for this customer
        existing = Font.get_by_filename_and_customer(filename, customer_id)
        if existing:
            return jsonify({'success': False, 'error': 'This font is already assigned to this customer'}), 400

        # Save file (only if not already on disk)
        file_path = os.path.join(FONTS_FOLDER, filename)
        if not os.path.exists(file_path):
            file.save(file_path)

        # Save to database
        font_id = Font.create(font_name, filename, file_path, customer_id)

        return jsonify({
            'success': True,
            'font': {
                'id': font_id,
                'font_name': font_name,
                'filename': filename
            }
        }), 201

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@font_bp.route('/list', methods=['GET'])
def list_fonts():
    """Get all fonts"""
    try:
        fonts = Font.get_all()
        return jsonify({'success': True, 'fonts': fonts}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@font_bp.route('/list/<customer_id>', methods=['GET'])
def list_fonts_by_customer(customer_id):
    """Get fonts for a specific customer and public fonts"""
    try:
        fonts = Font.get_by_customer(customer_id)
        return jsonify({'success': True, 'fonts': fonts}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@font_bp.route('/<int:font_id>/rename', methods=['PUT'])
def rename_font(font_id):
    """Rename a font"""
    try:
        data = request.get_json()
        new_name = data.get('font_name', '').strip()
        if not new_name:
            return jsonify({'success': False, 'error': 'Font name is required'}), 400

        font = Font.get_by_id(font_id)
        if not font:
            return jsonify({'success': False, 'error': 'Font not found'}), 404

        Font.rename(font_id, new_name)
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@font_bp.route('/<int:font_id>', methods=['DELETE'])
def delete_font(font_id):
    """Delete a font"""
    try:
        font = Font.get_by_id(font_id)
        if not font:
            return jsonify({'success': False, 'error': 'Font not found'}), 404

        # Delete file
        if os.path.exists(font['file_path']):
            os.remove(font['file_path'])

        # Delete from database
        Font.delete(font_id)

        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@font_bp.route('/file/<int:font_id>', methods=['GET'])
def serve_font(font_id):
    """Serve a font file for browser use (no download)"""
    try:
        font = Font.get_by_id(font_id)
        if not font:
            return jsonify({'success': False, 'error': 'Font not found'}), 404

        return send_file(font['file_path'], mimetype='font/' + font['filename'].rsplit('.', 1)[-1].lower())
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@font_bp.route('/download/<int:font_id>', methods=['GET'])
def download_font(font_id):
    """Download a font file"""
    try:
        font = Font.get_by_id(font_id)
        if not font:
            return jsonify({'success': False, 'error': 'Font not found'}), 404

        return send_file(font['file_path'], as_attachment=True, download_name=font['filename'])
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
