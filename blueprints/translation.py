"""Translation blueprint for translation table management routes"""
from flask import Blueprint, render_template, request, jsonify, send_file
from werkzeug.utils import secure_filename
from models.translation import Translation
import os
import tempfile

translation_bp = Blueprint('translation', __name__, url_prefix='/translation')

ALLOWED_EXTENSIONS = {'xlsx', 'xls'}

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@translation_bp.route('/create', methods=['GET'])
def create_page():
    """Render translation create page"""
    return render_template('translation/create.html')

@translation_bp.route('/view', methods=['GET'])
def view_page():
    """Render translation view page"""
    return render_template('translation/view.html')

@translation_bp.route('/upload', methods=['POST'])
def upload_excel():
    """Upload Excel file and return parsed data"""
    temp_path = None
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected'}), 400

        if not allowed_file(file.filename):
            return jsonify({'success': False, 'error': 'Only .xlsx and .xls files are allowed'}), 400

        # Save to temp file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
        temp_path = temp_file.name
        file.save(temp_path)
        temp_file.close()

        # Parse Excel
        from tools.excel_translation import parse_translation_excel
        data = parse_translation_excel(temp_path)

        # Clean up temp file
        try:
            os.unlink(temp_path)
        except:
            pass  # Ignore cleanup errors on Windows

        return jsonify({
            'success': True,
            'data': data
        }), 200

    except Exception as e:
        # Clean up temp file on error
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except:
                pass
        return jsonify({'success': False, 'error': str(e)}), 500

@translation_bp.route('/save', methods=['POST'])
def save_translation():
    """Save translation table"""
    try:
        data = request.get_json()
        table_name = data.get('table_name', '').strip()
        customer_id = data.get('customer_id', None)
        table_data = data.get('data')

        if not table_name:
            return jsonify({'success': False, 'error': 'Table name is required'}), 400

        if not table_data:
            return jsonify({'success': False, 'error': 'Table data is required'}), 400

        if customer_id == '':
            customer_id = None

        translation_id = Translation.create(table_name, table_data, customer_id)

        return jsonify({
            'success': True,
            'translation_id': translation_id
        }), 201

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@translation_bp.route('/list', methods=['GET'])
def list_translations():
    """Get all translation tables"""
    try:
        translations = Translation.get_all()
        return jsonify({'success': True, 'translations': translations}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@translation_bp.route('/list/<customer_id>', methods=['GET'])
def list_translations_by_customer(customer_id):
    """Get translation tables for a specific customer and public tables"""
    try:
        translations = Translation.get_by_customer(customer_id)
        return jsonify({'success': True, 'translations': translations}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@translation_bp.route('/<int:translation_id>', methods=['GET'])
def get_translation(translation_id):
    """Get single translation table"""
    try:
        translation = Translation.get_by_id(translation_id)
        if not translation:
            return jsonify({'success': False, 'error': 'Translation not found'}), 404

        return jsonify({'success': True, 'translation': translation}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@translation_bp.route('/<int:translation_id>/rename', methods=['PUT'])
def rename_translation(translation_id):
    """Rename a translation table"""
    try:
        data = request.get_json()
        new_name = data.get('table_name', '').strip()
        if not new_name:
            return jsonify({'success': False, 'error': 'Table name is required'}), 400

        translation = Translation.get_by_id(translation_id)
        if not translation:
            return jsonify({'success': False, 'error': 'Translation not found'}), 404

        Translation.rename(translation_id, new_name)
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@translation_bp.route('/<int:translation_id>', methods=['PUT'])
def update_translation(translation_id):
    """Update translation table data"""
    try:
        data = request.get_json()
        table_data = data.get('data')

        if not table_data:
            return jsonify({'success': False, 'error': 'Table data is required'}), 400

        translation = Translation.get_by_id(translation_id)
        if not translation:
            return jsonify({'success': False, 'error': 'Translation not found'}), 404

        Translation.update(translation_id, table_data)
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@translation_bp.route('/<int:translation_id>', methods=['DELETE'])
def delete_translation(translation_id):
    """Delete a translation table"""
    try:
        translation = Translation.get_by_id(translation_id)
        if not translation:
            return jsonify({'success': False, 'error': 'Translation not found'}), 404

        Translation.delete(translation_id)
        return jsonify({'success': True}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@translation_bp.route('/<int:translation_id>/export', methods=['GET'])
def export_translation(translation_id):
    """Export translation table to Excel"""
    try:
        translation = Translation.get_by_id(translation_id)
        if not translation:
            return jsonify({'success': False, 'error': 'Translation not found'}), 404

        # Create temp file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
        temp_file.close()

        # Export to Excel
        from tools.excel_translation import export_translation_excel
        export_translation_excel(translation['data'], temp_file.name)

        # Send file
        filename = f"{translation['table_name']}.xlsx"
        return send_file(temp_file.name, as_attachment=True, download_name=filename)

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
