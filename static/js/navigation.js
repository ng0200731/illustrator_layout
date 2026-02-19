// Tab and sidebar navigation management

// Tab state management
let tabs = [];
let activeTabId = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    loadTabsFromStorage();
    renderTabs();
});

// Toggle menu expansion
function toggleMenu(element) {
    const menuItem = element.parentElement;
    menuItem.classList.toggle('expanded');
}

// Open or switch to a tab
function openTab(title, url) {
    // Check if tab already exists
    const existingTab = tabs.find(tab => tab.url === url);

    if (existingTab) {
        // Switch to existing tab
        switchTab(existingTab.id);
    } else {
        // Create new tab
        const tabId = 'tab-' + Date.now();
        const newTab = {
            id: tabId,
            title: title,
            url: url
        };

        tabs.push(newTab);
        saveTabsToStorage();

        // Load content and switch to new tab
        loadTabContent(tabId, url);
        switchTab(tabId);
    }
}

// Switch to a specific tab
function switchTab(tabId) {
    activeTabId = tabId;
    saveTabsToStorage();
    renderTabs();

    // Show only the active tab content
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });

    const activePane = document.getElementById(tabId + '-content');
    if (activePane) {
        activePane.classList.add('active');
    }
}

// Close a tab
function closeTab(tabId, event) {
    event.stopPropagation();

    const tabIndex = tabs.findIndex(tab => tab.id === tabId);
    if (tabIndex === -1) return;

    // Remove tab
    tabs.splice(tabIndex, 1);

    // Remove content
    const contentPane = document.getElementById(tabId + '-content');
    if (contentPane) {
        contentPane.remove();
    }

    // If closing active tab, switch to previous tab
    if (activeTabId === tabId) {
        if (tabs.length > 0) {
            const newActiveTab = tabs[Math.max(0, tabIndex - 1)];
            switchTab(newActiveTab.id);
        } else {
            activeTabId = null;
        }
    }

    saveTabsToStorage();
    renderTabs();
}

// Render tabs in the tab bar
function renderTabs() {
    const tabBar = document.getElementById('tabBar');
    tabBar.innerHTML = '';

    tabs.forEach(tab => {
        const tabElement = document.createElement('div');
        tabElement.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
        tabElement.onclick = () => switchTab(tab.id);

        const titleSpan = document.createElement('span');
        titleSpan.textContent = tab.title;

        const closeBtn = document.createElement('span');
        closeBtn.className = 'tab-close';
        closeBtn.textContent = '✕';
        closeBtn.onclick = (e) => closeTab(tab.id, e);

        tabElement.appendChild(titleSpan);
        tabElement.appendChild(closeBtn);
        tabBar.appendChild(tabElement);
    });
}

// Load tab content via AJAX
function loadTabContent(tabId, url) {
    // Check if content already exists
    if (document.getElementById(tabId + '-content')) {
        return;
    }

    // Create content pane
    const contentPane = document.createElement('div');
    contentPane.id = tabId + '-content';
    contentPane.className = 'tab-pane';

    // Show loading state
    contentPane.innerHTML = '<div style="padding: 40px; text-align: center;">Loading...</div>';
    document.getElementById('tabContent').appendChild(contentPane);

    // Fetch content
    fetch(url)
        .then(response => response.text())
        .then(html => {
            // Extract body content from full HTML response
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const content = doc.querySelector('.tab-pane') || doc.body;

            // Copy attributes from the source tab-pane to our contentPane
            if (content.hasAttribute) {
                Array.from(content.attributes).forEach(attr => {
                    if (attr.name !== 'id' && attr.name !== 'class') {
                        contentPane.setAttribute(attr.name, attr.value);
                    }
                });
            }

            contentPane.innerHTML = content.innerHTML;

            // Execute any scripts in the loaded content
            const scripts = contentPane.querySelectorAll('script');
            scripts.forEach(script => {
                const newScript = document.createElement('script');
                if (script.src) {
                    newScript.src = script.src;
                } else {
                    newScript.textContent = script.textContent;
                }
                document.body.appendChild(newScript);
            });
        })
        .catch(error => {
            contentPane.innerHTML = '<div style="padding: 40px; text-align: center;">Error loading content</div>';
            console.error('Error loading tab content:', error);
        });
}

// Save tabs to sessionStorage
function saveTabsToStorage() {
    sessionStorage.setItem('tabs', JSON.stringify(tabs));
    sessionStorage.setItem('activeTabId', activeTabId);
}

// Load tabs from sessionStorage
function loadTabsFromStorage() {
    const savedTabs = sessionStorage.getItem('tabs');
    const savedActiveTabId = sessionStorage.getItem('activeTabId');

    if (savedTabs) {
        tabs = JSON.parse(savedTabs);
        activeTabId = savedActiveTabId;

        // Reload content for all tabs
        tabs.forEach(tab => {
            loadTabContent(tab.id, tab.url);
        });
    }
}
