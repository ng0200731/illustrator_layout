// Customer management JavaScript

// Handle customer form submission
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('customerForm');
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            createCustomer();
        });
    }
});

// Create a new customer
function createCustomer() {
    const formData = {
        company_name: document.getElementById('company_name').value,
        email_domain: document.getElementById('email_domain').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        address: document.getElementById('address').value,
        notes: document.getElementById('notes').value
    };

    fetch('/customer/create', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('Customer created successfully! ID: ' + data.customer_id, 'success');
            document.getElementById('customerForm').reset();
        } else {
            showMessage('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showMessage('Error creating customer: ' + error, 'error');
    });
}

// Load and display all customers
function loadCustomers() {
    fetch('/customer/list')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                displayCustomers(data.customers);
            } else {
                showMessage('Error loading customers: ' + data.error, 'error');
            }
        })
        .catch(error => {
            showMessage('Error loading customers: ' + error, 'error');
        });
}

// Display customers in table
function displayCustomers(customers) {
    const tbody = document.getElementById('customerTableBody');
    if (!tbody) return;

    if (customers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">No customers found</td></tr>';
        return;
    }

    tbody.innerHTML = customers.map(customer => `
        <tr>
            <td>${customer.customer_id}</td>
            <td>${customer.company_name}</td>
            <td>${customer.email_domain}</td>
            <td>${customer.email || '-'}</td>
            <td>${customer.phone || '-'}</td>
            <td class="actions">
                <button onclick="editCustomer('${customer.customer_id}')">Edit</button>
                <button onclick="deleteCustomer('${customer.customer_id}')">Delete</button>
            </td>
        </tr>
    `).join('');
}

// Edit customer (placeholder - would open modal or form)
function editCustomer(customerId) {
    fetch('/customer/' + customerId)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Edit functionality coming soon!\n\nCustomer: ' + JSON.stringify(data.customer, null, 2));
            } else {
                showMessage('Error loading customer: ' + data.error, 'error');
            }
        })
        .catch(error => {
            showMessage('Error: ' + error, 'error');
        });
}

// Delete customer
function deleteCustomer(customerId) {
    if (!confirm('Are you sure you want to delete this customer?')) {
        return;
    }

    fetch('/customer/' + customerId, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('Customer deleted successfully', 'success');
            loadCustomers();
        } else {
            showMessage('Error deleting customer: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showMessage('Error: ' + error, 'error');
    });
}

// Show message to user
function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    if (!messageDiv) return;

    messageDiv.textContent = text;
    messageDiv.className = 'message ' + type;
    messageDiv.style.display = 'block';

    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 5000);
}
