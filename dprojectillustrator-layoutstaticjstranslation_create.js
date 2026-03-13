// Translation Create JavaScript

let translationData = null;

(function() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTranslationCreate);
    } else {
        setTimeout(initTranslationCreate, 100);
    }
})();

function initTranslationCreate() {
    const uploadArea = document.getElementById('excel-upload-area');
    if (!uploadArea) {
        setTimeout(initTranslationCreate, 200);
        return;
    }

    // Drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleExcelFile(files[0]);
        }
    });

    loadCustomers();
}

async function loadCustomers() {
    try {
        const response = await fetch('/customer/list');
        const data = await response.json();
        if (data.success && data.customers) {
            const select = document.getElementById('customer-select');
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

function handleExcelUpload(input) {
    if (input.files.length > 0) {
        handleExcelFile(input.files[0]);
    }
}

async function handleExcelFile(file) {
    const errorDiv = document.getElementById('excel-error');
    errorDiv.style.display = 'none';

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
        errorDiv.textContent = 'Only .xlsx and .xls files are allowed';
        errorDiv.style.display = 'block';
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/translation/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            translationData = result.data;
            renderPreviewTable(translationData);
            document.getElementById('preview-section').style.display = 'block';
        } else {
            errorDiv.textContent = result.error || 'Failed to parse Excel file';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'Error uploading file: ' + error.message;
        errorDiv.style.display = 'block';
    }
}

function renderPreviewTable(data) {
    const table = document.getElementById('preview-table');
    table.innerHTML = '';

    // Headers
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    data.headers.forEach(header => {
        const th = document.createElement('th');
        th.textContent = header;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Rows
    const tbody = document.createElement('tbody');
    data.rows.forEach((row, rowIdx) => {
        const tr = document.createElement('tr');
        row.forEach((cell, colIdx) => {
            const td = document.createElement('td');
            td.textContent = cell;
            td.contentEditable = true;
            td.addEventListener('blur', () => {
                translationData.rows[rowIdx][colIdx] = td.textContent.trim();
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

function showSaveModal() {
    document.getElementById('save-modal').style.display = 'flex';
}

function closeSaveModal(event) {
    if (!event || event.target.classList.contains('modal-overlay') || event.target.classList.contains('modal-close')) {
        document.getElementById('save-modal').style.display = 'none';
    }
}

async function saveTranslationTable() {
    const tableName = document.getElementById('table-name-input').value.trim();
    const customerId = document.getElementById('customer-select').value || null;

    if (!tableName) {
        alert('Please enter a table name');
        return;
    }

    try {
        const response = await fetch('/translation/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table_name: tableName,
                customer_id: customerId,
                data: translationData
            })
        });

        const result = await response.json();

        if (result.success) {
            alert('Translation table saved successfully');
            closeSaveModal();
            // Reset form
            document.getElementById('excel-input').value = '';
            document.getElementById('preview-section').style.display = 'none';
            translationData = null;
        } else {
            alert('Error: ' + (result.error || 'Failed to save'));
        }
    } catch (error) {
        alert('Error saving translation table: ' + error.message);
    }
}
