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
        setupPreviewClose();
    }

    function setupPreviewClose() {
        var closeBtn = document.getElementById('btn-close-preview-modal');
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                var modal = document.getElementById('preview-modal');
                if (modal) modal.style.display = 'none';
            });
        }
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
        window._lastParsedRows = rows; // Store for preview
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
                html += '<th style="width:40px;">Preview</th>';
                html += '<th>1 ITEM DATATQTY<br><small>StyleColor[0].ItemData[#].itemQty</small></th>';
                html += '<th>2 Code of order<br><small>LabelOrder.Id</small></th>';
                html += '<th>3 FAM CODE<br><small>StyleColor[0].ProductTypeCodeLegacy</small></th>';
                html += '<th>4.0 FAM LINE DESCRIPTION<br><small>StyleColor[0].Line</small></th>';
                html += '<th>4.1 FAM LINE DESCRIPTION<br><small>StyleColor[0].Age</small></th>';
                html += '<th>4.2 FAM LINE DESCRIPTION<br><small>StyleColor[0].Gender</small></th>';
                html += '<th>5.1 Reference number (First 4)<br><small>StyleColor[0].ReferenceID (first 4)</small></th>';
                html += '<th>5.2 Reference number (Last 4)<br><small>StyleColor[0].ReferenceID (last 4)</small></th>';
                html += '<th>6 The colour of the garment<br><small>StyleColor[0].MangoColorCode + ":" + StyleColor[0].Color</small></th>';
                html += '<th>7 Size: EUR<br><small>StyleColor[0].ItemData[#].SizeNameES</small></th>';
                html += '<th>8 Family+Generic+code design text<br><small>StyleColor[0].ProductType + StyleColor[0].ProductTypeCodeLegacy + StyleColor[0].Generic</small></th>';
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

            labelRows.forEach(function(row, rowIdx) {
                html += '<tr>';

                if (labelType === 'GI001BAW' || labelType === 'GI000PRO') {
                    html += '<td style="text-align:center;"><button class="preview-btn" data-label-type="' + labelType + '" data-row-idx="' + rowIdx + '" title="Preview layout">👁</button></td>';
                    html += '<td>' + escapeHtml(row.item_qty || '') + '</td>';
                    html += '<td>' + escapeHtml(row.order_id || '') + '</td>';
                    html += '<td>' + escapeHtml(row.product_type || '') + '</td>';
                    html += '<td>' + escapeHtml(row.line || '') + '</td>';
                    html += '<td>' + escapeHtml(row.age || '') + '</td>';
                    html += '<td>' + escapeHtml(row.gender || '') + '</td>';
                    html += '<td>' + escapeHtml(row.ref_first_4 || '') + '</td>';
                    html += '<td>' + escapeHtml(row.ref_last_4 || '') + '</td>';
                    html += '<td>' + escapeHtml(row.color || '') + '</td>';
                    html += '<td>' + escapeHtml(row.size || '') + '</td>';
                    html += '<td class="full-product-cell">' + escapeHtml(row.full_product || '') + '</td>';
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

        // Show "Map to Overlays" button
        const mapButton = document.getElementById('btn-map-overlays');
        if (mapButton) {
            mapButton.style.display = 'inline-block';
            mapButton.onclick = function() {
                showMappingModal(Object.keys(groupedRows)[0]); // Use first label type
            };
        }
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

    // Field definitions for GI001BAW
    const GI001BAW_FIELDS = [
        {name: 'item_qty', label: '1 ITEM DATATQTY', parts: []},
        {name: 'order_id', label: '2 Code of order', parts: []},
        {name: 'product_type', label: '3 FAM CODE', parts: []},
        {name: 'line', label: '4.0 FAM LINE DESCRIPTION', parts: []},
        {name: 'age', label: '4.1 FAM LINE DESCRIPTION', parts: []},
        {name: 'gender', label: '4.2 FAM LINE DESCRIPTION', parts: []},
        {name: 'ref_first_4', label: '5.1 Reference number (First 4)', parts: []},
        {name: 'ref_last_4', label: '5.2 Reference number (Last 4)', parts: []},
        {name: 'color', label: '6 The colour of the garment', parts: ['MangoColorCode', 'Color']},
        {name: 'size', label: '7 Size: EUR', parts: []},
        {name: 'full_product', label: '8 Family+Generic+code design text', parts: ['ProductType', 'ProductTypeCodeLegacy', 'Generic']}
    ];

    // Show mapping modal
    function showMappingModal(labelType) {
        const modal = document.getElementById('overlay-mapping-modal');
        if (!modal) return;

        // Get field definitions based on label type
        let fields = [];
        if (labelType === 'GI001BAW' || labelType === 'GI000PRO') {
            fields = GI001BAW_FIELDS;
        } else {
            showMessage('Mapping not yet supported for ' + labelType, 'error');
            return;
        }

        // Load saved mappings
        fetch('/order/api/jsonl/get-mappings/' + labelType)
            .then(response => response.json())
            .then(data => {
                const savedMappings = data.success ? data.mappings : {};
                renderMappingFields(fields, savedMappings, labelType);
                modal.style.display = 'flex';
            })
            .catch(error => {
                console.error('Error loading mappings:', error);
                renderMappingFields(fields, {}, labelType);
                modal.style.display = 'flex';
            });
    }

    // Render mapping fields
    function renderMappingFields(fields, savedMappings, labelType) {
        const container = document.getElementById('mapping-fields-container');
        if (!container) return;

        let html = '<div class="mapping-fields">';

        fields.forEach(function(field) {
            html += '<div class="mapping-field-row">';
            html += '<label class="mapping-field-label">' + escapeHtml(field.label) + '</label>';
            html += '<div class="mapping-field-inputs">';

            if (field.parts.length === 0) {
                // Simple field - single dropdown
                const value = savedMappings[field.name] || '';
                html += '<input type="number" class="mapping-overlay-input" data-field="' + field.name + '" ';
                html += 'placeholder="Overlay #" min="1" value="' + value + '">';
            } else {
                // Concatenated field - multiple dropdowns with labels
                field.parts.forEach(function(partName, index) {
                    html += '<div class="mapping-part">';
                    html += '<span class="mapping-part-label">' + escapeHtml(partName) + ':</span>';
                    const savedArray = savedMappings[field.name] || [];
                    const value = savedArray[index] || '';
                    html += '<input type="number" class="mapping-overlay-input" data-field="' + field.name + '" ';
                    html += 'data-part="' + (index + 1) + '" placeholder="Overlay #" min="1" value="' + value + '">';
                    html += '</div>';
                });
            }

            html += '</div>';
            html += '</div>';
        });

        html += '</div>';
        html += '<input type="hidden" id="current-label-type" value="' + labelType + '">';

        container.innerHTML = html;
    }

    // Close mapping modal
    window.closeMappingModal = function() {
        const modal = document.getElementById('overlay-mapping-modal');
        if (modal) modal.style.display = 'none';
    };

    // Save mappings
    window.saveMappings = function() {
        const labelType = document.getElementById('current-label-type').value;
        const inputs = document.querySelectorAll('.mapping-overlay-input');
        const mappings = {};

        inputs.forEach(function(input) {
            const fieldName = input.getAttribute('data-field');
            const partIndex = input.getAttribute('data-part');
            const value = parseInt(input.value) || null;

            if (value) {
                if (partIndex) {
                    // Concatenated field
                    if (!mappings[fieldName]) {
                        mappings[fieldName] = [];
                    }
                    mappings[fieldName][parseInt(partIndex) - 1] = value;
                } else {
                    // Simple field
                    mappings[fieldName] = value;
                }
            }
        });

        // Save to backend
        fetch('/order/api/jsonl/save-mappings', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({label_type: labelType, mappings: mappings})
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showMessage('Mappings saved successfully', 'success');
                closeMappingModal();
            } else {
                showMessage(data.error || 'Failed to save mappings', 'error');
            }
        })
        .catch(error => {
            console.error('Error saving mappings:', error);
            showMessage('Error saving mappings: ' + error.message, 'error');
        });
    };

    // ─── Preview Popup ───
    var PT_TO_MM = 25.4 / 72;
    var cachedLayout = null;
    var cachedLabelType = null;

    var FIELD_TO_ROW_KEY = {
        '1': 'item_qty',
        '2': 'order_id',
        '3': 'product_type',
        '4.0': 'line',
        '4.1': 'age',
        '4.2': 'gender',
        '5.1': 'ref_first_4',
        '5.2': 'ref_last_4',
        '6': 'color',
        '7': 'size',
        '8': 'full_product'
    };

    function showPreviewPopup(labelType, rowData) {
        // Fetch or use cached layout
        if (cachedLayout && cachedLabelType === labelType) {
            renderPreview(cachedLayout, rowData);
            return;
        }
        showMessage('Loading layout for ' + labelType + '...', 'info');
        fetch('/order/api/jsonl/preview-layout/' + labelType)
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    cachedLayout = data.layout;
                    cachedLabelType = labelType;
                    renderPreview(data.layout, rowData);
                } else {
                    showMessage(data.error || 'No matching layout found', 'error');
                }
            })
            .catch(function(err) {
                showMessage('Error loading layout: ' + err.message, 'error');
            });
    }

    function renderPreview(layout, rowData) {
        var modal = document.getElementById('preview-modal');
        var canvas = document.getElementById('preview-canvas');
        var rowNum = document.getElementById('preview-row-num');
        if (!modal || !canvas) return;

        rowNum.textContent = rowData._rowIndex || '?';
        modal.style.display = 'block';

        var overlays = JSON.parse(JSON.stringify(layout.overlays || []));
        var mappings = layout.matchingMappings || {};

        // Apply row data to overlays via matching mappings
        for (var fieldId in mappings) {
            var val = mappings[fieldId];
            var rowKey = FIELD_TO_ROW_KEY[fieldId];
            if (!rowKey) continue;
            var dataValue = rowData[rowKey] || '';
            var indices = Array.isArray(val) ? val : (val !== undefined ? [val] : []);
            for (var i = 0; i < indices.length; i++) {
                if (indices[i] >= 0 && indices[i] < overlays.length) {
                    overlays[indices[i]].content = String(dataValue);
                }
            }
        }

        // Render on canvas
        var docW = (layout.docWidth || 210);
        var docH = (layout.docHeight || 297);
        var container = document.getElementById('preview-modal-body');
        var maxW = Math.min(400, window.innerWidth - 100);
        var maxH = Math.min(500, window.innerHeight - 150);
        var scale = Math.min(maxW / docW, maxH / docH);
        canvas.width = Math.ceil(docW * scale);
        canvas.height = Math.ceil(docH * scale);
        canvas.style.width = canvas.width + 'px';
        canvas.style.height = canvas.height + 'px';
        canvas.style.background = '#fff';
        canvas.style.border = '1px solid #000';

        var ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(scale, scale);
        ctx.clearRect(0, 0, docW, docH);

        // Draw document tree (background)
        if (layout.documentTree) {
            drawPreviewTree(ctx, layout.documentTree, layout.docMetadata);
        }

        // Draw overlays
        overlays.forEach(function(ov, idx) {
            if (ov.visible === false) return;
            var x = ov.x || 0, y = ov.y || 0, w = ov.w || 10, h = ov.h || 10;

            ctx.save();
            if (ov._rotation) {
                var cx = x + w / 2, cy = y + h / 2;
                ctx.translate(cx, cy);
                ctx.rotate(ov._rotation * Math.PI / 180);
                ctx.translate(-cx, -cy);
            }

            if (ov.type === 'textregion' && ov.content) {
                var fsMm = (ov.fontSize || 12) * PT_TO_MM;
                var fontStyle = '';
                if (ov.italic) fontStyle += 'italic ';
                if (ov.bold) fontStyle += 'bold ';
                fontStyle += fsMm + 'px ';
                fontStyle += "'" + (ov.fontFamily || 'Arial') + "', sans-serif";
                ctx.font = fontStyle;
                ctx.fillStyle = ov.color || '#000000';
                ctx.textAlign = ov.alignH === 'center' ? 'center' : ov.alignH === 'right' ? 'right' : 'left';
                ctx.textBaseline = 'top';
                var ls = (ov.letterSpacing || 0) * PT_TO_MM;
                if (ls) ctx.letterSpacing = ls + 'px';

                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y, w, h);
                ctx.clip();
                var tx = ov.alignH === 'center' ? x + w / 2 : ov.alignH === 'right' ? x + w : x + 0.5;
                var lh = fsMm * 1.2;
                var lines = (ov.content || '').split('\n');
                for (var li = 0; li < lines.length; li++) {
                    ctx.fillText(lines[li], tx, y + 0.5 + li * lh);
                }
                ctx.restore();
            } else if (ov.type === 'qrcoderegion') {
                ctx.strokeStyle = '#ccc';
                ctx.lineWidth = 0.2;
                ctx.strokeRect(x, y, w, h);
                var qrSize = Math.min(w, h) * 0.85;
                var qrX = x + (w - qrSize) / 2;
                var qrY = y + (h - qrSize) / 2;
                ctx.fillStyle = '#000';
                ctx.fillRect(qrX, qrY, qrSize, qrSize);
                ctx.fillStyle = '#fff';
                ctx.fillRect(qrX + qrSize * 0.1, qrY + qrSize * 0.1, qrSize * 0.8, qrSize * 0.8);
                ctx.fillStyle = '#000';
                ctx.font = (qrSize * 0.15) + 'px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('QR', x + w / 2, y + h / 2 + qrSize * 0.05);
            } else if (ov.type === 'barcoderegion') {
                ctx.strokeStyle = '#ccc';
                ctx.lineWidth = 0.2;
                ctx.strokeRect(x, y, w, h);
                var barH = h * 0.6;
                var barY = y + (h - barH) / 2;
                ctx.fillStyle = '#000';
                for (var bi = 0; bi < 30; bi++) {
                    var bw = w / 60;
                    if (bi % 3 !== 0) {
                        ctx.fillRect(x + bi * bw * 2, barY, bw, barH);
                    }
                }
            } else if (ov.type === 'imageregion') {
                ctx.strokeStyle = '#ccc';
                ctx.lineWidth = 0.2;
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = '#f0f0f0';
                ctx.fillRect(x, y, w, h);
            }

            ctx.restore();
        });
    }

    function drawPreviewTree(ctx, tree, metadata) {
        if (!tree) return;
        tree.forEach(function(node) {
            if (node.type === 'path' && node.pathData && node.fill && node.fill.type !== 'none') {
                ctx.save();
                ctx.fillStyle = node.fill.color || '#000';
                if (node.opacity !== undefined) ctx.globalAlpha = node.opacity / 100;
                drawPreviewPath(ctx, node.pathData, node.bounds);
                ctx.fill();
                ctx.restore();
            } else if (node.type === 'text' && node.content) {
                ctx.save();
                if (node.opacity !== undefined) ctx.globalAlpha = node.opacity / 100;
                var fsMm = (node.paragraphs && node.paragraphs[0] && node.paragraphs[0].runs && node.paragraphs[0].runs[0])
                    ? node.paragraphs[0].runs[0].fontSize * PT_TO_MM : 12 * PT_TO_MM;
                ctx.fillStyle = '#000';
                ctx.font = fsMm + 'px Arial, sans-serif';
                ctx.textBaseline = 'top';
                if (node.bounds) {
                    ctx.fillText(node.content.substring(0, 30), node.bounds.x, node.bounds.y);
                }
                ctx.restore();
            }
            if (node.children) drawPreviewTree(ctx, node.children, metadata);
        });
    }

    function drawPreviewPath(ctx, pathData, bounds) {
        if (!pathData || pathData.length === 0) {
            if (bounds) {
                ctx.beginPath();
                ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
            }
            return;
        }
        ctx.beginPath();
        ctx.moveTo(pathData[0].x, pathData[0].y);
        for (var i = 1; i < pathData.length; i++) {
            var p = pathData[i];
            if (p.handleIn || p.handleOut) {
                var prev = pathData[i - 1];
                var cpx = p.handleIn ? p.handleIn.x : p.x;
                var cpy = p.handleIn ? p.handleIn.y : p.y;
                ctx.quadraticCurveTo(cpx, cpy, p.x, p.y);
            } else {
                ctx.lineTo(p.x, p.y);
            }
        }
        ctx.closePath();
    }

    // Close preview modal
    window.closePreviewModal = function() {
        var modal = document.getElementById('preview-modal');
        if (modal) modal.style.display = 'none';
    };

    // Delegate click for preview buttons
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('.preview-btn');
        if (!btn) return;
        var labelType = btn.getAttribute('data-label-type');
        var rowIdx = parseInt(btn.getAttribute('data-row-idx'));
        // Find the row data from the stored rows
        if (window._lastParsedRows) {
            var rows = window._lastParsedRows.filter(function(r) { return r.label_type === labelType; });
            if (rows[rowIdx]) {
                rows[rowIdx]._rowIndex = rowIdx + 1;
                showPreviewPopup(labelType, rows[rowIdx]);
            }
        }
    });
})();
