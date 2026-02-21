// Font Upload JavaScript

// Initialize immediately when script loads
(function() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFontUpload);
    } else {
        setTimeout(initFontUpload, 100);
    }
})();

function initFontUpload() {
    console.log('Initializing font upload...');

    const uploadArea = document.getElementById('upload-area');
    const fontInput = document.getElementById('font-input');
    const btnChooseFont = document.getElementById('btn-choose-font');

    if (!uploadArea || !fontInput || !btnChooseFont) {
        console.warn('Font upload elements not found, retrying...');
        setTimeout(initFontUpload, 200);
        return;
    }

    console.log('Font upload elements found, setting up...');
    initializeUpload();
    loadRecentFonts();
}

function initializeUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fontInput = document.getElementById('font-input');
    const btnChooseFont = document.getElementById('btn-choose-font');

    console.log('Setting up upload handlers...');

    // Button click
    btnChooseFont.addEventListener('click', (e) => {
        e.stopPropagation();
        console.log('Choose file button clicked');
        fontInput.click();
    });

    // File input change
    fontInput.addEventListener('change', (e) => {
        console.log('File input changed');
        if (e.target.files.length > 0) {
            uploadFont(e.target.files[0]);
        }
    });

    // Drag and drop
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
        console.log('File dropped');

        if (e.dataTransfer.files.length > 0) {
            uploadFont(e.dataTransfer.files[0]);
        }
    });

    // Click on upload area
    uploadArea.addEventListener('click', (e) => {
        if (e.target === uploadArea || e.target.tagName === 'P') {
            console.log('Upload area clicked');
            fontInput.click();
        }
    });

    console.log('Upload handlers set up successfully');
}

async function uploadFont(file) {
    console.log('uploadFont called with:', file.name);

    const ext = file.name.split('.').pop().toLowerCase();
    if (ext !== 'ttf' && ext !== 'otf') {
        alert('Only .ttf and .otf files are allowed');
        return;
    }

    const formData = new FormData();
    formData.append('font', file);
    formData.append('font_name', file.name.replace(/\.(ttf|otf)$/i, ''));

    console.log('Uploading font to /font/upload...');

    try {
        const response = await fetch('/font/upload', {
            method: 'POST',
            body: formData
        });

        console.log('Upload response status:', response.status);
        const result = await response.json();
        console.log('Upload result:', result);

        if (result.success) {
            alert('Font uploaded successfully: ' + result.font.font_name);
            loadRecentFonts();
            // Show preview of uploaded font
            showPreview(result.font.id, result.font.font_name);
        } else {
            alert('Upload failed: ' + result.error);
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('Upload error: ' + error.message);
    }
}

async function showPreview(fontId, fontName) {
    console.log('Showing preview for:', fontName);

    const previewSection = document.getElementById('preview-section');
    const previewContent = document.getElementById('font-preview-content');

    // Load font dynamically
    await loadFontFile(fontId, fontName);

    // Generate character preview
    const html = renderCharacterPreview(fontName);
    previewContent.innerHTML = html;

    previewSection.style.display = 'block';
}

async function loadFontFile(fontId, fontName) {
    try {
        const fontFace = new FontFace(fontName, `url(/font/download/${fontId})`);
        await fontFace.load();
        document.fonts.add(fontFace);
        console.log('Font loaded:', fontName);
    } catch (error) {
        console.error('Error loading font:', error);
    }
}

function renderCharacterPreview(fontName) {
    const sections = [
        { label: 'Lowercase (a-z)', chars: 'abcdefghijklmnopqrstuvwxyz' },
        { label: 'Uppercase (A-Z)', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
        { label: 'Numbers (0-9)', chars: '0123456789' },
        { label: 'Symbols', chars: '! @ # $ % ^ & * ( ) _ + - = { } [ ] | \\ : ; " \' < > , . ? / ~ `' }
    ];

    let html = '';

    sections.forEach(section => {
        html += `<div class="preview-group">`;
        html += `<div class="preview-label">${section.label}</div>`;
        html += `<div class="preview-text" style="font-family: '${fontName}', sans-serif;">`;

        // Display each character on a new line
        for (let char of section.chars) {
            if (char === ' ') continue;
            html += char + '<br>';
        }

        html += `</div></div>`;
    });

    return html;
}

async function loadRecentFonts() {
    try {
        const response = await fetch('/font/list');
        const result = await response.json();

        if (result.success) {
            displayRecentFonts(result.fonts.slice(0, 5)); // Show only 5 most recent
        }
    } catch (error) {
        console.error('Error loading fonts:', error);
    }
}

function displayRecentFonts(fonts) {
    const fontsList = document.getElementById('fonts-list');
    const fontCount = document.getElementById('font-count');

    fontCount.textContent = `(${fonts.length} recent)`;

    if (fonts.length === 0) {
        fontsList.innerHTML = '<div class="empty-message">No fonts uploaded yet</div>';
        return;
    }

    fontsList.innerHTML = '';

    fonts.forEach(font => {
        const fontItem = document.createElement('div');
        fontItem.className = 'font-item';

        fontItem.innerHTML = `
            <div class="font-info">
                <div class="font-name">${font.font_name}</div>
                <div class="font-filename">${font.filename}</div>
            </div>
        `;

        fontsList.appendChild(fontItem);
    });
}
