// Layout management JavaScript

// Load and display all layouts
function loadLayouts() {
    const refreshBtn = document.querySelector('button[onclick="loadLayouts()"]');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Loading...';
    }

    fetch('/layout/list')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayLayouts(data.layouts);
            } else {
                showLayoutMessage('Error loading layouts: ' + data.error, 'error');
            }
        })
        .catch(error => {
            showLayoutMessage('Error loading layouts: ' + error, 'error');
        })
        .finally(() => {
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = 'Refresh List';
            }
        });
}

// Display layouts in table
function displayLayouts(layouts) {
    const tbody = document.getElementById('layoutTableBody');
    if (!tbody) return;

    if (layouts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 40px;">No layouts found</td></tr>';
        return;
    }

    tbody.innerHTML = layouts.map(layout => {

        // Format dates as dd/mm/yyyy hh:mm:ss
        const formatDateTime = (dateStr) => {
            const date = new Date(dateStr);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
        };

        const createdDate = formatDateTime(layout.created_at);
        const updatedDate = formatDateTime(layout.updated_at);
        const customerName = layout.customer_name || '-';
        const variableCount = layout.variable_count || 0;

        return `
            <tr>
                <td><input type="checkbox" class="layout-checkbox" data-layout-id="${layout.id}" onchange="updateDeleteButton()"></td>
                <td>${layout.id}</td>
                <td>${layout.name}</td>
                <td>${layout.type.toUpperCase()}</td>
                <td>${customerName}</td>
                <td>${variableCount}</td>
                <td>${createdDate}</td>
                <td>${updatedDate}</td>
                <td class="actions">
                    <button onclick="openLayout(${layout.id}, '${layout.type}')">Open</button>
                    ${layout.type === 'json' ? '<button onclick="viewMatching(' + layout.id + ')">Matching</button>' : ''}
                    <button onclick="deleteLayout(${layout.id})">Delete</button>
                </td>
            </tr>
        `;
    }).join('');

    updateDeleteButton();
}

// Open a layout in a new tab
function openLayout(layoutId, layoutType) {
    var route = layoutType === 'json' ? '/layout/create/json' : '/layout/create/pdf';
    openTab('Layout: ' + layoutId, route + '?load=' + layoutId);
}

// Delete a layout
function deleteLayout(layoutId) {
    if (!confirm('Are you sure you want to delete this layout?')) {
        return;
    }

    fetch('/layout/' + layoutId, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showLayoutMessage('Layout deleted successfully', 'success');
            loadLayouts();
        } else {
            showLayoutMessage('Error deleting layout: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showLayoutMessage('Error: ' + error, 'error');
    });
}

// Show message to user
function showLayoutMessage(text, type) {
    const messageDiv = document.getElementById('message');
    if (!messageDiv) return;

    messageDiv.textContent = text;
    messageDiv.className = 'message ' + type;
    messageDiv.style.display = 'block';

    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}

// Toggle select all checkbox
function toggleSelectAll(checkbox) {
    const checkboxes = document.querySelectorAll('.layout-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
    });
    updateDeleteButton();
}

// Select all layouts
function selectAllLayouts() {
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = true;
        toggleSelectAll(selectAllCheckbox);
    }
}

// Update delete button state
function updateDeleteButton() {
    const checkboxes = document.querySelectorAll('.layout-checkbox:checked');
    const deleteBtn = document.getElementById('btn-delete-selected');
    if (deleteBtn) {
        deleteBtn.disabled = checkboxes.length === 0;
    }

    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    const allCheckboxes = document.querySelectorAll('.layout-checkbox');
    if (selectAllCheckbox && allCheckboxes.length > 0) {
        selectAllCheckbox.checked = checkboxes.length === allCheckboxes.length;
    }
}

// Field definitions for matching JSON viewer
var MATCHING_FIELDS = {
    'GI001BAW': [
        { id: '1', label: 'ITEM DATA QTY', path: 'StyleColor[0].ItemData[#].itemQty' },
        { id: '2', label: 'Code of order', path: 'LabelOrder.Id' },
        { id: '3', label: 'FAM CODE', path: 'StyleColor[0].ProductTypeCodeLegacy' },
        { id: '4.0', label: 'FAM LINE DESCRIPTION', path: 'StyleColor[0].Line' },
        { id: '4.1', label: 'FAM LINE DESCRIPTION', path: 'StyleColor[0].Age' },
        { id: '4.2', label: 'FAM LINE DESCRIPTION', path: 'StyleColor[0].Gender' },
        { id: '5.1', label: 'Reference number (first 4)', path: 'StyleColor[0].ReferenceID (first 4)' },
        { id: '5.2', label: 'Reference number (last 4)', path: 'StyleColor[0].ReferenceID (last 4)' },
        { id: '6', label: 'Colour of garment', path: 'StyleColor[0].MangoColorCode + ":" + StyleColor[0].Color', concat: true },
        { id: '7', label: 'Size: EUR', path: 'StyleColor[0].ItemData[#].SizeNameES' },
        { id: '8', label: 'Family+Generic+code design text', path: 'StyleColor[0].ProductType + StyleColor[0].ProductTypeCodeLegacy + StyleColor[0].Generic', concat: true }
    ]
};

function getMatchingOverlayLabel(ov) {
    var labelMap = {
        'textregion': 'Text: "' + (ov.content || '').substring(0, 15) + '"',
        'imageregion': 'Image',
        'qrcoderegion': 'QR: ' + (ov.qrData || '').substring(0, 10),
        'barcoderegion': 'Barcode: ' + (ov.barcodeData || '').substring(0, 10),
        'translationregion': 'Translation'
    };
    return labelMap[ov.type] || ov.type;
}

function viewMatching(layoutId) {
    fetch('/layout/' + layoutId)
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (!res.success || !res.layout) { alert('Layout not found'); return; }
            var data = res.layout.data;
            if (!data || typeof data === 'string') {
                try { data = JSON.parse(data); } catch(e) { alert('Invalid layout data'); return; }
            }
            renderMatchingViewer(data, res.layout.name);
        })
        .catch(function(err) { alert('Error: ' + err.message); });
}

function renderMatchingViewer(data, layoutName) {
    var modal = document.getElementById('matching-viewer-modal');
    if (!modal) return;

    var overlays = data.overlays || [];
    var mappings = data.matchingMappings || {};
    var labelType = data.matchingLabelType || '';

    // Set header info
    var ltSpan = document.getElementById('matching-viewer-label-type');
    if (ltSpan) ltSpan.textContent = labelType || '—';
    var nameSpan = document.getElementById('matching-viewer-layout-name');
    if (nameSpan) nameSpan.textContent = layoutName || '';

    // Sort overlays by _overlayNumber for display
    var uiOrder = [];
    for (var k = 0; k < overlays.length; k++) uiOrder.push(k);
    uiOrder.sort(function(a, b) {
        return (overlays[a]._overlayNumber || 0) - (overlays[b]._overlayNumber || 0);
    });
    var displayNumMap = {};
    for (var k = 0; k < uiOrder.length; k++) displayNumMap[uiOrder[k]] = k + 1;

    // Build reverse map: overlayIdx -> [field ids]
    var ovToFields = {};
    for (var fid in mappings) {
        var val = mappings[fid];
        var indices = Array.isArray(val) ? val : (val !== undefined ? [val] : []);
        for (var i = 0; i < indices.length; i++) {
            if (!ovToFields[indices[i]]) ovToFields[indices[i]] = [];
            ovToFields[indices[i]].push(fid);
        }
    }

    var fields = MATCHING_FIELDS[labelType] || [];
    // Fallback: try prefix match (e.g. "GI001BAW_matching_matching_complete" matches "GI001BAW")
    if (fields.length === 0 && labelType) {
        var knownTypes = Object.keys(MATCHING_FIELDS);
        for (var t = 0; t < knownTypes.length; t++) {
            if (labelType.startsWith(knownTypes[t]) || knownTypes[t].startsWith(labelType)) {
                fields = MATCHING_FIELDS[knownTypes[t]];
                break;
            }
        }
    }

    // Render left: overlay list
    var overlayList = document.getElementById('matching-viewer-overlay-list');
    if (overlayList) {
        if (overlays.length === 0) {
            overlayList.innerHTML = '<div style="font-size:10px;color:#999;padding:6px;">No overlays</div>';
        } else {
            var html = '';
            for (var j = 0; j < uiOrder.length; j++) {
                var idx = uiOrder[j];
                var ov = overlays[idx];
                var displayNum = displayNumMap[idx] || (j + 1);
                var matchedFieldIds = ovToFields[idx] || [];
                var isMatched = matchedFieldIds.length > 0;

                var mappedLabel = '';
                if (isMatched && fields.length > 0) {
                    var parts = [];
                    matchedFieldIds.forEach(function(fid) {
                        var mf = fields.find(function(f) { return f.id === fid; });
                        if (mf) parts.push(mf.id + '. ' + mf.label);
                    });
                    if (parts.length > 0) {
                        mappedLabel = '<span style="color:#fff;font-weight:bold;">→ ' + parts.join(', ') + '</span>';
                    }
                }

                var bgColor = isMatched ? '#dc3545' : '';
                var borderColor = isMatched ? '#dc3545' : '#ddd';
                var textColor = isMatched ? '#fff' : '#000';

                html += '<div style="padding:4px 6px;font-size:11px;border:1px solid ' + borderColor + ';';
                if (bgColor) html += 'background:' + bgColor + ';';
                html += 'border-radius:3px;margin-bottom:3px;display:flex;justify-content:space-between;align-items:center;">';
                html += '<span style="color:' + textColor + ';">#' + String(displayNum).padStart(2, '0') + ' ' + getMatchingOverlayLabel(ov) + '</span>';
                html += '<span style="font-size:9px;">' + (mappedLabel || '') + '</span>';
                html += '</div>';
            }
            overlayList.innerHTML = html;
        }
    }

    // Render right: field cards
    var fieldsContainer = document.getElementById('matching-viewer-fields-container');
    if (fieldsContainer) {
        if (!labelType || fields.length === 0) {
            fieldsContainer.innerHTML = '<div style="font-size:10px;color:#999;padding:6px;">No matching data saved for this layout</div>';
        } else {
            var fhtml = '';
            fields.forEach(function(field) {
                var val = mappings[field.id];
                var indices = Array.isArray(val) ? val : (val !== undefined ? [val] : []);
                var mappedLabel = '';
                if (indices.length > 0) {
                    var parts = [];
                    indices.forEach(function(idx) {
                        if (overlays[idx]) {
                            var dn = displayNumMap[idx] || (idx + 1);
                            parts.push('#' + String(dn).padStart(2, '0') + ' ' + getMatchingOverlayLabel(overlays[idx]));
                        }
                    });
                    if (parts.length > 0) {
                        mappedLabel = '<span style="font-size:9px;color:#000;background:#e0e0e0;padding:1px 4px;border-radius:2px;">← ' + parts.join(', ') + '</span>';
                    }
                }

                var isMatched = indices.length > 0;
                var bgColor = isMatched ? '#ffe0e0' : '#f5f5f5';
                var borderColor = isMatched ? '#dc3545' : '#ddd';

                fhtml += '<div style="padding:6px 8px;background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:4px;margin-bottom:6px;">';
                fhtml += '<div><span style="font-size:11px;font-weight:bold;">' + field.id + '.</span> ';
                fhtml += '<span style="font-size:11px;">' + field.label + '</span>';
                if (field.concat) {
                    fhtml += ' <span style="font-size:9px;background:#333;color:#fff;padding:1px 4px;border-radius:2px;">MULTI</span>';
                }
                fhtml += '</div>';
                fhtml += '<div style="font-size:9px;color:#888;margin-top:2px;">' + field.path + '</div>';
                fhtml += '<div style="margin-top:3px;">' + (mappedLabel || '<span style="font-size:9px;color:#bbb;">not mapped</span>') + '</div>';
                fhtml += '</div>';
            });
            fieldsContainer.innerHTML = fhtml;
        }
    }

    // Show modal
    modal.style.display = 'block';
    if (!modal.dataset.positioned) {
        modal.style.top = '60px';
        modal.style.left = Math.max(20, window.innerWidth - 720) + 'px';
        modal.dataset.positioned = '1';
    }
}

// Setup matching viewer modal events
(function() {
    function setupMatchingViewer() {
        var modal = document.getElementById('matching-viewer-modal');
        var closeBtn = document.getElementById('btn-close-matching-viewer');
        var header = document.getElementById('matching-viewer-header');

        if (closeBtn && modal) {
            closeBtn.addEventListener('click', function() { modal.style.display = 'none'; });
        }

        // Modal drag
        if (header && modal) {
            var drag = { active: false, ox: 0, oy: 0 };
            header.addEventListener('mousedown', function(e) {
                if (e.target === closeBtn) return;
                drag.active = true;
                drag.ox = e.clientX - modal.offsetLeft;
                drag.oy = e.clientY - modal.offsetTop;
                e.preventDefault();
            });
            document.addEventListener('mousemove', function(e) {
                if (!drag.active) return;
                modal.style.left = Math.max(0, Math.min(e.clientX - drag.ox, window.innerWidth - 100)) + 'px';
                modal.style.top = Math.max(0, Math.min(e.clientY - drag.oy, window.innerHeight - 40)) + 'px';
            });
            document.addEventListener('mouseup', function() { drag.active = false; });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupMatchingViewer);
    } else {
        setupMatchingViewer();
    }
})();

function deleteSelectedLayouts() {
    const checkboxes = document.querySelectorAll('.layout-checkbox:checked');
    const layoutIds = Array.from(checkboxes).map(cb => cb.dataset.layoutId);

    if (layoutIds.length === 0) {
        return;
    }

    if (!confirm(`Are you sure you want to delete ${layoutIds.length} layout(s)?`)) {
        return;
    }

    let completed = 0;
    let errors = 0;

    layoutIds.forEach(layoutId => {
        fetch('/layout/' + layoutId, {
            method: 'DELETE'
        })
        .then(response => response.json())
        .then(data => {
            completed++;
            if (!data.success) {
                errors++;
            }

            if (completed === layoutIds.length) {
                if (errors === 0) {
                    showLayoutMessage(`Successfully deleted ${layoutIds.length} layout(s)`, 'success');
                } else {
                    showLayoutMessage(`Deleted ${layoutIds.length - errors} layout(s), ${errors} failed`, 'error');
                }
                loadLayouts();
            }
        })
        .catch(error => {
            completed++;
            errors++;

            if (completed === layoutIds.length) {
                showLayoutMessage(`Deleted ${layoutIds.length - errors} layout(s), ${errors} failed`, 'error');
                loadLayouts();
            }
        });
    });
}
