// Font View JavaScript

let allFonts = [];

(function() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFontView);
    } else {
        setTimeout(initFontView, 100);
    }
})();

function initFontView() {
    const table = document.getElementById('fontTable');
    if (!table) {
        setTimeout(initFontView, 200);
        return;
    }

    const searchFont = document.getElementById('search-font');
    const searchCustomer = document.getElementById('search-customer');

    if (searchFont) searchFont.addEventListener('input', filterFonts);
    if (searchCustomer) searchCustomer.addEventListener('change', filterFonts);

    loadAllFonts();
    loadCustomerFilter();
}

async function loadAllFonts() {
    try {
        const response = await fetch('/font/list');
        const result = await response.json();
        if (result.success) {
            allFonts = result.fonts;
            filterFonts();
        }
    } catch (error) {
        console.error('Error loading fonts:', error);
    }
}

async function loadCustomerFilter() {
    const select = document.getElementById('search-customer');
    if (!select) return;
    try {
        const response = await fetch('/customer/list');
        const data = await response.json();
        if (data.success && data.customers) {
            data.customers.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.customer_id;
                opt.textContent = c.company_name;
                select.appendChild(opt);
            });
        }
    } catch (error) {
        console.error('Error loading customers:', error);
    }
}

function filterFonts() {
    const searchText = (document.getElementById('search-font').value || '').toLowerCase();
    const customerFilter = document.getElementById('search-customer').value;
    let filtered = allFonts;
    if (searchText) {
        filtered = filtered.filter(f => f.font_name.toLowerCase().includes(searchText));
    }
    if (customerFilter === '__public__') {
        filtered = filtered.filter(f => !f.customer_id);
    } else if (customerFilter) {
        filtered = filtered.filter(f => f.customer_id === customerFilter);
    }
    displayFonts(filtered);
}

function displayFonts(fonts) {
    const tbody = document.getElementById('fontTableBody');
    if (fonts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px;">No fonts found</td></tr>';
        return;
    }
    tbody.innerHTML = '';
    fonts.forEach(font => {
        const tr = document.createElement('tr');
        const customerLabel = font.customer_name || 'Public';
        const updated = font.created_at ? formatDate(font.created_at) : '—';
        tr.innerHTML = `
            <td>${customerLabel}</td>
            <td id="font-name-${font.id}">${font.font_name}</td>
            <td>${updated}</td>
            <td class="font-preview-cell" id="font-preview-${font.id}">Loading...</td>
            <td>
                <div class="actions">
                    <button class="btn-view" onclick="viewFont(${font.id}, '${escapeName(font.font_name)}'); event.stopPropagation();">View</button>
                    <button class="btn-rename" onclick="startRename(${font.id}, '${escapeName(font.font_name)}'); event.stopPropagation();">Rename</button>
                    <button class="btn-delete" onclick="deleteFont(${font.id}); event.stopPropagation();">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
        loadFontAndPreview(font.id, font.font_name);
    });
}

function escapeName(name) {
    return name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${mins}`;
}

async function loadFontAndPreview(fontId, fontName) {
    try {
        const fontFace = new FontFace(fontName, `url(/font/download/${fontId})`);
        await fontFace.load();
        document.fonts.add(fontFace);
    } catch (error) {
        console.error('Error loading font:', error);
    }
    const cell = document.getElementById('font-preview-' + fontId);
    if (cell) {
        cell.style.fontFamily = `'${fontName}', sans-serif`;
        cell.textContent = 'AaBbCc 0123';
    }
}

function startRename(fontId, currentName) {
    const td = document.getElementById('font-name-' + fontId);
    if (!td) return;
    td.innerHTML = `
        <input class="rename-input" type="text" value="${currentName}"
            onkeydown="if(event.key==='Enter') saveRename(${fontId}, this.value); if(event.key==='Escape') cancelRename(${fontId}, '${escapeName(currentName)}');"
            onblur="cancelRename(${fontId}, '${escapeName(currentName)}')" />
    `;
    const input = td.querySelector('input');
    if (input) {
        input.focus();
        input.select();
    }
}

function cancelRename(fontId, originalName) {
    const td = document.getElementById('font-name-' + fontId);
    if (td) td.textContent = originalName;
}

async function saveRename(fontId, newName) {
    newName = newName.trim();
    if (!newName) return;
    try {
        const response = await fetch(`/font/${fontId}/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ font_name: newName })
        });
        const result = await response.json();
        if (result.success) {
            loadAllFonts();
        } else {
            alert('Rename failed: ' + result.error);
            loadAllFonts();
        }
    } catch (error) {
        alert('Rename error: ' + error.message);
        loadAllFonts();
    }
}

async function deleteFont(fontId) {
    if (!confirm('Are you sure you want to delete this font?')) return;
    try {
        const response = await fetch(`/font/${fontId}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            loadAllFonts();
        } else {
            alert('Delete failed: ' + result.error);
        }
    } catch (error) {
        alert('Delete error: ' + error.message);
    }
}

function viewFont(fontId, fontName) {
    const sections = [
        { label: 'Uppercase (A-Z)', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
        { label: 'Lowercase (a-z)', chars: 'abcdefghijklmnopqrstuvwxyz' },
        { label: 'Numbers (0-9)', chars: '0123456789' },
        { label: 'Symbols', chars: '!@#$%^&*()_+-={}[]|\\:;"\'<>,.?/~`' }
    ];

    let html = '';
    sections.forEach(s => {
        html += '<div class="modal-preview-group">';
        html += '<div class="modal-preview-label">' + s.label + '</div>';
        html += '<div class="glyph-grid">';
        for (var i = 0; i < s.chars.length; i++) {
            var ch = s.chars[i];
            var display = ch.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
            html += '<div class="glyph-cell">';
            html += '<div class="glyph-key">' + display + '</div>';
            html += '<div class="glyph-render" style="font-family:\'' + fontName + '\', sans-serif;">' + display + '</div>';
            html += '</div>';
        }
        html += '</div></div>';
    });

    // Remove existing modal if any
    const existing = document.getElementById('fontViewModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'fontViewModal';
    modal.className = 'font-modal-overlay';
    modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `
        <div class="font-modal">
            <div class="font-modal-header">
                <h3>${fontName}</h3>
                <button onclick="document.getElementById('fontViewModal').remove();">&times;</button>
            </div>
            <div class="font-modal-body">${html}</div>
        </div>
    `;
    document.body.appendChild(modal);
}
