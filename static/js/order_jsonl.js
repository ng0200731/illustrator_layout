/**
 * JSONL File Upload and Display
 */

(function() {
    'use strict';

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    function init() {
        setupFileUpload();
    }

    function setupFileUpload() {
        const uploadArea = document.getElementById('jsonl-upload-area');
        const fileInput = document.getElementById('jsonl-file-input');

        if (!uploadArea || !fileInput) return;

        // Click to browse
        uploadArea.addEventListener('click', function() {
            fileInput.click();
        });

        // File input change
        fileInput.addEventListener('change', function(e) {
            if (e.target.files.length > 0) {
                handleFileUpload(e.target.files[0]);
            }
        });

        // Drag and drop
        uploadArea.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', function(e) {
            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            uploadArea.classList.remove('dragover');

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileUpload(files[0]);
            }
        });
    }

    function handleFileUpload(file) {
        // Validate file type
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.jsonl') && !fileName.endsWith('.json')) {
            showMessage('Please select a .jsonl or .json file', 'error');
            return;
        }

        // Show loading message
        showMessage('Uploading and parsing file...', 'info');

        // Create FormData and upload
        const formData = new FormData();
        formData.append('file', file);

        fetch('/order/api/jsonl/parse', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showMessage('File parsed successfully', 'success');
                displayResults(data.rows);
            } else {
                showMessage(data.error || 'Failed to parse file', 'error');
            }
        })
        .catch(error => {
            console.error('Upload error:', error);
            showMessage('Error uploading file: ' + error.message, 'error');
        });
    }

    function displayResults(rows) {
        const resultsSection = document.getElementById('jsonl-results');
        const tableContainer = document.getElementById('jsonl-table-container');

        if (!resultsSection || !tableContainer) return;

        if (!rows || rows.length === 0) {
            tableContainer.innerHTML = '<p>No data found in file</p>';
            resultsSection.style.display = 'block';
            return;
        }

        // Group rows by label type
        const groupedRows = {};
        rows.forEach(function(row) {
            const labelType = row.label_type || 'GI001BAW';
            if (!groupedRows[labelType]) {
                groupedRows[labelType] = [];
            }
            groupedRows[labelType].push(row);
        });

        // Build HTML with collapsible sections for each label type
        let html = '';

        Object.keys(groupedRows).forEach(function(labelType) {
            const labelRows = groupedRows[labelType];

            html += '<div class="label-type-section">';
            html += '<h3 class="label-type-header" onclick="toggleLabelSection(this)">';
            html += '<span class="toggle-icon">▼</span> ' + labelType + ' (' + labelRows.length + ' rows)';
            html += '</h3>';
            html += '<div class="label-type-content">';
            html += '<table class="data-table">';
            html += '<thead><tr>';

            if (labelType === 'GI001BAW' || labelType === 'GI000PRO') {
                html += '<th>Label ID</th>';
                html += '<th>Vendor</th>';
                html += '<th>Order ID</th>';
                html += '<th>Item Qty</th>';
                html += '<th>Product Type</th>';
                html += '<th>Line</th>';
                html += '<th>Age</th>';
                html += '<th>Gender</th>';
                html += '<th>Ref (First 4)</th>';
                html += '<th>Ref (Last 4)</th>';
                html += '<th>Color</th>';
                html += '<th>Size</th>';
                html += '<th>Full Product</th>';
            } else if (labelType === 'ADHEDIST') {
                html += '<th>Label ID</th>';
                html += '<th>Supplier Code</th>';
                html += '<th>Order ID</th>';
                html += '<th>Total Size Pack Qty</th>';
                html += '<th>Ref (First 4)</th>';
                html += '<th>Ref (Last 4)</th>';
                html += '<th>Color</th>';
                html += '<th>Size Barcode</th>';
                html += '<th>Product Type</th>';
                html += '<th>Line</th>';
                html += '<th>Age</th>';
                html += '<th>Gender</th>';
                html += '<th>Size</th>';
                html += '<th>Size Pack Qty</th>';
                html += '<th>Country Origin</th>';
                html += '<th>Product Type Full</th>';
                html += '<th>Iconic</th>';
            } else if (labelType === 'PVP002XG') {
                html += '<th>Label ID</th>';
                html += '<th>Supplier Code</th>';
                html += '<th>Order ID</th>';
                html += '<th>Item Qty</th>';
                html += '<th>Product Type</th>';
                html += '<th>Line</th>';
                html += '<th>Iconic</th>';
                html += '<th>Reference ID</th>';
                html += '<th>Style ID</th>';
                html += '<th>Color</th>';
                html += '<th>Product Type (dup)</th>';
                html += '<th>DE Code</th>';
                html += '<th>EAN13</th>';
                html += '<th>Size Name</th>';
                html += '<th>Size IT</th>';
                html += '<th>Size UK</th>';
                html += '<th>Size US</th>';
                html += '<th>Size MX</th>';
                html += '<th>Size CN</th>';
                html += '<th>Product Type ES</th>';
            }

            html += '</tr></thead>';
            html += '<tbody>';

            labelRows.forEach(function(row) {
                html += '<tr>';

                if (labelType === 'GI001BAW' || labelType === 'GI000PRO') {
                    html += '<td>' + escapeHtml(row.label_id || '') + '</td>';
                    html += '<td>' + escapeHtml(row.vendor || '') + '</td>';
                    html += '<td>' + escapeHtml(row.order_id || '') + '</td>';
                    html += '<td>' + escapeHtml(row.item_qty || '') + '</td>';
                    html += '<td>' + escapeHtml(row.product_type || '') + '</td>';
                    html += '<td>' + escapeHtml(row.line || '') + '</td>';
                    html += '<td>' + escapeHtml(row.age || '') + '</td>';
                    html += '<td>' + escapeHtml(row.gender || '') + '</td>';
                    html += '<td>' + escapeHtml(row.ref_first_4 || '') + '</td>';
                    html += '<td>' + escapeHtml(row.ref_last_4 || '') + '</td>';
                    html += '<td>' + escapeHtml(row.color || '') + '</td>';
                    html += '<td>' + escapeHtml(row.size || '') + '</td>';
                    html += '<td>' + escapeHtml(row.full_product || '') + '</td>';
                } else if (labelType === 'ADHEDIST') {
                    html += '<td>' + escapeHtml(row.label_id || '') + '</td>';
                    html += '<td>' + escapeHtml(row.supplier_code || '') + '</td>';
                    html += '<td>' + escapeHtml(row.order_id || '') + '</td>';
                    html += '<td>' + escapeHtml(row.total_size_pack_qty || '') + '</td>';
                    html += '<td>' + escapeHtml(row.ref_first_4 || '') + '</td>';
                    html += '<td>' + escapeHtml(row.ref_last_4 || '') + '</td>';
                    html += '<td>' + escapeHtml(row.color || '') + '</td>';
                    html += '<td>' + escapeHtml(row.size_barcode || '') + '</td>';
                    html += '<td>' + escapeHtml(row.product_type || '') + '</td>';
                    html += '<td>' + escapeHtml(row.line || '') + '</td>';
                    html += '<td>' + escapeHtml(row.age || '') + '</td>';
                    html += '<td>' + escapeHtml(row.gender || '') + '</td>';
                    html += '<td>' + escapeHtml(row.size || '') + '</td>';
                    html += '<td>' + escapeHtml(row.size_pack_qty || '') + '</td>';
                    html += '<td>' + escapeHtml(row.country_origin || '') + '</td>';
                    html += '<td>' + escapeHtml(row.product_type_full || '') + '</td>';
                    html += '<td>' + escapeHtml(row.iconic || '') + '</td>';
                } else if (labelType === 'PVP002XG') {
                    html += '<td>' + escapeHtml(row.label_id || '') + '</td>';
                    html += '<td>' + escapeHtml(row.supplier_code || '') + '</td>';
                    html += '<td>' + escapeHtml(row.order_id || '') + '</td>';
                    html += '<td>' + escapeHtml(row.item_qty || '') + '</td>';
                    html += '<td>' + escapeHtml(row.product_type || '') + '</td>';
                    html += '<td>' + escapeHtml(row.line || '') + '</td>';
                    html += '<td>' + escapeHtml(row.iconic || '') + '</td>';
                    html += '<td>' + escapeHtml(row.reference_id || '') + '</td>';
                    html += '<td>' + escapeHtml(row.style_id || '') + '</td>';
                    html += '<td>' + escapeHtml(row.color || '') + '</td>';
                    html += '<td>' + escapeHtml(row.product_type_dup || '') + '</td>';
                    html += '<td>' + escapeHtml(row.de_code || '') + '</td>';
                    html += '<td>' + escapeHtml(row.ean13 || '') + '</td>';
                    html += '<td>' + escapeHtml(row.size_name || '') + '</td>';
                    html += '<td>' + escapeHtml(row.size_name_it || '') + '</td>';
                    html += '<td>' + escapeHtml(row.size_name_uk || '') + '</td>';
                    html += '<td>' + escapeHtml(row.size_name_us || '') + '</td>';
                    html += '<td>' + escapeHtml(row.size_name_mx || '') + '</td>';
                    html += '<td>' + escapeHtml(row.size_name_cn || '') + '</td>';
                    html += '<td>' + escapeHtml(row.product_type_es || '') + '</td>';
                }

                html += '</tr>';
            });

            html += '</tbody></table>';
            html += '</div>';
            html += '</div>';
        });

        tableContainer.innerHTML = html;
        resultsSection.style.display = 'block';
    }

    // Toggle label section visibility
    window.toggleLabelSection = function(header) {
        const content = header.nextElementSibling;
        const icon = header.querySelector('.toggle-icon');

        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.textContent = '▼';
        } else {
            content.style.display = 'none';
            icon.textContent = '▶';
        }
    };

    function showMessage(message, type) {
        const messageEl = document.getElementById('jsonl-upload-message');
        if (!messageEl) return;

        messageEl.textContent = message;
        messageEl.className = 'message message-' + type;
        messageEl.style.display = 'block';

        // Auto-hide success messages after 3 seconds
        if (type === 'success') {
            setTimeout(function() {
                messageEl.style.display = 'none';
            }, 3000);
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
})();
