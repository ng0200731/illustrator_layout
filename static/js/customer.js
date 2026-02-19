// Customer management JavaScript

// Store current customer ID and members
let currentCustomerId = null;
let currentMembers = [];

// Handle customer form submission
document.addEventListener('DOMContentLoaded', function() {
    // Setup email domain preview
    const emailDomainInput = document.getElementById('email_domain');
    const emailPrefixInput = document.getElementById('member_email_prefix');

    if (emailDomainInput) {
        emailDomainInput.addEventListener('input', updateEmailPreview);
    }

    if (emailPrefixInput) {
        emailPrefixInput.addEventListener('input', updateEmailPreview);
    }
});

// Switch between form tabs
function switchFormTab(tabName) {
    // Don't allow switching to member tab if company not saved
    if (tabName === 'member' && !currentCustomerId) {
        return;
    }

    // Update tab buttons
    document.querySelectorAll('.form-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.getElementById(tabName + 'Tab').classList.add('active');

    // Update tab content
    document.querySelectorAll('.form-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName + 'Content').classList.add('active');

    // Load members if switching to member tab
    if (tabName === 'member' && currentCustomerId) {
        loadMembers();
    }
}

// Save company information
function saveCompany() {
    const companyName = document.getElementById('company_name').value;
    const emailDomain = document.getElementById('email_domain').value;
    const companyType = document.getElementById('company_type').value;

    if (!companyName || !emailDomain || !companyType) {
        showMessage('Please fill in all required company fields', 'error');
        return;
    }

    const formData = {
        company_name: companyName,
        email_domain: emailDomain,
        company_type: companyType
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
            currentCustomerId = data.customer_id;
            showMessage('Company saved! ID: ' + data.customer_id, 'success');

            // Enable member tab
            document.getElementById('memberTab').disabled = false;

            // Update email domain display in member tab
            updateEmailPreview();

            // Switch to member tab
            setTimeout(() => {
                switchFormTab('member');
            }, 1000);
        } else {
            showMessage('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showMessage('Error saving company: ' + error, 'error');
    });
}

// Add member to customer
function addMember() {
    if (!currentCustomerId) {
        showMessage('Please save company information first', 'error');
        return;
    }

    const memberPrefix = document.getElementById('member_email_prefix').value;
    const emailDomain = document.getElementById('email_domain').value;
    const memberEmail = memberPrefix && emailDomain ? memberPrefix + '@' + emailDomain : null;
    const memberName = document.getElementById('member_name').value;
    const memberTitle = document.getElementById('member_title').value;
    const memberPhone = document.getElementById('member_tel').value;

    if (!memberName) {
        showMessage('Please enter member name', 'error');
        return;
    }

    const formData = {
        name: memberName,
        title: memberTitle,
        email: memberEmail,
        phone: memberPhone
    };

    fetch('/customer/' + currentCustomerId + '/members', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('Member added successfully!', 'success');
            resetMemberForm();
            loadMembers();
        } else {
            showMessage('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showMessage('Error adding member: ' + error, 'error');
    });
}

// Load members for current customer
function loadMembers() {
    if (!currentCustomerId) return;

    fetch('/customer/' + currentCustomerId + '/members')
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            currentMembers = data.members;
            displayMemberList();
        }
    })
    .catch(error => {
        console.error('Error loading members:', error);
    });
}

// Display member list
function displayMemberList() {
    const memberList = document.getElementById('memberList');
    if (!memberList) return;

    if (currentMembers.length === 0) {
        memberList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">No members added yet</p>';
        return;
    }

    memberList.innerHTML = currentMembers.map(member => `
        <div class="member-card">
            <div class="member-info">
                <div class="member-name">${member.name || '-'}</div>
                <div class="member-details">
                    ${member.title ? '<span class="member-title">' + member.title + '</span>' : ''}
                    ${member.email ? '<span class="member-email">' + member.email + '</span>' : ''}
                    ${member.phone ? '<span class="member-phone">' + member.phone + '</span>' : ''}
                </div>
            </div>
            <button class="btn-delete-member" onclick="deleteMember('${member.member_id}')">Delete</button>
        </div>
    `).join('');
}

// Delete member
function deleteMember(memberId) {
    if (!confirm('Are you sure you want to delete this member?')) {
        return;
    }

    fetch('/customer/members/' + memberId, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('Member deleted successfully!', 'success');
            loadMembers();
        } else {
            showMessage('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showMessage('Error deleting member: ' + error, 'error');
    });
}

// Finish and start new customer
function finishAndNew() {
    resetAllForms();
    switchFormTab('company');
    showMessage('Ready to create new customer', 'success');
}

// Reset company form
function resetCompanyForm() {
    document.getElementById('company_name').value = '';
    document.getElementById('email_domain').value = '';
    document.getElementById('company_type').value = '';
    updateEmailPreview();
}

// Reset member form
function resetMemberForm() {
    document.getElementById('member_name').value = '';
    document.getElementById('member_title').value = '';
    document.getElementById('member_email_prefix').value = '';
    document.getElementById('member_tel').value = '';
    updateEmailPreview();
}

// Reset all forms
function resetAllForms() {
    currentCustomerId = null;
    resetCompanyForm();
    resetMemberForm();

    // Disable member tab
    document.getElementById('memberTab').disabled = true;
}

// Update email preview when domain or prefix changes
function updateEmailPreview() {
    const domain = document.getElementById('email_domain').value;
    const prefix = document.getElementById('member_email_prefix').value;
    const domainDisplay = document.getElementById('email_domain_display');
    const fullEmailPreview = document.getElementById('full_email_preview');

    if (domainDisplay) {
        domainDisplay.textContent = domain || 'example.com';
    }

    if (fullEmailPreview) {
        if (prefix && domain) {
            fullEmailPreview.textContent = prefix + '@' + domain;
        } else {
            fullEmailPreview.textContent = '-';
        }
    }
}

// Dummy data generators
const dummyCompanies = [
    { name: 'Acme Corporation', domain: 'acme.com', type: 'buyer' },
    { name: 'Global Textiles Ltd', domain: 'globaltextiles.com', type: 'factory' },
    { name: 'Fashion Forward Inc', domain: 'fashionforward.com', type: 'buyer' },
    { name: 'Textile Agents Co', domain: 'textilagents.com', type: 'agent' },
    { name: 'Premium Fabrics', domain: 'premiumfabrics.com', type: 'factory' },
    { name: 'Style Sourcing', domain: 'stylesourcing.com', type: 'agent' }
];

const dummyMembers = [
    { name: 'John Smith', title: 'Purchasing Manager', prefix: 'john.smith', tel: '+1-555-0101' },
    { name: 'Sarah Johnson', title: 'Sales Director', prefix: 'sarah.j', tel: '+1-555-0102' },
    { name: 'Michael Chen', title: 'Operations Manager', prefix: 'michael.chen', tel: '+1-555-0103' },
    { name: 'Emily Davis', title: 'Account Executive', prefix: 'emily.davis', tel: '+1-555-0104' },
    { name: 'David Wilson', title: 'Production Manager', prefix: 'd.wilson', tel: '+1-555-0105' },
    { name: 'Lisa Anderson', title: 'Quality Control', prefix: 'l.anderson', tel: '+1-555-0106' }
];

// Fill dummy company data
function fillDummyCompany() {
    const company = dummyCompanies[Math.floor(Math.random() * dummyCompanies.length)];
    document.getElementById('company_name').value = company.name;
    document.getElementById('email_domain').value = company.domain;
    document.getElementById('company_type').value = company.type;
    updateEmailPreview();
}

// Fill dummy member data
function fillDummyMember() {
    const member = dummyMembers[Math.floor(Math.random() * dummyMembers.length)];
    document.getElementById('member_name').value = member.name;
    document.getElementById('member_title').value = member.title;
    document.getElementById('member_email_prefix').value = member.prefix;
    document.getElementById('member_tel').value = member.tel;
    updateEmailPreview();
}

// Reset form
function resetForm() {
    document.getElementById('company_name').value = '';
    document.getElementById('email_domain').value = '';
    document.getElementById('company_type').value = '';
    document.getElementById('member_name').value = '';
    document.getElementById('member_title').value = '';
    document.getElementById('member_email_prefix').value = '';
    document.getElementById('member_tel').value = '';
    updateEmailPreview();
}

// Create customer with member
function createCustomerWithMember() {
    const companyName = document.getElementById('company_name').value;
    const emailDomain = document.getElementById('email_domain').value;
    const companyType = document.getElementById('company_type').value;

    if (!companyName || !emailDomain || !companyType) {
        showMessage('Please fill in all required company fields', 'error');
        return;
    }

    const memberPrefix = document.getElementById('member_email_prefix').value;
    const memberEmail = memberPrefix && emailDomain ? memberPrefix + '@' + emailDomain : null;

    const formData = {
        company_name: companyName,
        email_domain: emailDomain,
        company_type: companyType,
        email: memberEmail,
        phone: document.getElementById('member_tel').value,
        member_name: document.getElementById('member_name').value,
        member_title: document.getElementById('member_title').value
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
            resetForm();
        } else {
            showMessage('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showMessage('Error creating customer: ' + error, 'error');
    });
}

// Create a new customer (legacy function)
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

    tbody.innerHTML = customers.map((customer, index) => {
        // Format members display
        let membersDisplay = 'No members';
        if (customer.members && customer.members.length > 0) {
            membersDisplay = `${customer.members.length} member${customer.members.length > 1 ? 's' : ''}`;
        }

        // Create member details row (hidden by default)
        let memberDetailsRow = '';
        if (customer.members && customer.members.length > 0) {
            const memberCards = customer.members.map(member => `
                <div class="member-detail-card">
                    <div class="member-detail-info">
                        <div class="member-detail-name">${member.name || '-'}</div>
                        <div class="member-detail-meta">
                            ${member.title ? '<span class="member-detail-title">📋 ' + member.title + '</span>' : ''}
                            ${member.email ? '<span class="member-detail-email">✉️ ' + member.email + '</span>' : ''}
                            ${member.phone ? '<span class="member-detail-phone">📞 ' + member.phone + '</span>' : ''}
                        </div>
                    </div>
                    <button class="btn-delete-member-small" onclick="deleteMemberFromView('${member.member_id}', '${customer.customer_id}')">Delete</button>
                </div>
            `).join('');

            memberDetailsRow = `
                <tr class="member-details-row" id="details-${customer.customer_id}" style="display: none;">
                    <td colspan="6">
                        <div class="member-details-container">
                            <h4>Members of ${customer.company_name}</h4>
                            <div class="member-details-list">
                                ${memberCards}
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }

        return `
        <tr class="customer-row" onclick="toggleMemberDetails('${customer.customer_id}')">
            <td>${customer.customer_id}</td>
            <td>${customer.company_name}</td>
            <td>${customer.company_type ? customer.company_type.toUpperCase() : '-'}</td>
            <td>${customer.email_domain}</td>
            <td>${membersDisplay}</td>
            <td class="actions" onclick="event.stopPropagation()">
                <button onclick="editCustomer('${customer.customer_id}')">Edit</button>
                <button onclick="deleteCustomer('${customer.customer_id}')">Delete</button>
            </td>
        </tr>
        ${memberDetailsRow}
        `;
    }).join('');
}

// Toggle member details row
function toggleMemberDetails(customerId) {
    const detailsRow = document.getElementById('details-' + customerId);
    if (detailsRow) {
        if (detailsRow.style.display === 'none') {
            detailsRow.style.display = 'table-row';
        } else {
            detailsRow.style.display = 'none';
        }
    }
}

// Delete member from view
function deleteMemberFromView(memberId, customerId) {
    if (!confirm('Are you sure you want to delete this member?')) {
        return;
    }

    fetch('/customer/members/' + memberId, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showMessage('Member deleted successfully!', 'success');
            loadCustomers(); // Reload the customer list
        } else {
            showMessage('Error: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showMessage('Error deleting member: ' + error, 'error');
    });
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
