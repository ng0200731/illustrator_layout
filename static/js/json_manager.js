// json_manager.js — JSON-based layout editor
// Loads Illustrator-exported JSON, renders on canvas, supports overlays

var jCanvasStates = new WeakMap();

function getJCanvasState(c) {
    if (!jCanvasStates.has(c)) {
        jCanvasStates.set(c, {
            documentTree: null,
            docWidth: 0,
            docHeight: 0,
            overlays: [],
            selectedOverlayIdx: -1,
            selectedTreePath: null,
            selectedTreePaths: {},
            lastClickedTreePath: null,
            selectedTreePanelId: null,
            scale: 1,
            pan: { x: 0, y: 0, zoom: 1, dragging: false, startX: 0, startY: 0, spaceDown: false },
            dragState: { active: false, startX: 0, startY: 0, overlayIdx: -1 },
            rectSelect: { active: false, startX: 0, startY: 0, endX: 0, endY: 0 },
            layerExpanded: {},
            historyStack: [],
            historyIndex: -1,
            maxHistorySize: 50,
            currentLayoutId: null,
            currentLayoutName: null,
            currentCustomerId: null,
            currentCustomerName: null,
            edges: [],
            edgeMode: false,
            edgeDrawing: null,
            candidateEdges: [],
            snapPoints: [],
            highlightedEdge: null,
            snapStart: null,
            snapEnd: null,
            resizingEdge: null,
            contentMode: false,
            contentSelectedBlock: null,
            contentRegionMode: false,
            contentRegionDraw: null,
            contentRegionBlock: null,
            pendingContentRegion: null,
            pendingContentType: null,
            previewDragState: { active: false, startX: 0, startY: 0 },
            blockExpanded: {},
            editingComponentIdx: -1,
            _editingTextNode: null,
            _selectedTextNode: null,
            _textNodeResizing: null,
            regionResizing: null,
            boundsRects: [],
            addOverlayMode: false,
            addOverlayStep: null,
            addOverlaySelectedBRIdx: -1,
            addOverlayDraw: null,
            addOverlaySnapPoint: null,
            addOverlayHoverPoint: null,
            _addOverlayBRIdx: -1
        });
    }
    return jCanvasStates.get(c);
}

var jCanvas = null;
var jCtx = null;
var jState = null;

// Proxy getters
Object.defineProperty(window, 'jOverlays', {
    get: function() { return jState ? jState.overlays : []; },
    set: function(v) { if (jState) jState.overlays = v; }
});

function _jel(id) {
    if (!jCanvas) return document.getElementById(id);
    var tp = jCanvas.closest('.tab-pane');
    if (!tp) return document.getElementById(id);
    return tp.querySelector('#' + id);
}

function jSwitchToCanvas(el) {
    if (!el) return;
    jCanvas = el;
    jCtx = jCanvas.getContext('2d');
    jState = getJCanvasState(jCanvas);
}

// ─── Init ───

function jsonInitWithTabPane(tabPane) {
    if (!tabPane) return;
    var canvasEl = tabPane.querySelector('#canvas');
    if (!canvasEl) return;
    canvasEl._tabPane = tabPane;
    jSwitchToCanvas(canvasEl);

    jSetupDragDrop();
    jSetupFileInput();
    jSetupButtons();
    jSetupCanvasInteraction();
    jSetupCollapsibleSections();
    jSetupAlignmentButtons();

    var typeSelect = tabPane.querySelector('#ct-type-select');
    if (typeSelect) typeSelect.addEventListener('change', jOnContentTypeChange);

    var ctAlignH = tabPane.querySelector('#ct-align-h');
    if (ctAlignH) {
        ctAlignH.querySelectorAll('button').forEach(function(btn) {
            btn.addEventListener('click', function() {
                ctAlignH.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                if (jState && jState.editingComponentIdx >= 0 && jState.editingComponentIdx < jState.overlays.length) {
                    jState.overlays[jState.editingComponentIdx].alignH = btn.dataset.val;
                }
                if (jState && jState._editingTextNode) {
                    jUpdateTextNodeFromForm(jState._editingTextNode);
                }
                jRenderCanvas();
            });
        });
    }
    var ctAlignV = tabPane.querySelector('#ct-align-v');
    if (ctAlignV) {
        ctAlignV.querySelectorAll('button').forEach(function(btn) {
            btn.addEventListener('click', function() {
                ctAlignV.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                if (jState && jState.editingComponentIdx >= 0 && jState.editingComponentIdx < jState.overlays.length) {
                    jState.overlays[jState.editingComponentIdx].alignV = btn.dataset.val;
                }
                if (jState && jState._editingTextNode) {
                    jUpdateTextNodeFromForm(jState._editingTextNode);
                }
                jRenderCanvas();
            });
        });
    }

    ['ct-text-value', 'ct-font-size', 'ct-color', 'ct-letter-spacing'].forEach(function(id) {
        var el = tabPane.querySelector('#' + id);
        if (el) el.addEventListener('input', function() {
            if (jState && jState.editingComponentIdx >= 0 && jState.editingComponentIdx < jState.overlays.length) {
                var comp = jState.overlays[jState.editingComponentIdx];
                if (id === 'ct-letter-spacing') comp.letterSpacing = parseFloat(el.value) || 0;
                else if (id === 'ct-font-size') comp.fontSize = parseFloat(el.value) || 12;
                else if (id === 'ct-color') comp.color = el.value;
                else if (id === 'ct-text-value') comp.content = el.value;
            }
            // Live update text node in document tree
            if (jState && jState._editingTextNode) {
                jUpdateTextNodeFromForm(jState._editingTextNode);
            }
            jRenderCanvas();
        });
    });

    var ctFontSelect = tabPane.querySelector('#ct-font-select');

    // Live preview for QR/barcode inputs
    ['ct-qr-data', 'ct-barcode-data'].forEach(function(id) {
        var el = tabPane.querySelector('#' + id);
        if (el) el.addEventListener('input', function() { jRenderCanvas(); });
    });
    var bcFmtSelect = tabPane.querySelector('#ct-barcode-format');
    if (bcFmtSelect) bcFmtSelect.addEventListener('change', function() { jRenderCanvas(); });

    if (ctFontSelect) {
        ctFontSelect.addEventListener('change', function() {
            var opt = ctFontSelect.options[ctFontSelect.selectedIndex];
            if (ctFontSelect.value && opt && opt.dataset.fontName) {
                jLoadFontForCanvas(parseInt(ctFontSelect.value), opt.dataset.fontName);
            }
            if (jState && jState.editingComponentIdx >= 0 && jState.editingComponentIdx < jState.overlays.length) {
                var comp = jState.overlays[jState.editingComponentIdx];
                comp.fontFamily = opt ? (opt.dataset.fontName || '') : '';
                comp.fontId = ctFontSelect.value ? parseInt(ctFontSelect.value) : null;
            }
            // Live update text node font
            if (jState && jState._editingTextNode) {
                jUpdateTextNodeFromForm(jState._editingTextNode);
            }
            jRenderCanvas();
        });
    }

    ['ct-bold-btn', 'ct-italic-btn'].forEach(function(id) {
        var btn = tabPane.querySelector('#' + id);
        if (btn) {
            btn.removeAttribute('onclick');
            btn.addEventListener('click', function() {
                btn.classList.toggle('active');
                if (jState && jState.editingComponentIdx >= 0 && jState.editingComponentIdx < jState.overlays.length) {
                    var comp = jState.overlays[jState.editingComponentIdx];
                    if (id === 'ct-bold-btn') comp.bold = btn.classList.contains('active');
                    else if (id === 'ct-italic-btn') comp.italic = btn.classList.contains('active');
                }
                if (jState && jState._editingTextNode) {
                    jUpdateTextNodeFromForm(jState._editingTextNode);
                }
                jRenderCanvas();
            });
        }
    });

    jRenderCanvas();

    var layoutId = tabPane.getAttribute('data-layout-id');
    if (layoutId && layoutId.trim() !== '') {
        jLoadLayoutFromDatabase(layoutId);
    } else {
        jShowCustomerSelectModal();
    }
}

// __CONTINUE_HERE_2__

// ─── Setup Functions ───

function jSetupDragDrop() {
    var container = _jel('canvas-container');
    if (container._dragDropSetup) return;
    container._dragDropSetup = true;

    container.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        container.classList.add('drag-over');
    });
    container.addEventListener('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        container.classList.remove('drag-over');
    });
    container.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        container.classList.remove('drag-over');
        var files = e.dataTransfer.files;
        if (files.length > 0 && files[0].name.toLowerCase().endsWith('.json')) {
            jParseJsonFile(files[0]);
        }
    });
}

function jSetupFileInput() {
    var fileInput = _jel('file-input');
    var chooseBtn = _jel('btn-choose-file');
    if (chooseBtn && fileInput) {
        chooseBtn.addEventListener('click', function() { fileInput.click(); });
        fileInput.addEventListener('change', function() {
            if (fileInput.files.length > 0) {
                jParseJsonFile(fileInput.files[0]);
                fileInput.value = '';
            }
        });
    }
}

function jSetupButtons() {
    var deleteBtn = _jel('btn-delete');
    var exportPdfBtn = _jel('btn-export-pdf');
    var exportAiEditableBtn = _jel('btn-export-ai-editable');
    var exportAiOutlinedBtn = _jel('btn-export-ai-outlined');
    var exportJsonBtn = _jel('btn-export-json');

    if (deleteBtn && !deleteBtn._listenerAdded) {
        deleteBtn.addEventListener('click', jDeleteSelected);
        deleteBtn._listenerAdded = true;
    }
    if (exportPdfBtn && !exportPdfBtn._listenerAdded) {
        exportPdfBtn.addEventListener('click', function() { jExportFile('pdf'); });
        exportPdfBtn._listenerAdded = true;
    }
    if (exportAiEditableBtn && !exportAiEditableBtn._listenerAdded) {
        exportAiEditableBtn.addEventListener('click', function() { jExportFile('ai-separate', false); });
        exportAiEditableBtn._listenerAdded = true;
    }
    if (exportAiOutlinedBtn && !exportAiOutlinedBtn._listenerAdded) {
        exportAiOutlinedBtn.addEventListener('click', function() { jExportFile('ai-separate', true); });
        exportAiOutlinedBtn._listenerAdded = true;
    }
    if (exportJsonBtn && !exportJsonBtn._listenerAdded) {
        exportJsonBtn.addEventListener('click', jExportJson);
        exportJsonBtn._listenerAdded = true;
    }
}

function jSetupCollapsibleSections() {
    var tabPane = jCanvas.closest('.tab-pane');
    if (!tabPane) return;
    tabPane.querySelectorAll('.collapsible-header').forEach(function(header) {
        if (header._collapsibleSetup) return;
        header._collapsibleSetup = true;
        header.addEventListener('click', function() {
            var body = header.nextElementSibling;
            var icon = header.querySelector('.collapse-icon');
            if (body) {
                var isHidden = body.style.display === 'none';
                body.style.display = isHidden ? '' : 'none';
                if (icon) icon.textContent = isHidden ? '▼' : '▶';
            }
        });
    });
}

function jSetupAlignmentButtons() {
    var tabPane = jCanvas.closest('.tab-pane');
    if (!tabPane) return;
    tabPane.querySelectorAll('.alignment-buttons').forEach(function(group) {
        group.querySelectorAll('button').forEach(function(btn) {
            btn.addEventListener('click', function() {
                group.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
            });
        });
    });
}

// __CONTINUE_HERE_3__

// ─── JSON Parsing ───

// Convert pt to mm
var PT_TO_MM = 25.4 / 72;

function jParseJsonFile(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);

            // Detect re-imported layout state
            if (data._exportType === 'layout-state') {
                jLoadLayoutFromExport(data);
                return;
            }

            if (!data.version || !data.layers) {
                alert('Invalid JSON: missing version or layers');
                return;
            }
            jState.documentTree = data.layers;
            jState.docWidth = data.metadata.width * PT_TO_MM;
            jState.docHeight = data.metadata.height * PT_TO_MM;
            jState.docMetadata = data.metadata;
            jState.docSwatches = data.swatches || [];
            jState.overlays = [];
            jState.edges = [];
            jState.selectedOverlayIdx = -1;
            jState.selectedTreePath = null;
            jState.selectedTreePaths = {};
            jState.lastClickedTreePath = null;
            jState.selectedTreePanelId = null;

            // Compute scale to fit canvas
            var container = _jel('canvas-container');
            var cw = container.clientWidth - 40;
            var ch = container.clientHeight - 40;
            jState.scale = Math.min(cw / jState.docWidth, ch / jState.docHeight);
            jState.pan = { x: 0, y: 0, zoom: 1, dragging: false, startX: 0, startY: 0, spaceDown: false };

            // Assign unique IDs to all tree nodes for expand/collapse tracking
            jAssignNodeIds(jState.documentTree, '');

            // Collect bounding rectangles and auto-create text overlays
            jState.boundsRects = [];
            jCollectBoundsRects(jState.documentTree);
            jAutoCreateTextOverlays(jState.documentTree);

            // Hide empty state, enable export
            var emptyState = _jel('empty-state');
            if (emptyState) emptyState.style.display = 'none';
            var exportPdf = _jel('btn-export-pdf');
            var exportAiE = _jel('btn-export-ai-editable');
            var exportAiO = _jel('btn-export-ai-outlined');
            var exportJson = _jel('btn-export-json');
            if (exportPdf) exportPdf.disabled = false;
            if (exportAiE) exportAiE.disabled = false;
            if (exportAiO) exportAiO.disabled = false;
            if (exportJson) exportJson.disabled = false;
            var addBtn = _jel('overlay-add-btn');
            if (addBtn) addBtn.disabled = (jState.boundsRects.length === 0);

            jState.historyStack = [];
            jState.historyIndex = -1;
            jCaptureState();
            jRenderCanvas();
            jRenderLayerTree();
            jRenderOverlayList();
        } catch(err) {
            alert('Error parsing JSON: ' + err.message);
        }
    };
    reader.readAsText(file);
}

function jAssignNodeIds(nodes, prefix) {
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        node._id = prefix + i;
        if (node.children) jAssignNodeIds(node.children, node._id + '-');
        if (node.paths) {
            for (var j = 0; j < node.paths.length; j++) {
                node.paths[j]._id = node._id + '-p' + j;
            }
        }
    }
}

function jFindNodeByIdInTree(nodes, id) {
    if (!nodes) return null;
    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i]._id === id) return nodes[i];
        if (nodes[i].children) {
            var found = jFindNodeByIdInTree(nodes[i].children, id);
            if (found) return found;
        }
        if (nodes[i].paths) {
            for (var j = 0; j < nodes[i].paths.length; j++) {
                if (nodes[i].paths[j]._id === id) return nodes[i].paths[j];
            }
        }
    }
    return null;
}

function jFindParentOfNode(nodes, id, parent) {
    if (!nodes) return null;
    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i]._id === id) return { parent: parent, index: i, array: nodes };
        if (nodes[i].children) {
            var found = jFindParentOfNode(nodes[i].children, id, nodes[i]);
            if (found) return found;
        }
        if (nodes[i].paths) {
            for (var j = 0; j < nodes[i].paths.length; j++) {
                if (nodes[i].paths[j]._id === id) return { parent: nodes[i], index: j, array: nodes[i].paths };
            }
        }
    }
    return null;
}

function jGetPanelNodeIds(panelId) {
    if (!panelId) return [];
    var brIdx = parseInt(panelId.replace('__br_', ''));
    var brs = jState.boundsRects;
    if (!brs || brIdx < 0 || brIdx >= brs.length) return [];
    var br = brs[brIdx];
    var allNodes = [];
    jCollectDisplayNodes(jState.documentTree, allNodes);
    var ids = [];
    for (var i = 0; i < allNodes.length; i++) {
        var node = allNodes[i];
        if (node._isBoundsRect) continue;
        var b = node.bounds;
        if (!b && node._isUserGroup && node.children && node.children.length > 0) {
            b = node.children[0].bounds;
        }
        if (!b) continue;
        var cx = b.x * PT_TO_MM + (b.width * PT_TO_MM) / 2;
        var cy = b.y * PT_TO_MM + (b.height * PT_TO_MM) / 2;
        if (cx >= br.x && cx <= br.x + br.w && cy >= br.y && cy <= br.y + br.h) {
            ids.push(node._id);
        }
    }
    return ids;
}

function jGetNodeRange(panelId, fromId, toId) {
    var orderedIds = jGetPanelNodeIds(panelId);
    var fromIdx = -1, toIdx = -1;
    for (var i = 0; i < orderedIds.length; i++) {
        if (orderedIds[i] === fromId) fromIdx = i;
        if (orderedIds[i] === toId) toIdx = i;
    }
    if (fromIdx < 0 || toIdx < 0) return [toId];
    var lo = Math.min(fromIdx, toIdx), hi = Math.max(fromIdx, toIdx);
    return orderedIds.slice(lo, hi + 1);
}

function jCollectDisplayNodes(nodes, out) {
    if (!nodes) return;
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node._isBoundsRect) continue;
        if (node._isUserGroup) {
            out.push(node);
        } else if (node.children) {
            jCollectDisplayNodes(node.children, out);
        } else if (node.type === 'path' || node.type === 'compoundPath' || node.type === 'text' || node.type === 'image') {
            out.push(node);
        }
    }
}

function jCollectBoundsRects(nodes) {
    if (!nodes) return;
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.type === 'path' && node.name && node.name.indexOf('__bounds__') === 0) {
            var b = node.bounds;
            jState.boundsRects.push({
                name: node.name,
                groupName: node.name.substring(10),
                x: b.x * PT_TO_MM,
                y: b.y * PT_TO_MM,
                w: b.width * PT_TO_MM,
                h: b.height * PT_TO_MM,
                node: node
            });
            node._isBoundsRect = true;
        }
        if (node.children) jCollectBoundsRects(node.children);
    }
}

function jFindContainingBoundsRect(region) {
    if (!jState || !jState.boundsRects) return null;
    var cx = region.x + region.w / 2;
    var cy = region.y + region.h / 2;
    var best = null;
    var bestArea = Infinity;
    for (var i = 0; i < jState.boundsRects.length; i++) {
        var br = jState.boundsRects[i];
        if (cx >= br.x && cx <= br.x + br.w && cy >= br.y && cy <= br.y + br.h) {
            var area = br.w * br.h;
            if (area < bestArea) {
                bestArea = area;
                best = br;
            }
        }
    }
    return best;
}

function jAutoCreateTextOverlays(nodes) {
    if (!nodes) return;
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.children) jAutoCreateTextOverlays(node.children);
        if (node.type !== 'text' || !node.paragraphs || node.paragraphs.length === 0) continue;
        var b = node.bounds;
        var region = {
            x: b.x * PT_TO_MM, y: b.y * PT_TO_MM,
            w: b.width * PT_TO_MM, h: b.height * PT_TO_MM
        };
        var boundsRect = jFindContainingBoundsRect(region);
        var content = '', fontFamily = 'Arial', fontStyle = '';
        var fontSize = 12, color = '#000000', alignment = 'left', tracking = 0;
        for (var pi = 0; pi < node.paragraphs.length; pi++) {
            var para = node.paragraphs[pi];
            if (para.alignment) alignment = para.alignment;
            var runs = para.runs || [];
            for (var ri = 0; ri < runs.length; ri++) {
                var run = runs[ri];
                content += run.text || '';
                if (run.fontFamily) fontFamily = run.fontFamily;
                if (run.fontStyle) fontStyle = run.fontStyle;
                if (run.fontSize) fontSize = run.fontSize;
                if (run.tracking) tracking = run.tracking;
                if (run.color) {
                    var css = jColorToCSS(run.color);
                    if (css) color = jColorToHex(css);
                }
            }
            if (pi < node.paragraphs.length - 1) content += '\n';
        }
        var bold = fontStyle.toLowerCase().indexOf('bold') >= 0;
        var italic = fontStyle.toLowerCase().indexOf('italic') >= 0;
        jState.overlays.push({
            type: 'textregion',
            x: region.x, y: region.y, w: region.w, h: region.h,
            fontFamily: fontFamily, fontSize: fontSize,
            bold: bold, italic: italic, color: color,
            letterSpacing: tracking / 1000 * fontSize,
            alignH: alignment, alignV: 'top',
            content: content, visible: true, locked: false, isVariable: false,
            _boundsRectIdx: boundsRect ? jState.boundsRects.indexOf(boundsRect) : -1
        });
        node._isDoubledText = true;
    }
}

function jMarkDoubledTextNodes(nodes) {
    if (!nodes) return;
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.children) jMarkDoubledTextNodes(node.children);
        if (node.type !== 'text' || !node.bounds) continue;
        var b = node.bounds;
        var nx = b.x * PT_TO_MM, ny = b.y * PT_TO_MM;
        var nw = b.width * PT_TO_MM, nh = b.height * PT_TO_MM;
        // Check if any overlay covers this text node's region
        for (var oi = 0; oi < jState.overlays.length; oi++) {
            var ov = jState.overlays[oi];
            // Match if overlay origin is close to the text node origin
            if (Math.abs(ov.x - nx) < 1 && Math.abs(ov.y - ny) < 1) {
                node._isDoubledText = true;
                break;
            }
        }
    }
}

// __CONTINUE_HERE_4__

// ─── Canvas Interaction ───

function jSetupCanvasInteraction() {
    var currentCanvas = jCanvas;
    var oldMD = currentCanvas._jMouseDown;
    var oldWH = currentCanvas._jWheel;
    var oldDC = currentCanvas._jDblClick;
    var oldMM = currentCanvas._jMouseMove;
    if (oldMD) currentCanvas.removeEventListener('mousedown', oldMD);
    if (oldWH) currentCanvas.removeEventListener('wheel', oldWH);
    if (oldDC) currentCanvas.removeEventListener('dblclick', oldDC);
    if (oldMM) currentCanvas.removeEventListener('mousemove', oldMM);

    var mouseDownHandler = function(e) { jSwitchToCanvas(currentCanvas); jOnMouseDown(e); };
    var wheelHandler = function(e) { jSwitchToCanvas(currentCanvas); jOnWheel(e); };
    var dblClickHandler = function(e) { jSwitchToCanvas(currentCanvas); jOnCanvasDblClick(e); };
    var mouseMoveHandler = function(e) { jSwitchToCanvas(currentCanvas); jOnCanvasMouseMove(e); };
    currentCanvas._jMouseDown = mouseDownHandler;
    currentCanvas._jWheel = wheelHandler;
    currentCanvas._jDblClick = dblClickHandler;
    currentCanvas._jMouseMove = mouseMoveHandler;
    currentCanvas.addEventListener('mousedown', mouseDownHandler);
    currentCanvas.addEventListener('wheel', wheelHandler);
    currentCanvas.addEventListener('dblclick', dblClickHandler);
    currentCanvas.addEventListener('mousemove', mouseMoveHandler);
}

function jOnCanvasMouseMove(e) {
    if (!jState) return;
    // Hover indicators only during addOverlay drawRegion step
    if (jState.addOverlayMode && jState.addOverlayStep === 'drawRegion') {
        var brIdx = jState.addOverlaySelectedBRIdx;
        var br = (brIdx >= 0 && jState.boundsRects) ? jState.boundsRects[brIdx] : null;
        if (!br) return;
        var rawPos = jScreenToDoc(e.clientX, e.clientY);
        var pos = jUnrotatePoint(rawPos.x, rawPos.y, brIdx);
        var snapPts = [
            { x: br.x, y: br.y, type: 'corner' },
            { x: br.x + br.w, y: br.y, type: 'corner' },
            { x: br.x, y: br.y + br.h, type: 'corner' },
            { x: br.x + br.w, y: br.y + br.h, type: 'corner' },
            { x: br.x + br.w / 2, y: br.y, type: 'edge' },
            { x: br.x + br.w / 2, y: br.y + br.h, type: 'edge' },
            { x: br.x, y: br.y + br.h / 2, type: 'edge' },
            { x: br.x + br.w, y: br.y + br.h / 2, type: 'edge' }
        ];
        var THRESH = 2;
        var best = null, bestDist = THRESH;
        for (var i = 0; i < snapPts.length; i++) {
            var sp = snapPts[i];
            var dx = pos.x - sp.x, dy = pos.y - sp.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < bestDist) { bestDist = dist; best = sp; }
        }
        var prev = jState.addOverlayHoverPoint;
        if (best !== prev && (best === null || prev === null || best.x !== prev.x || best.y !== prev.y)) {
            jState.addOverlayHoverPoint = best;
            jRenderCanvas();
        }
        return;
    }
    // Clear hover when not in drawRegion step
    if (jState.addOverlayHoverPoint) {
        jState.addOverlayHoverPoint = null;
        jRenderCanvas();
    }
}

function jOnCanvasDblClick(e) {
    if (!jCanvas || !jState || !jState.documentTree) return;

    var pos = jScreenToDoc(e.clientX, e.clientY);

    // First check overlays (content regions) — account for panel rotation
    for (var i = jState.overlays.length - 1; i >= 0; i--) {
        var ov = jState.overlays[i];
        if (ov.visible === false) continue;
        var testPos = jUnrotatePoint(pos.x, pos.y, ov._boundsRectIdx);
        if (testPos.x >= ov.x && testPos.x <= ov.x + ov.w && testPos.y >= ov.y && testPos.y <= ov.y + ov.h) {
            jEditOverlayRegion(i);
            return;
        }
    }

    // Then check document tree text nodes — account for panel rotation
    var hitNode = jHitTestTextNodeRotated(pos.x, pos.y);
    if (hitNode) {
        jEditTextNode(hitNode);
        return;
    }
}

function jUnrotatePoint(x, y, boundsRectIdx) {
    var brs = jState.boundsRects;
    if (!brs || boundsRectIdx < 0 || boundsRectIdx >= brs.length) return { x: x, y: y };
    var br = brs[boundsRectIdx];
    var rot = br._rotation || 0;
    if (rot === 0) return { x: x, y: y };
    var cx = br.x + br.w / 2;
    var cy = br.y + br.h / 2;
    var rad = -rot * Math.PI / 180;
    var dx = x - cx, dy = y - cy;
    return {
        x: cx + dx * Math.cos(rad) - dy * Math.sin(rad),
        y: cy + dx * Math.sin(rad) + dy * Math.cos(rad)
    };
}

function jHitTestTextNodeRotated(x, y) {
    if (!jState.documentTree) return null;
    var brs = jState.boundsRects;
    var allNodes = [];
    jCollectLeafNodes(jState.documentTree, allNodes);
    for (var i = allNodes.length - 1; i >= 0; i--) {
        var node = allNodes[i];
        if (node.visible === false) continue;
        if (node.type !== 'text' || !node.bounds) continue;
        var b = node.bounds;
        var bx = b.x * PT_TO_MM, by = b.y * PT_TO_MM;
        var bw = b.width * PT_TO_MM, bh = b.height * PT_TO_MM;
        // Find which bounds rect this node belongs to
        var ncx = bx + bw / 2, ncy = by + bh / 2;
        var brIdx = -1;
        if (brs) {
            for (var bi = 0; bi < brs.length; bi++) {
                var tbr = brs[bi];
                if (ncx >= tbr.x && ncx <= tbr.x + tbr.w && ncy >= tbr.y && ncy <= tbr.y + tbr.h) {
                    brIdx = bi; break;
                }
            }
        }
        var testPos = jUnrotatePoint(x, y, brIdx);
        if (testPos.x >= bx && testPos.x <= bx + bw && testPos.y >= by && testPos.y <= by + bh) {
            return node;
        }
    }
    return null;
}

function jHitTestTextNode(nodes, x, y) {
    if (!nodes) return null;
    // Check in reverse (top-most first)
    for (var i = nodes.length - 1; i >= 0; i--) {
        var node = nodes[i];
        if (node.visible === false) continue;
        if (node.children) {
            var hit = jHitTestTextNode(node.children, x, y);
            if (hit) return hit;
        }
        if (node.type === 'text' && node.bounds) {
            var b = node.bounds;
            var bx = b.x * PT_TO_MM, by = b.y * PT_TO_MM;
            var bw = b.width * PT_TO_MM, bh = b.height * PT_TO_MM;
            if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) {
                return node;
            }
        }
    }
    return null;
}

function jEditOverlayRegion(ovIdx) {
    if (!jState) return;
    var ov = jState.overlays[ovIdx];
    if (!ov) return;
    if (ov.locked) return;
    var typeMap = { 'textregion': 'text', 'imageregion': 'image', 'qrcoderegion': 'qrcode', 'barcoderegion': 'barcode' };
    var contentType = typeMap[ov.type];
    if (!contentType) return;

    jState.pendingContentRegion = { x: ov.x, y: ov.y, w: ov.w, h: ov.h };
    jState.pendingContentType = contentType;
    jState.editingComponentIdx = ovIdx;
    jState._addOverlayBRIdx = ov._boundsRectIdx >= 0 ? ov._boundsRectIdx : -1;

    // Show content type panel
    var panel = _jel('content-type-panel');
    if (panel) panel.style.display = '';
    var picker = _jel('content-type-picker');
    if (picker) picker.style.display = '';
    var typeSelect = _jel('ct-type-select');
    if (typeSelect) { typeSelect.value = contentType; jOnContentTypeChange(); }
    var btns = _jel('ct-buttons');
    if (btns) btns.style.display = '';
    var rotBtns = _jel('ct-rotate-buttons');
    if (rotBtns) rotBtns.style.display = '';

    jLoadFontList();
    jPrefillContentForm(contentType, ov);
    jAttachContentPreviewListeners();
    var aiFontRow = _jel('ct-ai-font-row');
    if (aiFontRow) aiFontRow.style.display = 'none';
    jRenderCanvas();
}

// __CONTINUE_HERE__
function jEditTextNode(node) {
    if (!jState || !node || !node.paragraphs) return;

    // Extract text properties from the node
    var content = '';
    var fontFamily = 'Arial';
    var fontStyle = '';
    var fontSize = 12;
    var color = '#000000';
    var alignment = 'left';
    var tracking = 0;
    var bold = false;
    var italic = false;

    for (var pi = 0; pi < node.paragraphs.length; pi++) {
        var para = node.paragraphs[pi];
        if (para.alignment) alignment = para.alignment;
        var runs = para.runs || [];
        for (var ri = 0; ri < runs.length; ri++) {
            var run = runs[ri];
            content += run.text || '';
            if (run.fontFamily) fontFamily = run.fontFamily;
            if (run.fontStyle) fontStyle = run.fontStyle;
            if (run.fontSize) fontSize = run.fontSize;
            if (run.tracking) tracking = run.tracking;
            if (run.color) {
                var css = jColorToCSS(run.color);
                if (css) color = jColorToHex(css);
            }
        }
        if (pi < node.paragraphs.length - 1) content += '\n';
    }

    bold = fontStyle.toLowerCase().indexOf('bold') >= 0;
    italic = fontStyle.toLowerCase().indexOf('italic') >= 0;

    var b = node.bounds;
    var region = { x: b.x * PT_TO_MM, y: b.y * PT_TO_MM, w: b.width * PT_TO_MM, h: b.height * PT_TO_MM };

    // Snap region to the nearest confirmed edge that contains or overlaps the text node
    var snappedEdge = jFindContainingEdge(region);
    if (snappedEdge) {
        region.x = snappedEdge.x1;
        region.y = snappedEdge.y1;
        region.w = snappedEdge.x2 - snappedEdge.x1;
        region.h = snappedEdge.y2 - snappedEdge.y1;
    }

    jState.pendingContentRegion = region;
    jState.pendingContentType = 'text';
    jState.editingComponentIdx = -1;
    jState._editingTextNode = node;
    jState._selectedTextNode = node;

    // Show content type panel
    var panel = _jel('content-type-panel');
    if (panel) panel.style.display = '';
    var picker = _jel('content-type-picker');
    if (picker) picker.style.display = '';
    var typeSelect = _jel('ct-type-select');
    if (typeSelect) { typeSelect.value = 'text'; jOnContentTypeChange(); }
    var btns = _jel('ct-buttons');
    if (btns) btns.style.display = '';
    var rotBtns = _jel('ct-rotate-buttons');
    if (rotBtns) rotBtns.style.display = '';

    jLoadFontList(true).then(function() {
        jPrefillContentForm('text', {
            content: content,
            fontFamily: fontFamily,
            fontSize: fontSize,
            bold: bold,
            italic: italic,
            color: color,
            letterSpacing: tracking / 1000 * fontSize,
            alignH: alignment,
            alignV: 'top',
            aiFontName: fontFamily,
            aiFontStyle: fontStyle
        });
        jAttachContentPreviewListeners();
        jRenderCanvas();
    });
}

// Live-update a document tree text node from the content panel form
function jUpdateTextNodeFromForm(node) {
    if (!node || !node.paragraphs) return;
    var content = (_jel('ct-text-value') || {}).value || '';
    var fontSize = parseFloat((_jel('ct-font-size') || {}).value) || 12;
    var color = (_jel('ct-color') || {}).value || '#000000';
    var letterSpacing = parseFloat((_jel('ct-letter-spacing') || {}).value) || 0;
    var bold = _jel('ct-bold-btn') ? _jel('ct-bold-btn').classList.contains('active') : false;
    var italic = _jel('ct-italic-btn') ? _jel('ct-italic-btn').classList.contains('active') : false;
    var alignH = 'left';
    var alignHBtns = _jel('ct-align-h');
    if (alignHBtns) { var a = alignHBtns.querySelector('.active'); if (a) alignH = a.dataset.val; }

    // Get selected font family from dropdown
    var fontSelect = _jel('ct-font-select');
    var fontFamily = 'Arial';
    if (fontSelect && fontSelect.options[fontSelect.selectedIndex]) {
        fontFamily = fontSelect.options[fontSelect.selectedIndex].dataset.fontName || fontFamily;
    }

    var fontStyle = '';
    if (bold) fontStyle += 'Bold';
    if (italic) fontStyle += (fontStyle ? ' ' : '') + 'Italic';
    if (!fontStyle) fontStyle = 'Regular';

    // Convert hex color to RGB object for the renderer
    var r = parseInt(color.substr(1, 2), 16) / 255;
    var g = parseInt(color.substr(3, 2), 16) / 255;
    var b = parseInt(color.substr(5, 2), 16) / 255;
    var colorObj = { type: 'rgb', r: r, g: g, b: b };

    // Rebuild paragraphs from content
    var lines = content.split('\n');
    var tracking = fontSize > 0 ? (letterSpacing / fontSize) * 1000 : 0;
    node.paragraphs = lines.map(function(line) {
        return {
            alignment: alignH,
            runs: [{
                text: line,
                fontFamily: fontFamily,
                fontStyle: fontStyle,
                fontSize: fontSize,
                leading: 'auto',
                tracking: tracking,
                color: colorObj
            }]
        };
    });
}

function jPrefillContentForm(type, data) {
    if (type === 'text') {
        var tv = _jel('ct-text-value'); if (tv) tv.value = data.content || '';
        var fs = _jel('ct-font-size'); if (fs) fs.value = data.fontSize || 12;
        var cc = _jel('ct-color'); if (cc) cc.value = data.color || '#000000';
        var ls = _jel('ct-letter-spacing'); if (ls) ls.value = data.letterSpacing || 0;
        var bb = _jel('ct-bold-btn');
        if (bb) { if (data.bold) bb.classList.add('active'); else bb.classList.remove('active'); }
        var ib = _jel('ct-italic-btn');
        if (ib) { if (data.italic) ib.classList.add('active'); else ib.classList.remove('active'); }
        var ah = _jel('ct-align-h');
        if (ah) {
            ah.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
            var hBtn = ah.querySelector('[data-val="' + (data.alignH || 'left') + '"]');
            if (hBtn) hBtn.classList.add('active');
        }
        var av = _jel('ct-align-v');
        if (av) {
            av.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
            var vBtn = av.querySelector('[data-val="' + (data.alignV || 'top') + '"]');
            if (vBtn) vBtn.classList.add('active');
        }

        // Select matching font in dropdown
        var fontSelect = _jel('ct-font-select');
        if (fontSelect && (data.fontId || data.fontFamily)) {
            var selectFont = function() {
                if (!fontSelect) return;
                // Try by fontId first
                if (data.fontId) {
                    for (var fi = 0; fi < fontSelect.options.length; fi++) {
                        if (fontSelect.options[fi].value == data.fontId) {
                            fontSelect.selectedIndex = fi;
                            return;
                        }
                    }
                }
                // Fallback: match by fontFamily name
                if (data.fontFamily) {
                    var normalizedName = data.fontFamily.toLowerCase().replace(/[\s\-_]/g, '');
                    for (var fi = 0; fi < fontSelect.options.length; fi++) {
                        var optName = (fontSelect.options[fi].dataset.fontName || '').toLowerCase().replace(/[\s\-_]/g, '');
                        if (optName && (optName === normalizedName || optName.indexOf(normalizedName) >= 0 || normalizedName.indexOf(optName) >= 0)) {
                            fontSelect.selectedIndex = fi;
                            return;
                        }
                    }
                }
            };
            // Font list may still be loading, try now and retry after delays
            selectFont();
            setTimeout(selectFont, 500);
            setTimeout(selectFont, 1500);
        }

        // Show AI Font name from Illustrator
        var aiFontRow = _jel('ct-ai-font-row');
        var aiFontSpan = _jel('ct-ai-font-name');
        if (data.aiFontName) {
            var displayName = data.aiFontName;
            if (data.aiFontStyle) displayName += ' ' + data.aiFontStyle;
            if (aiFontSpan) aiFontSpan.textContent = displayName;
            if (aiFontRow) aiFontRow.style.display = '';
            // Check if font exists in web app after font list loads
            jCheckAiFontAvailability(data.aiFontName);
        } else {
            if (aiFontRow) aiFontRow.style.display = 'none';
            if (aiFontSpan) { aiFontSpan.textContent = ''; aiFontSpan.style.color = ''; aiFontSpan.style.borderColor = ''; }
        }
    } else if (type === 'image') {
        var iu = _jel('ct-image-url'); if (iu) iu.value = data.imageUrl || '';
        var imf = _jel('ct-image-fit'); if (imf) imf.value = data.imageFit || 'contain';
    } else if (type === 'qrcode') {
        var qd = _jel('ct-qr-data'); if (qd) qd.value = data.qrData || '';
    } else if (type === 'barcode') {
        var bd = _jel('ct-barcode-data'); if (bd) bd.value = data.barcodeData || '';
        var bf = _jel('ct-barcode-format'); if (bf) bf.value = data.barcodeFormat || 'code128';
    }
}

function jCheckAiFontAvailability(aiFontName) {
    var aiFontSpan = _jel('ct-ai-font-name');
    if (!aiFontSpan) return;
    var fontSelect = _jel('ct-font-select');

    var doCheck = function() {
        if (!fontSelect) return;
        var found = false;
        var matchIdx = -1;
        var normalizedAi = aiFontName.toLowerCase().replace(/[\s\-_]/g, '');
        for (var i = 0; i < fontSelect.options.length; i++) {
            var opt = fontSelect.options[i];
            var optName = (opt.dataset.fontName || opt.textContent || '').toLowerCase().replace(/[\s\-_]/g, '');
            if (optName && (optName.indexOf(normalizedAi) >= 0 || normalizedAi.indexOf(optName) >= 0)) {
                found = true;
                matchIdx = i;
                break;
            }
        }
        if (found) {
            aiFontSpan.style.color = '#00aa00';
            aiFontSpan.style.borderColor = '#00aa00';
            aiFontSpan.style.fontWeight = 'normal';
            aiFontSpan.title = 'Font available in web app';
            // Auto-select the matching font in dropdown
            if (matchIdx >= 0) {
                fontSelect.selectedIndex = matchIdx;
                var matchOpt = fontSelect.options[matchIdx];
                if (matchOpt && matchOpt.dataset.fontName) {
                    jLoadFontForCanvas(parseInt(matchOpt.value), matchOpt.dataset.fontName);
                }
            }
        } else {
            aiFontSpan.style.color = '#cc0000';
            aiFontSpan.style.borderColor = '#cc0000';
            aiFontSpan.style.fontWeight = 'bold';
            aiFontSpan.title = 'Font NOT available in web app — please upload it';
        }
    };

    // Font list may still be loading, check now and retry after delay
    doCheck();
    setTimeout(doCheck, 500);
    setTimeout(doCheck, 1500);
}

function jColorToHex(cssColor) {
    if (!cssColor) return '#000000';
    if (cssColor.charAt(0) === '#') return cssColor;
    var m = cssColor.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) {
        var r = parseInt(m[1]).toString(16).padStart(2, '0');
        var g = parseInt(m[2]).toString(16).padStart(2, '0');
        var b = parseInt(m[3]).toString(16).padStart(2, '0');
        return '#' + r + g + b;
    }
    return '#000000';
}

function jOnWheel(e) {
    e.preventDefault();
    var pan = jState.pan;
    var rect = jCanvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var oldZoom = pan.zoom;
    var delta = e.deltaY > 0 ? 0.9 : 1.1;
    pan.zoom = Math.max(0.1, Math.min(20, pan.zoom * delta));
    pan.x = mx - (mx - pan.x) * (pan.zoom / oldZoom);
    pan.y = my - (my - pan.y) * (pan.zoom / oldZoom);
    jRenderCanvas();
}

function jOnMouseDown(e) {
    var pan = jState.pan;
    if (e.button === 1 || pan.spaceDown) {
        pan.dragging = true;
        pan.startX = e.clientX - pan.x;
        pan.startY = e.clientY - pan.y;
        var onMove = function(ev) {
            pan.x = ev.clientX - pan.startX;
            pan.y = ev.clientY - pan.startY;
            jRenderCanvas();
        };
        var onUp = function() {
            pan.dragging = false;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return;
    }

    // Check text node resize handles
    if (jState._selectedTextNode) {
        var handlePos = jScreenToDoc(e.clientX, e.clientY);
        var handleId = jHitTestTextNodeHandle(handlePos);
        if (handleId) {
            jStartTextNodeResize(e, handleId);
            return;
        }
    }

    // (Block/Edge/Content modes removed)

    // Add-overlay mode handling
    if (jState.addOverlayMode) {
        if (jState.addOverlayStep === 'selectPanel') {
            var pos0 = jScreenToDoc(e.clientX, e.clientY);
            var clickedBRIdx = jHitTestBoundsRect(pos0.x, pos0.y);
            if (clickedBRIdx >= 0) {
                jState.addOverlayStep = 'drawRegion';
                jState.addOverlaySelectedBRIdx = clickedBRIdx;
                var hint = _jel('overlay-add-hint');
                if (hint) {
                    var brName = jState.boundsRects[clickedBRIdx].groupName || ('Panel ' + (clickedBRIdx + 1));
                    hint.textContent = 'Step 2: Draw inside "' + brName + '". Esc to cancel.';
                }
                if (jCanvas) jCanvas.style.cursor = 'crosshair';
                jRenderCanvas();
            }
            return;
        }
        if (jState.addOverlayStep === 'drawRegion') {
            jOnAddOverlayDrawStart(e);
            return;
        }
    }

    // Check if clicking on pending content region (move/resize before Apply)
    if (jState.pendingContentRegion) {
        var prPos = jScreenToDoc(e.clientX, e.clientY);
        var pr = jState.pendingContentRegion;
        var prBrIdx = jState._addOverlayBRIdx;
        var upos = (prBrIdx >= 0) ? jUnrotatePoint(prPos.x, prPos.y, prBrIdx) : prPos;
        var handleId = jHitTestPendingHandle(upos, pr);
        if (handleId) {
            jStartPendingResize(e, handleId);
            return;
        }
        if (upos.x >= pr.x && upos.x <= pr.x + pr.w && upos.y >= pr.y && upos.y <= pr.y + pr.h) {
            jStartPendingDrag(e);
            return;
        }
    }

    // Check if clicking on an overlay resize handle
    var pos = jScreenToDoc(e.clientX, e.clientY);
    var ovHandleId = jHitTestOverlayHandle(pos);
    if (ovHandleId) {
        jStartOverlayResize(e, jState.selectedOverlayIdx, ovHandleId);
        return;
    }

    // Check if clicking on an overlay
    var hitIdx = jHitTestOverlay(pos.x, pos.y);
    if (hitIdx >= 0) {
        jState.selectedOverlayIdx = hitIdx;
        jState.selectedTreePath = null;
        jState.selectedTreePaths = {};
        jState.lastClickedTreePath = null;
        jState.selectedTreePanelId = null;
        jStartOverlayDrag(e, hitIdx);
    } else {
        // Start rectangle selection drag on empty canvas
        jState.selectedOverlayIdx = -1;
        jState._selectedTextNode = null;
        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
            jState.selectedTreePath = null;
            jState.selectedTreePaths = {};
            jState.lastClickedTreePath = null;
            jState.selectedTreePanelId = null;
        }
        var rsPos = jScreenToDoc(e.clientX, e.clientY);
        jState.rectSelect = { active: true, startX: rsPos.x, startY: rsPos.y, endX: rsPos.x, endY: rsPos.y };
        jRenderCanvas();
        var onRSMove = function(ev) {
            var mp = jScreenToDoc(ev.clientX, ev.clientY);
            jState.rectSelect.endX = mp.x;
            jState.rectSelect.endY = mp.y;
            jRenderCanvas();
        };
        var onRSUp = function() {
            document.removeEventListener('mousemove', onRSMove);
            document.removeEventListener('mouseup', onRSUp);
            jFinishRectSelect(e.ctrlKey || e.metaKey);
        };
        document.addEventListener('mousemove', onRSMove);
        document.addEventListener('mouseup', onRSUp);
    }
    jRenderCanvas();
    jRenderOverlayList();
    jUpdateActionButtons();
}

function jScreenToDoc(clientX, clientY) {
    var rect = jCanvas.getBoundingClientRect();
    var pan = jState.pan;
    var s = jState.scale * pan.zoom;
    var offsetX = (jCanvas.width - jState.docWidth * jState.scale) / 2;
    var offsetY = (jCanvas.height - jState.docHeight * jState.scale) / 2;
    return {
        x: (clientX - rect.left - pan.x - offsetX) / s,
        y: (clientY - rect.top - pan.y - offsetY) / s
    };
}

function jFinishRectSelect(additive) {
    var rs = jState.rectSelect;
    if (!rs || !rs.active) return;
    var rx = Math.min(rs.startX, rs.endX), ry = Math.min(rs.startY, rs.endY);
    var rw = Math.abs(rs.endX - rs.startX), rh = Math.abs(rs.endY - rs.startY);
    rs.active = false;

    // If drag was too small, treat as a click (clear selection)
    if (rw < 0.5 && rh < 0.5) {
        if (!additive) {
            jState.selectedTreePaths = {};
            jState.selectedTreePath = null;
            jState.lastClickedTreePath = null;
            jState.selectedTreePanelId = null;
        }
        jRenderCanvas();
        jRenderLayerTree();
        return;
    }

    // Collect all display nodes and test intersection
    var allNodes = [];
    jCollectDisplayNodes(jState.documentTree, allNodes);
    if (!additive) {
        jState.selectedTreePaths = {};
        jState.selectedTreePanelId = null;
    }
    for (var i = 0; i < allNodes.length; i++) {
        var node = allNodes[i];
        if (node._isBoundsRect) continue;
        if (node.visible === false) continue;
        if (node.locked) continue;
        var b = node.bounds;
        if (!b && node._isUserGroup && node.children && node.children.length > 0) {
            b = node.children[0].bounds;
        }
        if (!b) continue;
        var nx = b.x * PT_TO_MM, ny = b.y * PT_TO_MM;
        var nw = b.width * PT_TO_MM, nh = b.height * PT_TO_MM;
        // Check AABB overlap
        if (nx + nw > rx && nx < rx + rw && ny + nh > ry && ny < ry + rh) {
            jState.selectedTreePaths[node._id] = true;
        }
    }
    var keys = Object.keys(jState.selectedTreePaths);
    jState.selectedTreePath = keys.length === 1 ? keys[0] : null;
    jState.lastClickedTreePath = keys.length > 0 ? keys[keys.length - 1] : null;
    jRenderCanvas();
    jRenderLayerTree();
}

function jHitTestOverlay(x, y) {
    for (var i = jState.overlays.length - 1; i >= 0; i--) {
        var o = jState.overlays[i];
        if (o.visible === false) continue;
        var tp = jUnrotatePoint(x, y, o._boundsRectIdx);
        if (tp.x >= o.x && tp.x <= o.x + o.w && tp.y >= o.y && tp.y <= o.y + o.h) return i;
    }
    return -1;
}

function jGetBoundsSnapPoints(br) {
    if (!br) return [];
    return [
        { x: br.x, y: br.y }, { x: br.x + br.w, y: br.y },
        { x: br.x, y: br.y + br.h }, { x: br.x + br.w, y: br.y + br.h },
        { x: br.x + br.w / 2, y: br.y }, { x: br.x + br.w / 2, y: br.y + br.h },
        { x: br.x, y: br.y + br.h / 2 }, { x: br.x + br.w, y: br.y + br.h / 2 },
        { x: br.x + br.w / 2, y: br.y + br.h / 2 }
    ];
}

function jSnapOverlayToPoints(x, y, w, h, snaps) {
    var THRESH = 1;
    for (var i = 0; i < snaps.length; i++) {
        var s = snaps[i];
        if (Math.abs(x - s.x) < THRESH) x = s.x;
        else if (Math.abs(x + w - s.x) < THRESH) x = s.x - w;
        if (Math.abs(y - s.y) < THRESH) y = s.y;
        else if (Math.abs(y + h - s.y) < THRESH) y = s.y - h;
    }
    return { x: x, y: y };
}

function jStartOverlayDrag(e, idx) {
    var ov = jState.overlays[idx];
    if (ov.locked) return;
    var rawPos = jScreenToDoc(e.clientX, e.clientY);
    var pos = jUnrotatePoint(rawPos.x, rawPos.y, ov._boundsRectIdx);
    var offX = pos.x - ov.x;
    var offY = pos.y - ov.y;
    var constraint = null;
    var snaps = [];
    if (ov._boundsRectIdx >= 0 && jState.boundsRects) {
        constraint = jState.boundsRects[ov._boundsRectIdx];
        snaps = jGetBoundsSnapPoints(constraint);
    }
    var brIdx = ov._boundsRectIdx;
    var onMove = function(ev) {
        var rawP = jScreenToDoc(ev.clientX, ev.clientY);
        var p = jUnrotatePoint(rawP.x, rawP.y, brIdx);
        var newX = p.x - offX;
        var newY = p.y - offY;
        if (constraint) {
            if (newX < constraint.x) newX = constraint.x;
            if (newY < constraint.y) newY = constraint.y;
            if (newX + ov.w > constraint.x + constraint.w) newX = constraint.x + constraint.w - ov.w;
            if (newY + ov.h > constraint.y + constraint.h) newY = constraint.y + constraint.h - ov.h;
            var snapped = jSnapOverlayToPoints(newX, newY, ov.w, ov.h, snaps);
            newX = snapped.x; newY = snapped.y;
        }
        ov.x = newX;
        ov.y = newY;
        jRenderCanvas();
    };
    var onUp = function() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        jCaptureState();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function jHitTestPendingHandle(pos, pr) {
    var T = 1.5;
    var handles = [
        { id: 'tl', x: pr.x, y: pr.y },
        { id: 'tr', x: pr.x + pr.w, y: pr.y },
        { id: 'bl', x: pr.x, y: pr.y + pr.h },
        { id: 'br', x: pr.x + pr.w, y: pr.y + pr.h }
    ];
    for (var i = 0; i < handles.length; i++) {
        var h = handles[i];
        if (Math.abs(pos.x - h.x) < T && Math.abs(pos.y - h.y) < T) return h.id;
    }
    return null;
}

function jStartPendingDrag(e) {
    var pr = jState.pendingContentRegion;
    var brIdx = jState._addOverlayBRIdx;
    var br = (brIdx >= 0 && jState.boundsRects) ? jState.boundsRects[brIdx] : null;
    var rawPos = jScreenToDoc(e.clientX, e.clientY);
    var pos = (brIdx >= 0) ? jUnrotatePoint(rawPos.x, rawPos.y, brIdx) : rawPos;
    var offX = pos.x - pr.x, offY = pos.y - pr.y;
    var snaps = br ? jGetBoundsSnapPoints(br) : [];
    var onMove = function(ev) {
        var rawP = jScreenToDoc(ev.clientX, ev.clientY);
        var p = (brIdx >= 0) ? jUnrotatePoint(rawP.x, rawP.y, brIdx) : rawP;
        var nx = p.x - offX, ny = p.y - offY;
        if (br) {
            if (nx < br.x) nx = br.x;
            if (ny < br.y) ny = br.y;
            if (nx + pr.w > br.x + br.w) nx = br.x + br.w - pr.w;
            if (ny + pr.h > br.y + br.h) ny = br.y + br.h - pr.h;
            var snapped = jSnapOverlayToPoints(nx, ny, pr.w, pr.h, snaps);
            nx = snapped.x; ny = snapped.y;
        }
        pr.x = nx; pr.y = ny;
        jRenderCanvas();
    };
    var onUp = function() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function jStartPendingResize(e, handleId) {
    var pr = jState.pendingContentRegion;
    var brIdx = jState._addOverlayBRIdx;
    var br = (brIdx >= 0 && jState.boundsRects) ? jState.boundsRects[brIdx] : null;
    var MIN = 1;
    var onMove = function(ev) {
        var rawP = jScreenToDoc(ev.clientX, ev.clientY);
        var p = (brIdx >= 0) ? jUnrotatePoint(rawP.x, rawP.y, brIdx) : rawP;
        if (br) {
            p.x = Math.max(br.x, Math.min(p.x, br.x + br.w));
            p.y = Math.max(br.y, Math.min(p.y, br.y + br.h));
        }
        if (handleId === 'br') {
            pr.w = Math.max(MIN, p.x - pr.x);
            pr.h = Math.max(MIN, p.y - pr.y);
        } else if (handleId === 'bl') {
            var r = pr.x + pr.w;
            pr.x = Math.min(p.x, r - MIN);
            pr.w = r - pr.x;
            pr.h = Math.max(MIN, p.y - pr.y);
        } else if (handleId === 'tr') {
            var b = pr.y + pr.h;
            pr.w = Math.max(MIN, p.x - pr.x);
            pr.y = Math.min(p.y, b - MIN);
            pr.h = b - pr.y;
        } else if (handleId === 'tl') {
            var r2 = pr.x + pr.w, b2 = pr.y + pr.h;
            pr.x = Math.min(p.x, r2 - MIN);
            pr.y = Math.min(p.y, b2 - MIN);
            pr.w = r2 - pr.x;
            pr.h = b2 - pr.y;
        }
        jRenderCanvas();
    };
    var onUp = function() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function resetViewport() {
    if (!jState) return;
    var container = _jel('canvas-container');
    var cw = container.clientWidth - 40;
    var ch = container.clientHeight - 40;
    jState.scale = Math.min(cw / jState.docWidth, ch / jState.docHeight);
    jState.pan = { x: 0, y: 0, zoom: 1, dragging: false, startX: 0, startY: 0, spaceDown: false };
    jRenderCanvas();
}

// Space key for pan
document.addEventListener('keydown', function(e) {
    if (jState && e.code === 'Space' && !e.target.matches('input,textarea,select')) {
        e.preventDefault();
        jState.pan.spaceDown = true;
    }
    if (jState && e.code === 'Escape' && jState.addOverlayMode) {
        jCancelAddOverlay();
    }
});
document.addEventListener('keyup', function(e) {
    if (jState && e.code === 'Space') {
        jState.pan.spaceDown = false;
    }
});

// __CONTINUE_HERE_5__

// ─── Canvas Rendering ───

function jRenderCanvas() {
    if (!jCanvas || !jCtx) return;
    var container = _jel('canvas-container');
    if (!container) return;
    jCanvas.width = container.clientWidth;
    jCanvas.height = container.clientHeight;
    var c = jCtx;
    c.clearRect(0, 0, jCanvas.width, jCanvas.height);

    if (!jState.documentTree) return;

    var pan = jState.pan;
    var s = jState.scale * pan.zoom;
    var docW = jState.docWidth * jState.scale;
    var docH = jState.docHeight * jState.scale;
    var offsetX = (jCanvas.width - docW) / 2 + pan.x;
    var offsetY = (jCanvas.height - docH) / 2 + pan.y;

    c.save();
    c.translate(offsetX, offsetY);
    c.scale(s, s);

    // White artboard background
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, jState.docWidth, jState.docHeight);

    // Clip to artboard
    c.save();
    c.beginPath();
    c.rect(0, 0, jState.docWidth, jState.docHeight);
    c.clip();

    // Render document tree with per-panel rotation
    var brs = jState.boundsRects;
    if (brs && brs.length > 0) {
        // Render nodes grouped by bounds rect, applying rotation per panel
        var allLeaves = [];
        jCollectLeafNodes(jState.documentTree, allLeaves);

        // Bucket nodes by bounds rect
        var buckets = [];
        var unassigned = [];
        for (var bi = 0; bi < brs.length; bi++) buckets.push([]);
        for (var ni = 0; ni < allLeaves.length; ni++) {
            var nd = allLeaves[ni];
            if (nd._isBoundsRect) continue;
            var nb = nd.bounds;
            if (!nb) { unassigned.push(nd); continue; }
            var ncx = nb.x * PT_TO_MM + (nb.width * PT_TO_MM) / 2;
            var ncy = nb.y * PT_TO_MM + (nb.height * PT_TO_MM) / 2;
            var assigned = false;
            for (var bi2 = 0; bi2 < brs.length; bi2++) {
                var tbr = brs[bi2];
                if (ncx >= tbr.x && ncx <= tbr.x + tbr.w && ncy >= tbr.y && ncy <= tbr.y + tbr.h) {
                    buckets[bi2].push(nd);
                    assigned = true;
                    break;
                }
            }
            if (!assigned) unassigned.push(nd);
        }

        // Render each panel with rotation
        for (var pi = 0; pi < brs.length; pi++) {
            var pbr = brs[pi];
            var rot = pbr._rotation || 0;

            // Draw bounds rect border (always unrotated for reference)
            c.save();
            c.strokeStyle = '#000';
            c.lineWidth = 0.3;
            c.setLineDash([1.5, 1]);
            c.strokeRect(pbr.x, pbr.y, pbr.w, pbr.h);
            c.setLineDash([]);
            c.restore();

            // Highlight boundsRects during add-overlay mode
            if (jState.addOverlayMode && jState.addOverlayStep === 'selectPanel') {
                c.save();
                c.fillStyle = 'rgba(0, 150, 255, 0.08)';
                c.strokeStyle = 'rgba(0, 150, 255, 0.6)';
                c.lineWidth = 0.5;
                c.fillRect(pbr.x, pbr.y, pbr.w, pbr.h);
                c.strokeRect(pbr.x, pbr.y, pbr.w, pbr.h);
                c.restore();
            }
            if (jState.addOverlayMode && jState.addOverlayStep === 'drawRegion' && pi === jState.addOverlaySelectedBRIdx) {
                c.save();
                c.fillStyle = 'rgba(0, 200, 0, 0.06)';
                c.strokeStyle = 'rgba(0, 200, 0, 0.8)';
                c.lineWidth = 0.6;
                c.fillRect(pbr.x, pbr.y, pbr.w, pbr.h);
                c.strokeRect(pbr.x, pbr.y, pbr.w, pbr.h);
                c.restore();
            }

            if (rot !== 0) {
                var cx = pbr.x + pbr.w / 2;
                var cy = pbr.y + pbr.h / 2;
                c.save();
                c.translate(cx, cy);
                c.rotate(rot * Math.PI / 180);
                c.translate(-cx, -cy);
            }

            for (var bni = 0; bni < buckets[pi].length; bni++) {
                var bnode = buckets[pi][bni];
                if (bnode.visible === false) continue;
                if (bnode._isDoubledText) continue;
                var bop = (bnode.opacity || 100) / 100;
                if (bnode.type === 'path') jRenderPath(c, bnode, bop);
                else if (bnode.type === 'compoundPath') jRenderCompoundPath(c, bnode, bop);
                else if (bnode.type === 'text') jRenderText(c, bnode, bop);
                else if (bnode.type === 'image') jRenderImagePlaceholder(c, bnode, bop);
            }

            if (rot !== 0) c.restore();
        }

        // Render unassigned nodes without rotation
        for (var ui = 0; ui < unassigned.length; ui++) {
            var unode = unassigned[ui];
            if (unode.visible === false) continue;
            if (unode._isDoubledText) continue;
            var uop = (unode.opacity || 100) / 100;
            if (unode.type === 'path') jRenderPath(c, unode, uop);
            else if (unode.type === 'compoundPath') jRenderCompoundPath(c, unode, uop);
            else if (unode.type === 'text') jRenderText(c, unode, uop);
            else if (unode.type === 'image') jRenderImagePlaceholder(c, unode, uop);
        }
    } else {
        // No bounds rects — render normally
        jRenderNodes(c, jState.documentTree, 1.0);
    }

    c.restore();

    // Render overlays on top (with per-panel rotation)
    jRenderOverlays(c);

    // Live preview for pending content region (image/QR/barcode)
    if (jState.pendingContentRegion && jState.pendingContentType) {
        var pr = jState.pendingContentRegion;
        var pt = jState.pendingContentType;
        if (pt === 'text') {
            c.save();
            c.strokeStyle = '#00aa00';
            c.lineWidth = 0.5;
            c.setLineDash([1, 1]);
            c.strokeRect(pr.x, pr.y, pr.w, pr.h);
            c.setLineDash([]);
            var textVal = (_jel('ct-text-value') || {}).value || '';
            if (textVal) {
                var fontSize = parseFloat((_jel('ct-font-size') || {}).value) || 12;
                var fontPt = fontSize * 0.3528;
                c.fillStyle = (_jel('ct-color') || {}).value || '#000';
                c.font = fontPt + 'px sans-serif';
                c.textBaseline = 'top';
                c.save();
                c.beginPath();
                c.rect(pr.x, pr.y, pr.w, pr.h);
                c.clip();
                c.fillText(textVal, pr.x + 0.5, pr.y + 0.5);
                c.restore();
            }
            c.restore();
        } else if (pt === 'image') {
            c.save();
            c.strokeStyle = '#00aa00';
            c.lineWidth = 0.5;
            c.setLineDash([1, 1]);
            c.strokeRect(pr.x, pr.y, pr.w, pr.h);
            c.setLineDash([]);
            c.fillStyle = 'rgba(0, 200, 0, 0.05)';
            c.fillRect(pr.x, pr.y, pr.w, pr.h);
            c.beginPath();
            c.moveTo(pr.x, pr.y); c.lineTo(pr.x + pr.w, pr.y + pr.h);
            c.moveTo(pr.x + pr.w, pr.y); c.lineTo(pr.x, pr.y + pr.h);
            c.lineWidth = 0.3;
            c.stroke();
            c.restore();
        } else if (pt === 'qrcode') {
            c.save();
            c.strokeStyle = '#00aa00';
            c.lineWidth = 0.5;
            c.setLineDash([1, 1]);
            c.strokeRect(pr.x, pr.y, pr.w, pr.h);
            c.setLineDash([]);
            var qrVal = (_jel('ct-qr-data') || {}).value || '';
            if (qrVal && typeof qrcode === 'function') {
                try {
                    var qrPrev = qrcode(0, 'M');
                    qrPrev.addData(qrVal);
                    qrPrev.make();
                    var mc = qrPrev.getModuleCount();
                    var cw = pr.w / mc, ch = pr.h / mc;
                    c.fillStyle = '#ffffff';
                    c.fillRect(pr.x, pr.y, pr.w, pr.h);
                    c.fillStyle = '#000000';
                    for (var qri = 0; qri < mc; qri++) {
                        for (var qci = 0; qci < mc; qci++) {
                            if (qrPrev.isDark(qri, qci)) {
                                c.fillRect(pr.x + qci * cw, pr.y + qri * ch, cw, ch);
                            }
                        }
                    }
                } catch(e) {}
            } else {
                c.fillStyle = '#999';
                c.font = '3px sans-serif';
                c.textAlign = 'center';
                c.fillText('QR', pr.x + pr.w / 2, pr.y + pr.h / 2);
                c.textAlign = 'left';
            }
            c.restore();
        } else if (pt === 'barcode') {
            c.save();
            c.strokeStyle = '#00aa00';
            c.lineWidth = 0.5;
            c.setLineDash([1, 1]);
            c.strokeRect(pr.x, pr.y, pr.w, pr.h);
            c.setLineDash([]);
            var bcVal = (_jel('ct-barcode-data') || {}).value || '';
            var bcFmt = (_jel('ct-barcode-format') || {}).value || 'CODE128';
            if (bcVal && typeof JsBarcode === 'function') {
                try {
                    var bcCanvas = document.createElement('canvas');
                    JsBarcode(bcCanvas, bcVal, {
                        format: bcFmt, displayValue: false, margin: 0, width: 2, height: 100
                    });
                    c.drawImage(bcCanvas, pr.x, pr.y, pr.w, pr.h);
                } catch(e) {}
            } else {
                c.fillStyle = '#999';
                c.font = '3px sans-serif';
                c.textAlign = 'center';
                c.fillText('Barcode', pr.x + pr.w / 2, pr.y + pr.h / 2);
                c.textAlign = 'left';
            }
            c.restore();
        }
        // Draw resize handles on pending region
        var hs = 0.8;
        var prHandles = [
            { x: pr.x, y: pr.y }, { x: pr.x + pr.w, y: pr.y },
            { x: pr.x, y: pr.y + pr.h }, { x: pr.x + pr.w, y: pr.y + pr.h }
        ];
        c.save();
        for (var hi = 0; hi < prHandles.length; hi++) {
            var hh = prHandles[hi];
            c.fillStyle = '#fff';
            c.strokeStyle = '#00aa00';
            c.lineWidth = 0.3;
            c.fillRect(hh.x - hs, hh.y - hs, hs * 2, hs * 2);
            c.strokeRect(hh.x - hs, hh.y - hs, hs * 2, hs * 2);
        }
        c.restore();
    }

    // Draw add-overlay region while dragging
    if (jState.addOverlayDraw) {
        var aod = jState.addOverlayDraw;
        var brIdx = jState.addOverlaySelectedBRIdx;
        var aRot = 0;
        if (jState.boundsRects && brIdx >= 0 && brIdx < jState.boundsRects.length) {
            aRot = jState.boundsRects[brIdx]._rotation || 0;
        }
        if (aRot !== 0) {
            var abr = jState.boundsRects[brIdx];
            var acx = abr.x + abr.w / 2;
            var acy = abr.y + abr.h / 2;
            c.save();
            c.translate(acx, acy);
            c.rotate(aRot * Math.PI / 180);
            c.translate(-acx, -acy);
        }
        c.save();
        c.strokeStyle = '#00aa00';
        c.lineWidth = 0.5;
        c.setLineDash([1.5, 1.5]);
        var rx = Math.min(aod.x1, aod.x2), ry = Math.min(aod.y1, aod.y2);
        var rw = Math.abs(aod.x2 - aod.x1), rh = Math.abs(aod.y2 - aod.y1);
        c.strokeRect(rx, ry, rw, rh);
        c.fillStyle = 'rgba(0, 170, 0, 0.05)';
        c.fillRect(rx, ry, rw, rh);
        c.setLineDash([]);
        c.restore();
        if (aRot !== 0) c.restore();

        // Snap indicator dot
        if (jState.addOverlaySnapPoint) {
            var sp = jState.addOverlaySnapPoint;
            var spRot = 0;
            if (jState.boundsRects && brIdx >= 0 && brIdx < jState.boundsRects.length) {
                spRot = jState.boundsRects[brIdx]._rotation || 0;
            }
            if (spRot !== 0) {
                var sbr = jState.boundsRects[brIdx];
                var scx = sbr.x + sbr.w / 2, scy = sbr.y + sbr.h / 2;
                c.save();
                c.translate(scx, scy);
                c.rotate(spRot * Math.PI / 180);
                c.translate(-scx, -scy);
            }
            c.save();
            c.beginPath();
            c.arc(sp.x, sp.y, 1, 0, Math.PI * 2);
            c.fillStyle = sp.type === 'corner' ? '#0066ff' : '#ff0000';
            c.fill();
            c.restore();
            if (spRot !== 0) c.restore();
        }
    }

    // Hover indicator dot (when not dragging, just hovering over mother panel)
    if (jState.addOverlayHoverPoint && !jState.addOverlayDraw) {
        var hp = jState.addOverlayHoverPoint;
        var hpBrIdx = jState.addOverlaySelectedBRIdx;
        var hpRot = 0;
        if (jState.boundsRects && hpBrIdx >= 0 && hpBrIdx < jState.boundsRects.length) {
            hpRot = jState.boundsRects[hpBrIdx]._rotation || 0;
        }
        if (hpRot !== 0) {
            var hbr = jState.boundsRects[hpBrIdx];
            var hcx = hbr.x + hbr.w / 2, hcy = hbr.y + hbr.h / 2;
            c.save();
            c.translate(hcx, hcy);
            c.rotate(hpRot * Math.PI / 180);
            c.translate(-hcx, -hcy);
        }
        c.save();
        c.beginPath();
        c.arc(hp.x, hp.y, 1, 0, Math.PI * 2);
        c.fillStyle = hp.type === 'corner' ? '#0066ff' : '#ff0000';
        c.fill();
        c.restore();
        if (hpRot !== 0) c.restore();
    }

    // Highlight selected tree nodes on canvas
    var selKeys = Object.keys(jState.selectedTreePaths);
    if (selKeys.length > 0) {
        for (var si = 0; si < selKeys.length; si++) {
            var selNode = jFindNodeByIdInTree(jState.documentTree, selKeys[si]);
            if (!selNode || selNode.visible === false || selNode._isBoundsRect) continue;
            var sb = selNode.bounds;
            if (!sb && selNode._isUserGroup && selNode.children && selNode.children.length > 0) {
                sb = selNode.children[0].bounds;
            }
            if (!sb) continue;
            var sx = sb.x * PT_TO_MM, sy = sb.y * PT_TO_MM;
            var sw = sb.width * PT_TO_MM, sh = sb.height * PT_TO_MM;
            c.save();
            c.strokeStyle = '#0066ff';
            c.lineWidth = 0.4;
            c.setLineDash([1, 1]);
            c.strokeRect(sx, sy, sw, sh);
            c.fillStyle = 'rgba(0, 102, 255, 0.08)';
            c.fillRect(sx, sy, sw, sh);
            c.setLineDash([]);
            c.restore();
        }
    }

    // Draw rectangle selection marquee
    var rs = jState.rectSelect;
    if (rs && rs.active) {
        var rsx = Math.min(rs.startX, rs.endX), rsy = Math.min(rs.startY, rs.endY);
        var rsw = Math.abs(rs.endX - rs.startX), rsh = Math.abs(rs.endY - rs.startY);
        c.save();
        c.strokeStyle = '#0066ff';
        c.lineWidth = 0.4;
        c.setLineDash([1.5, 1.5]);
        c.strokeRect(rsx, rsy, rsw, rsh);
        c.fillStyle = 'rgba(0, 102, 255, 0.06)';
        c.fillRect(rsx, rsy, rsw, rsh);
        c.setLineDash([]);
        c.restore();
    }

    c.restore();

    // Artboard border
    c.save();
    c.translate(offsetX, offsetY);
    c.scale(s, s);
    c.strokeStyle = '#000';
    c.lineWidth = 0.5 / s;
    c.strokeRect(0, 0, jState.docWidth, jState.docHeight);
    c.restore();
}

function jRenderNodes(c, nodes, parentOpacity) {
    if (!nodes) return;
    // Render in reverse order (bottom to top in Illustrator = first to last in array)
    for (var i = nodes.length - 1; i >= 0; i--) {
        var node = nodes[i];
        if (node.visible === false) continue;
        if (node._isDoubledText) continue;
        var opacity = parentOpacity * ((node.opacity || 100) / 100);

        if (node._isBoundsRect) {
            // Render as dashed border instead of filled path
            var b = node.bounds;
            c.save();
            c.globalAlpha = opacity;
            c.strokeStyle = '#000';
            c.lineWidth = 0.3;
            c.setLineDash([1.5, 1]);
            c.strokeRect(b.x * PT_TO_MM, b.y * PT_TO_MM, b.width * PT_TO_MM, b.height * PT_TO_MM);
            c.setLineDash([]);
            c.restore();
            continue;
        }

        if (node.children) {
            // Layer or group
            c.save();
            c.globalAlpha = opacity;
            jRenderNodes(c, node.children, 1.0);
            c.restore();
        } else if (node.type === 'path') {
            jRenderPath(c, node, opacity);
        } else if (node.type === 'compoundPath') {
            jRenderCompoundPath(c, node, opacity);
        } else if (node.type === 'text') {
            jRenderText(c, node, opacity);
        } else if (node.type === 'image') {
            jRenderImagePlaceholder(c, node, opacity);
        }
    }
}

// __CONTINUE_HERE_6__

function jColorToCSS(color) {
    if (!color || color.type === 'none') return null;
    if (color.type === 'rgb') return 'rgb(' + color.r + ',' + color.g + ',' + color.b + ')';
    if (color.type === 'cmyk') {
        var r = Math.round(255 * (1 - color.c / 100) * (1 - color.k / 100));
        var g = Math.round(255 * (1 - color.m / 100) * (1 - color.k / 100));
        var b = Math.round(255 * (1 - color.y / 100) * (1 - color.k / 100));
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }
    if (color.type === 'spot' && color.fallback) return jColorToCSS(color.fallback);
    if (color.type === 'gradient') return jGradientToCSS(color);
    return null;
}

function jGradientToCSS(color) {
    // Gradients need canvas gradient objects — return first stop color as fallback
    if (color.stops && color.stops.length > 0) return jColorToCSS(color.stops[0].color);
    return '#000000';
}

function jRenderPath(c, node, opacity) {
    if (!node.pathData || node.pathData.length === 0) return;
    c.save();
    c.globalAlpha = opacity;

    var pts = node.pathData;
    c.beginPath();
    // Move to first point
    c.moveTo(pts[0].x * PT_TO_MM, pts[0].y * PT_TO_MM);
    for (var i = 1; i < pts.length; i++) {
        var prev = pts[i - 1];
        var pt = pts[i];
        var ho = prev.handleOut;
        var hi = pt.handleIn;
        if (ho && hi && (ho.x !== prev.x || ho.y !== prev.y || hi.x !== pt.x || hi.y !== pt.y)) {
            c.bezierCurveTo(ho.x * PT_TO_MM, ho.y * PT_TO_MM, hi.x * PT_TO_MM, hi.y * PT_TO_MM, pt.x * PT_TO_MM, pt.y * PT_TO_MM);
        } else {
            c.lineTo(pt.x * PT_TO_MM, pt.y * PT_TO_MM);
        }
    }
    // Close path
    if (node.closed && pts.length > 1) {
        var last = pts[pts.length - 1];
        var first = pts[0];
        var ho = last.handleOut;
        var hi = first.handleIn;
        if (ho && hi && (ho.x !== last.x || ho.y !== last.y || hi.x !== first.x || hi.y !== first.y)) {
            c.bezierCurveTo(ho.x * PT_TO_MM, ho.y * PT_TO_MM, hi.x * PT_TO_MM, hi.y * PT_TO_MM, first.x * PT_TO_MM, first.y * PT_TO_MM);
        }
        c.closePath();
    }

    var fillCSS = jColorToCSS(node.fill);
    var strokeCSS = jColorToCSS(node.stroke);
    if (fillCSS) { c.fillStyle = fillCSS; c.fill(); }
    if (strokeCSS && node.strokeWidth > 0) {
        c.strokeStyle = strokeCSS;
        c.lineWidth = node.strokeWidth * PT_TO_MM;
        c.lineCap = node.strokeCap || 'butt';
        c.lineJoin = node.strokeJoin || 'miter';
        c.miterLimit = node.miterLimit || 10;
        c.stroke();
    }
    c.restore();
}

function jRenderCompoundPath(c, node, opacity) {
    if (!node.paths || node.paths.length === 0) return;
    c.save();
    c.globalAlpha = opacity;
    c.beginPath();
    for (var p = 0; p < node.paths.length; p++) {
        var path = node.paths[p];
        if (!path.pathData || path.pathData.length === 0) continue;
        var pts = path.pathData;
        c.moveTo(pts[0].x * PT_TO_MM, pts[0].y * PT_TO_MM);
        for (var i = 1; i < pts.length; i++) {
            var prev = pts[i - 1];
            var pt = pts[i];
            var ho = prev.handleOut;
            var hi = pt.handleIn;
            if (ho && hi && (ho.x !== prev.x || ho.y !== prev.y || hi.x !== pt.x || hi.y !== pt.y)) {
                c.bezierCurveTo(ho.x * PT_TO_MM, ho.y * PT_TO_MM, hi.x * PT_TO_MM, hi.y * PT_TO_MM, pt.x * PT_TO_MM, pt.y * PT_TO_MM);
            } else {
                c.lineTo(pt.x * PT_TO_MM, pt.y * PT_TO_MM);
            }
        }
        if (path.closed) c.closePath();
    }
    // Use evenodd for compound paths
    var fillCSS = jColorToCSS(node.fill || (node.paths[0] && node.paths[0].fill));
    var strokeCSS = jColorToCSS(node.stroke || (node.paths[0] && node.paths[0].stroke));
    if (fillCSS) { c.fillStyle = fillCSS; c.fill('evenodd'); }
    if (strokeCSS) {
        var sw = node.strokeWidth || (node.paths[0] && node.paths[0].strokeWidth) || 0;
        if (sw > 0) { c.strokeStyle = strokeCSS; c.lineWidth = sw * PT_TO_MM; c.stroke(); }
    }
    c.restore();
}

// __CONTINUE_HERE_7__

function jRenderText(c, node, opacity) {
    if (!node.paragraphs || !node.bounds) return;
    c.save();
    c.globalAlpha = opacity;
    var b = node.bounds;
    var x = b.x * PT_TO_MM;
    var y = b.y * PT_TO_MM;
    var w = b.width * PT_TO_MM;
    var h = b.height * PT_TO_MM;

    // Apply transformation matrix if present (handles rotation)
    if (node.matrix) {
        var m = node.matrix;
        var cx = x + w / 2;
        var cy = y + h / 2;
        c.translate(cx, cy);
        // Illustrator matrix: a=scaleX, b=shearY, c=shearX, d=scaleY
        // But d is negated because we flipped Y in export
        c.transform(m.a, -m.b, -m.c, m.d, m.tx * PT_TO_MM, -m.ty * PT_TO_MM);
        c.translate(-cx, -cy);
    }

    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();

    var curY = y;
    for (var pi = 0; pi < node.paragraphs.length; pi++) {
        var para = node.paragraphs[pi];
        var align = para.alignment || 'left';
        var runs = para.runs || [];
        for (var ri = 0; ri < runs.length; ri++) {
            var run = runs[ri];
            var fontSize = (run.fontSize || 12) * PT_TO_MM;
            var leading = run.leading === 'auto' ? fontSize * 1.2 : (run.leading || run.fontSize * 1.2) * PT_TO_MM;
            var fontStyle = '';
            if (run.fontStyle && run.fontStyle.toLowerCase().indexOf('bold') >= 0) fontStyle += 'bold ';
            if (run.fontStyle && run.fontStyle.toLowerCase().indexOf('italic') >= 0) fontStyle += 'italic ';
            fontStyle += fontSize + 'px ';
            fontStyle += "'" + (run.fontFamily || 'Arial') + "', sans-serif";
            c.font = fontStyle;
            c.fillStyle = jColorToCSS(run.color) || '#000000';
            c.textBaseline = 'top';
            if (align === 'center') c.textAlign = 'center';
            else if (align === 'right') c.textAlign = 'right';
            else c.textAlign = 'left';

            var lines = (run.text || '').split('\n');
            for (var li = 0; li < lines.length; li++) {
                var tx = x;
                if (align === 'center') tx = x + w / 2;
                else if (align === 'right') tx = x + w;
                c.fillText(lines[li], tx, curY);
                curY += leading;
            }
        }
    }
    c.restore();

    // Green dotted line around text bounds (same style as PDF manager content regions)
    c.save();
    c.globalAlpha = 1;
    if (node.matrix) {
        var m = node.matrix;
        var cx = x + w / 2;
        var cy = y + h / 2;
        c.translate(cx, cy);
        c.transform(m.a, -m.b, -m.c, m.d, m.tx * PT_TO_MM, -m.ty * PT_TO_MM);
        c.translate(-cx, -cy);
    }
    c.strokeStyle = '#00cc00';
    c.lineWidth = 0.3;
    c.setLineDash([1, 1]);
    c.strokeRect(x, y, w, h);
    c.setLineDash([]);
    // Label with font name
    c.fillStyle = '#00aa00';
    c.font = '2.5px sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'bottom';
    var fontLabel = 'Text';
    if (node.paragraphs && node.paragraphs.length > 0) {
        var runs = node.paragraphs[0].runs;
        if (runs && runs.length > 0 && runs[0].fontFamily) {
            fontLabel = runs[0].fontFamily;
            if (runs[0].fontStyle) fontLabel += ' ' + runs[0].fontStyle;
        }
    }
    c.fillText(fontLabel, x, y - 0.3);
    c.restore();

    // Draw 8 resize handles if this text node is selected
    if (jState._selectedTextNode === node) {
        jDrawTextNodeHandles(c, x, y, w, h);
    }
}

function jRenderImagePlaceholder(c, node, opacity) {
    if (!node.bounds) return;
    c.save();
    c.globalAlpha = opacity;
    var b = node.bounds;
    var x = b.x * PT_TO_MM, y = b.y * PT_TO_MM;
    var w = b.width * PT_TO_MM, h = b.height * PT_TO_MM;
    c.fillStyle = '#f0f0f0';
    c.fillRect(x, y, w, h);
    c.strokeStyle = '#ccc';
    c.lineWidth = 0.3;
    c.strokeRect(x, y, w, h);
    // Draw X
    c.beginPath();
    c.moveTo(x, y); c.lineTo(x + w, y + h);
    c.moveTo(x + w, y); c.lineTo(x, y + h);
    c.stroke();
    c.restore();
}

function jRenderOverlays(c) {
    if (!jState.overlays) return;
    var brs = jState.boundsRects;
    for (var i = 0; i < jState.overlays.length; i++) {
        var ov = jState.overlays[i];
        if (!ov.visible) continue;
        if (jState.editingComponentIdx === i && jState.pendingContentRegion) continue;
        var rot = 0;
        if (brs && ov._boundsRectIdx >= 0 && ov._boundsRectIdx < brs.length) {
            rot = brs[ov._boundsRectIdx]._rotation || 0;
        }
        if (rot !== 0) {
            var pbr = brs[ov._boundsRectIdx];
            var cx = pbr.x + pbr.w / 2;
            var cy = pbr.y + pbr.h / 2;
            c.save();
            c.translate(cx, cy);
            c.rotate(rot * Math.PI / 180);
            c.translate(-cx, -cy);
        }
        jRenderOverlayItem(c, ov, i);
        if (rot !== 0) c.restore();
    }
}

function jRenderOverlayItem(c, ov, idx) {
    var x = ov.x, y = ov.y, w = ov.w, h = ov.h;
    var isSelected = idx === jState.selectedOverlayIdx;
    var ovRot = ov._rotation || 0;

    // Apply overlay's own rotation around its center
    if (ovRot !== 0) {
        c.save();
        var ocx = x + w / 2;
        var ocy = y + h / 2;
        c.translate(ocx, ocy);
        c.rotate(ovRot * Math.PI / 180);
        c.translate(-ocx, -ocy);
    }

    // Draw region border
    c.save();
    c.strokeStyle = isSelected ? '#0066ff' : '#00aa00';
    c.lineWidth = 0.5;
    c.setLineDash([1, 1]);
    c.strokeRect(x, y, w, h);
    c.setLineDash([]);

    if (ov.type === 'textregion' && ov.content && ov.fontFamily) {
        var fontSizeMm = ov.fontSize * PT_TO_MM;
        var fontStyle = '';
        if (ov.italic) fontStyle += 'italic ';
        if (ov.bold) fontStyle += 'bold ';
        fontStyle += fontSizeMm + 'px ';
        fontStyle += "'" + ov.fontFamily + "', sans-serif";
        c.font = fontStyle;
        c.fillStyle = ov.color || '#000000';
        if (ov.alignH === 'center') c.textAlign = 'center';
        else if (ov.alignH === 'right') c.textAlign = 'right';
        else c.textAlign = 'left';
        c.textBaseline = 'top';

        var tx = x;
        if (ov.alignH === 'center') tx = x + w / 2;
        else if (ov.alignH === 'right') tx = x + w;

        var lines = ov.content.split('\n');
        var lineSpacing = (ov.letterSpacing || 0) * PT_TO_MM;
        var lineHeight = fontSizeMm * 1.2 + lineSpacing;
        var totalH = lines.length * lineHeight;
        var startY = y;
        if (ov.alignV === 'center') startY = y + (h - totalH) / 2;
        else if (ov.alignV === 'bottom') startY = y + h - totalH;

        c.save();
        c.beginPath();
        c.rect(x, y, w, h);
        c.clip();
        for (var li = 0; li < lines.length; li++) {
            c.fillText(lines[li], tx, startY + li * lineHeight);
        }
        c.restore();
        c.textAlign = 'left';
    } else if (ov.type === 'imageregion') {
        // X-cross placeholder
        c.fillStyle = 'rgba(0, 200, 0, 0.05)';
        c.fillRect(x, y, w, h);
        c.beginPath();
        c.moveTo(x, y); c.lineTo(x + w, y + h);
        c.moveTo(x + w, y); c.lineTo(x, y + h);
        c.strokeStyle = isSelected ? '#0066ff' : '#00aa00';
        c.lineWidth = 0.3;
        c.stroke();
    } else if (ov.type === 'qrcoderegion' && ov.qrData) {
        // Real QR code
        try {
            var qr = qrcode(0, 'M');
            qr.addData(ov.qrData);
            qr.make();
            var mCount = qr.getModuleCount();
            var cellW = w / mCount, cellH = h / mCount;
            c.fillStyle = '#ffffff';
            c.fillRect(x, y, w, h);
            c.fillStyle = '#000000';
            for (var qr_r = 0; qr_r < mCount; qr_r++) {
                for (var qr_c = 0; qr_c < mCount; qr_c++) {
                    if (qr.isDark(qr_r, qr_c)) {
                        c.fillRect(x + qr_c * cellW, y + qr_r * cellH, cellW, cellH);
                    }
                }
            }
        } catch(e) {
            c.fillStyle = '#cc0000';
            c.font = '3px sans-serif';
            c.fillText('QR Error', x + 1, y + h / 2);
        }
    } else if (ov.type === 'qrcoderegion') {
        c.fillStyle = '#999';
        c.font = '3px sans-serif';
        c.textAlign = 'center';
        c.fillText('QR', x + w / 2, y + h / 2);
        c.textAlign = 'left';
    } else if (ov.type === 'barcoderegion' && ov.barcodeData) {
        // Real barcode
        try {
            var bcCanvas = document.createElement('canvas');
            JsBarcode(bcCanvas, ov.barcodeData, {
                format: ov.barcodeFormat || 'CODE128',
                displayValue: false, margin: 0, width: 2, height: 100
            });
            c.drawImage(bcCanvas, x, y, w, h);
        } catch(e) {
            c.fillStyle = '#cc0000';
            c.font = '3px sans-serif';
            c.fillText('Barcode Error', x + 1, y + h / 2);
        }
    } else if (ov.type === 'barcoderegion') {
        c.fillStyle = '#999';
        c.font = '3px sans-serif';
        c.textAlign = 'center';
        c.fillText('Barcode', x + w / 2, y + h / 2);
        c.textAlign = 'left';
    }

    // Label
    c.fillStyle = isSelected ? '#0066ff' : '#00aa00';
    c.font = '3px sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'bottom';
    var label = ov.type === 'textregion' ? 'Text' : ov.type === 'imageregion' ? 'Image' : ov.type === 'qrcoderegion' ? 'QR' : 'Barcode';
    c.fillText(label, x, y - 0.5);
    c.restore();

    // Draw 8 resize handles if this overlay is selected and has bounds constraint
    if (isSelected && ov._boundsRectIdx >= 0) {
        jDrawOverlayHandles(c, x, y, w, h);
    }

    // Close overlay rotation transform
    if (ovRot !== 0) {
        c.restore();
    }
}

function jGetOverlayHandles(x, y, w, h) {
    var hs = HANDLE_SIZE_MM;
    return [
        { id: 'tl', x: x - hs/2, y: y - hs/2 },
        { id: 'tc', x: x + w/2 - hs/2, y: y - hs/2 },
        { id: 'tr', x: x + w - hs/2, y: y - hs/2 },
        { id: 'ml', x: x - hs/2, y: y + h/2 - hs/2 },
        { id: 'mr', x: x + w - hs/2, y: y + h/2 - hs/2 },
        { id: 'bl', x: x - hs/2, y: y + h - hs/2 },
        { id: 'bc', x: x + w/2 - hs/2, y: y + h - hs/2 },
        { id: 'br', x: x + w - hs/2, y: y + h - hs/2 }
    ];
}

function jDrawOverlayHandles(c, x, y, w, h) {
    var handles = jGetOverlayHandles(x, y, w, h);
    var hs = HANDLE_SIZE_MM;
    c.save();
    for (var i = 0; i < handles.length; i++) {
        c.fillStyle = '#ffffff';
        c.fillRect(handles[i].x, handles[i].y, hs, hs);
        c.strokeStyle = '#0066ff';
        c.lineWidth = 0.3;
        c.strokeRect(handles[i].x, handles[i].y, hs, hs);
    }
    c.restore();
}

function jHitTestOverlayHandle(pos) {
    if (!jState || jState.selectedOverlayIdx < 0) return null;
    var ov = jState.overlays[jState.selectedOverlayIdx];
    if (!ov || ov._boundsRectIdx < 0) return null;
    var tp = jUnrotatePoint(pos.x, pos.y, ov._boundsRectIdx);
    var handles = jGetOverlayHandles(ov.x, ov.y, ov.w, ov.h);
    var hs = HANDLE_SIZE_MM;
    for (var i = 0; i < handles.length; i++) {
        if (tp.x >= handles[i].x && tp.x <= handles[i].x + hs &&
            tp.y >= handles[i].y && tp.y <= handles[i].y + hs) {
            return handles[i].id;
        }
    }
    return null;
}

function jStartOverlayResize(e, idx, handleId) {
    var ov = jState.overlays[idx];
    if (!ov) return;
    if (ov.locked) return;
    var origX = ov.x, origY = ov.y, origW = ov.w, origH = ov.h;
    var brIdx = ov._boundsRectIdx;
    var rawStart = jScreenToDoc(e.clientX, e.clientY);
    var startPos = jUnrotatePoint(rawStart.x, rawStart.y, brIdx);
    var constraint = null;
    if (ov._boundsRectIdx >= 0 && jState.boundsRects) {
        constraint = jState.boundsRects[ov._boundsRectIdx];
    }
    var onMove = function(ev) {
        var rawP = jScreenToDoc(ev.clientX, ev.clientY);
        var p = jUnrotatePoint(rawP.x, rawP.y, brIdx);
        var dx = p.x - startPos.x;
        var dy = p.y - startPos.y;
        if (handleId === 'tl') { ov.x = origX + dx; ov.y = origY + dy; ov.w = origW - dx; ov.h = origH - dy; }
        else if (handleId === 'tc') { ov.y = origY + dy; ov.h = origH - dy; }
        else if (handleId === 'tr') { ov.y = origY + dy; ov.w = origW + dx; ov.h = origH - dy; }
        else if (handleId === 'ml') { ov.x = origX + dx; ov.w = origW - dx; }
        else if (handleId === 'mr') { ov.w = origW + dx; }
        else if (handleId === 'bl') { ov.x = origX + dx; ov.w = origW - dx; ov.h = origH + dy; }
        else if (handleId === 'bc') { ov.h = origH + dy; }
        else if (handleId === 'br') { ov.w = origW + dx; ov.h = origH + dy; }
        if (ov.w < 2) ov.w = 2;
        if (ov.h < 2) ov.h = 2;
        if (constraint) {
            if (ov.x < constraint.x) { ov.w -= (constraint.x - ov.x); ov.x = constraint.x; }
            if (ov.y < constraint.y) { ov.h -= (constraint.y - ov.y); ov.y = constraint.y; }
            if (ov.x + ov.w > constraint.x + constraint.w) ov.w = constraint.x + constraint.w - ov.x;
            if (ov.y + ov.h > constraint.y + constraint.h) ov.h = constraint.y + constraint.h - ov.y;
        }
        jRenderCanvas();
    };
    var onUp = function() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        jCaptureState();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function jRenderEdges(c) {
    if (!jState.edges) return;
    for (var i = 0; i < jState.edges.length; i++) {
        var edge = jState.edges[i];
        c.save();
        c.strokeStyle = edge.confirmed ? '#00aa00' : '#ff6600';
        c.lineWidth = 0.3;
        c.setLineDash(edge.confirmed ? [] : [2, 2]);
        c.strokeRect(edge.x1, edge.y1, edge.x2 - edge.x1, edge.y2 - edge.y1);
        c.setLineDash([]);
        c.restore();
    }
}

// __CONTINUE_HERE_8__

// ─── Layer Tree Panel ───

function jRenderLayerTree() {
    var tree = _jel('layer-tree');
    if (!tree) return;
    tree.innerHTML = '';

    // Show/hide Group/Ungroup buttons based on selection
    var groupBtn = _jel('layer-group-btn');
    var ungroupBtn = _jel('layer-ungroup-btn');
    var selKeys = Object.keys(jState.selectedTreePaths);
    if (groupBtn) groupBtn.style.display = selKeys.length >= 2 ? 'inline-block' : 'none';
    if (ungroupBtn) {
        var showUngroup = false;
        if (selKeys.length === 1) {
            var selNode = jFindNodeByIdInTree(jState.documentTree, selKeys[0]);
            if (selNode && selNode._isUserGroup) showUngroup = true;
        }
        ungroupBtn.style.display = showUngroup ? 'inline-block' : 'none';
    }

    // Auto-expand panels containing selected nodes
    if (selKeys.length > 0 && jState.boundsRects && jState.boundsRects.length > 0) {
        var allNodesForExpand = [];
        jCollectDisplayNodes(jState.documentTree, allNodesForExpand);
        for (var ei = 0; ei < allNodesForExpand.length; ei++) {
            var en = allNodesForExpand[ei];
            if (!jState.selectedTreePaths[en._id]) continue;
            var eb = en.bounds;
            if (!eb && en._isUserGroup && en.children && en.children.length > 0) eb = en.children[0].bounds;
            if (!eb) continue;
            var ecx = eb.x * PT_TO_MM + (eb.width * PT_TO_MM) / 2;
            var ecy = eb.y * PT_TO_MM + (eb.height * PT_TO_MM) / 2;
            for (var ebi = 0; ebi < jState.boundsRects.length; ebi++) {
                var ebr = jState.boundsRects[ebi];
                if (ecx >= ebr.x && ecx <= ebr.x + ebr.w && ecy >= ebr.y && ecy <= ebr.y + ebr.h) {
                    jState.layerExpanded['__br_' + ebi] = true;
                    break;
                }
            }
        }
    }

    if (!jState.documentTree || jState.documentTree.length === 0) {
        tree.innerHTML = '<div class="empty-message">No JSON loaded</div>';
        return;
    }

    var brs = jState.boundsRects;
    if (brs && brs.length > 0) {
        var countEl = _jel('layer-count');
        if (countEl) countEl.textContent = '(' + brs.length + ' layers)';

        // Collect display nodes (leaf nodes + user groups as units)
        var allNodes = [];
        jCollectDisplayNodes(jState.documentTree, allNodes);

        // Group nodes by which bounds rect contains them
        var buckets = [];
        for (var bi = 0; bi < brs.length; bi++) buckets.push([]);

        for (var ni = 0; ni < allNodes.length; ni++) {
            var node = allNodes[ni];
            if (node._isBoundsRect) continue;
            var b = node.bounds;
            if (!b && node._isUserGroup && node.children && node.children.length > 0) {
                b = node.children[0].bounds;
            }
            if (!b) continue;
            var cx = b.x * PT_TO_MM + (b.width * PT_TO_MM) / 2;
            var cy = b.y * PT_TO_MM + (b.height * PT_TO_MM) / 2;
            for (var bi2 = 0; bi2 < brs.length; bi2++) {
                var br = brs[bi2];
                if (cx >= br.x && cx <= br.x + br.w && cy >= br.y && cy <= br.y + br.h) {
                    buckets[bi2].push(node);
                    break;
                }
            }
        }

        // Move user groups to top of each bucket
        for (var si = 0; si < buckets.length; si++) {
            var groups = [];
            var others = [];
            for (var sj = 0; sj < buckets[si].length; sj++) {
                if (buckets[si][sj]._isUserGroup) groups.push(buckets[si][sj]);
                else others.push(buckets[si][sj]);
            }
            buckets[si] = groups.concat(others);
        }

        // Render each bounds rect as a layer
        for (var li = 0; li < brs.length; li++) {
            var br = brs[li];
            var layerId = '__br_' + li;
            var isExpanded = jState.layerExpanded[layerId] === true;
            var childCount = buckets[li].length;

            // Count overlays for this layer
            for (var oi2 = 0; oi2 < jState.overlays.length; oi2++) {
                if (jState.overlays[oi2]._boundsRectIdx === li) childCount++;
            }

            jRenderBoundsLayerItem(tree, br, layerId, isExpanded, childCount);

            if (isExpanded) {
                // Render contained nodes
                for (var ci = 0; ci < buckets[li].length; ci++) {
                    jRenderTreeNode(tree, buckets[li][ci], 1, false, layerId);
                }
                // Render overlays belonging to this layer
                for (var oi = 0; oi < jState.overlays.length; oi++) {
                    var ov = jState.overlays[oi];
                    if (ov._boundsRectIdx === li) {
                        jRenderOverlayTreeItem(tree, ov, oi, 1);
                    }
                }
            }
        }
    } else {
        // Fallback: render raw hierarchy
        var countEl = _jel('layer-count');
        if (countEl) countEl.textContent = '(' + jState.documentTree.length + ' layers)';
        for (var i = 0; i < jState.documentTree.length; i++) {
            jRenderTreeNode(tree, jState.documentTree[i], 0, false, null);
        }
    }
}

function jCollectLeafNodes(nodes, out) {
    if (!nodes) return;
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node._isBoundsRect) continue;
        if (node.visible === false) continue;
        if (node.children) {
            jCollectLeafNodes(node.children, out);
        } else if (node.type === 'path' || node.type === 'compoundPath' || node.type === 'text' || node.type === 'image') {
            out.push(node);
        }
    }
}

function jRenderBoundsLayerItem(parent, br, layerId, isExpanded, childCount) {
    var item = document.createElement('div');
    item.className = 'layer-tree-item';
    item.style.paddingLeft = '4px';

    var toggle = document.createElement('span');
    toggle.className = 'layer-toggle';
    toggle.textContent = isExpanded ? '▼' : '▶';
    toggle.style.cursor = 'pointer';
    toggle.style.marginRight = '4px';
    toggle.style.fontSize = '10px';
    (function(lid) {
        toggle.addEventListener('click', function(e) {
            e.stopPropagation();
            jState.layerExpanded[lid] = !isExpanded;
            jRenderLayerTree();
        });
    })(layerId);

    // Visibility toggle — hides/shows all nodes within this bounds rect
    var eyeBtn = document.createElement('button');
    eyeBtn.className = 'icon-btn';
    var isVisible = br._visible !== false;
    eyeBtn.textContent = isVisible ? '👁' : '-';
    eyeBtn.style.marginRight = '2px';
    (function(b) {
        eyeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            b._visible = !(b._visible !== false);
            jSetChildVisibility(b);
            jRenderCanvas();
            jRenderLayerTree();
        });
    })(br);

    // Lock toggle — locks/unlocks all nodes within this bounds rect
    var lockBtn = document.createElement('button');
    lockBtn.className = 'icon-btn';
    var isLocked = br._locked === true;
    lockBtn.textContent = isLocked ? '🔒' : '🔓';
    lockBtn.style.marginRight = '2px';
    (function(b) {
        lockBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            b._locked = !b._locked;
            jSetChildLocked(b);
            jRenderLayerTree();
        });
    })(br);

    var label = document.createElement('span');
    label.className = 'component-label';
    var rotDeg = br._rotation || 0;
    var rotLabel = rotDeg ? ' [' + rotDeg + '°]' : '';
    label.textContent = '[L] ' + br.groupName + ' (' + childCount + ')' + rotLabel;

    // Rotate buttons
    var rotCW = document.createElement('button');
    rotCW.className = 'icon-btn';
    rotCW.textContent = '↻';
    rotCW.title = 'Rotate +90°';
    rotCW.style.marginLeft = '4px';
    rotCW.style.fontSize = '12px';
    (function(b) {
        rotCW.addEventListener('click', function(e) {
            e.stopPropagation();
            b._rotation = ((b._rotation || 0) + 90) % 360;
            jRenderCanvas();
            jRenderLayerTree();
        });
    })(br);

    var rotCCW = document.createElement('button');
    rotCCW.className = 'icon-btn';
    rotCCW.textContent = '↺';
    rotCCW.title = 'Rotate -90°';
    rotCCW.style.fontSize = '12px';
    (function(b) {
        rotCCW.addEventListener('click', function(e) {
            e.stopPropagation();
            b._rotation = ((b._rotation || 0) - 90 + 360) % 360;
            jRenderCanvas();
            jRenderLayerTree();
        });
    })(br);

    item.appendChild(toggle);
    item.appendChild(eyeBtn);
    item.appendChild(lockBtn);
    item.appendChild(label);
    item.appendChild(rotCW);
    item.appendChild(rotCCW);
    parent.appendChild(item);
}

function jSetChildVisibility(br) {
    if (!jState.documentTree) return;
    var visible = br._visible !== false;
    jSetVisibilityInBounds(jState.documentTree, br, visible);
}

function jSetVisibilityInBounds(nodes, br, visible) {
    if (!nodes) return;
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node._isBoundsRect) continue;
        var b = node.bounds;
        if (b) {
            var cx = b.x * PT_TO_MM + (b.width * PT_TO_MM) / 2;
            var cy = b.y * PT_TO_MM + (b.height * PT_TO_MM) / 2;
            if (cx >= br.x && cx <= br.x + br.w && cy >= br.y && cy <= br.y + br.h) {
                node.visible = visible;
            }
        }
        if (node.children) jSetVisibilityInBounds(node.children, br, visible);
        if (node.paths) jSetVisibilityInBounds(node.paths, br, visible);
    }
}

// Like jCollectLeafNodes but does NOT skip invisible nodes
function jCollectAllLeafNodes(nodes, out) {
    if (!nodes) return;
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node._isBoundsRect) continue;
        if (node.children) {
            jCollectAllLeafNodes(node.children, out);
        } else if (node.type === 'path' || node.type === 'compoundPath' || node.type === 'text' || node.type === 'image') {
            out.push(node);
        }
    }
}

function jSetChildLocked(br) {
    if (!jState.documentTree) return;
    var locked = br._locked === true;
    jSetLockedInBounds(jState.documentTree, br, locked);
}

function jSetLockedInBounds(nodes, br, locked) {
    if (!nodes) return;
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node._isBoundsRect) continue;
        var b = node.bounds;
        if (b) {
            var cx = b.x * PT_TO_MM + (b.width * PT_TO_MM) / 2;
            var cy = b.y * PT_TO_MM + (b.height * PT_TO_MM) / 2;
            if (cx >= br.x && cx <= br.x + br.w && cy >= br.y && cy <= br.y + br.h) {
                node.locked = locked;
            }
        }
        if (node.children) jSetLockedInBounds(node.children, br, locked);
        if (node.paths) jSetLockedInBounds(node.paths, br, locked);
    }
}

function jRenderOverlayTreeItem(parent, ov, ovIdx, depth) {
    var item = document.createElement('div');
    item.className = 'layer-tree-item';
    item.style.paddingLeft = (depth * 12 + 4) + 'px';
    if (ovIdx === jState.selectedOverlayIdx) item.style.background = '#e0e0e0';

    var icon = document.createElement('span');
    icon.style.marginRight = '4px';
    icon.style.fontSize = '10px';
    icon.textContent = '  ';

    var eyeBtn = document.createElement('button');
    eyeBtn.className = 'icon-btn';
    eyeBtn.textContent = ov.visible ? '👁' : '-';
    eyeBtn.style.marginRight = '2px';
    (function(idx) {
        eyeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            jState.overlays[idx].visible = !jState.overlays[idx].visible;
            jRenderCanvas();
            jRenderLayerTree();
        });
    })(ovIdx);

    var label = document.createElement('span');
    label.className = 'component-label';
    label.style.color = '#00aa00';
    var labelMap = { 'textregion': 'Text', 'imageregion': 'Image', 'qrcoderegion': 'QR', 'barcoderegion': 'Barcode' };
    var txt = labelMap[ov.type] || ov.type;
    if (ov.type === 'textregion' && ov.content) txt += ': "' + ov.content.substring(0, 15) + '"';
    var ovRot = ov._rotation || 0;
    if (ovRot) txt += ' [' + ovRot + '°]';
    label.textContent = '[OV] ' + txt;

    // Rotate buttons for overlay
    var rotCW = document.createElement('button');
    rotCW.className = 'icon-btn';
    rotCW.textContent = '↻';
    rotCW.title = 'Rotate +90°';
    rotCW.style.marginLeft = '4px';
    rotCW.style.fontSize = '12px';
    (function(idx) {
        rotCW.addEventListener('click', function(e) {
            e.stopPropagation();
            var o = jState.overlays[idx];
            o._rotation = ((o._rotation || 0) + 90) % 360;
            jRenderCanvas();
            jRenderLayerTree();
        });
    })(ovIdx);

    var rotCCW = document.createElement('button');
    rotCCW.className = 'icon-btn';
    rotCCW.textContent = '↺';
    rotCCW.title = 'Rotate -90°';
    rotCCW.style.fontSize = '12px';
    (function(idx) {
        rotCCW.addEventListener('click', function(e) {
            e.stopPropagation();
            var o = jState.overlays[idx];
            o._rotation = ((o._rotation || 0) - 90 + 360) % 360;
            jRenderCanvas();
            jRenderLayerTree();
        });
    })(ovIdx);

    item.appendChild(icon);
    item.appendChild(eyeBtn);
    item.appendChild(label);
    item.appendChild(rotCW);
    item.appendChild(rotCCW);
    (function(idx) {
        item.addEventListener('click', function() {
            jState.selectedOverlayIdx = idx;
            jState.selectedTreePath = null;
            jState.selectedTreePaths = {};
            jState.lastClickedTreePath = null;
            jState.selectedTreePanelId = null;
            jRenderCanvas();
            jRenderLayerTree();
            jRenderOverlayList();
        });
    })(ovIdx);
    parent.appendChild(item);
}

function jRenderTreeNode(parent, node, depth, isPanel, panelId) {
    // Skip __bounds__ rect nodes from the tree
    if (node._isBoundsRect) return;

    var item = document.createElement('div');
    item.className = 'layer-tree-item';
    item.setAttribute('data-node-id', node._id);
    item.style.paddingLeft = (depth * 12 + 4) + 'px';

    // Count visible children (excluding __bounds__ rects)
    var visibleChildren = [];
    if (node.children) {
        for (var ci = 0; ci < node.children.length; ci++) {
            if (!node.children[ci]._isBoundsRect) visibleChildren.push(node.children[ci]);
        }
    }
    var hasChildren = visibleChildren.length > 0 || (node.paths && node.paths.length > 0);
    var isExpanded = jState.layerExpanded[node._id] === true;

    // Expand/collapse toggle
    var toggle = document.createElement('span');
    toggle.className = 'layer-toggle';
    toggle.textContent = hasChildren ? (isExpanded ? '▼' : '▶') : '  ';
    toggle.style.cursor = hasChildren ? 'pointer' : 'default';
    toggle.style.marginRight = '4px';
    toggle.style.fontSize = '10px';
    if (hasChildren) {
        (function(nid) {
            toggle.addEventListener('click', function(e) {
                e.stopPropagation();
                jState.layerExpanded[nid] = !isExpanded;
                jRenderLayerTree();
            });
        })(node._id);
    }

    // Visibility toggle
    var eyeBtn = document.createElement('button');
    eyeBtn.className = 'icon-btn';
    eyeBtn.textContent = node.visible !== false ? '👁' : '-';
    eyeBtn.style.marginRight = '2px';
    (function(n) {
        eyeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var newVal = !(n.visible !== false);
            n.visible = newVal;
            if (n.children) jSetVisibleAll(n.children, newVal);
            if (n.paths) jSetVisibleAll(n.paths, newVal);
            jRenderCanvas();
            jRenderLayerTree();
        });
    })(node);

    // Lock toggle
    var lockBtn = document.createElement('button');
    lockBtn.className = 'icon-btn';
    lockBtn.textContent = node.locked ? '🔒' : '🔓';
    lockBtn.style.marginRight = '2px';
    (function(n) {
        lockBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            var newVal = !n.locked;
            n.locked = newVal;
            if (n.children) jSetLockAll(n.children, newVal);
            if (n.paths) jSetLockAll(n.paths, newVal);
            jRenderLayerTree();
        });
    })(node);

    // Label — show panel groups as [L] layer icon
    var label = document.createElement('span');
    label.className = 'component-label';
    var typeIcon = '';
    if (isPanel) typeIcon = '[L] ';
    else if (node.children) typeIcon = node.type === 'group' ? '[G] ' : '[L] ';
    else if (node.type === 'path') typeIcon = '[P] ';
    else if (node.type === 'compoundPath') typeIcon = '[CP] ';
    else if (node.type === 'text') typeIcon = '[T] ';
    else if (node.type === 'image') typeIcon = '[I] ';
    var childCount = '';
    if (node.children) childCount = ' (' + jCountDescendants(node) + ')';
    label.textContent = typeIcon + (node.name || 'Unnamed') + childCount;

    item.appendChild(toggle);
    item.appendChild(eyeBtn);
    item.appendChild(lockBtn);
    item.appendChild(label);

    // Click to select/highlight (multi-select support)
    (function(n, pid) {
        item.addEventListener('click', function(e) {
            e.stopPropagation();
            jState.selectedOverlayIdx = -1;
            if (e.ctrlKey || e.metaKey) {
                if (jState.selectedTreePanelId && jState.selectedTreePanelId !== pid) {
                    jState.selectedTreePaths = {};
                    jState.selectedTreePanelId = pid;
                }
                if (jState.selectedTreePaths[n._id]) {
                    delete jState.selectedTreePaths[n._id];
                } else {
                    jState.selectedTreePaths[n._id] = true;
                    jState.selectedTreePanelId = pid;
                }
                jState.lastClickedTreePath = n._id;
            } else if (e.shiftKey && jState.lastClickedTreePath && jState.selectedTreePanelId === pid) {
                var range = jGetNodeRange(pid, jState.lastClickedTreePath, n._id);
                for (var ri = 0; ri < range.length; ri++) {
                    jState.selectedTreePaths[range[ri]] = true;
                }
            } else {
                jState.selectedTreePaths = {};
                jState.selectedTreePaths[n._id] = true;
                jState.selectedTreePanelId = pid;
                jState.lastClickedTreePath = n._id;
            }
            var keys = Object.keys(jState.selectedTreePaths);
            jState.selectedTreePath = keys.length === 1 ? keys[0] : null;
            jRenderCanvas();
            jRenderLayerTree();
        });
    })(node, panelId);

    if (jState.selectedTreePaths[node._id]) {
        item.style.background = '#e0e0e0';
    }

    parent.appendChild(item);

    // Render children if expanded (skip __bounds__ rects)
    if (hasChildren && isExpanded) {
        for (var i = 0; i < visibleChildren.length; i++) {
            jRenderTreeNode(parent, visibleChildren[i], depth + 1, false, panelId);
        }
        if (node.paths) {
            for (var i = 0; i < node.paths.length; i++) {
                jRenderTreeNode(parent, node.paths[i], depth + 1, false, panelId);
            }
        }
    }
}

function jCountDescendants(node) {
    var count = 0;
    if (node.children) {
        for (var i = 0; i < node.children.length; i++) {
            if (node.children[i]._isBoundsRect) continue;
            count++;
            count += jCountDescendants(node.children[i]);
        }
    }
    if (node.paths) count += node.paths.length;
    return count;
}

function expandAllLayers() {
    if (!jState || !jState.documentTree) return;
    jExpandAll(jState.documentTree, true);
    // Also expand bounds rect layers
    if (jState.boundsRects) {
        for (var i = 0; i < jState.boundsRects.length; i++) {
            jState.layerExpanded['__br_' + i] = true;
        }
    }
    jRenderLayerTree();
}
function collapseAllLayers() {
    if (!jState || !jState.documentTree) return;
    jExpandAll(jState.documentTree, false);
    if (jState.boundsRects) {
        for (var i = 0; i < jState.boundsRects.length; i++) {
            jState.layerExpanded['__br_' + i] = false;
        }
    }
    jRenderLayerTree();
}

function jGroupSelectedNodes() {
    var selKeys = Object.keys(jState.selectedTreePaths);
    if (selKeys.length < 2) return;
    var groupName = prompt('Enter group name:', 'Group');
    if (!groupName) return;

    // Collect node parent info
    var nodesToGroup = [];
    for (var i = 0; i < selKeys.length; i++) {
        var info = jFindParentOfNode(jState.documentTree, selKeys[i], null);
        if (info) nodesToGroup.push(info);
    }
    if (nodesToGroup.length < 2) return;

    // Group by parent array, sort descending index within each to avoid shift issues
    var byArray = [];
    for (var i = 0; i < nodesToGroup.length; i++) {
        var found = false;
        for (var j = 0; j < byArray.length; j++) {
            if (byArray[j].arr === nodesToGroup[i].array) {
                byArray[j].items.push(nodesToGroup[i]);
                found = true;
                break;
            }
        }
        if (!found) byArray.push({ arr: nodesToGroup[i].array, items: [nodesToGroup[i]] });
    }

    // Remove nodes from parents (descending index order), collect children
    var children = [];
    var firstArray = nodesToGroup[0].array;
    var firstIndex = nodesToGroup[0].index;
    // Find the earliest index in the first array for insertion
    for (var i = 0; i < nodesToGroup.length; i++) {
        if (nodesToGroup[i].array === firstArray && nodesToGroup[i].index < firstIndex) {
            firstIndex = nodesToGroup[i].index;
        }
    }

    for (var g = 0; g < byArray.length; g++) {
        byArray[g].items.sort(function(a, b) { return b.index - a.index; });
        for (var k = 0; k < byArray[g].items.length; k++) {
            var removed = byArray[g].arr.splice(byArray[g].items[k].index, 1)[0];
            children.unshift(removed);
        }
    }

    var groupNode = {
        type: 'group',
        name: groupName,
        visible: true,
        locked: false,
        children: children,
        _isUserGroup: true
    };

    firstArray.splice(firstIndex, 0, groupNode);
    jAssignNodeIds(jState.documentTree, '');
    jState.selectedTreePaths = {};
    jState.selectedTreePaths[groupNode._id] = true;
    jState.selectedTreePath = groupNode._id;
    jState.lastClickedTreePath = null;
    jState.layerExpanded[groupNode._id] = true;
    jRenderCanvas();
    jRenderLayerTree();
}

function jUngroupSelectedNode() {
    var selKeys = Object.keys(jState.selectedTreePaths);
    if (selKeys.length !== 1) return;
    var groupId = selKeys[0];
    var info = jFindParentOfNode(jState.documentTree, groupId, null);
    if (!info) return;
    var groupNode = info.array[info.index];
    if (!groupNode._isUserGroup || !groupNode.children) return;
    var children = groupNode.children;
    info.array.splice(info.index, 1);
    for (var i = 0; i < children.length; i++) {
        info.array.splice(info.index + i, 0, children[i]);
    }
    jAssignNodeIds(jState.documentTree, '');
    jState.selectedTreePaths = {};
    jState.selectedTreePath = null;
    jState.lastClickedTreePath = null;
    jRenderCanvas();
    jRenderLayerTree();
}

function jToggleAllLayerExpand() {
    if (!jState || !jState.documentTree) return;
    var anyExpanded = false;
    for (var key in jState.layerExpanded) {
        if (jState.layerExpanded[key] === true) { anyExpanded = true; break; }
    }
    if (anyExpanded) {
        collapseAllLayers();
    } else {
        expandAllLayers();
    }
    var btn = _jel('layer-toggle-expand');
    if (btn) btn.textContent = anyExpanded ? '▶' : '▼';
}
function jExpandAll(nodes, val) {
    for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n._id) jState.layerExpanded[n._id] = val;
        if (n.children) jExpandAll(n.children, val);
        if (n.paths) {
            for (var j = 0; j < n.paths.length; j++) {
                if (n.paths[j]._id) jState.layerExpanded[n.paths[j]._id] = val;
            }
        }
    }
}
function lockAllLayers() {
    if (!jState || !jState.documentTree) return;
    jSetLockAll(jState.documentTree, true);
    if (jState.boundsRects) {
        for (var i = 0; i < jState.boundsRects.length; i++) {
            jState.boundsRects[i]._locked = true;
        }
    }
    jRenderLayerTree();
}
function unlockAllLayers() {
    if (!jState || !jState.documentTree) return;
    jSetLockAll(jState.documentTree, false);
    if (jState.boundsRects) {
        for (var i = 0; i < jState.boundsRects.length; i++) {
            jState.boundsRects[i]._locked = false;
        }
    }
    jRenderLayerTree();
}

function jToggleAllLayerVisible() {
    if (!jState || !jState.documentTree) return;
    var allVisible = jCheckAllVisible(jState.documentTree);
    jSetVisibleAll(jState.documentTree, !allVisible);
    if (jState.boundsRects) {
        for (var i = 0; i < jState.boundsRects.length; i++) {
            jState.boundsRects[i]._visible = !allVisible;
            jSetChildVisibility(jState.boundsRects[i]);
        }
    }
    var btn = _jel('layer-toggle-visible');
    if (btn) btn.textContent = allVisible ? '-' : '👁';
    jRenderCanvas();
    jRenderLayerTree();
}

function jToggleAllLayerLock() {
    if (!jState || !jState.documentTree) return;
    var allLocked = jCheckAllLocked(jState.documentTree);
    jSetLockAll(jState.documentTree, !allLocked);
    if (jState.boundsRects) {
        for (var i = 0; i < jState.boundsRects.length; i++) {
            jState.boundsRects[i]._locked = !allLocked;
        }
    }
    var btn = _jel('layer-toggle-lock');
    if (btn) btn.textContent = allLocked ? '🔓' : '🔒';
    jRenderCanvas();
    jRenderLayerTree();
}

function jCheckAllVisible(nodes) {
    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].visible === false) return false;
        if (nodes[i].children && !jCheckAllVisible(nodes[i].children)) return false;
    }
    return true;
}

function jCheckAllLocked(nodes) {
    for (var i = 0; i < nodes.length; i++) {
        if (!nodes[i].locked) return false;
        if (nodes[i].children && !jCheckAllLocked(nodes[i].children)) return false;
    }
    return true;
}

function jSetVisibleAll(nodes, val) {
    for (var i = 0; i < nodes.length; i++) {
        nodes[i].visible = val;
        if (nodes[i].children) jSetVisibleAll(nodes[i].children, val);
        if (nodes[i].paths) jSetVisibleAll(nodes[i].paths, val);
    }
}
function jSetLockAll(nodes, val) {
    for (var i = 0; i < nodes.length; i++) {
        nodes[i].locked = val;
        if (nodes[i].children) jSetLockAll(nodes[i].children, val);
        if (nodes[i].paths) jSetLockAll(nodes[i].paths, val);
    }
}

// __CONTINUE_HERE_9__

// ─── Overlay List Panel ───

function jRenderOverlayList() {
    var list = _jel('overlay-list');
    if (!list) return;
    list.innerHTML = '';
    var countEl = _jel('overlay-count');
    if (countEl) countEl.textContent = '(' + jState.overlays.length + ' items)';

    if (jState.overlays.length === 0) {
        list.innerHTML = '<div class="empty-message">No overlays added</div>';
        return;
    }
    for (var i = 0; i < jState.overlays.length; i++) {
        var ov = jState.overlays[i];
        var item = document.createElement('div');
        item.className = 'component-item';
        if (i === jState.selectedOverlayIdx) item.classList.add('selected');

        var eyeBtn = document.createElement('button');
        eyeBtn.className = 'icon-btn';
        eyeBtn.textContent = ov.visible ? '👁' : '-';
        (function(idx) {
            eyeBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                jState.overlays[idx].visible = !jState.overlays[idx].visible;
                jRenderCanvas();
                jRenderOverlayList();
            });
        })(i);

        var lockBtn = document.createElement('button');
        lockBtn.className = 'icon-btn';
        lockBtn.textContent = ov.locked ? '🔒' : '🔓';
        lockBtn.title = ov.locked ? 'Unlock' : 'Lock';
        (function(idx) {
            lockBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                jState.overlays[idx].locked = !jState.overlays[idx].locked;
                jRenderCanvas();
                jRenderOverlayList();
            });
        })(i);

        var varBtn = document.createElement('button');
        varBtn.className = 'icon-btn' + (ov.isVariable ? ' var-active' : '');
        varBtn.textContent = ov.isVariable ? '⚡' : '○';
        varBtn.title = ov.isVariable ? 'Variable (on)' : 'Variable (off)';
        varBtn.style.fontSize = '10px';
        (function(idx) {
            varBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                jState.overlays[idx].isVariable = !jState.overlays[idx].isVariable;
                jCaptureState();
                jRenderCanvas();
                jRenderOverlayList();
            });
        })(i);

        var label = document.createElement('span');
        label.className = 'component-label';
        var labelMap = {
            'textregion': 'Text: "' + (ov.content || '').substring(0, 20) + '"',
            'imageregion': 'Image: ' + (ov.imageUrl || '').substring(0, 15),
            'qrcoderegion': 'QR: ' + (ov.qrData || '').substring(0, 15),
            'barcoderegion': 'Barcode: ' + (ov.barcodeData || '').substring(0, 15)
        };
        var ovRot = ov._rotation || 0;
        var rotSuffix = ovRot ? ' [' + ovRot + '°]' : '';
        label.textContent = (labelMap[ov.type] || ov.type) + rotSuffix;

        var rotCW = document.createElement('button');
        rotCW.className = 'icon-btn';
        rotCW.textContent = '↻';
        rotCW.title = 'Rotate +90°';
        rotCW.style.marginLeft = '4px';
        rotCW.style.fontSize = '12px';
        (function(idx) {
            rotCW.addEventListener('click', function(e) {
                e.stopPropagation();
                var o = jState.overlays[idx];
                o._rotation = ((o._rotation || 0) + 90) % 360;
                jRenderCanvas();
                jRenderOverlayList();
                jRenderLayerTree();
            });
        })(i);

        var rotCCW = document.createElement('button');
        rotCCW.className = 'icon-btn';
        rotCCW.textContent = '↺';
        rotCCW.title = 'Rotate -90°';
        rotCCW.style.fontSize = '12px';
        (function(idx) {
            rotCCW.addEventListener('click', function(e) {
                e.stopPropagation();
                var o = jState.overlays[idx];
                o._rotation = ((o._rotation || 0) - 90 + 360) % 360;
                jRenderCanvas();
                jRenderOverlayList();
                jRenderLayerTree();
            });
        })(i);

        item.appendChild(eyeBtn);
        item.appendChild(lockBtn);
        item.appendChild(varBtn);
        item.appendChild(label);
        item.appendChild(rotCW);
        item.appendChild(rotCCW);
        (function(idx) {
            item.addEventListener('click', function() {
                jState.selectedOverlayIdx = idx;
                jState.selectedTreePath = null;
                jState.selectedTreePaths = {};
                jState.lastClickedTreePath = null;
                jState.selectedTreePanelId = null;
                jRenderCanvas();
                jRenderOverlayList();
                jUpdateActionButtons();
            });
        })(i);
        list.appendChild(item);
    }
}

function jToggleAllOverlayVisible() {
    if (!jState || jState.overlays.length === 0) return;
    var allVisible = jState.overlays.every(function(ov) { return ov.visible !== false; });
    for (var i = 0; i < jState.overlays.length; i++) {
        jState.overlays[i].visible = !allVisible;
    }
    var btn = _jel('overlay-toggle-visible');
    if (btn) btn.textContent = allVisible ? '-' : '👁';
    jRenderCanvas();
    jRenderOverlayList();
}

function jToggleAllOverlayLock() {
    if (!jState || jState.overlays.length === 0) return;
    var allLocked = jState.overlays.every(function(ov) { return ov.locked === true; });
    for (var i = 0; i < jState.overlays.length; i++) {
        jState.overlays[i].locked = !allLocked;
    }
    var btn = _jel('overlay-toggle-lock');
    if (btn) btn.textContent = allLocked ? '🔓' : '🔒';
    jRenderCanvas();
    jRenderOverlayList();
}

function jUpdateActionButtons() {
    var deleteBtn = _jel('btn-delete');
    if (deleteBtn) deleteBtn.disabled = jState.selectedOverlayIdx < 0;
}

function jDeleteSelected() {
    if (jState.selectedOverlayIdx < 0) return;
    jCaptureState();
    jState.overlays.splice(jState.selectedOverlayIdx, 1);
    jState.selectedOverlayIdx = -1;
    jRenderCanvas();
    jRenderOverlayList();
    jUpdateActionButtons();
}

function rotateSelectedOverlay(deg) {
    var idx = jState.editingComponentIdx;
    if (idx < 0 || idx >= jState.overlays.length) return;
    jCaptureState();
    var o = jState.overlays[idx];
    o._rotation = ((o._rotation || 0) + deg + 360) % 360;
    jRenderCanvas();
    jRenderOverlayList();
    jRenderLayerTree();
}

// ─── Content Type Handling ───

function jAttachContentPreviewListeners() {
    var ids = ['ct-text-value','ct-font-size','ct-color','ct-letter-spacing',
               'ct-qr-data','ct-barcode-data','ct-barcode-format','ct-image-url','ct-image-fit'];
    ids.forEach(function(id) {
        var el = _jel(id);
        if (el && !el._ctPreviewBound) {
            el._ctPreviewBound = true;
            el.addEventListener('input', function() { jRenderCanvas(); });
        }
    });
}

function jOnContentTypeChange() {
    var sel = _jel('ct-type-select');
    if (!sel) return;
    var val = sel.value;
    ['ct-form-text', 'ct-form-image', 'ct-form-qrcode', 'ct-form-barcode'].forEach(function(id) {
        var el = _jel(id);
        if (el) el.style.display = 'none';
    });
    var btns = _jel('ct-buttons');
    var rotBtns = _jel('ct-rotate-buttons');
    if (val === 'text') { var f = _jel('ct-form-text'); if (f) f.style.display = ''; if (btns) btns.style.display = ''; if (rotBtns) rotBtns.style.display = ''; }
    else if (val === 'image') { var f = _jel('ct-form-image'); if (f) f.style.display = ''; if (btns) btns.style.display = ''; if (rotBtns) rotBtns.style.display = ''; }
    else if (val === 'qrcode') { var f = _jel('ct-form-qrcode'); if (f) f.style.display = ''; if (btns) btns.style.display = ''; if (rotBtns) rotBtns.style.display = ''; }
    else if (val === 'barcode') { var f = _jel('ct-form-barcode'); if (f) f.style.display = ''; if (btns) btns.style.display = ''; if (rotBtns) rotBtns.style.display = ''; }
    else { if (btns) btns.style.display = 'none'; if (rotBtns) rotBtns.style.display = 'none'; }

    if (jState && jState.pendingContentRegion) {
        jState.pendingContentType = val;
        jRenderCanvas();
    }
}

function applyContentSettings() {
    if (!jState || !jState.pendingContentRegion || !jState.pendingContentType) return;
    var region = jState.pendingContentRegion;
    var type = jState.pendingContentType;
    var comp = null;

    if (type === 'text') {
        comp = jCollectTextData(region);
    } else if (type === 'image') {
        comp = {
            type: 'imageregion', x: region.x, y: region.y, w: region.w, h: region.h,
            imageUrl: (_jel('ct-image-url') || {}).value || '',
            imageFit: (_jel('ct-image-fit') || {}).value || 'contain',
            visible: true, locked: false, isVariable: false
        };
    } else if (type === 'qrcode') {
        comp = {
            type: 'qrcoderegion', x: region.x, y: region.y, w: region.w, h: region.h,
            qrData: (_jel('ct-qr-data') || {}).value || '',
            visible: true, locked: false, isVariable: false
        };
    } else if (type === 'barcode') {
        comp = {
            type: 'barcoderegion', x: region.x, y: region.y, w: region.w, h: region.h,
            barcodeData: (_jel('ct-barcode-data') || {}).value || '',
            barcodeFormat: (_jel('ct-barcode-format') || {}).value || 'code128',
            visible: true, locked: false, isVariable: false
        };
    }

    if (comp) {
        jCaptureState();
        // Editing existing overlay (double-click)
        if (jState.editingComponentIdx >= 0 && jState.editingComponentIdx < jState.overlays.length) {
            // Preserve position and bounds constraint from existing overlay
            var existing = jState.overlays[jState.editingComponentIdx];
            comp.x = existing.x; comp.y = existing.y;
            comp.w = existing.w; comp.h = existing.h;
            comp._boundsRectIdx = existing._boundsRectIdx;
            comp._rotation = existing._rotation || 0;
            jState.overlays[jState.editingComponentIdx] = comp;
            jState.selectedOverlayIdx = -1;
        } else {
            // Find containing bounds rect for new overlay
            if (jState._addOverlayBRIdx >= 0 && jState._addOverlayBRIdx < jState.boundsRects.length) {
                comp._boundsRectIdx = jState._addOverlayBRIdx;
            } else {
                var br = jFindContainingBoundsRect(comp);
                comp._boundsRectIdx = br ? jState.boundsRects.indexOf(br) : -1;
            }
            jState.overlays.push(comp);
            jState.selectedOverlayIdx = -1;
        }
        // Flash feedback on apply button
        var applyBtn = _jel('ct-apply');
        if (applyBtn) {
            applyBtn.style.background = '#000';
            applyBtn.style.color = '#fff';
            setTimeout(function() {
                applyBtn.style.background = '';
                applyBtn.style.color = '';
            }, 300);
        }
    }

    jState.editingComponentIdx = -1;
    jState._editingTextNode = null;
    jState._selectedTextNode = null;
    jState.pendingContentRegion = null;
    jState.pendingContentType = null;
    jState._addOverlayBRIdx = -1;
    var picker = _jel('content-type-picker');
    if (picker) picker.style.display = 'none';
    var btns = _jel('ct-buttons');
    if (btns) btns.style.display = 'none';
    var rotBtns = _jel('ct-rotate-buttons');
    if (rotBtns) rotBtns.style.display = 'none';
    ['ct-form-text', 'ct-form-image', 'ct-form-qrcode', 'ct-form-barcode'].forEach(function(id) {
        var el = _jel(id); if (el) el.style.display = 'none';
    });
    var aiFontRow = _jel('ct-ai-font-row');
    if (aiFontRow) aiFontRow.style.display = 'none';

    jRenderCanvas();
    jRenderOverlayList();
}

function cancelContentSettings() {
    jState.pendingContentRegion = null;
    jState.pendingContentType = null;
    jState._addOverlayBRIdx = -1;
    jState.editingComponentIdx = -1;
    jState._editingTextNode = null;
    jState._selectedTextNode = null;
    var picker = _jel('content-type-picker');
    if (picker) picker.style.display = 'none';
    var btns = _jel('ct-buttons');
    if (btns) btns.style.display = 'none';
    var rotBtns = _jel('ct-rotate-buttons');
    if (rotBtns) rotBtns.style.display = 'none';
    ['ct-form-text', 'ct-form-image', 'ct-form-qrcode', 'ct-form-barcode'].forEach(function(id) {
        var el = _jel(id); if (el) el.style.display = 'none';
    });
    var aiFontRow = _jel('ct-ai-font-row');
    if (aiFontRow) aiFontRow.style.display = 'none';
    jRenderCanvas();
}

// __CONTINUE_HERE_10__

function jCollectTextData(region) {
    var fontSelect = _jel('ct-font-select');
    var selectedOpt = fontSelect ? fontSelect.options[fontSelect.selectedIndex] : null;
    var fontName = selectedOpt ? selectedOpt.dataset.fontName || '' : '';
    var fontId = fontSelect ? fontSelect.value : '';
    var fontSize = parseFloat((_jel('ct-font-size') || {}).value) || 12;
    var bold = _jel('ct-bold-btn') ? _jel('ct-bold-btn').classList.contains('active') : false;
    var italic = _jel('ct-italic-btn') ? _jel('ct-italic-btn').classList.contains('active') : false;
    var color = (_jel('ct-color') || {}).value || '#000000';
    var letterSpacing = parseFloat((_jel('ct-letter-spacing') || {}).value) || 0;
    var alignH = 'left';
    var alignHBtns = _jel('ct-align-h');
    if (alignHBtns) { var a = alignHBtns.querySelector('.active'); if (a) alignH = a.dataset.val; }
    var alignV = 'top';
    var alignVBtns = _jel('ct-align-v');
    if (alignVBtns) { var a = alignVBtns.querySelector('.active'); if (a) alignV = a.dataset.val; }
    return {
        type: 'textregion',
        x: region.x, y: region.y, w: region.w, h: region.h,
        fontFamily: fontName, fontId: fontId ? parseInt(fontId) : null,
        fontSize: fontSize, bold: bold, italic: italic,
        color: color, letterSpacing: letterSpacing,
        alignH: alignH, alignV: alignV,
        content: (_jel('ct-text-value') || {}).value || '',
        visible: true, locked: false, isVariable: false
    };
}

// ─── Text Node Resize Handles ───

var HANDLE_SIZE_MM = 1.5; // size of each handle square in mm

function jGetTextNodeHandles(x, y, w, h) {
    var hs = HANDLE_SIZE_MM;
    return [
        { id: 'tl', x: x - hs/2, y: y - hs/2, cursor: 'nwse-resize' },
        { id: 'tc', x: x + w/2 - hs/2, y: y - hs/2, cursor: 'ns-resize' },
        { id: 'tr', x: x + w - hs/2, y: y - hs/2, cursor: 'nesw-resize' },
        { id: 'ml', x: x - hs/2, y: y + h/2 - hs/2, cursor: 'ew-resize' },
        { id: 'mr', x: x + w - hs/2, y: y + h/2 - hs/2, cursor: 'ew-resize' },
        { id: 'bl', x: x - hs/2, y: y + h - hs/2, cursor: 'nesw-resize' },
        { id: 'bc', x: x + w/2 - hs/2, y: y + h - hs/2, cursor: 'ns-resize' },
        { id: 'br', x: x + w - hs/2, y: y + h - hs/2, cursor: 'nwse-resize' }
    ];
}

function jDrawTextNodeHandles(c, x, y, w, h) {
    var handles = jGetTextNodeHandles(x, y, w, h);
    var hs = HANDLE_SIZE_MM;
    c.save();
    for (var i = 0; i < handles.length; i++) {
        c.fillStyle = '#ffffff';
        c.fillRect(handles[i].x, handles[i].y, hs, hs);
        c.strokeStyle = '#00cc00';
        c.lineWidth = 0.3;
        c.strokeRect(handles[i].x, handles[i].y, hs, hs);
    }
    c.restore();
}

function jHitTestTextNodeHandle(pos) {
    if (!jState || !jState._selectedTextNode) return null;
    var node = jState._selectedTextNode;
    var b = node.bounds;
    if (!b) return null;
    var x = b.x * PT_TO_MM, y = b.y * PT_TO_MM;
    var w = b.width * PT_TO_MM, h = b.height * PT_TO_MM;
    var handles = jGetTextNodeHandles(x, y, w, h);
    var hs = HANDLE_SIZE_MM;
    for (var i = 0; i < handles.length; i++) {
        if (pos.x >= handles[i].x && pos.x <= handles[i].x + hs &&
            pos.y >= handles[i].y && pos.y <= handles[i].y + hs) {
            return handles[i].id;
        }
    }
    return null;
}

function jStartTextNodeResize(e, handleId) {
    var node = jState._selectedTextNode;
    if (!node || !node.bounds) return;
    var b = node.bounds;
    var origX = b.x, origY = b.y, origW = b.width, origH = b.height;
    var startPos = jScreenToDoc(e.clientX, e.clientY);

    var onMove = function(ev) {
        var p = jScreenToDoc(ev.clientX, ev.clientY);
        var dx = (p.x - startPos.x) / PT_TO_MM;
        var dy = (p.y - startPos.y) / PT_TO_MM;

        if (handleId === 'tl') {
            b.x = origX + dx; b.y = origY + dy;
            b.width = origW - dx; b.height = origH - dy;
        } else if (handleId === 'tc') {
            b.y = origY + dy; b.height = origH - dy;
        } else if (handleId === 'tr') {
            b.y = origY + dy; b.width = origW + dx; b.height = origH - dy;
        } else if (handleId === 'ml') {
            b.x = origX + dx; b.width = origW - dx;
        } else if (handleId === 'mr') {
            b.width = origW + dx;
        } else if (handleId === 'bl') {
            b.x = origX + dx; b.width = origW - dx; b.height = origH + dy;
        } else if (handleId === 'bc') {
            b.height = origH + dy;
        } else if (handleId === 'br') {
            b.width = origW + dx; b.height = origH + dy;
        }
        // Enforce minimum size
        if (b.width < 5) b.width = 5;
        if (b.height < 5) b.height = 5;
        jRenderCanvas();
    };
    var onUp = function() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        jCaptureState();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

// Find the confirmed edge that best contains or overlaps a region
function jFindContainingEdge(region) {
    if (!jState || !jState.edges) return null;
    var cx = region.x + region.w / 2;
    var cy = region.y + region.h / 2;
    var best = null;
    var bestArea = Infinity;
    for (var i = 0; i < jState.edges.length; i++) {
        var e = jState.edges[i];
        if (!e.confirmed) continue;
        var ex = Math.min(e.x1, e.x2), ey = Math.min(e.y1, e.y2);
        var ew = Math.abs(e.x2 - e.x1), eh = Math.abs(e.y2 - e.y1);
        // Check if the text node center is inside this edge
        if (cx >= ex && cx <= ex + ew && cy >= ey && cy <= ey + eh) {
            var area = ew * eh;
            if (area < bestArea) {
                bestArea = area;
                best = e;
            }
        }
    }
    return best;
}

// ─── Edge Mode ───

function toggleEdgeMode() {
    // Block section removed — no-op
}

// ─── Add Overlay Mode ───

function jStartAddOverlay() {
    if (!jState || !jState.boundsRects || jState.boundsRects.length === 0) return;
    if (jState.addOverlayMode) { jCancelAddOverlay(); return; }
    jState.addOverlayMode = true;
    jState.addOverlayStep = 'selectPanel';
    jState.addOverlaySelectedBRIdx = -1;
    jState.addOverlayDraw = null;
    var hint = _jel('overlay-add-hint');
    if (hint) { hint.style.display = ''; hint.textContent = 'Step 1: Click a panel on the canvas'; }
    var addBtn = _jel('overlay-add-btn');
    if (addBtn) addBtn.classList.add('var-active');
    if (jCanvas) jCanvas.style.cursor = 'pointer';
    jRenderCanvas();
}

function jCancelAddOverlay() {
    if (!jState) return;
    jState.addOverlayMode = false;
    jState.addOverlayStep = null;
    jState.addOverlaySelectedBRIdx = -1;
    jState.addOverlayDraw = null;
    jState.addOverlaySnapPoint = null;
    jState.addOverlayHoverPoint = null;
    var hint = _jel('overlay-add-hint');
    if (hint) hint.style.display = 'none';
    var addBtn = _jel('overlay-add-btn');
    if (addBtn) addBtn.classList.remove('var-active');
    if (jCanvas) jCanvas.style.cursor = '';
    jRenderCanvas();
}

function jHitTestBoundsRect(x, y) {
    if (!jState || !jState.boundsRects) return -1;
    var bestIdx = -1, bestArea = Infinity;
    for (var i = 0; i < jState.boundsRects.length; i++) {
        var br = jState.boundsRects[i];
        if (x >= br.x && x <= br.x + br.w && y >= br.y && y <= br.y + br.h) {
            var area = br.w * br.h;
            if (area < bestArea) { bestArea = area; bestIdx = i; }
        }
    }
    return bestIdx;
}

function jOnAddOverlayDrawStart(e) {
    var brIdx = jState.addOverlaySelectedBRIdx;
    var br = jState.boundsRects[brIdx];
    if (!br) return;
    var rawPos = jScreenToDoc(e.clientX, e.clientY);
    var pos = jUnrotatePoint(rawPos.x, rawPos.y, brIdx);
    var sx = Math.max(br.x, Math.min(pos.x, br.x + br.w));
    var sy = Math.max(br.y, Math.min(pos.y, br.y + br.h));
    jState.addOverlayDraw = { x1: sx, y1: sy, x2: sx, y2: sy };
    var onMove = function(ev) {
        var rawP = jScreenToDoc(ev.clientX, ev.clientY);
        var p = jUnrotatePoint(rawP.x, rawP.y, brIdx);
        var cx2 = Math.max(br.x, Math.min(p.x, br.x + br.w));
        var cy2 = Math.max(br.y, Math.min(p.y, br.y + br.h));
        // Snap to corners and edge midpoints
        var snapPts = [
            { x: br.x, y: br.y, type: 'corner' },
            { x: br.x + br.w, y: br.y, type: 'corner' },
            { x: br.x, y: br.y + br.h, type: 'corner' },
            { x: br.x + br.w, y: br.y + br.h, type: 'corner' },
            { x: br.x + br.w / 2, y: br.y, type: 'edge' },
            { x: br.x + br.w / 2, y: br.y + br.h, type: 'edge' },
            { x: br.x, y: br.y + br.h / 2, type: 'edge' },
            { x: br.x + br.w, y: br.y + br.h / 2, type: 'edge' }
        ];
        var SNAP_THRESH = 2;
        var bestSnap = null, bestDist = SNAP_THRESH;
        for (var si = 0; si < snapPts.length; si++) {
            var sp = snapPts[si];
            var dx = cx2 - sp.x, dy = cy2 - sp.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < bestDist) { bestDist = dist; bestSnap = sp; }
        }
        if (bestSnap) { cx2 = bestSnap.x; cy2 = bestSnap.y; }
        jState.addOverlaySnapPoint = bestSnap;
        jState.addOverlayDraw.x2 = cx2;
        jState.addOverlayDraw.y2 = cy2;
        jRenderCanvas();
    };
    var onUp = function() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        jState.addOverlaySnapPoint = null;
        var rd = jState.addOverlayDraw;
        if (rd && Math.abs(rd.x2 - rd.x1) > 0.5 && Math.abs(rd.y2 - rd.y1) > 0.5) {
            var x = Math.min(rd.x1, rd.x2), y = Math.min(rd.y1, rd.y2);
            var w = Math.abs(rd.x2 - rd.x1), h = Math.abs(rd.y2 - rd.y1);
            jState.pendingContentRegion = { x: x, y: y, w: w, h: h };
            jState.pendingContentType = 'text';
            jState.editingComponentIdx = -1;
            jState._addOverlayBRIdx = brIdx;
            var panel = _jel('content-type-panel');
            if (panel) panel.style.display = '';
            var picker = _jel('content-type-picker');
            if (picker) picker.style.display = '';
            var typeSelect = _jel('ct-type-select');
            if (typeSelect) { typeSelect.value = 'text'; jOnContentTypeChange(); }
            var btns = _jel('ct-buttons');
            if (btns) btns.style.display = '';
            var rotBtns = _jel('ct-rotate-buttons');
            if (rotBtns) rotBtns.style.display = '';
            jLoadFontList();
            jAttachContentPreviewListeners();
            jState.addOverlayMode = false;
            jState.addOverlayStep = null;
            jState.addOverlayDraw = null;
            var hint = _jel('overlay-add-hint');
            if (hint) hint.style.display = 'none';
            var addBtn = _jel('overlay-add-btn');
            if (addBtn) addBtn.classList.remove('var-active');
            if (jCanvas) jCanvas.style.cursor = '';
        } else {
            jState.addOverlayDraw = null;
        }
        jRenderCanvas();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function jOnEdgeMouseDown(e) {
    var pos = jScreenToDoc(e.clientX, e.clientY);
    jState.edgeDrawing = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
    var onMove = function(ev) {
        var p = jScreenToDoc(ev.clientX, ev.clientY);
        jState.edgeDrawing.x2 = p.x;
        jState.edgeDrawing.y2 = p.y;
        jRenderCanvas();
    };
    var onUp = function() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        var ed = jState.edgeDrawing;
        if (ed && Math.abs(ed.x2 - ed.x1) > 1 && Math.abs(ed.y2 - ed.y1) > 1) {
            var x1 = Math.min(ed.x1, ed.x2), y1 = Math.min(ed.y1, ed.y2);
            var x2 = Math.max(ed.x1, ed.x2), y2 = Math.max(ed.y1, ed.y2);
            jState.edges.push({ x1: x1, y1: y1, x2: x2, y2: y2, confirmed: false, id: 'edge-' + Date.now() });
            jCaptureState();
        }
        jState.edgeDrawing = null;
        jRenderCanvas();
        jRenderEdgeList();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

// ─── Content Mode ───

function toggleContentMode() {
    // Block section removed — no-op
}

function jOnContentRegionMouseDown(e) {
    var pos = jScreenToDoc(e.clientX, e.clientY);
    jState.contentRegionDraw = { x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y };
    var onMove = function(ev) {
        var p = jScreenToDoc(ev.clientX, ev.clientY);
        jState.contentRegionDraw.x2 = p.x;
        jState.contentRegionDraw.y2 = p.y;
        jRenderCanvas();
    };
    var onUp = function() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        var rd = jState.contentRegionDraw;
        if (rd && Math.abs(rd.x2 - rd.x1) > 0.5 && Math.abs(rd.y2 - rd.y1) > 0.5) {
            var x = Math.min(rd.x1, rd.x2), y = Math.min(rd.y1, rd.y2);
            var w = Math.abs(rd.x2 - rd.x1), h = Math.abs(rd.y2 - rd.y1);
            jState.pendingContentRegion = { x: x, y: y, w: w, h: h };
            jState.pendingContentType = (_jel('ct-type-select') || {}).value || 'text';
            var picker = _jel('content-type-picker');
            if (picker) picker.style.display = '';
        }
        jState.contentRegionDraw = null;
        jRenderCanvas();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

function jRenderEdgeList() {
    var list = _jel('edge-list');
    if (!list) return;
    list.innerHTML = '';
    if (!jState.edges || jState.edges.length === 0) {
        list.innerHTML = '<div class="empty-message">No edges defined</div>';
        return;
    }
    for (var i = 0; i < jState.edges.length; i++) {
        var edge = jState.edges[i];
        var item = document.createElement('div');
        item.className = 'component-item';
        var label = document.createElement('span');
        label.textContent = 'Edge ' + (i + 1) + (edge.confirmed ? ' [confirmed]' : '');
        var confirmBtn = document.createElement('button');
        confirmBtn.className = 'icon-btn';
        confirmBtn.textContent = edge.confirmed ? '✓' : '○';
        (function(idx) {
            confirmBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                jState.edges[idx].confirmed = !jState.edges[idx].confirmed;
                jRenderCanvas();
                jRenderEdgeList();
            });
        })(i);
        var delBtn = document.createElement('button');
        delBtn.className = 'icon-btn';
        delBtn.textContent = '✕';
        (function(idx) {
            delBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                jState.edges.splice(idx, 1);
                jCaptureState();
                jRenderCanvas();
                jRenderEdgeList();
            });
        })(i);
        item.appendChild(confirmBtn);
        item.appendChild(label);
        item.appendChild(delBtn);
        list.appendChild(item);
    }
}

// __CONTINUE_HERE_11__

// ─── History (Undo/Redo) ───

function jCaptureState() {
    if (!jState) return;
    var snapshot = {
        overlays: JSON.parse(JSON.stringify(jState.overlays)),
        edges: JSON.parse(JSON.stringify(jState.edges))
    };
    if (jState.historyIndex < jState.historyStack.length - 1) {
        jState.historyStack = jState.historyStack.slice(0, jState.historyIndex + 1);
    }
    jState.historyStack.push(snapshot);
    if (jState.historyStack.length > jState.maxHistorySize) {
        jState.historyStack.shift();
    }
    jState.historyIndex = jState.historyStack.length - 1;
    jUpdateUndoRedo();
}

function undo() {
    if (!jState || jState.historyIndex <= 0) return;
    jState.historyIndex--;
    var snap = jState.historyStack[jState.historyIndex];
    jState.overlays = JSON.parse(JSON.stringify(snap.overlays));
    jState.edges = JSON.parse(JSON.stringify(snap.edges));
    jState.selectedOverlayIdx = -1;
    jRenderCanvas();
    jRenderOverlayList();
    jRenderEdgeList();
    jUpdateUndoRedo();
}

function redo() {
    if (!jState || jState.historyIndex >= jState.historyStack.length - 1) return;
    jState.historyIndex++;
    var snap = jState.historyStack[jState.historyIndex];
    jState.overlays = JSON.parse(JSON.stringify(snap.overlays));
    jState.edges = JSON.parse(JSON.stringify(snap.edges));
    jState.selectedOverlayIdx = -1;
    jRenderCanvas();
    jRenderOverlayList();
    jRenderEdgeList();
    jUpdateUndoRedo();
}

function jUpdateUndoRedo() {
    var undoBtn = _jel('undo-btn');
    var redoBtn = _jel('redo-btn');
    if (undoBtn) undoBtn.disabled = !jState || jState.historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = !jState || jState.historyIndex >= jState.historyStack.length - 1;
}

// ─── Font Loading ───

var jLoadedFonts = {};

function jLoadFontForCanvas(fontId, fontName) {
    if (jLoadedFonts[fontId]) return;
    jLoadedFonts[fontId] = true;
    var url = '/font/file/' + fontId;
    var font = new FontFace(fontName, 'url(' + url + ')');
    font.load().then(function(loaded) {
        document.fonts.add(loaded);
        jRenderCanvas();
    }).catch(function(err) {
        console.error('Font load error:', err);
    });
}

// Load font list into select (filtered by customer if selected)
// Returns a promise that resolves when fonts are loaded
function jLoadFontList(forceReload) {
    var sel = _jel('ct-font-select');
    if (!sel) return Promise.resolve();
    var customerId = jState ? jState.currentCustomerId : null;
    var cacheKey = customerId || '__all__';
    if (!forceReload && sel._fontsLoaded === cacheKey) return Promise.resolve();
    sel._fontsLoaded = cacheKey;
    // Clear existing options
    while (sel.options.length > 0) sel.remove(0);
    var url = customerId ? '/font/list/' + encodeURIComponent(customerId) : '/font/list';
    return fetch(url).then(function(r) { return r.json(); }).then(function(data) {
        if (data.success && data.fonts) {
            data.fonts.forEach(function(f) {
                var opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = f.font_name;
                opt.dataset.fontName = f.font_name;
                sel.appendChild(opt);
            });
        }
    }).catch(function() {});
}

// __CONTINUE_HERE_12__

// ─── Save/Load ───

function saveLayoutToDatabase() {
    if (!jState || !jState.documentTree) return;
    var modal = _jel('save-layout-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    var formView = _jel('save-layout-form-view');
    var confirmView = _jel('save-layout-confirm-view');
    if (formView) formView.style.display = '';
    if (confirmView) confirmView.style.display = 'none';

    // Load customers
    var customerSelect = _jel('layout-customer');
    if (customerSelect && !customerSelect._loaded) {
        customerSelect._loaded = true;
        fetch('/customer/list').then(function(r) { return r.json(); }).then(function(data) {
            if (data.success && data.customers) {
                data.customers.forEach(function(c) {
                    var opt = document.createElement('option');
                    opt.value = c.customer_id;
                    opt.textContent = c.company_name;
                    customerSelect.appendChild(opt);
                });
            }
            if (jState.currentCustomerId) customerSelect.value = jState.currentCustomerId;
        });
    } else if (customerSelect && jState.currentCustomerId) {
        customerSelect.value = jState.currentCustomerId;
    }

    var nameInput = _jel('layout-name');
    if (nameInput && jState.currentLayoutName) nameInput.value = jState.currentLayoutName;

    // Load font list for content panel
    jLoadFontList();

    var form = _jel('save-layout-form');
    if (form && !form._submitBound) {
        form._submitBound = true;
        form.addEventListener('submit', function(e) {
            e.preventDefault();
            var customerId = customerSelect.value;
            var layoutName = nameInput.value.trim();
            if (!customerId) { jShowMessage('Please select a customer', 'error'); return; }
            if (!layoutName) { jShowMessage('Please enter a layout name', 'error'); return; }
            if (!/^[a-zA-Z0-9\-_]+$/.test(layoutName)) {
                jShowMessage('Layout name can only contain letters, numbers, - and _', 'error');
                return;
            }

            var layoutData = {
                name: layoutName,
                type: 'json',
                data: {
                    documentTree: jState.documentTree,
                    docMetadata: jState.docMetadata,
                    docSwatches: jState.docSwatches,
                    overlays: jState.overlays,
                    docWidth: jState.docWidth,
                    docHeight: jState.docHeight,
                    scale: jState.scale,
                    edges: jState.edges,
                    boundsRectRotations: (jState.boundsRects || []).map(function(br) { return br._rotation || 0; }),
                    components: jState.overlays.map(function(ov) {
                        return {
                            type: ov.type,
                            x: ov.x, y: ov.y, w: ov.w, h: ov.h,
                            content: ov.content || '',
                            fontFamily: ov.fontFamily || '',
                            fontId: ov.fontId || null,
                            fontSize: ov.fontSize || 12,
                            bold: ov.bold || false,
                            italic: ov.italic || false,
                            color: ov.color || '#000000',
                            letterSpacing: ov.letterSpacing || 0,
                            alignH: ov.alignH || 'left',
                            alignV: ov.alignV || 'top',
                            visible: ov.visible !== false,
                            imageUrl: ov.imageUrl || '',
                            imageFit: ov.imageFit || 'contain',
                            qrData: ov.qrData || '',
                            barcodeData: ov.barcodeData || '',
                            barcodeFormat: ov.barcodeFormat || 'code128',
                            isVariable: ov.isVariable || false,
                            rotation: ov._rotation || 0,
                            boundsRectIdx: ov._boundsRectIdx >= 0 ? ov._boundsRectIdx : -1
                        };
                    }),
                    label_width: jState.docWidth,
                    label_height: jState.docHeight
                },
                customer_id: customerId
            };

            // Check duplicate
            fetch('/layout/check-duplicate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customer_id: customerId, name: layoutName })
            }).then(function(r) { return r.json(); }).then(function(res) {
                if (res.exists) {
                    jState._pendingSave = layoutData;
                    jState._pendingOverwriteId = res.layout.id;
                    var msg = _jel('overwrite-message');
                    if (msg) msg.textContent = 'A layout named "' + layoutName + '" already exists. Overwrite?';
                    if (formView) formView.style.display = 'none';
                    if (confirmView) confirmView.style.display = '';
                } else {
                    jDoSave(layoutData, null);
                }
            });
        });
    }
}

function confirmOverwrite() {
    if (jState._pendingSave && jState._pendingOverwriteId) {
        jDoSave(jState._pendingSave, jState._pendingOverwriteId);
    }
}

function cancelOverwrite() {
    var formView = _jel('save-layout-form-view');
    var confirmView = _jel('save-layout-confirm-view');
    if (formView) formView.style.display = '';
    if (confirmView) confirmView.style.display = 'none';
}

function closeSaveModal() {
    var modal = _jel('save-layout-modal');
    if (modal) modal.style.display = 'none';
}

function jDoSave(layoutData, overwriteId) {
    var url = overwriteId ? '/layout/' + overwriteId : '/layout/save';
    var method = overwriteId ? 'PUT' : 'POST';
    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(layoutData)
    }).then(function(r) { return r.json(); }).then(function(res) {
        if (res.success) {
            jState.currentLayoutId = overwriteId || res.id;
            jState.currentLayoutName = layoutData.name;
            jState.currentCustomerId = layoutData.customer_id;
            closeSaveModal();
            jShowMessage('Layout saved', 'success');
        } else {
            jShowMessage('Save failed: ' + (res.error || 'Unknown error'), 'error');
        }
    }).catch(function(err) {
        jShowMessage('Save failed: ' + err.message, 'error');
    });
}

function jShowMessage(text, type) {
    // Simple alert for now
    alert(text);
}

// __CONTINUE_HERE_13__

function jLoadLayoutFromDatabase(layoutId) {
    fetch('/layout/' + layoutId).then(function(r) { return r.json(); }).then(function(res) {
        if (!res.success || !res.layout) { alert('Layout not found'); return; }
        var layout = res.layout;
        var data = layout.data;

        jState.documentTree = data.documentTree || null;
        jState.docMetadata = data.docMetadata || null;
        jState.docSwatches = data.docSwatches || [];
        jState.overlays = data.overlays || [];
        jState.docWidth = data.docWidth || 0;
        jState.docHeight = data.docHeight || 0;
        jState.scale = data.scale || 1;
        jState.edges = data.edges || [];
        jState.currentLayoutId = layout.id;
        jState.currentLayoutName = layout.name;
        jState.currentCustomerId = layout.customer_id;

        if (jState.documentTree) {
            jAssignNodeIds(jState.documentTree, '');
            // Re-collect bounds rects so overlay constraints work
            jState.boundsRects = [];
            jCollectBoundsRects(jState.documentTree);
            // Restore bounds rect rotations from saved data
            var savedRotations = data.boundsRectRotations || [];
            for (var bi = 0; bi < jState.boundsRects.length && bi < savedRotations.length; bi++) {
                jState.boundsRects[bi]._rotation = savedRotations[bi] || 0;
            }
            // Re-assign _boundsRectIdx for overlays based on coordinates
            for (var oi = 0; oi < jState.overlays.length; oi++) {
                var ov = jState.overlays[oi];
                var br = jFindContainingBoundsRect(ov);
                ov._boundsRectIdx = br ? jState.boundsRects.indexOf(br) : -1;
            }
            // Mark document tree text nodes that have overlay replacements
            jMarkDoubledTextNodes(jState.documentTree);
        }

        var emptyState = _jel('empty-state');
        if (emptyState) emptyState.style.display = 'none';
        var exportPdf = _jel('btn-export-pdf');
        var exportAiE = _jel('btn-export-ai-editable');
        var exportAiO = _jel('btn-export-ai-outlined');
        var exportJson = _jel('btn-export-json');
        if (exportPdf) exportPdf.disabled = false;
        if (exportAiE) exportAiE.disabled = false;
        if (exportAiO) exportAiO.disabled = false;
        if (exportJson) exportJson.disabled = false;

        jState.historyStack = [];
        jState.historyIndex = -1;
        jCaptureState();

        // Fetch customer name
        if (layout.customer_id) {
            fetch('/customer/' + layout.customer_id).then(function(r) { return r.json(); }).then(function(cres) {
                if (cres.success && cres.customer) {
                    jState.currentCustomerName = cres.customer.company_name;
                    var label = _jel('customer-name-label');
                    if (label) label.textContent = cres.customer.company_name;
                }
            });
        }

        jRenderCanvas();
        jRenderLayerTree();
        jRenderOverlayList();
        jRenderEdgeList();
    }).catch(function(err) {
        alert('Error loading layout: ' + err.message);
    });
}

// ─── Customer Modal ───

function jShowCustomerSelectModal() {
    var modal = _jel('customer-select-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    var sel = _jel('customer-select-dropdown');
    if (sel && !sel._loaded) {
        sel._loaded = true;
        fetch('/customer/list').then(function(r) { return r.json(); }).then(function(data) {
            if (data.success && data.customers) {
                data.customers.forEach(function(c) {
                    var opt = document.createElement('option');
                    opt.value = c.customer_id;
                    opt.textContent = c.company_name;
                    sel.appendChild(opt);
                });
            }
        });
    }
}
// Alias for template onclick
function showCustomerSelectModal() { jShowCustomerSelectModal(); }

function closeCustomerSelectModal() {
    var modal = _jel('customer-select-modal');
    if (modal) modal.style.display = 'none';
}

function confirmCustomerSelect() {
    var sel = _jel('customer-select-dropdown');
    if (!sel || !sel.value) return;
    jState.currentCustomerId = sel.value;
    var opt = sel.options[sel.selectedIndex];
    jState.currentCustomerName = opt.textContent;
    var label = _jel('customer-name-label');
    if (label) label.textContent = opt.textContent;
    closeCustomerSelectModal();
    jLoadFontList();
}

// __CONTINUE_HERE_14__

// ─── Export JSON ───

function jFilterVisibleTree(nodes) {
    if (!nodes) return null;
    var result = [];
    for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (node.visible === false) continue;
        var clone = {};
        for (var k in node) { clone[k] = node[k]; }
        if (node.children) {
            clone.children = jFilterVisibleTree(node.children);
        }
        if (node.paths) {
            clone.paths = jFilterVisibleTree(node.paths);
        }
        result.push(clone);
    }
    return result;
}

function jExportJson() {
    if (!jState || !jState.documentTree) return;

    var btn = _jel('btn-export-json');
    if (btn) btn.classList.add('exporting');

    var includeHidden = true;
    var chk = _jel('export-include-hidden');
    if (chk) includeHidden = chk.checked;

    var tree = jState.documentTree;
    var overlays = jState.overlays;
    if (!includeHidden) {
        tree = jFilterVisibleTree(tree);
        overlays = overlays.filter(function(ov) { return ov.visible !== false; });
    }

    var exportData = {
        _exportType: 'layout-state',
        documentTree: tree,
        docMetadata: jState.docMetadata,
        docSwatches: jState.docSwatches,
        overlays: overlays,
        docWidth: jState.docWidth,
        docHeight: jState.docHeight,
        scale: jState.scale,
        edges: jState.edges,
        boundsRectRotations: (jState.boundsRects || []).map(function(br) { return br._rotation || 0; })
    };

    var jsonStr = JSON.stringify(exportData, null, 2);
    var blob = new Blob([jsonStr], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var jsonFilename = (jState.currentLayoutName || 'layout');
    if (!includeHidden) jsonFilename += '_no_eye';
    a.download = jsonFilename + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (btn) btn.classList.remove('exporting');
}

function jLoadLayoutFromExport(data) {
    jState.documentTree = data.documentTree || null;
    jState.docMetadata = data.docMetadata || null;
    jState.docSwatches = data.docSwatches || [];
    jState.overlays = data.overlays || [];
    jState.docWidth = data.docWidth || 0;
    jState.docHeight = data.docHeight || 0;
    jState.scale = data.scale || 1;
    jState.edges = data.edges || [];
    jState.selectedOverlayIdx = -1;
    jState.selectedTreePath = null;
    jState.selectedTreePaths = {};
    jState.lastClickedTreePath = null;
    jState.selectedTreePanelId = null;
    jState.currentLayoutId = null;
    jState.currentLayoutName = null;
    jState.currentCustomerId = null;

    if (jState.documentTree) {
        jAssignNodeIds(jState.documentTree, '');
        jState.boundsRects = [];
        jCollectBoundsRects(jState.documentTree);
        var savedRotations = data.boundsRectRotations || [];
        for (var bi = 0; bi < jState.boundsRects.length && bi < savedRotations.length; bi++) {
            jState.boundsRects[bi]._rotation = savedRotations[bi] || 0;
        }
        for (var oi = 0; oi < jState.overlays.length; oi++) {
            var ov = jState.overlays[oi];
            var br = jFindContainingBoundsRect(ov);
            ov._boundsRectIdx = br ? jState.boundsRects.indexOf(br) : -1;
        }
        jMarkDoubledTextNodes(jState.documentTree);
    }

    var emptyState = _jel('empty-state');
    if (emptyState) emptyState.style.display = 'none';
    var exportJson = _jel('btn-export-json');
    var exportPdf = _jel('btn-export-pdf');
    var exportAiE = _jel('btn-export-ai-editable');
    var exportAiO = _jel('btn-export-ai-outlined');
    if (exportJson) exportJson.disabled = false;
    if (exportPdf) exportPdf.disabled = false;
    if (exportAiE) exportAiE.disabled = false;
    if (exportAiO) exportAiO.disabled = false;
    var addBtn = _jel('overlay-add-btn');
    if (addBtn) addBtn.disabled = (jState.boundsRects.length === 0);

    jState.historyStack = [];
    jState.historyIndex = -1;
    jCaptureState();
    jRenderCanvas();
    jRenderLayerTree();
    jRenderOverlayList();
    jRenderEdgeList();
}

// ─── Export ───

function jExportFile(type, outlined) {
    if (!jState || !jState.documentTree) return;

    // Show spinner on the clicked button
    var btnId = type === 'pdf' ? 'btn-export-pdf' : (outlined ? 'btn-export-ai-outlined' : 'btn-export-ai-editable');
    var btn = _jel(btnId);
    if (btn) btn.classList.add('exporting');
    console.log('jExportFile start:', type, outlined);

    var includeHidden = true;
    var chk = _jel('export-include-hidden');
    if (chk) includeHidden = chk.checked;

    // Flatten document tree into components array for export
    var components = [];
    jFlattenForExport(jState.documentTree, components, 1.0);

    // If export-eye-close is off, remove hidden components
    if (!includeHidden) {
        components = components.filter(function(c) { return c.visible !== false; });
    }

    // Assign boundsRectIdx to flattened components based on center point
    var brs = jState.boundsRects || [];
    for (var ci = 0; ci < components.length; ci++) {
        var comp = components[ci];
        if (comp._isBoundsRect) continue;
        var ccx = comp.x + comp.width / 2;
        var ccy = comp.y + comp.height / 2;
        comp.boundsRectIdx = -1;
        for (var bi = 0; bi < brs.length; bi++) {
            var tbr = brs[bi];
            if (ccx >= tbr.x && ccx <= tbr.x + tbr.w && ccy >= tbr.y && ccy <= tbr.y + tbr.h) {
                comp.boundsRectIdx = bi;
                break;
            }
        }
    }

    // Remove pdfpath components that fall inside an overlay region
    // (handles cases where original AI text was already outlined as paths)
    var overlays = jState.overlays || [];
    components = components.filter(function(comp) {
        if (comp.type !== 'pdfpath') return true;
        var cx = comp.x + comp.width / 2;
        var cy = comp.y + comp.height / 2;
        for (var oi = 0; oi < overlays.length; oi++) {
            var ov = overlays[oi];
            if (cx >= ov.x && cx <= ov.x + ov.w && cy >= ov.y && cy <= ov.y + ov.h) {
                return false;
            }
        }
        return true;
    });

    // Add overlay components
    for (var i = 0; i < jState.overlays.length; i++) {
        var ov = jState.overlays[i];
        if (!includeHidden && ov.visible === false) continue;
        components.push({
            type: ov.type,
            x: ov.x, y: ov.y,
            width: ov.w, height: ov.h,
            content: ov.content || '',
            fontFamily: ov.fontFamily || '',
            fontId: ov.fontId || null,
            fontSize: ov.fontSize || 12,
            bold: ov.bold || false,
            italic: ov.italic || false,
            color: ov.color || '#000000',
            letterSpacing: ov.letterSpacing || 0,
            alignH: ov.alignH || 'left',
            alignV: ov.alignV || 'top',
            visible: ov.visible !== false,
            imageUrl: ov.imageUrl || '',
            imageFit: ov.imageFit || 'contain',
            qrData: ov.qrData || '',
            barcodeData: ov.barcodeData || '',
            barcodeFormat: ov.barcodeFormat || 'code128',
            rotation: ov._rotation || 0,
            boundsRectIdx: ov._boundsRectIdx >= 0 ? ov._boundsRectIdx : -1,
            isVariable: ov.isVariable || false
        });
    }

    // Build boundsRects info for export (rotation + geometry)
    var exportBoundsRects = [];
    if (jState.boundsRects) {
        for (var bi = 0; bi < jState.boundsRects.length; bi++) {
            var br = jState.boundsRects[bi];
            exportBoundsRects.push({
                x: br.x, y: br.y, w: br.w, h: br.h,
                rotation: br._rotation || 0
            });
        }
    }

    var separateInvisible = type === 'ai-separate';
    var data = {
        label: { width: jState.docWidth, height: jState.docHeight },
        components: components,
        boundsRects: exportBoundsRects,
        outlined: !!outlined,
        separateInvisible: separateInvisible
    };

    var endpoint = type === 'pdf' ? '/export/pdf' : '/export/ai';
    var filename = (jState.currentLayoutName || 'layout');
    if (!includeHidden) filename += '_no_eye';
    if (type === 'pdf') filename += '.pdf';
    else if (outlined) filename += '_outlined.ai';
    else filename += '_editable.ai';

    console.log('jExportFile: sending fetch to', endpoint, 'components:', components.length);
    fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    }).then(function(r) {
        console.log('jExportFile: response status', r.status);
        if (!r.ok) throw new Error('Export failed');
        return r.blob();
    }).then(function(blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        if (btn) btn.classList.remove('exporting');
    }).catch(function(err) {
        if (btn) btn.classList.remove('exporting');
        alert('Export error: ' + err.message);
    });
}

function jFlattenForExport(nodes, out, parentOpacity) {
    if (!nodes) return;
    for (var i = nodes.length - 1; i >= 0; i--) {
        var node = nodes[i];
        if (node._isBoundsRect) continue;
        if (node._isDoubledText) continue;
        var opacity = parentOpacity * ((node.opacity || 100) / 100);

        if (node.children) {
            jFlattenForExport(node.children, out, opacity);
        } else if (node.type === 'path') {
            out.push(jPathToExportComponent(node, opacity));
        } else if (node.type === 'compoundPath') {
            // Export all sub-paths as a single compound path (even-odd fill for holes)
            if (node.paths && node.paths.length > 0) {
                var allOps = [];
                for (var p = 0; p < node.paths.length; p++) {
                    var subComp = jPathToExportComponent(node.paths[p], opacity, node);
                    if (subComp && subComp.pathData && subComp.pathData.ops) {
                        for (var oi = 0; oi < subComp.pathData.ops.length; oi++) {
                            allOps.push(subComp.pathData.ops[oi]);
                        }
                    }
                }
                var fill = node.fill || (node.paths[0] && node.paths[0].fill);
                var stroke = node.stroke || (node.paths[0] && node.paths[0].stroke);
                var fillRGB = jColorToRGBArray(fill);
                var strokeRGB = jColorToRGBArray(stroke);
                var b = node.bounds || { x: 0, y: 0, width: 0, height: 0 };
                out.push({
                    type: 'pdfpath',
                    x: b.x * PT_TO_MM, y: b.y * PT_TO_MM,
                    width: b.width * PT_TO_MM, height: b.height * PT_TO_MM,
                    visible: node.visible !== false,
                    isCompound: true,
                    pathData: { ops: allOps, fill: fillRGB, stroke: strokeRGB, lw: (node.strokeWidth || 0) * PT_TO_MM }
                });
            }
        } else if (node.type === 'text') {
            out.push(jTextToExportComponent(node, opacity));
        }
    }
}

function jPathToExportComponent(node, opacity, parent) {
    // Convert anchor points to ops format for export_ai.py
    var ops = [];
    var pts = node.pathData || [];
    if (pts.length === 0) return null;

    ops.push({ o: 'M', a: [pts[0].x * PT_TO_MM, pts[0].y * PT_TO_MM] });
    for (var i = 1; i < pts.length; i++) {
        var prev = pts[i - 1];
        var pt = pts[i];
        var ho = prev.handleOut;
        var hi = pt.handleIn;
        if (ho && hi && (ho.x !== prev.x || ho.y !== prev.y || hi.x !== pt.x || hi.y !== pt.y)) {
            ops.push({ o: 'C', a: [ho.x * PT_TO_MM, ho.y * PT_TO_MM, hi.x * PT_TO_MM, hi.y * PT_TO_MM, pt.x * PT_TO_MM, pt.y * PT_TO_MM] });
        } else {
            ops.push({ o: 'L', a: [pt.x * PT_TO_MM, pt.y * PT_TO_MM] });
        }
    }
    if (node.closed) ops.push({ o: 'Z', a: [] });

    var fill = node.fill || (parent && parent.fill);
    var stroke = node.stroke || (parent && parent.stroke);
    var fillRGB = jColorToRGBArray(fill);
    var strokeRGB = jColorToRGBArray(stroke);

    var b = node.bounds || { x: 0, y: 0, width: 0, height: 0 };
    return {
        type: 'pdfpath',
        x: b.x * PT_TO_MM, y: b.y * PT_TO_MM,
        width: b.width * PT_TO_MM, height: b.height * PT_TO_MM,
        visible: node.visible !== false,
        pathData: { ops: ops, fill: fillRGB, stroke: strokeRGB, lw: (node.strokeWidth || 0) * PT_TO_MM }
    };
}

function jTextToExportComponent(node, opacity) {
    var b = node.bounds || { x: 0, y: 0, width: 0, height: 0 };
    var content = '';
    var fontFamily = 'Arial';
    var fontSize = 12;
    var color = '#000000';
    var alignment = 'left';

    if (node.paragraphs) {
        var texts = [];
        for (var pi = 0; pi < node.paragraphs.length; pi++) {
            var para = node.paragraphs[pi];
            if (para.alignment) alignment = para.alignment;
            var runs = para.runs || [];
            for (var ri = 0; ri < runs.length; ri++) {
                texts.push(runs[ri].text || '');
                if (runs[ri].fontFamily) fontFamily = runs[ri].fontFamily;
                if (runs[ri].fontSize) fontSize = runs[ri].fontSize;
                if (runs[ri].color) color = jColorToCSS(runs[ri].color) || '#000000';
            }
        }
        content = texts.join('');
    }

    return {
        type: 'textregion',
        x: b.x * PT_TO_MM, y: b.y * PT_TO_MM,
        width: b.width * PT_TO_MM, height: b.height * PT_TO_MM,
        content: content,
        fontFamily: fontFamily,
        fontSize: fontSize,
        color: color,
        alignH: alignment,
        alignV: 'top',
        bold: false, italic: false,
        letterSpacing: 0,
        visible: node.visible !== false
    };
}

function jColorToRGBArray(color) {
    if (!color || color.type === 'none') return null;
    if (color.type === 'rgb') return [color.r / 255, color.g / 255, color.b / 255];
    if (color.type === 'cmyk') {
        return [
            (1 - color.c / 100) * (1 - color.k / 100),
            (1 - color.m / 100) * (1 - color.k / 100),
            (1 - color.y / 100) * (1 - color.k / 100)
        ];
    }
    if (color.type === 'spot' && color.fallback) return jColorToRGBArray(color.fallback);
    if (color.type === 'gradient' && color.stops && color.stops.length > 0) return jColorToRGBArray(color.stops[0].color);
    return null;
}
