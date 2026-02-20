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
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px;">No layouts found</td></tr>';
        return;
    }

    console.log('Displaying layouts:', layouts);
    tbody.innerHTML = layouts.map(layout => {
        console.log('Layout ID:', layout.id, 'Type:', typeof layout.id);

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

        return `
            <tr>
                <td>${layout.id}</td>
                <td>${layout.name}</td>
                <td>${layout.type.toUpperCase()}</td>
                <td>${customerName}</td>
                <td>${createdDate}</td>
                <td>${updatedDate}</td>
                <td class="actions">
                    <button onclick="openLayout(${layout.id})">Open</button>
                    <button onclick="deleteLayout(${layout.id})">Delete</button>
                </td>
            </tr>
        `;
    }).join('');
}

// Open a layout in a new tab
function openLayout(layoutId) {
    console.log('Opening layout with ID:', layoutId);
    // Open PDF manager tab with layout ID in URL
    openTab('Layout: ' + layoutId, '/layout/create/pdf?load=' + layoutId);
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
