// Font Manager JavaScript

let selectedFontId = null;
let loadedFonts = [];

// Initialize immediately when script loads (for tab-based loading)
(function() {
    // Wait a bit for DOM to be ready if loaded in a tab
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFontManager);
    } else {
        // DOM already loaded, init immediately
        setTimeout(initFontManager, 100);
    }
})();

function initFontManager() {
    console.log('Initializing font manager...');

    // Check if elements exist
    const uploadArea = document.getElementById('upload-area');
    const fontInput = document.getElementById('font-input');
    const btnChooseFont = document.getElementById('btn-choose-font');

    if (!uploadArea || !fontInput || !btnChooseFont) {
        console.warn('Font manager elements not found, retrying...');
        setTimeout(initFontManager, 200);
        return;
    }

    console.log('Font manager elements found, setting up...');
    initializeUpload();
    loadFonts();
}

function initializeUpload() {
    const uploadArea = document.getElementById('upload-area');
    const fontInput = document.getElementById('font-input');
    const btnChooseFont = document.getElementById('btn-choose-font');

    console.log('Setting up upload handlers...');

    // Button click - stop propagation to prevent upload area click
    btnChooseFont.addEventListener('click', (e) => {
        e.stopPropagation();
        fontInput.click();
    });

    // File input change
    fontInput.addEventListener('change', (e) => {
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

        if (e.dataTransfer.files.length > 0) {
            uploadFont(e.dataTransfer.files[0]);
        }
    });

    // Click on upload area (but not on button)
    uploadArea.addEventListener('click', (e) => {
        // Only trigger if clicking the area itself, not the button
        if (e.target === uploadArea || e.target.tagName === 'P') {
            fontInput.click();
        }
    });

    console.log('Upload handlers set up successfully');
}

async function uploadFont(file) {
    console.log('uploadFont called with:', file.name);

    // Validate file type
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
            alert('Font uploaded successfully');
            loadFonts();
        } else {
            alert('Upload failed: ' + result.error);
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert('Upload error: ' + error.message);
    }
}

async function loadFonts() {
    try {
        const response = await fetch('/font/list');
        const result = await response.json();

        if (result.success) {
            loadedFonts = result.fonts;
            displayFonts(result.fonts);
        }
    } catch (error) {
        console.error('Error loading fonts:', error);
    }
}

function displayFonts(fonts) {
    const fontsList = document.getElementById('fonts-list');
    const fontCount = document.getElementById('font-count');

    fontCount.textContent = `(${fonts.length} font${fonts.length !== 1 ? 's' : ''})`;

    if (fonts.length === 0) {
        fontsList.innerHTML = '<div class="empty-message">No fonts uploaded yet</div>';
        return;
    }

    fontsList.innerHTML = '';

    fonts.forEach(font => {
        const fontItem = document.createElement('div');
        fontItem.className = 'font-item';
        fontItem.dataset.fontId = font.id;

        fontItem.innerHTML = `
            <div class="font-info">
                <div class="font-name">${font.font_name}</div>
                <div class="font-filename">${font.filename}</div>
            </div>
            <div class="font-actions">
                <button onclick="showPreview(${font.id}, '${font.font_name}', '${font.filename}'); event.stopPropagation();">Preview</button>
                <button onclick="deleteFont(${font.id}); event.stopPropagation();">Delete</button>
            </div>
        `;

        fontItem.addEventListener('click', () => {
            selectFont(font.id, font.font_name, font.filename);
        });

        fontsList.appendChild(fontItem);
    });
}

function selectFont(fontId, fontName, filename) {
    // Remove previous selection
    document.querySelectorAll('.font-item').forEach(item => {
        item.classList.remove('selected');
    });

    // Add selection
    const fontItem = document.querySelector(`[data-font-id="${fontId}"]`);
    if (fontItem) {
        fontItem.classList.add('selected');
    }

    selectedFontId = fontId;
    showPreview(fontId, fontName, filename);
}

async function showPreview(fontId, fontName, filename) {
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
        // Create @font-face dynamically
        const fontFace = new FontFace(fontName, `url(/font/download/${fontId})`);
        await fontFace.load();
        document.fonts.add(fontFace);
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
        html += `<div class="character-grid">`;

        for (let char of section.chars) {
            if (char === ' ') continue; // Skip spaces

            // Escape special characters for onclick
            const escapedChar = char.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\\/g, '\\\\');
            const escapedFontName = fontName.replace(/'/g, "\\'");

            html += `<div class="character-item" onclick="selectCharacter('${escapedChar}', '${escapedFontName}')" style="font-family: '${fontName}', sans-serif;" title="Click to add to layout">`;
            html += char;
            html += `</div>`;
        }

        html += `</div></div>`;
    });

    return html;
}

function selectCharacter(char, fontName) {
    // Check if a layout tab is open
    const layoutTab = findLayoutTab();

    if (!layoutTab) {
        alert('Please open a layout (Layout → Create → Draw) to add characters');
        return;
    }

    // Add character to layout
    // This function needs to be implemented in draw_manager.js
    if (typeof addTextToCanvas === 'function') {
        addTextToCanvas(char, fontName);
    } else {
        console.warn('addTextToCanvas function not found. Character:', char);
        alert('Layout integration not yet implemented');
    }
}

function findLayoutTab() {
    // Look for an active layout tab
    const tabs = document.querySelectorAll('.tab');
    for (let tab of tabs) {
        const title = tab.textContent;
        if (title.includes('Layout (Draw)')) {
            return tab;
        }
    }
    return null;
}

async function deleteFont(fontId) {
    if (!confirm('Are you sure you want to delete this font?')) {
        return;
    }

    try {
        const response = await fetch(`/font/${fontId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.success) {
            alert('Font deleted successfully');
            loadFonts();

            // Hide preview if deleted font was selected
            if (selectedFontId === fontId) {
                document.getElementById('preview-section').style.display = 'none';
                selectedFontId = null;
            }
        } else {
            alert('Delete failed: ' + result.error);
        }
    } catch (error) {
        alert('Delete error: ' + error.message);
    }
}

// Export function for use in other scripts
window.getAvailableFonts = function() {
    return loadedFonts;
};
