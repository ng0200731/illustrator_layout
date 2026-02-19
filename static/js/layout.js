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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No layouts found</td></tr>';
        return;
    }

    tbody.innerHTML = layouts.map(layout => {
        const createdDate = new Date(layout.created_at).toLocaleDateString();
        return `
            <tr>
                <td>${layout.layout_id}</td>
                <td>${layout.name}</td>
                <td>${layout.type.toUpperCase()}</td>
                <td>${layout.customer_id || '-'}</td>
                <td>${createdDate}</td>
                <td class="actions">
                    <button onclick="openLayout('${layout.layout_id}')">Open</button>
                    <button onclick="deleteLayout('${layout.layout_id}')">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Open a layout in a new tab
function openLayout(layoutId) {
    fetch('/layout/' + layoutId)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const layout = data.layout;
                // Open PDF manager tab and load the layout data
                if (layout.type === 'pdf') {
                    openTab('Layout: ' + layout.name, '/layout/create/pdf?load=' + layoutId);
                } else {
                    alert('Layout type not supported yet: ' + layout.type);
                }
            } else {
                showLayoutMessage('Error loading layout: ' + data.error, 'error');
            }
        })
        .catch(error => {
            showLayoutMessage('Error: ' + error, 'error');
        });
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
