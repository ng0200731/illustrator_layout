// Font Upload JavaScript — Two-step flow: preview locally, then upload to database
// Supports multiple file upload

let pendingFiles = []; // Array of { file, fontName }

// Initialize immediately when script loads
(function() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFontUpload);
    } else {
        setTimeout(initFontUpload, 100);
    }
})();

function initFontUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fontInput = document.getElementById('font-input');
    const btnChooseFont = document.getElementById('btn-choose-font');

    if (!uploadArea || !fontInput || !btnChooseFont) {
        setTimeout(initFontUpload, 200);
        return;
    }

    initializeUpload();
}

function initializeUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fontInput = document.getElementById('font-input');
    const btnChooseFont = document.getElementById('btn-choose-font');
    const btnUploadToDb = document.getElementById('btn-upload-to-db');

    btnChooseFont.addEventListener('click', (e) => {
        e.stopPropagation();
        fontInput.click();
    });

    fontInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            previewFonts(Array.from(e.target.files));
        }
    });

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.style.background = '#f5f5f5';
    });

    uploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.style.background = 'white';
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadArea.style.background = 'white';
        if (e.dataTransfer.files.length > 0) {
            previewFonts(Array.from(e.dataTransfer.files));
        }
    });

    uploadArea.addEventListener('click', (e) => {
        if (e.target === uploadArea || e.target.tagName === 'P') {
            fontInput.click();
        }
    });

    // Upload to database button — opens modal
    btnUploadToDb.addEventListener('click', showUploadModal);
}

async function previewFonts(files) {
    // Filter valid font files
    const validFiles = files.filter(f => {
        const ext = f.name.split('.').pop().toLowerCase();
        return ext === 'ttf' || ext === 'otf';
    });

    if (validFiles.length === 0) {
        alert('Only .ttf and .otf files are allowed');
        return;
    }

    pendingFiles = [];

    for (const file of validFiles) {
        const fontName = file.name.replace(/\.(ttf|otf)$/i, '');

        try {
            const objectUrl = URL.createObjectURL(file);
            const fontFace = new FontFace(fontName, `url(${objectUrl})`);
            await fontFace.load();
            document.fonts.add(fontFace);
            pendingFiles.push({ file, fontName });
        } catch (error) {
            console.warn('Error loading font ' + file.name + ': ' + error.message);
        }
    }

    if (pendingFiles.length === 0) {
        alert('No valid fonts could be loaded');
        return;
    }

    const reviewSection = document.getElementById('review-section');
    const previewContent = document.getElementById('font-preview-content');

    let html = '';
    for (const pf of pendingFiles) {
        html += '<div class="font-preview-item">';
        html += '<h3 style="margin:8px 0 4px;font-size:13px;border-bottom:1px solid #000;padding-bottom:4px;">' + escapeHtml(pf.fontName) + '</h3>';
        html += renderCharacterPreview(pf.fontName);
        html += '</div>';
    }

    previewContent.innerHTML = html;
    reviewSection.style.display = 'block';
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderCharacterPreview(fontName) {
    const sections = [
        { label: 'Uppercase (A-Z)', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
        { label: 'Lowercase (a-z)', chars: 'abcdefghijklmnopqrstuvwxyz' },
        { label: 'Numbers (0-9)', chars: '0123456789' },
        { label: 'Symbols', chars: '!@#$%^&*()_+-={}[]|\\:;"\'<>,.?/~`' }
    ];

    let html = '';
    sections.forEach(section => {
        html += '<div class="preview-group">';
        html += '<div class="preview-label">' + section.label + '</div>';
        html += '<div class="glyph-grid">';
        for (var i = 0; i < section.chars.length; i++) {
            var ch = section.chars[i];
            var display = ch.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
            html += '<div class="glyph-cell">';
            html += '<div class="glyph-key">' + display + '</div>';
            html += '<div class="glyph-render" style="font-family:\'' + fontName + '\', sans-serif;">' + display + '</div>';
            html += '</div>';
        }
        html += '</div></div>';
    });

    return html;
}

function showUploadModal() {
    if (pendingFiles.length === 0) {
        alert('No font files to upload');
        return;
    }

    const modal = document.getElementById('font-upload-modal');
    const customerSelect = document.getElementById('font-customer-select');
    const btnPublic = document.getElementById('btn-upload-public');
    const btnCancel = document.getElementById('btn-modal-cancel');

    // Load customers
    customerSelect.innerHTML = '<option value="">Loading customers...</option>';
    fetch('/customer/list')
        .then(r => r.json())
        .then(data => {
            if (data.success && data.customers) {
                customerSelect.innerHTML = '<option value="">Select a customer...</option>';
                data.customers.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.customer_id;
                    opt.textContent = c.company_name;
                    customerSelect.appendChild(opt);
                });
            } else {
                customerSelect.innerHTML = '<option value="">No customers found</option>';
            }
        })
        .catch(() => {
            customerSelect.innerHTML = '<option value="">Error loading customers</option>';
        });

    modal.classList.add('active');

    customerSelect.onchange = function() {
        if (this.value) {
            doUploadAll(this.value);
        }
    };

    btnPublic.onclick = function() {
        doUploadAll(null);
    };

    btnCancel.onclick = function() {
        modal.classList.remove('active');
    };
}

async function doUploadAll(customerId) {
    const modal = document.getElementById('font-upload-modal');
    const total = pendingFiles.length;
    let successCount = 0;
    let errors = [];

    for (const pf of pendingFiles) {
        const formData = new FormData();
        formData.append('font', pf.file);
        formData.append('font_name', pf.fontName);
        formData.append('customer_id', customerId || '');

        try {
            const response = await fetch('/font/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                successCount++;
            } else {
                errors.push(pf.fontName + ': ' + result.error);
            }
        } catch (error) {
            errors.push(pf.fontName + ': ' + error.message);
        }
    }

    const label = customerId ? 'customer' : 'public';
    let msg = successCount + ' of ' + total + ' font(s) uploaded as ' + label + ' successfully.';
    if (errors.length > 0) {
        msg += '\n\nFailed:\n' + errors.join('\n');
    }
    alert(msg);

    pendingFiles = [];
    modal.classList.remove('active');
    document.getElementById('review-section').style.display = 'none';
    document.getElementById('font-preview-content').innerHTML = '';
}
