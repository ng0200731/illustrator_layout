// Font View JavaScript

let selectedFontId = null;

// Initialize immediately when script loads
(function() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFontView);
    } else {
        setTimeout(initFontView, 100);
    }
})();

function initFontView() {
    console.log('Initializing font view...');

    const fontsGrid = document.getElementById('fonts-grid');

    if (!fontsGrid) {
        console.warn('Font view elements not found, retrying...');
        setTimeout(initFontView, 200);
        return;
    }

    console.log('Font view elements found, loading fonts...');
    loadAllFonts();
}

async function loadAllFonts() {
    try {
        const response = await fetch('/font/list');
        const result = await response.json();

        if (result.success) {
            displayFonts(result.fonts);
        }
    } catch (error) {
        console.error('Error loading fonts:', error);
    }
}

function displayFonts(fonts) {
    const fontsGrid = document.getElementById('fonts-grid');
    const fontCount = document.getElementById('font-count');

    fontCount.textContent = `(${fonts.length} font${fonts.length !== 1 ? 's' : ''})`;

    if (fonts.length === 0) {
        fontsGrid.innerHTML = '<div class="empty-message">No fonts uploaded yet</div>';
        return;
    }

    fontsGrid.innerHTML = '';

    fonts.forEach(font => {
        const fontCard = document.createElement('div');
        fontCard.className = 'font-card';
        fontCard.dataset.fontId = font.id;

        fontCard.innerHTML = `
            <div class="font-card-header">
                <div class="font-name">${font.font_name}</div>
                <div class="font-actions">
                    <button onclick="showPreview(${font.id}, '${font.font_name}'); event.stopPropagation();" title="Preview">👁</button>
                    <button onclick="deleteFont(${font.id}); event.stopPropagation();" title="Delete">🗑</button>
                </div>
            </div>
            <div class="font-filename">${font.filename}</div>
            <div class="font-date">Uploaded: ${new Date(font.created_at).toLocaleDateString()}</div>
        `;

        fontCard.addEventListener('click', () => {
            showPreview(font.id, font.font_name);
        });

        fontsGrid.appendChild(fontCard);
    });
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
    selectedFontId = fontId;
}

function closePreview() {
    const previewSection = document.getElementById('preview-section');
    previewSection.style.display = 'none';
    selectedFontId = null;
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
        html += `<div class="character-grid">`;

        for (let char of section.chars) {
            if (char === ' ') continue;

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
    if (typeof addTextToCanvas === 'function') {
        addTextToCanvas(char, fontName);
    } else {
        alert('Please open a layout (Layout → Create → PDF) to add characters');
    }
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
            loadAllFonts();

            // Hide preview if deleted font was selected
            if (selectedFontId === fontId) {
                closePreview();
            }
        } else {
            alert('Delete failed: ' + result.error);
        }
    } catch (error) {
        alert('Delete error: ' + error.message);
    }
}
