// Translation View JavaScript

let allTranslations = [];
let currentTranslationId = null;
let currentTranslationData = null;

(function() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTranslationView);
    } else {
        setTimeout(initTranslationView, 100);
    }
})();

function initTranslationView() {
    const table = document.getElementById('translation-tbody');
    if (!table) {
        setTimeout(initTranslationView, 200);
        return;
    }

    loadTranslations();
    loadCustomerFilter();
}

async function loadTranslations() {
    try {
        const response = await fetch('/translation/list');
        const result = await response.json();
        if (result.success) {
            allTranslations = result.translations;
            filterTranslations();
        }
    } catch (error) {
        console.error('Error loading translations:', error);
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

function filterTranslations() {
    const searchText = (document.getElementById('search-name').value || '').toLowerCase();
    const customerFilter = document.getElementById('search-customer').value;

    let filtered = allTranslations;

    if (searchText) {
        filtered = filtered.filter(t => t.table_name.toLowerCase().includes(searchText));
    }

    if (customerFilter === '__public__') {
        filtered = filtered.filter(t => !t.customer_id);
    } else if (customerFilter) {
        filtered = filtered.filter(t => t.customer_id === customerFilter);
    }

    displayTranslations(filtered);
}

function displayTranslations(translations) {
    const tbody = document.getElementById('translation-tbody');

    if (translations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px;">No translation tables found</td></tr>';
        return;
    }

    tbody.innerHTML = '';
    translations.forEach(t => {
        const tr = document.createElement('tr');
        const customerLabel = t.customer_name || 'Public';
        const updated = t.updated_at ? formatDate(t.updated_at) : '—';

        tr.innerHTML = `
            <td>${customerLabel}</td>
            <td id="table-name-${t.id}">${escapeHtml(t.table_name)}</td>
            <td>${updated}</td>
            <td>
                <div class="actions">
                    <button class="btn-view" onclick="showViewModal(${t.id})">View</button>
                    <button class="btn-rename" onclick="startRename(${t.id})">Rename</button>
                    <button class="btn-delete" onclick="deleteTranslation(${t.id})">Delete</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function showViewModal(translationId) {
    try {
        const response = await fetch(`/translation/${translationId}`);
        const result = await response.json();

        if (result.success) {
            currentTranslationId = translationId;
            currentTranslationData = result.translation.data;

            document.getElementById('modal-title').textContent = result.translation.table_name;
            renderModalTable(currentTranslationData);
            document.getElementById('view-modal').style.display = 'flex';
        }
    } catch (error) {
        console.error('Error loading translation:', error);
        alert('Error loading translation table');
    }
}

function renderModalTable(data) {
    const table = document.getElementById('modal-table');
    table.innerHTML = '';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    data.headers.forEach((header, colIdx) => {
        const th = document.createElement('th');
        const div = document.createElement('div');
        div.textContent = header;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'column-search';
        input.dataset.col = colIdx;
        input.placeholder = 'Search...';
        input.oninput = filterModalTable;
        th.appendChild(div);
        th.appendChild(input);
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    data.rows.forEach((row, rowIdx) => {
        const tr = document.createElement('tr');
        tr.dataset.rowIdx = rowIdx;
        row.forEach((cell, colIdx) => {
            const td = document.createElement('td');
            td.textContent = cell;
            td.contentEditable = true;
            td.addEventListener('blur', () => {
                const newValue = td.textContent.trim();
                if (newValue !== cell) {
                    updateCell(rowIdx, colIdx, newValue);
                }
            });
            td.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    td.blur();
                }
            });
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
}

function filterModalTable() {
    const table = document.getElementById('modal-table');
    const tbody = table.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');

    const searchInputs = table.querySelectorAll('.column-search');
    const filters = Array.from(searchInputs).map(input => input.value.toLowerCase());

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        let match = true;

        filters.forEach((filter, colIdx) => {
            if (filter && cells[colIdx]) {
                const cellText = cells[colIdx].textContent.toLowerCase();
                if (!cellText.includes(filter)) {
                    match = false;
                }
            }
        });

        row.style.display = match ? '' : 'none';
    });
}

async function updateCell(rowIdx, colIdx, newValue) {
    currentTranslationData.rows[rowIdx][colIdx] = newValue;

    try {
        const response = await fetch(`/translation/${currentTranslationId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: currentTranslationData })
        });

        const result = await response.json();
        if (!result.success) {
            alert('Error updating cell: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error updating cell:', error);
        alert('Error updating cell');
    }
}

function closeViewModal(event) {
    if (!event || event.target.classList.contains('view-modal-overlay') || event.target.classList.contains('view-modal-close')) {
        document.getElementById('view-modal').style.display = 'none';
        currentTranslationId = null;
        currentTranslationData = null;
    }
}

async function exportToExcel() {
    if (!currentTranslationId) return;

    try {
        window.location.href = `/translation/${currentTranslationId}/export`;
    } catch (error) {
        console.error('Error exporting:', error);
        alert('Error exporting to Excel');
    }
}

function startRename(id) {
    const cell = document.getElementById(`table-name-${id}`);
    const currentName = cell.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.style.width = '100%';
    input.style.padding = '4px';
    input.style.border = '1px solid #000';
    input.style.fontSize = '11px';

    input.addEventListener('blur', () => saveRename(id, input.value, cell, currentName));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            input.blur();
        } else if (e.key === 'Escape') {
            cell.textContent = currentName;
        }
    });

    cell.innerHTML = '';
    cell.appendChild(input);
    input.focus();
    input.select();
}

async function saveRename(id, newName, cell, oldName) {
    newName = newName.trim();

    if (!newName || newName === oldName) {
        cell.textContent = oldName;
        return;
    }

    try {
        const response = await fetch(`/translation/${id}/rename`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ table_name: newName })
        });

        const result = await response.json();

        if (result.success) {
            cell.textContent = newName;
            const t = allTranslations.find(t => t.id === id);
            if (t) t.table_name = newName;
        } else {
            alert('Error: ' + (result.error || 'Failed to rename'));
            cell.textContent = oldName;
        }
    } catch (error) {
        console.error('Error renaming:', error);
        alert('Error renaming table');
        cell.textContent = oldName;
    }
}

async function deleteTranslation(id) {
    if (!confirm('Are you sure you want to delete this translation table?')) {
        return;
    }

    try {
        const response = await fetch(`/translation/${id}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            allTranslations = allTranslations.filter(t => t.id !== id);
            filterTranslations();
        } else {
            alert('Error: ' + (result.error || 'Failed to delete'));
        }
    } catch (error) {
        console.error('Error deleting:', error);
        alert('Error deleting translation table');
    }
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
