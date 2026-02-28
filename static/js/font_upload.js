// Font Upload JavaScript — Two-step flow: preview locally, then upload to database

let pendingFile = null;
let pendingFontName = null;

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
            previewFont(e.target.files[0]);
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
            previewFont(e.dataTransfer.files[0]);
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

async function previewFont(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'ttf' && ext !== 'otf') {
        alert('Only .ttf and .otf files are allowed');
        return;
    }

    pendingFile = file;
    pendingFontName = file.name.replace(/\.(ttf|otf)$/i, '');

    try {
        const objectUrl = URL.createObjectURL(file);
        const fontFace = new FontFace(pendingFontName, `url(${objectUrl})`);
        await fontFace.load();
        document.fonts.add(fontFace);
    } catch (error) {
        alert('Error loading font: ' + error.message);
        return;
    }

    const reviewSection = document.getElementById('review-section');
    const previewContent = document.getElementById('font-preview-content');
    previewContent.innerHTML = renderCharacterPreview(pendingFontName);
    reviewSection.style.display = 'block';
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
    if (!pendingFile) {
        alert('No font file to upload');
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
            doUpload(this.value);
        }
    };

    btnPublic.onclick = function() {
        doUpload(null);
    };

    btnCancel.onclick = function() {
        modal.classList.remove('active');
    };
}

async function doUpload(customerId) {
    const modal = document.getElementById('font-upload-modal');

    const formData = new FormData();
    formData.append('font', pendingFile);
    formData.append('font_name', pendingFontName);
    formData.append('customer_id', customerId || '');

    try {
        const response = await fetch('/font/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            const label = customerId ? 'customer' : 'public';
            alert('Font "' + pendingFontName + '" uploaded as ' + label + ' successfully');
            pendingFile = null;
            pendingFontName = null;

            modal.classList.remove('active');
            document.getElementById('review-section').style.display = 'none';
            document.getElementById('font-preview-content').innerHTML = '';
        } else {
            alert('Upload failed: ' + result.error);
        }
    } catch (error) {
        alert('Upload error: ' + error.message);
    }
}
