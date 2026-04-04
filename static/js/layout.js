// Layout management JavaScript

// Load and display all layouts
function loadLayouts() {
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

// Delete selected layouts
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
