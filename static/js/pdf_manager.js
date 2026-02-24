// Store state per canvas using WeakMap
var canvasStates = new WeakMap();

function getCanvasState(canvas) {
    if (!canvasStates.has(canvas)) {
        canvasStates.set(canvas, {
            components: [],
            selectedIdx: -1,
            selectedSet: [],
            scale: 1,
            pdfWidth: 0,
            pdfHeight: 0,
            pan: { x: 0, y: 0, zoom: 1, dragging: false, startX: 0, startY: 0, spaceDown: false },
            dragState: { active: false, startX: 0, startY: 0, componentIdx: -1 },
            rectSelect: { active: false, startX: 0, startY: 0, endX: 0, endY: 0 },
            groupExpanded: {},
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
            groupNames: {},
            editingComponentIdx: -1,
            regionResizing: null
        });
    }
    return canvasStates.get(canvas);
}

// Current active canvas and its state
var canvas = null;
var ctx = null;
var state = null;

// Proxy getters for backward compatibility
Object.defineProperty(window, 'components', {
    get: function() { return state ? state.components : []; },
    set: function(val) { if (state) state.components = val; }
});
Object.defineProperty(window, 'selectedIdx', {
    get: function() { return state ? state.selectedIdx : -1; },
    set: function(val) { if (state) state.selectedIdx = val; }
});
Object.defineProperty(window, 'selectedSet', {
    get: function() { return state ? state.selectedSet : []; },
    set: function(val) { if (state) state.selectedSet = val; }
});
Object.defineProperty(window, 'scale', {
    get: function() { return state ? state.scale : 1; },
    set: function(val) { if (state) state.scale = val; }
});
Object.defineProperty(window, 'pdfWidth', {
    get: function() { return state ? state.pdfWidth : 0; },
    set: function(val) { if (state) state.pdfWidth = val; }
});
Object.defineProperty(window, 'pdfHeight', {
    get: function() { return state ? state.pdfHeight : 0; },
    set: function(val) { if (state) state.pdfHeight = val; }
});
Object.defineProperty(window, 'pan', {
    get: function() { return state ? state.pan : { x: 0, y: 0, zoom: 1, dragging: false, startX: 0, startY: 0, spaceDown: false }; },
    set: function(val) { if (state) state.pan = val; }
});
Object.defineProperty(window, 'dragState', {
    get: function() { return state ? state.dragState : { active: false, startX: 0, startY: 0, componentIdx: -1 }; },
    set: function(val) { if (state) state.dragState = val; }
});
Object.defineProperty(window, 'rectSelect', {
    get: function() { return state ? state.rectSelect : { active: false, startX: 0, startY: 0, endX: 0, endY: 0 }; },
    set: function(val) { if (state) state.rectSelect = val; }
});
Object.defineProperty(window, 'groupExpanded', {
    get: function() { return state ? state.groupExpanded : {}; },
    set: function(val) { if (state) state.groupExpanded = val; }
});
Object.defineProperty(window, 'historyStack', {
    get: function() { return state ? state.historyStack : []; },
    set: function(val) { if (state) state.historyStack = val; }
});
Object.defineProperty(window, 'historyIndex', {
    get: function() { return state ? state.historyIndex : -1; },
    set: function(val) { if (state) state.historyIndex = val; }
});
Object.defineProperty(window, 'maxHistorySize', {
    get: function() { return state ? state.maxHistorySize : 50; },
    set: function(val) { if (state) state.maxHistorySize = val; }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    init();
});

function initWithTabPane(tabPane) {
    if (!tabPane) return;

    var canvasEl = tabPane.querySelector('#canvas');
    if (!canvasEl) return;

    // Store reference to tab pane on canvas element
    canvasEl._tabPane = tabPane;

    // Set as active canvas
    switchToCanvas(canvasEl);

    setupDragDrop();
    setupFileInput();
    setupButtons();
    setupCanvasInteraction();
    setupCollapsibleSections();
    setupAlignmentButtons();

    // Wire up content type dropdown
    var typeSelect = tabPane.querySelector('#ct-type-select');
    if (typeSelect) {
        typeSelect.addEventListener('change', onContentTypeChange);
    }
    // Wire up alignment buttons for content type panel
    var ctAlignH = tabPane.querySelector('#ct-align-h');
    if (ctAlignH) {
        ctAlignH.querySelectorAll('button').forEach(function(btn) {
            btn.addEventListener('click', function() {
                ctAlignH.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                renderCanvas();
            });
        });
    }
    var ctAlignV = tabPane.querySelector('#ct-align-v');
    if (ctAlignV) {
        ctAlignV.querySelectorAll('button').forEach(function(btn) {
            btn.addEventListener('click', function() {
                ctAlignV.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                renderCanvas();
            });
        });
    }

    // Wire up live preview listeners for text content fields
    ['ct-text-value', 'ct-font-size', 'ct-color', 'ct-letter-spacing'].forEach(function(id) {
        var el = tabPane.querySelector('#' + id);
        if (el) el.addEventListener('input', function() { renderCanvas(); });
    });
    var ctFontSelect = tabPane.querySelector('#ct-font-select');
    if (ctFontSelect) {
        ctFontSelect.addEventListener('change', function() {
            var opt = ctFontSelect.options[ctFontSelect.selectedIndex];
            if (ctFontSelect.value && opt && opt.dataset.fontName) {
                loadFontForCanvas(parseInt(ctFontSelect.value), opt.dataset.fontName);
            }
            renderCanvas();
        });
    }
    ['ct-bold-btn', 'ct-italic-btn'].forEach(function(id) {
        var btn = tabPane.querySelector('#' + id);
        if (btn) {
            btn.removeAttribute('onclick');
            btn.addEventListener('click', function() {
                btn.classList.toggle('active');
                renderCanvas();
            });
        }
    });

    renderCanvas();

    var layoutId = tabPane.getAttribute('data-layout-id');
    if (layoutId && layoutId.trim() !== '') {
        loadLayoutFromDatabase(layoutId);
    } else {
        // New layout — prompt customer selection
        showCustomerSelectModal();
    }
}

// Switch active canvas context
function switchToCanvas(canvasEl) {
    if (!canvasEl) return;
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    state = getCanvasState(canvas);
    console.log('Switched to canvas:', canvas, 'with state:', state);
    console.log('Components count:', state.components.length);
    console.log('PDF dimensions:', state.pdfWidth, 'x', state.pdfHeight);
}

function init() {
    canvas = document.getElementById('canvas');
    if (!canvas) return;

    ctx = canvas.getContext('2d');
    state = getCanvasState(canvas);

    setupDragDrop();
    setupFileInput();
    setupButtons();
    setupCanvasInteraction();

    renderCanvas();

    // Check if we should load a layout from data attribute
    const tabPane = canvas.closest('.tab-pane');
    console.log('Tab pane found:', tabPane);
    if (tabPane) {
        const layoutId = tabPane.getAttribute('data-layout-id');
        console.log('Layout ID from data attribute:', layoutId);
        if (layoutId && layoutId.trim() !== '') {
            console.log('Loading layout:', layoutId);
            loadLayoutFromDatabase(layoutId);
        } else {
            console.log('No layout ID to load');
        }
    } else {
        console.log('No tab pane found');
    }
}

// Helper to get element scoped to current canvas's tab pane
function _el(id) {
    if (!canvas) return document.getElementById(id);
    var tabPane = canvas.closest('.tab-pane');
    if (!tabPane) return document.getElementById(id);
    return tabPane.querySelector('#' + id);
}

function setupDragDrop() {
    var container = _el('canvas-container');

    if (container._dragDropSetup) return; // Already setup
    container._dragDropSetup = true;

    // Prevent default drag behavior on the container
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

        if (e.dataTransfer.files && e.dataTransfer.files.length) {
            var file = e.dataTransfer.files[0];
            if (file.name.toLowerCase().endsWith('.pdf')) {
                parsePdfFile(file);
            }
        }
    });

    // Also prevent default on the entire pdf-manager-container
    var pdfContainer = document.querySelector('.pdf-manager-container');
    if (pdfContainer) {
        pdfContainer.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
        });
        pdfContainer.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
        });
    }
}

function setupFileInput() {
    var fileInput = _el('file-input');
    var chooseBtn = _el('btn-choose-file');

    if (chooseBtn && !chooseBtn._listenerAdded) {
        chooseBtn.addEventListener('click', function() {
            fileInput.click();
        });
        chooseBtn._listenerAdded = true;
    }

    if (fileInput && !fileInput._listenerAdded) {
        fileInput.addEventListener('change', function(e) {
            if (e.target.files && e.target.files.length) {
                parsePdfFile(e.target.files[0]);
            }
        });
        fileInput._listenerAdded = true;
    }
}

function setupButtons() {
    var saveBtn = _el('btn-save-layout');
    if (saveBtn && !saveBtn._listenerAdded) {
        saveBtn.addEventListener('click', saveLayoutToDatabase);
        saveBtn._listenerAdded = true;
    }

    var groupBtn = _el('btn-group');
    var ungroupBtn = _el('btn-ungroup');
    var deleteBtn = _el('btn-delete');
    var exportPdfBtn = _el('btn-export-pdf');
    var exportAiEditableBtn = _el('btn-export-ai-editable');
    var exportAiOutlinedBtn = _el('btn-export-ai-outlined');

    if (groupBtn && !groupBtn._listenerAdded) {
        groupBtn.addEventListener('click', groupSelected);
        groupBtn._listenerAdded = true;
    }
    if (ungroupBtn && !ungroupBtn._listenerAdded) {
        ungroupBtn.addEventListener('click', ungroupSelected);
        ungroupBtn._listenerAdded = true;
    }
    if (deleteBtn && !deleteBtn._listenerAdded) {
        deleteBtn.addEventListener('click', deleteSelected);
        deleteBtn._listenerAdded = true;
    }
    if (exportPdfBtn && !exportPdfBtn._listenerAdded) {
        exportPdfBtn.addEventListener('click', function() { exportFile('pdf'); });
        exportPdfBtn._listenerAdded = true;
    }
    if (exportAiEditableBtn && !exportAiEditableBtn._listenerAdded) {
        exportAiEditableBtn.addEventListener('click', function() { exportFile('ai-separate', false); });
        exportAiEditableBtn._listenerAdded = true;
    }
    if (exportAiOutlinedBtn && !exportAiOutlinedBtn._listenerAdded) {
        exportAiOutlinedBtn.addEventListener('click', function() { exportFile('ai-separate', true); });
        exportAiOutlinedBtn._listenerAdded = true;
    }
}

function setupCanvasInteraction() {
    // Store the current canvas element for this setup
    var currentCanvas = canvas;

    // Remove any existing listeners to avoid duplicates
    var oldMouseDown = currentCanvas._mouseDownHandler;
    var oldWheel = currentCanvas._wheelHandler;

    if (oldMouseDown) {
        currentCanvas.removeEventListener('mousedown', oldMouseDown);
    }
    if (oldWheel) {
        currentCanvas.removeEventListener('wheel', oldWheel);
    }

    // Create new handlers
    var mouseDownHandler = function(e) {
        // Switch to this canvas when interacting with it
        switchToCanvas(currentCanvas);
        onCanvasMouseDown(e);
    };

    var wheelHandler = function(e) {
        // Switch to this canvas when interacting with it
        switchToCanvas(currentCanvas);
        onCanvasWheel(e);
    };

    // Store handlers on canvas for later removal
    currentCanvas._mouseDownHandler = mouseDownHandler;
    currentCanvas._wheelHandler = wheelHandler;

    // Add new listeners
    currentCanvas.addEventListener('mousedown', mouseDownHandler);
    currentCanvas.addEventListener('wheel', wheelHandler);
    currentCanvas.addEventListener('dblclick', onCanvasDblClick);

    // Global listeners (only add once)
    if (!window._pdfManagerGlobalListenersAdded) {
        document.addEventListener('mousemove', onCanvasMouseMove);
        document.addEventListener('mouseup', onCanvasMouseUp);
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('keyup', onKeyUp);

        // Handle window resize
        window.addEventListener('resize', function() {
            renderCanvas();
        });

        window._pdfManagerGlobalListenersAdded = true;
    }
}

function parsePdfFile(file) {
    console.log('parsePdfFile called with:', file.name);
    var reader = new FileReader();

    reader.onload = function(e) {
        var data = new Uint8Array(e.target.result);

        pdfjsLib.getDocument({ data: data }).promise.then(function(pdf) {
            pdf.getPage(1).then(function(page) {
                var viewport = page.getViewport({ scale: 1.0 });

                // Convert PDF points to mm (72 points = 25.4mm)
                pdfWidth = viewport.width / 72 * 25.4;
                pdfHeight = viewport.height / 72 * 25.4;

                // Extract vector paths and text
                Promise.all([
                    extractPdfObjects(page, pdfWidth, pdfHeight),
                    extractTextContent(page, pdfHeight)
                ]).then(function(results) {
                    var paths = results[0];
                    var texts = results[1];

                    // Clear existing components
                    components = [];

                    // Add path components
                    paths.forEach(function(pathObj) {
                        components.push({
                            type: 'pdfpath',
                            x: pathObj.bbox.x,
                            y: pathObj.bbox.y,
                            w: pathObj.bbox.w,
                            h: pathObj.bbox.h,
                            pathData: {
                                ops: pathObj.ops,
                                fill: pathObj.fill,
                                stroke: pathObj.stroke,
                                lw: pathObj.lw
                            },
                            visible: true,
                            locked: false,
                            groupId: null
                        });
                    });

                    // Add text components
                    texts.forEach(function(textObj) {
                        components.push({
                            type: 'text',
                            content: textObj.content,
                            x: textObj.x,
                            y: textObj.y,
                            w: textObj.w,
                            h: textObj.h,
                            fontFamily: textObj.fontFamily || 'Arial',
                            fontSize: textObj.fontSize,
                            visible: true,
                            locked: false,
                            groupId: null
                        });
                    });

                    // Hide empty state
                    _el('empty-state').style.display = 'none';

                    // Enable export buttons
                    _el('btn-export-pdf').disabled = false;
                    _el('btn-export-ai-editable').disabled = false;
                    _el('btn-export-ai-outlined').disabled = false;

                    // Center the PDF on canvas
                    centerPdfOnCanvas();

                    renderCanvas();
                    renderComponentList();
                    renderColorPalette();
                    captureState(); // Capture initial state
                }).catch(function(err) {
                    console.error('Error extracting PDF content:', err);
                });
            }).catch(function(err) {
                console.error('Error getting page:', err);
            });
        }).catch(function(err) {
            console.error('Error loading PDF:', err);
        });
    };

    reader.onerror = function(err) {
        console.error('FileReader error:', err);
    };

    reader.readAsArrayBuffer(file);
}

function extractPdfObjects(page, pdfW, pdfH) {
    return page.getOperatorList().then(function(opList) {
        var objects = [];
        var currentPath = [];
        var currentState = {
            ctm: [1, 0, 0, 1, 0, 0],
            fill: null,
            stroke: null,
            lineWidth: 1
        };
        var stateStack = [];

        var OPS = pdfjsLib.OPS;

        // Normalize RGB values - PDF.js may return 0-255 or 0-1 range
        function normalizeColor(arr) {
            var max = Math.max(arr[0], arr[1], arr[2]);
            return max > 1 ? [arr[0] / 255, arr[1] / 255, arr[2] / 255] : arr;
        }

        for (var i = 0; i < opList.fnArray.length; i++) {
            var fn = opList.fnArray[i];
            var args = opList.argsArray[i];

            if (fn === OPS.save) {
                stateStack.push(JSON.parse(JSON.stringify(currentState)));
            } else if (fn === OPS.restore) {
                if (stateStack.length > 0) {
                    currentState = stateStack.pop();
                }
            } else if (fn === OPS.transform) {
                currentState.ctm = mulMat(currentState.ctm, args);
            } else if (fn === OPS.setFillRGBColor) {
                currentState.fill = normalizeColor([args[0], args[1], args[2]]);
            } else if (fn === OPS.setStrokeRGBColor) {
                currentState.stroke = normalizeColor([args[0], args[1], args[2]]);
            } else if (fn === OPS.setFillCMYKColor) {
                // Convert CMYK to RGB
                var c = args[0], m = args[1], y = args[2], k = args[3];
                currentState.fill = [
                    (1 - c) * (1 - k),
                    (1 - m) * (1 - k),
                    (1 - y) * (1 - k)
                ];
            } else if (fn === OPS.setStrokeCMYKColor) {
                // Convert CMYK to RGB
                var c = args[0], m = args[1], y = args[2], k = args[3];
                currentState.stroke = [
                    (1 - c) * (1 - k),
                    (1 - m) * (1 - k),
                    (1 - y) * (1 - k)
                ];
            } else if (fn === OPS.setFillGray) {
                var gray = args[0];
                currentState.fill = [gray, gray, gray];
            } else if (fn === OPS.setStrokeGray) {
                var gray = args[0];
                currentState.stroke = [gray, gray, gray];
            } else if (fn === OPS.setLineWidth) {
                currentState.lineWidth = args[0];
            } else if (fn === OPS.constructPath) {
                // constructPath contains array of operations and points
                // ops array uses OPS constants (same as top-level operators)
                var ops = args[0];
                var points = args[1];
                var pointIdx = 0;

                for (var j = 0; j < ops.length; j++) {
                    var op = ops[j];

                    if (op === OPS.moveTo) {
                        var pt = txPt(currentState.ctm, points[pointIdx], points[pointIdx + 1]);
                        currentPath.push({ o: 'M', a: [pt[0] / 72 * 25.4, pdfH - (pt[1] / 72 * 25.4)] });
                        pointIdx += 2;
                    } else if (op === OPS.lineTo) {
                        var pt = txPt(currentState.ctm, points[pointIdx], points[pointIdx + 1]);
                        currentPath.push({ o: 'L', a: [pt[0] / 72 * 25.4, pdfH - (pt[1] / 72 * 25.4)] });
                        pointIdx += 2;
                    } else if (op === OPS.curveTo) {
                        var pt1 = txPt(currentState.ctm, points[pointIdx], points[pointIdx + 1]);
                        var pt2 = txPt(currentState.ctm, points[pointIdx + 2], points[pointIdx + 3]);
                        var pt3 = txPt(currentState.ctm, points[pointIdx + 4], points[pointIdx + 5]);
                        currentPath.push({
                            o: 'C',
                            a: [
                                pt1[0] / 72 * 25.4, pdfH - (pt1[1] / 72 * 25.4),
                                pt2[0] / 72 * 25.4, pdfH - (pt2[1] / 72 * 25.4),
                                pt3[0] / 72 * 25.4, pdfH - (pt3[1] / 72 * 25.4)
                            ]
                        });
                        pointIdx += 6;
                    } else if (op === OPS.rectangle) {
                        var x = points[pointIdx], y = points[pointIdx + 1];
                        var w = points[pointIdx + 2], h = points[pointIdx + 3];
                        var pt1 = txPt(currentState.ctm, x, y);
                        var pt2 = txPt(currentState.ctm, x + w, y);
                        var pt3 = txPt(currentState.ctm, x + w, y + h);
                        var pt4 = txPt(currentState.ctm, x, y + h);
                        currentPath.push({ o: 'M', a: [pt1[0] / 72 * 25.4, pdfH - (pt1[1] / 72 * 25.4)] });
                        currentPath.push({ o: 'L', a: [pt2[0] / 72 * 25.4, pdfH - (pt2[1] / 72 * 25.4)] });
                        currentPath.push({ o: 'L', a: [pt3[0] / 72 * 25.4, pdfH - (pt3[1] / 72 * 25.4)] });
                        currentPath.push({ o: 'L', a: [pt4[0] / 72 * 25.4, pdfH - (pt4[1] / 72 * 25.4)] });
                        currentPath.push({ o: 'Z', a: [] });
                        pointIdx += 4;
                    } else if (op === OPS.closePath) {
                        currentPath.push({ o: 'Z', a: [] });
                    }
                }
            } else if (fn === OPS.moveTo) {
                var pt = txPt(currentState.ctm, args[0], args[1]);
                currentPath.push({ o: 'M', a: [pt[0] / 72 * 25.4, pdfH - (pt[1] / 72 * 25.4)] });
            } else if (fn === OPS.lineTo) {
                var pt = txPt(currentState.ctm, args[0], args[1]);
                currentPath.push({ o: 'L', a: [pt[0] / 72 * 25.4, pdfH - (pt[1] / 72 * 25.4)] });
            } else if (fn === OPS.curveTo) {
                var pt1 = txPt(currentState.ctm, args[0], args[1]);
                var pt2 = txPt(currentState.ctm, args[2], args[3]);
                var pt3 = txPt(currentState.ctm, args[4], args[5]);
                currentPath.push({
                    o: 'C',
                    a: [
                        pt1[0] / 72 * 25.4, pdfH - (pt1[1] / 72 * 25.4),
                        pt2[0] / 72 * 25.4, pdfH - (pt2[1] / 72 * 25.4),
                        pt3[0] / 72 * 25.4, pdfH - (pt3[1] / 72 * 25.4)
                    ]
                });
            } else if (fn === OPS.rectangle) {
                var x = args[0], y = args[1], w = args[2], h = args[3];
                var pt1 = txPt(currentState.ctm, x, y);
                var pt2 = txPt(currentState.ctm, x + w, y);
                var pt3 = txPt(currentState.ctm, x + w, y + h);
                var pt4 = txPt(currentState.ctm, x, y + h);
                currentPath.push({ o: 'M', a: [pt1[0] / 72 * 25.4, pdfH - (pt1[1] / 72 * 25.4)] });
                currentPath.push({ o: 'L', a: [pt2[0] / 72 * 25.4, pdfH - (pt2[1] / 72 * 25.4)] });
                currentPath.push({ o: 'L', a: [pt3[0] / 72 * 25.4, pdfH - (pt3[1] / 72 * 25.4)] });
                currentPath.push({ o: 'L', a: [pt4[0] / 72 * 25.4, pdfH - (pt4[1] / 72 * 25.4)] });
                currentPath.push({ o: 'Z', a: [] });
            } else if (fn === OPS.closePath) {
                currentPath.push({ o: 'Z', a: [] });
            } else if (fn === OPS.endPath) {
                // endPath discards the current path without painting it (used after clip)
                currentPath = [];
            } else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.stroke || fn === OPS.fillStroke || fn === OPS.eoFillStroke) {
                if (currentPath.length > 0) {
                    var bbox = calculateBBox(currentPath);
                    var obj = {
                        ops: currentPath.slice(),
                        fill: (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke || fn === OPS.eoFillStroke) ? currentState.fill : null,
                        stroke: (fn === OPS.stroke || fn === OPS.fillStroke || fn === OPS.eoFillStroke) ? currentState.stroke : null,
                        lw: currentState.lineWidth / 72 * 25.4,
                        bbox: bbox
                    };
                    objects.push(obj);
                    currentPath = [];
                }
            }
        }

        console.log('Total objects extracted:', objects.length);
        if (objects.length > 0) {
            console.log('First 5 objects:', objects.slice(0, 5).map(function(obj) {
                return {
                    fill: obj.fill,
                    stroke: obj.stroke,
                    lw: obj.lw,
                    opsCount: obj.ops.length,
                    bbox: obj.bbox
                };
            }));
        }
        return objects;
    });
}

function extractTextContent(page, pdfH) {
    return page.getTextContent().then(function(textContent) {
        var texts = [];

        textContent.items.forEach(function(item) {
            // Filter readable text
            var readable = item.str.replace(/[\x00-\x1f\ufffd]/g, '');
            var printable = readable.replace(/[^\x20-\x7e\u00a0-\u024f\u0400-\u04ff\u4e00-\u9fff\u3000-\u30ff\uac00-\ud7af]/g, '');

            if (printable.length < readable.length * 0.5 || printable.trim().length === 0) {
                return;
            }

            var transform = item.transform;
            var x = transform[4] / 72 * 25.4;
            var y = pdfH - (transform[5] / 72 * 25.4);
            var fontSize = Math.abs(transform[0]) / 72 * 25.4 / 0.3528;
            var w = item.width / 72 * 25.4;
            var h = fontSize * 0.3528 * 1.3;

            texts.push({
                content: printable,
                x: x,
                y: y,
                w: w,
                h: h,
                fontSize: fontSize,
                fontFamily: item.fontName || 'Arial'
            });
        });

        return texts;
    });
}

function mulMat(a, b) {
    return [
        a[0] * b[0] + a[2] * b[1],
        a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3],
        a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4],
        a[1] * b[4] + a[3] * b[5] + a[5]
    ];
}

function txPt(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function calculateBBox(ops) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    ops.forEach(function(op) {
        if (op.o === 'M' || op.o === 'L') {
            minX = Math.min(minX, op.a[0]);
            minY = Math.min(minY, op.a[1]);
            maxX = Math.max(maxX, op.a[0]);
            maxY = Math.max(maxY, op.a[1]);
        } else if (op.o === 'C') {
            for (var i = 0; i < 6; i += 2) {
                minX = Math.min(minX, op.a[i]);
                minY = Math.min(minY, op.a[i + 1]);
                maxX = Math.max(maxX, op.a[i]);
                maxY = Math.max(maxY, op.a[i + 1]);
            }
        }
    });

    return {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY
    };
}

function isRectIntersecting(comp, rect) {
    // Check if component bounding box intersects with selection rectangle
    return !(comp.x + comp.w < rect.x ||
             comp.x > rect.x + rect.w ||
             comp.y + comp.h < rect.y ||
             comp.y > rect.y + rect.h);
}

function renderCanvas() {
    if (!canvas || !ctx) return;

    // Update zoom display
    var zoomDisplay = _el('zoom-level');
    if (zoomDisplay) {
        zoomDisplay.textContent = Math.round(pan.zoom * 100) + '%';
    }

    var container = _el('canvas-container');
    var containerW = container.clientWidth;
    var containerH = container.clientHeight;

    if (pdfWidth > 0 && pdfHeight > 0) {
        // Add padding to prevent canvas from touching edges
        var padding = 40;
        var availableW = containerW - padding * 2;
        var availableH = containerH - padding * 2;

        // Calculate scale to fit PDF in available space
        var fitScale = Math.min(availableW / pdfWidth, availableH / pdfHeight, 6);
        scale = fitScale * pan.zoom;

        canvas.width = pdfWidth * scale;
        canvas.height = pdfHeight * scale;

        // Apply pan transform
        canvas.style.transform = 'translate(' + pan.x + 'px, ' + pan.y + 'px)';
    } else {
        canvas.width = containerW;
        canvas.height = containerH;
        canvas.style.transform = 'none';
    }

    // Fill canvas background with grey
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw white PDF page background with black border
    if (pdfWidth > 0 && pdfHeight > 0) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
    }

    if (components.length === 0) return;

    // Draw components
    components.forEach(function(comp, idx) {
        // Skip component being edited (preview draws it instead)
        if (state && state.editingComponentIdx === idx && state.pendingContentRegion) return;
        if (comp.type === 'pdfpath') {
            drawPdfPath(comp, idx);
        } else if (comp.type === 'text') {
            drawText(comp, idx);
        } else if (comp.type === 'textregion') {
            drawTextRegion(comp, idx);
        } else if (comp.type === 'imageregion') {
            drawImageRegion(comp, idx);
        } else if (comp.type === 'qrcoderegion') {
            drawQrCodeRegion(comp, idx);
        } else if (comp.type === 'barcoderegion') {
            drawBarcodeRegion(comp, idx);
        }
    });

    // Draw live text preview for pending content region
    if (state && state.pendingContentRegion && state.pendingContentType === 'text') {
        var previewComp = buildPreviewComponent();
        if (previewComp) {
            drawTextRegion(previewComp, -1);
        }
    }

    // Draw defined edges (green rectangles, only unconfirmed)
    if (state && state.edges) {
        ctx.save();
        state.edges.forEach(function(edge) {
            if (edge.confirmed) return;
            var ex = edge.x * scale;
            var ey = edge.y * scale;
            var ew = edge.w * scale;
            var eh = edge.h * scale;
            ctx.fillStyle = 'rgba(0, 200, 0, 0.1)';
            ctx.fillRect(ex, ey, ew, eh);
            ctx.strokeStyle = '#00cc00';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(ex, ey, ew, eh);
            // Draw dimensions label
            ctx.fillStyle = '#00cc00';
            ctx.font = '10px sans-serif';
            ctx.fillText(edge.w.toFixed(1) + ' x ' + edge.h.toFixed(1) + ' mm', ex + 2, ey - 4);
            // Draw 8 resize handles
            var handles = getEdgeHandles(edge);
            var hs = 3; // handle half-size in px
            ctx.fillStyle = '#00cc00';
            handles.forEach(function(h) {
                var hx = h.x * scale;
                var hy = h.y * scale;
                ctx.fillRect(hx - hs, hy - hs, hs * 2, hs * 2);
                ctx.strokeStyle = '#009900';
                ctx.lineWidth = 1;
                ctx.strokeRect(hx - hs, hy - hs, hs * 2, hs * 2);
            });
        });
        ctx.restore();
    }

    // Draw snap point indicators in edge mode
    if (state && state.edgeMode && state.snapPoints) {
        ctx.save();
        state.snapPoints.forEach(function(pt) {
            ctx.beginPath();
            ctx.arc(pt.x * scale, pt.y * scale, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 200, 0, 0.4)';
            ctx.fill();
        });
        // Highlight snapped start point
        if (state.snapStart) {
            ctx.beginPath();
            ctx.arc(state.snapStart.x * scale, state.snapStart.y * scale, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#00cc00';
            ctx.fill();
        }
        // Highlight snapped end point
        if (state.snapEnd) {
            ctx.beginPath();
            ctx.arc(state.snapEnd.x * scale, state.snapEnd.y * scale, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#00cc00';
            ctx.fill();
        }
        ctx.restore();
    }

    // Draw edge rectangle being drawn
    if (state && state.edgeDrawing) {
        ctx.save();
        var ed = state.edgeDrawing;
        var ex = Math.min(ed.startX, ed.endX) * scale;
        var ey = Math.min(ed.startY, ed.endY) * scale;
        var ew = Math.abs(ed.endX - ed.startX) * scale;
        var eh = Math.abs(ed.endY - ed.startY) * scale;
        ctx.fillStyle = 'rgba(0, 200, 0, 0.08)';
        ctx.fillRect(ex, ey, ew, eh);
        ctx.strokeStyle = '#00cc00';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(ex, ey, ew, eh);
        ctx.setLineDash([]);
        // Show live dimensions
        var liveW = Math.abs(ed.endX - ed.startX).toFixed(1);
        var liveH = Math.abs(ed.endY - ed.startY).toFixed(1);
        ctx.fillStyle = '#00cc00';
        ctx.font = '10px sans-serif';
        ctx.fillText(liveW + ' x ' + liveH + ' mm', ex + 2, ey - 4);
        ctx.restore();
    }

    // Draw content region being drawn + block snap indicators
    if (state && state.contentRegionMode && state.contentRegionBlock) {
        ctx.save();
        var block = state.contentRegionBlock;
        var bx = block.x * scale, by = block.y * scale;
        var bw = block.w * scale, bh = block.h * scale;

        // Draw block outline (so user sees the boundary)
        ctx.strokeStyle = 'rgba(0, 200, 0, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.setLineDash([]);

        // Draw snap points on block: 4 corners + 4 midpoints
        var blockSnaps = [
            { x: block.x, y: block.y },
            { x: block.x + block.w, y: block.y },
            { x: block.x, y: block.y + block.h },
            { x: block.x + block.w, y: block.y + block.h },
            { x: block.x + block.w / 2, y: block.y },
            { x: block.x + block.w, y: block.y + block.h / 2 },
            { x: block.x + block.w / 2, y: block.y + block.h },
            { x: block.x, y: block.y + block.h / 2 }
        ];
        blockSnaps.forEach(function(sp) {
            ctx.beginPath();
            ctx.arc(sp.x * scale, sp.y * scale, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 200, 0, 0.4)';
            ctx.fill();
        });

        // Draw the text region rectangle being drawn
        if (state.contentRegionDraw) {
            var tr = state.contentRegionDraw;
            var rx = Math.min(tr.startX, tr.endX) * scale;
            var ry = Math.min(tr.startY, tr.endY) * scale;
            var rw = Math.abs(tr.endX - tr.startX) * scale;
            var rh = Math.abs(tr.endY - tr.startY) * scale;
            ctx.strokeStyle = '#00cc00';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.setLineDash([]);

            // Highlight snapped corners of the text region
            var snapThresh = 2 / (pan.zoom || 1);
            var corners = [
                { x: tr.startX, y: tr.startY },
                { x: tr.endX, y: tr.endY }
            ];
            corners.forEach(function(c) {
                var snapped = false;
                blockSnaps.forEach(function(sp) {
                    if (Math.abs(c.x - sp.x) < snapThresh && Math.abs(c.y - sp.y) < snapThresh) snapped = true;
                });
                // Also check edge lines
                if (Math.abs(c.x - block.x) < 0.01 || Math.abs(c.x - (block.x + block.w)) < 0.01 ||
                    Math.abs(c.x - (block.x + block.w / 2)) < 0.01 ||
                    Math.abs(c.y - block.y) < 0.01 || Math.abs(c.y - (block.y + block.h)) < 0.01 ||
                    Math.abs(c.y - (block.y + block.h / 2)) < 0.01) {
                    snapped = true;
                }
                if (snapped) {
                    ctx.beginPath();
                    ctx.arc(c.x * scale, c.y * scale, 5, 0, Math.PI * 2);
                    ctx.fillStyle = '#00cc00';
                    ctx.fill();
                }
            });
        }
        ctx.restore();
    } else if (state && state.contentRegionDraw) {
        // Fallback: draw without block (shouldn't happen but safe)
        ctx.save();
        var tr = state.contentRegionDraw;
        var rx = Math.min(tr.startX, tr.endX) * scale;
        var ry = Math.min(tr.startY, tr.endY) * scale;
        var rw = Math.abs(tr.endX - tr.startX) * scale;
        var rh = Math.abs(tr.endY - tr.startY) * scale;
        ctx.strokeStyle = '#00cc00';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.setLineDash([]);
        ctx.restore();
    }

    // Draw selected block highlight in content mode
    if (state && state.contentMode && state.contentSelectedBlock) {
        var sb = state.contentSelectedBlock;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 200, 0, 0.12)';
        ctx.fillRect(sb.x * scale, sb.y * scale, sb.w * scale, sb.h * scale);
        ctx.strokeStyle = '#00cc00';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(sb.x * scale, sb.y * scale, sb.w * scale, sb.h * scale);
        ctx.restore();
    }

    // Draw selection rectangle if active
    if (rectSelect.active) {
        var minX = Math.min(rectSelect.startX, rectSelect.endX) * scale;
        var minY = Math.min(rectSelect.startY, rectSelect.endY) * scale;
        var maxX = Math.max(rectSelect.startX, rectSelect.endX) * scale;
        var maxY = Math.max(rectSelect.startY, rectSelect.endY) * scale;

        ctx.fillStyle = 'rgba(0, 102, 255, 0.1)';
        ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

        ctx.strokeStyle = '#0066ff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        ctx.setLineDash([]);
    }
}

function drawPdfPath(comp, idx) {
    if (!comp.visible) {
        ctx.globalAlpha = 0.15;
    }

    ctx.beginPath();

    comp.pathData.ops.forEach(function(op) {
        if (op.o === 'M') {
            ctx.moveTo(op.a[0] * scale, op.a[1] * scale);
        } else if (op.o === 'L') {
            ctx.lineTo(op.a[0] * scale, op.a[1] * scale);
        } else if (op.o === 'C') {
            ctx.bezierCurveTo(
                op.a[0] * scale, op.a[1] * scale,
                op.a[2] * scale, op.a[3] * scale,
                op.a[4] * scale, op.a[5] * scale
            );
        } else if (op.o === 'Z') {
            ctx.closePath();
        }
    });

    if (comp.pathData.fill) {
        ctx.fillStyle = rgbToString(comp.pathData.fill);
        ctx.fill();
    }

    if (comp.pathData.stroke) {
        ctx.strokeStyle = rgbToString(comp.pathData.stroke);
        ctx.lineWidth = comp.pathData.lw * scale;
        ctx.stroke();
    }

    // Highlight if selected
    if (idx === selectedIdx || selectedSet.indexOf(idx) !== -1) {
        ctx.strokeStyle = '#0066ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(comp.x * scale, comp.y * scale, comp.w * scale, comp.h * scale);
    }

    ctx.globalAlpha = 1.0;
}

function drawText(comp, idx) {
    if (!comp.visible) {
        ctx.globalAlpha = 0.15;
    }

    ctx.fillStyle = '#000';
    ctx.font = (comp.fontSize * scale) + 'px ' + comp.fontFamily;
    ctx.fillText(comp.content, comp.x * scale, (comp.y + comp.h * 0.8) * scale);

    // Highlight if selected
    if (idx === selectedIdx || selectedSet.indexOf(idx) !== -1) {
        ctx.strokeStyle = '#0066ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(comp.x * scale, comp.y * scale, comp.w * scale, comp.h * scale);
    }

    ctx.globalAlpha = 1.0;
}

function rgbToString(rgb) {
    if (!rgb) return 'transparent';
    return 'rgb(' + Math.round(rgb[0] * 255) + ',' + Math.round(rgb[1] * 255) + ',' + Math.round(rgb[2] * 255) + ')';
}

function colorKey(rgb) {
    // Round to nearest 1% to group similar colors
    return Math.round(rgb[0] * 100) + ',' +
           Math.round(rgb[1] * 100) + ',' +
           Math.round(rgb[2] * 100);
}

function collectUniqueColors() {
    var colors = [];
    var colorMap = {};

    components.forEach(function(comp) {
        if (comp.type === 'pdfpath') {
            if (comp.pathData.fill) {
                var key = colorKey(comp.pathData.fill);
                if (!colorMap[key]) {
                    colorMap[key] = comp.pathData.fill;
                    colors.push({ rgb: comp.pathData.fill, type: 'fill' });
                }
            }
            if (comp.pathData.stroke) {
                var key = colorKey(comp.pathData.stroke);
                if (!colorMap[key]) {
                    colorMap[key] = comp.pathData.stroke;
                    colors.push({ rgb: comp.pathData.stroke, type: 'stroke' });
                }
            }
        }
    });

    return colors;
}

function selectByColor(targetRgb, toggleVisibility) {
    var targetKey = colorKey(targetRgb);

    if (toggleVisibility) {
        // Toggle visibility of all paths with this color
        captureState();
        var hasVisible = false;
        components.forEach(function(comp) {
            if (comp.type === 'pdfpath') {
                var fillMatch = comp.pathData.fill && colorKey(comp.pathData.fill) === targetKey;
                var strokeMatch = comp.pathData.stroke && colorKey(comp.pathData.stroke) === targetKey;
                if (fillMatch || strokeMatch) {
                    if (comp.visible) hasVisible = true;
                }
            }
        });

        // If any are visible, hide all; otherwise show all
        components.forEach(function(comp) {
            if (comp.type === 'pdfpath') {
                var fillMatch = comp.pathData.fill && colorKey(comp.pathData.fill) === targetKey;
                var strokeMatch = comp.pathData.stroke && colorKey(comp.pathData.stroke) === targetKey;
                if (fillMatch || strokeMatch) {
                    comp.visible = !hasVisible;
                }
            }
        });

        renderCanvas();
        renderComponentList();
    } else {
        // Select all paths with this color
        selectedSet = [];
        components.forEach(function(comp, idx) {
            if (comp.type === 'pdfpath' && !comp.locked) {
                var fillMatch = comp.pathData.fill && colorKey(comp.pathData.fill) === targetKey;
                var strokeMatch = comp.pathData.stroke && colorKey(comp.pathData.stroke) === targetKey;

                if (fillMatch || strokeMatch) {
                    selectedSet.push(idx);
                }
            }
        });

        selectedIdx = selectedSet.length === 1 ? selectedSet[0] : -1;
        renderCanvas();
        renderComponentList();
        renderPropertiesPanel();
    }
}

function renderColorPalette() {
    var palette = _el('color-palette');
    if (!palette) return;

    var colors = collectUniqueColors();
    var colorCount = _el('color-count');
    if (colorCount) {
        colorCount.textContent = '(' + colors.length + ' colors)';
    }

    palette.innerHTML = '';

    colors.forEach(function(colorInfo) {
        var swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.backgroundColor = rgbToString(colorInfo.rgb);
        swatch.title = rgbToString(colorInfo.rgb) + '\nLeft-click: Select\nRight-click: Toggle visibility';

        // Check if any visible paths with this color exist
        var targetKey = colorKey(colorInfo.rgb);
        var hasVisiblePaths = false;

        for (var i = 0; i < components.length; i++) {
            var comp = components[i];
            if (comp.type === 'pdfpath' && comp.visible) {
                var fillMatch = comp.pathData.fill && colorKey(comp.pathData.fill) === targetKey;
                var strokeMatch = comp.pathData.stroke && colorKey(comp.pathData.stroke) === targetKey;
                if (fillMatch || strokeMatch) {
                    hasVisiblePaths = true;
                    break;
                }
            }
        }

        // Dim the swatch if no visible paths with this color exist
        if (!hasVisiblePaths) {
            swatch.style.opacity = '0.3';
        }

        // Left-click: select paths with this color
        swatch.addEventListener('click', function() {
            selectByColor(colorInfo.rgb, false);
        });

        // Right-click: toggle visibility
        swatch.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            selectByColor(colorInfo.rgb, true);
            renderColorPalette();
        });

        palette.appendChild(swatch);
    });
}

function expandAllGroups() {
    if (!state) return;
    state.components.forEach(function(comp) {
        if (comp.groupId) state.groupExpanded[comp.groupId] = true;
    });
    renderComponentList();
}

function collapseAllGroups() {
    if (!state) return;
    state.components.forEach(function(comp) {
        if (comp.groupId) state.groupExpanded[comp.groupId] = false;
    });
    renderComponentList();
}

function lockAllComponents() {
    if (!state) return;
    state.components.forEach(function(comp) { comp.locked = true; });
    renderComponentList();
}

function unlockAllComponents() {
    if (!state) return;
    state.components.forEach(function(comp) { comp.locked = false; });
    renderComponentList();
}

function renderComponentList() {
    var list = _el('component-list');
    list.innerHTML = '';

    var nonBlockCount = components.filter(function(c) { return !c.snappedEdgeId; }).length;
    _el('component-count').textContent = '(' + nonBlockCount + ' items)';

    if (nonBlockCount === 0) {
        list.innerHTML = '<div class="empty-message">No components</div>';
        return;
    }

    // Group components by groupId
    var groups = {};
    var ungrouped = [];

    components.forEach(function(comp, idx) {
        // Skip block regions — they are shown under their block in the edge list
        if (comp.snappedEdgeId) return;
        if (comp.groupId) {
            if (!groups[comp.groupId]) {
                groups[comp.groupId] = [];
            }
            groups[comp.groupId].push({ comp: comp, idx: idx });
        } else {
            ungrouped.push({ comp: comp, idx: idx });
        }
    });

    // Render groups first
    Object.keys(groups).forEach(function(groupId) {
        var groupItems = groups[groupId];
        var isExpanded = groupExpanded[groupId] !== false; // Default to expanded

        // Check if all group members are selected
        var allSelected = groupItems.every(function(item) {
            return selectedSet.indexOf(item.idx) !== -1;
        });

        // Create group header
        var groupHeader = document.createElement('div');
        groupHeader.className = 'component-item group-header';
        if (allSelected) {
            groupHeader.classList.add('selected');
        }
        groupHeader.style.fontWeight = '600';

        var expandBtn = document.createElement('span');
        expandBtn.textContent = isExpanded ? '▼' : '▶';
        expandBtn.style.marginRight = '4px';
        expandBtn.style.cursor = 'pointer';

        var eyeBtn = document.createElement('button');
        eyeBtn.className = 'icon-btn';
        var allVisible = groupItems.every(function(item) { return item.comp.visible; });
        eyeBtn.textContent = allVisible ? '👁' : '-';
        eyeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            groupItems.forEach(function(item) {
                item.comp.visible = !allVisible;
            });
            renderCanvas();
            renderComponentList();
        });

        var lockBtn = document.createElement('button');
        lockBtn.className = 'icon-btn';
        var allLocked = groupItems.every(function(item) { return item.comp.locked; });
        lockBtn.textContent = allLocked ? '🔒' : '🔓';
        lockBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            groupItems.forEach(function(item) {
                item.comp.locked = !allLocked;
            });
            renderComponentList();
        });

        var label = document.createElement('span');
        label.className = 'component-label';
        var pathCount = groupItems.filter(function(item) { return item.comp.type === 'pdfpath'; }).length;
        var groupName = (state.groupNames && state.groupNames[groupId]) || 'Group';
        label.textContent = groupName + ' (' + pathCount + ' paths, ' + groupItems.length + ' items)';
        label.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            var newName = prompt('Rename group:', groupName);
            if (newName !== null && newName.trim()) {
                if (!state.groupNames) state.groupNames = {};
                state.groupNames[groupId] = newName.trim();
                renderComponentList();
            }
        });

        groupHeader.appendChild(expandBtn);
        groupHeader.appendChild(eyeBtn);
        groupHeader.appendChild(lockBtn);
        groupHeader.appendChild(label);

        groupHeader.addEventListener('click', function(e) {
            // Toggle expand/collapse
            if (e.target === expandBtn || e.target === groupHeader) {
                groupExpanded[groupId] = !isExpanded;
                renderComponentList();
            } else {
                // Select all group members
                selectedSet = groupItems.map(function(item) { return item.idx; });
                selectedIdx = -1;
                renderCanvas();
                renderComponentList();
                renderPropertiesPanel();
            }
        });

        list.appendChild(groupHeader);

        // Render group members if expanded
        if (isExpanded) {
            groupItems.forEach(function(item) {
                var compItem = createComponentItem(item.comp, item.idx, true);
                list.appendChild(compItem);
            });
        }
    });

    // Render ungrouped components
    ungrouped.forEach(function(item) {
        var compItem = createComponentItem(item.comp, item.idx, false);
        list.appendChild(compItem);
    });

    updateActionButtons();
}

function createComponentItem(comp, idx, isGroupMember) {
    var item = document.createElement('div');
    item.className = 'component-item';
    if (selectedSet.indexOf(idx) !== -1) {
        item.classList.add('selected');
    }
    if (isGroupMember) {
        item.style.paddingLeft = '24px';
    }

    var checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedSet.indexOf(idx) !== -1;
    checkbox.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleSelection(idx);
    });

    var eyeBtn = document.createElement('button');
    eyeBtn.className = 'icon-btn';
    eyeBtn.textContent = comp.visible ? '👁' : '-';
    eyeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleVisibility(idx);
    });

    var lockBtn = document.createElement('button');
    lockBtn.className = 'icon-btn';
    lockBtn.textContent = comp.locked ? '🔒' : '🔓';
    lockBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleLock(idx);
    });

    var label = document.createElement('span');
    label.className = 'component-label';
    var labelMap = {
        'text': 'Text: "' + (comp.content || '').substring(0, 20) + '"',
        'textregion': 'Text Region',
        'imageregion': 'Image: ' + (comp.imageUrl || '').substring(0, 15),
        'qrcoderegion': 'QR: ' + (comp.qrData || '').substring(0, 15),
        'barcoderegion': 'Barcode: ' + (comp.barcodeData || '').substring(0, 15),
        'pdfpath': 'Path ' + (idx + 1)
    };
    label.textContent = labelMap[comp.type] || comp.type + ' ' + (idx + 1);

    item.appendChild(checkbox);
    item.appendChild(eyeBtn);
    item.appendChild(lockBtn);
    item.appendChild(label);

    item.addEventListener('click', function() {
        selectComponent(idx);
    });

    return item;
}

function selectComponent(idx) {
    var comp = components[idx];

    // If component is part of a group, select all group members
    if (comp.groupId) {
        selectedSet = [];
        components.forEach(function(c, i) {
            if (c.groupId === comp.groupId) {
                selectedSet.push(i);
            }
        });
        selectedIdx = -1;
    } else {
        selectedIdx = idx;
        selectedSet = [idx];
    }

    renderCanvas();
    renderComponentList();
    renderPropertiesPanel();
}

function toggleSelection(idx) {
    var pos = selectedSet.indexOf(idx);
    if (pos !== -1) {
        selectedSet.splice(pos, 1);
    } else {
        selectedSet.push(idx);
    }

    if (selectedSet.length === 1) {
        selectedIdx = selectedSet[0];
    } else {
        selectedIdx = -1;
    }

    renderCanvas();
    renderComponentList();
    renderPropertiesPanel();
}

function toggleVisibility(idx) {
    captureState();
    components[idx].visible = !components[idx].visible;
    renderCanvas();
    renderComponentList();
    renderColorPalette();
}

function toggleLock(idx) {
    captureState();
    components[idx].locked = !components[idx].locked;
    renderComponentList();
}

function renderPropertiesPanel() {
    var panel = _el('properties-panel');
    var section = _el('properties-section');

    if (selectedIdx === -1 || selectedSet.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    panel.innerHTML = '';

    if (selectedSet.length === 1) {
        var comp = components[selectedIdx];

        var html = '<div class="property-group">';
        html += '<div class="property-group-title">Position</div>';
        html += '<div class="property-row"><label>X:</label><span>' + comp.x.toFixed(2) + ' mm</span></div>';
        html += '<div class="property-row"><label>Y:</label><span>' + comp.y.toFixed(2) + ' mm</span></div>';
        html += '</div>';

        html += '<div class="property-group">';
        html += '<div class="property-group-title">Size</div>';
        html += '<div class="property-row"><label>W:</label><span>' + comp.w.toFixed(2) + ' mm</span></div>';
        html += '<div class="property-row"><label>H:</label><span>' + comp.h.toFixed(2) + ' mm</span></div>';
        html += '</div>';

        if (comp.type === 'pdfpath' && comp.pathData) {
            html += '<div class="property-group">';
            html += '<div class="property-group-title">Style</div>';
            if (comp.pathData.fill) {
                html += '<div class="property-row"><label>Fill:</label><span>' + rgbToString(comp.pathData.fill) + '</span></div>';
            }
            if (comp.pathData.stroke) {
                html += '<div class="property-row"><label>Stroke:</label><span>' + rgbToString(comp.pathData.stroke) + '</span></div>';
                html += '<div class="property-row"><label>Width:</label><span>' + comp.pathData.lw.toFixed(2) + ' mm</span></div>';
            }
            html += '</div>';
        } else if (comp.type === 'text') {
            html += '<div class="property-group">';
            html += '<div class="property-group-title">Text</div>';
            html += '<div class="property-row"><label>Font:</label><span>' + comp.fontFamily + '</span></div>';
            html += '<div class="property-row"><label>Size:</label><span>' + comp.fontSize.toFixed(1) + ' pt</span></div>';
            html += '</div>';
        } else if (comp.type === 'textregion') {
            html += '<div class="property-group">';
            html += '<div class="property-group-title">Text Region</div>';
            html += '<div class="property-row"><label>Font:</label><span>' + (comp.fontFamily || '-') + '</span></div>';
            html += '<div class="property-row"><label>Size:</label><span>' + (comp.fontSize || 12) + ' pt</span></div>';
            html += '<div class="property-row"><label>Color:</label><span>' + (comp.color || '#000000') + '</span></div>';
            html += '</div>';
        } else if (comp.type === 'imageregion') {
            html += '<div class="property-group">';
            html += '<div class="property-group-title">Image</div>';
            html += '<div class="property-row"><label>URL:</label><span>' + (comp.imageUrl || '-') + '</span></div>';
            html += '<div class="property-row"><label>Fit:</label><span>' + (comp.imageFit || 'contain') + '</span></div>';
            html += '</div>';
        } else if (comp.type === 'qrcoderegion') {
            html += '<div class="property-group">';
            html += '<div class="property-group-title">QR Code</div>';
            html += '<div class="property-row"><label>Data:</label><span>' + (comp.qrData || '-') + '</span></div>';
            html += '</div>';
        } else if (comp.type === 'barcoderegion') {
            html += '<div class="property-group">';
            html += '<div class="property-group-title">Barcode</div>';
            html += '<div class="property-row"><label>Data:</label><span>' + (comp.barcodeData || '-') + '</span></div>';
            html += '<div class="property-row"><label>Format:</label><span>' + (comp.barcodeFormat || 'code128') + '</span></div>';
            html += '</div>';
        }

        panel.innerHTML = html;
    } else {
        panel.innerHTML = '<p>' + selectedSet.length + ' components selected</p>';
    }
}

function updateActionButtons() {
    var hasSelection = selectedSet.length > 0;
    var canGroup = selectedSet.length > 1;

    _el('btn-group').disabled = !canGroup;
    _el('btn-ungroup').disabled = !hasSelection;
    _el('btn-delete').disabled = !hasSelection;
}

function hitTestRegionHandle(x, y) {
    if (!state || selectedSet.length !== 1) return null;
    var idx = selectedSet[0];
    var comp = components[idx];
    if (!comp || !comp.snappedEdgeId) return null;

    var hs = 4 / scale; // handle hit area in mm
    var handles = [
        { name: 'tl', hx: comp.x, hy: comp.y },
        { name: 'tc', hx: comp.x + comp.w / 2, hy: comp.y },
        { name: 'tr', hx: comp.x + comp.w, hy: comp.y },
        { name: 'ml', hx: comp.x, hy: comp.y + comp.h / 2 },
        { name: 'mr', hx: comp.x + comp.w, hy: comp.y + comp.h / 2 },
        { name: 'bl', hx: comp.x, hy: comp.y + comp.h },
        { name: 'bc', hx: comp.x + comp.w / 2, hy: comp.y + comp.h },
        { name: 'br', hx: comp.x + comp.w, hy: comp.y + comp.h }
    ];
    for (var i = 0; i < handles.length; i++) {
        if (Math.abs(x - handles[i].hx) < hs && Math.abs(y - handles[i].hy) < hs) {
            return { compIdx: idx, handle: handles[i].name };
        }
    }
    return null;
}

function onCanvasDblClick(e) {
    if (!canvas || !state) return;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) / scale;
    var y = (e.clientY - rect.top) / scale;

    // Check if double-clicking on a content region
    for (var i = components.length - 1; i >= 0; i--) {
        var comp = components[i];
        if (comp.snappedEdgeId && x >= comp.x && x <= comp.x + comp.w && y >= comp.y && y <= comp.y + comp.h) {
            editContentRegion(i);
            return;
        }
    }
}

function onCanvasMouseDown(e) {
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) / scale;
    var y = (e.clientY - rect.top) / scale;

    // Pan mode with space key
    if (pan.spaceDown) {
        pan.dragging = true;
        pan.startX = e.clientX;
        pan.startY = e.clientY;
        canvas.style.cursor = 'grabbing';
        return;
    }

    // Edge mode — start drawing edge, snap to nearest point
    if (state.edgeMode) {
        var snapPt = findNearestSnapPoint(x, y, state.snapPoints, 5 / pan.zoom);
        if (snapPt) {
            state.snapStart = snapPt;
            state.edgeDrawing = { startX: snapPt.x, startY: snapPt.y, endX: x, endY: y };
        } else {
            state.snapStart = null;
            state.edgeDrawing = { startX: x, startY: y, endX: x, endY: y };
        }
        return;
    }

    // Resize handle hit test for unconfirmed edges
    if (!state.edgeMode) {
        var handleHit = hitTestEdgeHandle(x, y);
        if (handleHit) {
            state.resizingEdge = { edgeId: handleHit.edgeId, handle: handleHit.handle, edgeIndex: handleHit.edgeIndex };
            return;
        }
    }

    // Check if clicking on the pending content region to drag it (works in edit mode too)
    if (state && state.pendingContentRegion) {
        var pr = state.pendingContentRegion;
        if (x >= pr.x && x <= pr.x + pr.w && y >= pr.y && y <= pr.y + pr.h) {
            state.previewDragState = { active: true, startX: x, startY: y };
            canvas.style.cursor = 'move';
            return;
        }
    }

    // Content mode — click confirmed block to select, or draw inside selected block
    if (state.contentMode) {
        // If a block is selected, check if clicking on existing content region first
        if (state.contentRegionMode && state.contentRegionBlock) {
            // Hit test existing content regions in this block
            for (var ci = components.length - 1; ci >= 0; ci--) {
                var cr = components[ci];
                if (cr.snappedEdgeId === state.contentRegionBlock.id && !cr.locked &&
                    x >= cr.x && x <= cr.x + cr.w && y >= cr.y && y <= cr.y + cr.h) {
                    selectComponent(ci);
                    captureState();
                    state.contentRegionMode = false;
                    dragState.active = true;
                    dragState.startX = x;
                    dragState.startY = y;
                    dragState.componentIdx = ci;
                    canvas.style.cursor = 'move';
                    return;
                }
            }
            // Otherwise start drawing new content region
            var block = state.contentRegionBlock;
            var sx = x, sy = y;
            if (block) {
                sx = Math.max(block.x, Math.min(block.x + block.w, sx));
                sy = Math.max(block.y, Math.min(block.y + block.h, sy));
                var snapThresh = 2 / (pan.zoom || 1);
                if (Math.abs(sx - block.x) < snapThresh) sx = block.x;
                else if (Math.abs(sx - (block.x + block.w)) < snapThresh) sx = block.x + block.w;
                else if (Math.abs(sx - (block.x + block.w / 2)) < snapThresh) sx = block.x + block.w / 2;
                if (Math.abs(sy - block.y) < snapThresh) sy = block.y;
                else if (Math.abs(sy - (block.y + block.h)) < snapThresh) sy = block.y + block.h;
                else if (Math.abs(sy - (block.y + block.h / 2)) < snapThresh) sy = block.y + block.h / 2;
            }
            state.contentRegionDraw = { startX: sx, startY: sy, endX: sx, endY: sy };
            return;
        }
        // Otherwise check if clicking on a confirmed block to select it
        var clickedBlock = null;
        for (var i = 0; i < state.edges.length; i++) {
            var edge = state.edges[i];
            if (!edge.confirmed) continue;
            if (x >= edge.x && x <= edge.x + edge.w && y >= edge.y && y <= edge.y + edge.h) {
                clickedBlock = edge;
                break;
            }
        }
        if (clickedBlock) {
            state.contentSelectedBlock = clickedBlock;
            state.contentRegionBlock = clickedBlock;
            state.contentRegionMode = true;
            state.pendingContentRegion = null;
            canvas.style.cursor = 'crosshair';
            renderCanvas();
        }
        return;
    }

    // Check if clicking on a resize handle of a selected content region
    var regionHandle = hitTestRegionHandle(x, y);
    if (regionHandle) {
        state.regionResizing = { compIdx: regionHandle.compIdx, handle: regionHandle.handle, startX: x, startY: y };
        return;
    }

    // Check if clicking on a component
    for (var i = components.length - 1; i >= 0; i--) {
        var comp = components[i];
        if (comp.locked) continue;

        if (x >= comp.x && x <= comp.x + comp.w && y >= comp.y && y <= comp.y + comp.h) {
            if (e.ctrlKey) {
                toggleSelection(i);
            } else {
                selectComponent(i);
            }

            captureState(); // Capture state before drag
            dragState.active = true;
            dragState.startX = x;
            dragState.startY = y;
            dragState.componentIdx = i;
            return;
        }
    }

    // Clicked on empty space - start rectangle selection
    if (!e.ctrlKey) {
        selectedIdx = -1;
        selectedSet = [];
    }

    rectSelect.active = true;
    rectSelect.startX = x;
    rectSelect.startY = y;
    rectSelect.endX = x;
    rectSelect.endY = y;

    renderCanvas();
    renderComponentList();
    renderPropertiesPanel();
}

function onCanvasMouseMove(e) {
    // Edge resize handle dragging
    if (state && state.resizingEdge) {
        var rect = canvas.getBoundingClientRect();
        var x = (e.clientX - rect.left) / scale;
        var y = (e.clientY - rect.top) / scale;
        var edge = state.edges[state.resizingEdge.edgeIndex];
        if (edge) {
            resizeEdgeByHandle(edge, state.resizingEdge.handle, x, y);
            renderCanvas();
            renderEdgeList();
        }
        return;
    }

    // Edge mode drawing — snap end to nearest point
    if (state && state.edgeMode && state.edgeDrawing) {
        var rect = canvas.getBoundingClientRect();
        var x = (e.clientX - rect.left) / scale;
        var y = (e.clientY - rect.top) / scale;
        var snapPt = findNearestSnapPoint(x, y, state.snapPoints, 5 / pan.zoom);
        if (snapPt) {
            state.snapEnd = snapPt;
            state.edgeDrawing.endX = snapPt.x;
            state.edgeDrawing.endY = snapPt.y;
        } else {
            state.snapEnd = null;
            state.edgeDrawing.endX = x;
            state.edgeDrawing.endY = y;
        }
        renderCanvas();
        return;
    }

    // Drag pending content region within block
    if (state && state.previewDragState && state.previewDragState.active && state.pendingContentRegion) {
        var rect = canvas.getBoundingClientRect();
        var x = (e.clientX - rect.left) / scale;
        var y = (e.clientY - rect.top) / scale;
        var dx = x - state.previewDragState.startX;
        var dy = y - state.previewDragState.startY;
        var pr = state.pendingContentRegion;
        var block = getBlockForPendingRegion();
        if (block) {
            var newX = pr.x + dx;
            var newY = pr.y + dy;
            newX = Math.max(block.x, Math.min(block.x + block.w - pr.w, newX));
            newY = Math.max(block.y, Math.min(block.y + block.h - pr.h, newY));
            pr.x = newX;
            pr.y = newY;
        } else {
            pr.x += dx;
            pr.y += dy;
        }
        state.previewDragState.startX = x;
        state.previewDragState.startY = y;
        renderCanvas();
        return;
    }

    // Content region drawing — clamped to block boundaries with snap
    if (state && state.contentRegionMode && state.contentRegionDraw) {
        var rect = canvas.getBoundingClientRect();
        var x = (e.clientX - rect.left) / scale;
        var y = (e.clientY - rect.top) / scale;
        var block = state.contentRegionBlock;
        if (block) {
            x = Math.max(block.x, Math.min(block.x + block.w, x));
            y = Math.max(block.y, Math.min(block.y + block.h, y));
            // Snap to block edges/corners (2mm threshold)
            var snapThresh = 2 / (pan.zoom || 1);
            if (Math.abs(x - block.x) < snapThresh) x = block.x;
            else if (Math.abs(x - (block.x + block.w)) < snapThresh) x = block.x + block.w;
            else if (Math.abs(x - (block.x + block.w / 2)) < snapThresh) x = block.x + block.w / 2;
            if (Math.abs(y - block.y) < snapThresh) y = block.y;
            else if (Math.abs(y - (block.y + block.h)) < snapThresh) y = block.y + block.h;
            else if (Math.abs(y - (block.y + block.h / 2)) < snapThresh) y = block.y + block.h / 2;
        }
        state.contentRegionDraw.endX = x;
        state.contentRegionDraw.endY = y;
        renderCanvas();
        return;
    }

    // Handle rectangle selection
    if (rectSelect.active) {
        var rect = canvas.getBoundingClientRect();
        var x = (e.clientX - rect.left) / scale;
        var y = (e.clientY - rect.top) / scale;
        rectSelect.endX = x;
        rectSelect.endY = y;
        renderCanvas();
        return;
    }

    // Handle pan mode
    if (pan.dragging) {
        var dx = e.clientX - pan.startX;
        var dy = e.clientY - pan.startY;
        pan.x += dx;
        pan.y += dy;
        pan.startX = e.clientX;
        pan.startY = e.clientY;
        renderCanvas();
        return;
    }

    // Region resize dragging
    if (state && state.regionResizing) {
        var rect = canvas.getBoundingClientRect();
        var x = (e.clientX - rect.left) / scale;
        var y = (e.clientY - rect.top) / scale;
        var rs = state.regionResizing;
        var comp = components[rs.compIdx];
        if (!comp) { state.regionResizing = null; return; }

        var block = null;
        if (comp.snappedEdgeId) {
            for (var bi = 0; bi < state.edges.length; bi++) {
                if (state.edges[bi].id === comp.snappedEdgeId) { block = state.edges[bi]; break; }
            }
        }

        var dx = x - rs.startX;
        var dy = y - rs.startY;
        var nx = comp.x, ny = comp.y, nw = comp.w, nh = comp.h;
        var h = rs.handle;

        if (h === 'tl' || h === 'ml' || h === 'bl') { nx += dx; nw -= dx; }
        if (h === 'tr' || h === 'mr' || h === 'br') { nw += dx; }
        if (h === 'tl' || h === 'tc' || h === 'tr') { ny += dy; nh -= dy; }
        if (h === 'bl' || h === 'bc' || h === 'br') { nh += dy; }

        // Minimum size
        if (nw < 2) { nw = 2; nx = comp.x; }
        if (nh < 2) { nh = 2; ny = comp.y; }

        // Clamp to block
        if (block) {
            if (nx < block.x) { nw -= (block.x - nx); nx = block.x; }
            if (ny < block.y) { nh -= (block.y - ny); ny = block.y; }
            if (nx + nw > block.x + block.w) nw = block.x + block.w - nx;
            if (ny + nh > block.y + block.h) nh = block.y + block.h - ny;
        }

        comp.x = nx; comp.y = ny; comp.w = nw; comp.h = nh;
        rs.startX = x; rs.startY = y;
        renderCanvas();
        return;
    }

    if (!dragState.active) return;

    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) / scale;
    var y = (e.clientY - rect.top) / scale;

    var dx = x - dragState.startX;
    var dy = y - dragState.startY;

    // Move selected components
    selectedSet.forEach(function(idx) {
        components[idx].x += dx;
        components[idx].y += dy;

        // Clamp to parent block if content region
        var comp = components[idx];
        if (comp.snappedEdgeId && state) {
            for (var bi = 0; bi < state.edges.length; bi++) {
                if (state.edges[bi].id === comp.snappedEdgeId) {
                    var blk = state.edges[bi];
                    comp.x = Math.max(blk.x, Math.min(blk.x + blk.w - comp.w, comp.x));
                    comp.y = Math.max(blk.y, Math.min(blk.y + blk.h - comp.h, comp.y));
                    break;
                }
            }
        }
    });

    dragState.startX = x;
    dragState.startY = y;

    renderCanvas();
}

function onCanvasMouseUp(e) {
    // End pending region drag
    if (state && state.previewDragState && state.previewDragState.active) {
        state.previewDragState.active = false;
        canvas.style.cursor = 'crosshair';
        renderCanvas();
        return;
    }

    // End region resize
    if (state && state.regionResizing) {
        state.regionResizing = null;
        renderCanvas();
        renderEdgeList();
        return;
    }

    // Edge resize handle release
    if (state && state.resizingEdge) {
        state.resizingEdge = null;
        renderEdgeList();
        renderCanvas();
        return;
    }

    // Edge mode — finalize edge rectangle from snap-to-snap
    if (state && state.edgeMode && state.edgeDrawing) {
        var ed = state.edgeDrawing;
        var ex = Math.min(ed.startX, ed.endX);
        var ey = Math.min(ed.startY, ed.endY);
        var ew = Math.abs(ed.endX - ed.startX);
        var eh = Math.abs(ed.endY - ed.startY);
        if (ew > 0.3 || eh > 0.3) {
            state.edges.push({
                id: 'edge-' + Date.now(),
                x: ex, y: ey,
                w: ew, h: eh,
                confirmed: false
            });
            renderEdgeList();
        }
        state.edgeDrawing = null;
        state.snapStart = null;
        state.snapEnd = null;
        renderCanvas();
        return;
    }

    // Content region mode — finalize region, show content type picker
    if (state && state.contentRegionMode && state.contentRegionDraw) {
        var tr = state.contentRegionDraw;
        var rx = Math.min(tr.startX, tr.endX);
        var ry = Math.min(tr.startY, tr.endY);
        var rw = Math.abs(tr.endX - tr.startX);
        var rh = Math.abs(tr.endY - tr.startY);
        var block = state.contentRegionBlock;
        if (block) {
            if (rx < block.x) { rw -= (block.x - rx); rx = block.x; }
            if (ry < block.y) { rh -= (block.y - ry); ry = block.y; }
            if (rx + rw > block.x + block.w) rw = block.x + block.w - rx;
            if (ry + rh > block.y + block.h) rh = block.y + block.h - ry;
        }
        if (rw > 1 && rh > 1) {
            state.pendingContentRegion = {
                x: rx, y: ry, w: rw, h: rh,
                snappedEdgeId: block ? block.id : null
            };
            showContentTypePanel();
        }
        state.contentRegionDraw = null;
        canvas.style.cursor = 'crosshair';
        renderCanvas();
        return;
    }

    // Handle rectangle selection
    if (rectSelect.active) {
        var minX = Math.min(rectSelect.startX, rectSelect.endX);
        var minY = Math.min(rectSelect.startY, rectSelect.endY);
        var maxX = Math.max(rectSelect.startX, rectSelect.endX);
        var maxY = Math.max(rectSelect.startY, rectSelect.endY);

        var selRect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

        // Find all components intersecting the rectangle
        var newSelection = [];
        for (var i = 0; i < components.length; i++) {
            if (!components[i].locked && isRectIntersecting(components[i], selRect)) {
                newSelection.push(i);
            }
        }

        // Update selection
        if (e.ctrlKey) {
            // Add to existing selection
            newSelection.forEach(function(idx) {
                if (selectedSet.indexOf(idx) === -1) {
                    selectedSet.push(idx);
                }
            });
        } else {
            selectedSet = newSelection;
        }

        selectedIdx = selectedSet.length === 1 ? selectedSet[0] : -1;

        rectSelect.active = false;
        renderCanvas();
        renderComponentList();
        renderPropertiesPanel();
        return;
    }

    dragState.active = false;
    pan.dragging = false;
    if (state && state.contentRegionBlock) {
        state.contentRegionMode = true;
        canvas.style.cursor = 'crosshair';
    } else if (pan.spaceDown) {
        canvas.style.cursor = 'grab';
    } else {
        canvas.style.cursor = 'default';
    }
}

function onCanvasWheel(e) {
    e.preventDefault();

    var zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    var newZoom = pan.zoom * zoomFactor;

    // Clamp zoom between 0.1x and 10x
    newZoom = Math.max(0.1, Math.min(10, newZoom));

    pan.zoom = newZoom;
    renderCanvas();
}

function onKeyDown(e) {
    if (e.key === 'Delete' && selectedSet.length > 0) {
        deleteSelected();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
            redo();
        } else {
            undo();
        }
    } else if (e.key === ' ') {
        var tag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        e.preventDefault();
        pan.spaceDown = true;
        canvas.style.cursor = 'grab';
    } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        var newZoom = pan.zoom * 1.2;
        pan.zoom = Math.min(10, newZoom);
        renderCanvas();
    } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        var newZoom = pan.zoom * 0.8;
        pan.zoom = Math.max(0.1, newZoom);
        renderCanvas();
    } else if (e.key === 'Escape') {
        if (state && state.contentMode) {
            toggleContentMode();
        } else if (state && state.edgeMode) {
            toggleEdgeMode();
        }
    }
}

function onKeyUp(e) {
    if (e.key === ' ') {
        pan.spaceDown = false;
        pan.dragging = false;
        canvas.style.cursor = 'default';
    }
}

function calculateBBox(ops) {
    var minX = Infinity, minY = Infinity;
    var maxX = -Infinity, maxY = -Infinity;

    ops.forEach(function(op) {
        if (op.o === 'M' || op.o === 'L') {
            minX = Math.min(minX, op.a[0]);
            minY = Math.min(minY, op.a[1]);
            maxX = Math.max(maxX, op.a[0]);
            maxY = Math.max(maxY, op.a[1]);
        } else if (op.o === 'C') {
            // Bezier curve - check all control points
            for (var i = 0; i < 6; i += 2) {
                minX = Math.min(minX, op.a[i]);
                minY = Math.min(minY, op.a[i + 1]);
                maxX = Math.max(maxX, op.a[i]);
                maxY = Math.max(maxY, op.a[i + 1]);
            }
        }
    });

    return {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY
    };
}

function makeStyleKey(pathData) {
    var fillKey = pathData.fill ? colorKey(pathData.fill) : 'none';
    var strokeKey = pathData.stroke ? colorKey(pathData.stroke) : 'none';
    var lwKey = Math.round(pathData.lw * 100);
    return fillKey + '|' + strokeKey + '|' + lwKey;
}

function pathsAreNearby(comp1, comp2, threshold) {
    // Calculate center points
    var c1x = comp1.x + comp1.w / 2;
    var c1y = comp1.y + comp1.h / 2;
    var c2x = comp2.x + comp2.w / 2;
    var c2y = comp2.y + comp2.h / 2;

    // Calculate distance
    var dx = c1x - c2x;
    var dy = c1y - c2y;
    var distance = Math.sqrt(dx * dx + dy * dy);

    // Threshold: 50mm (about 2 inches) - paths closer than this are considered "nearby"
    return distance < threshold;
}

function clusterPathsByProximity(paths, threshold) {
    if (paths.length === 0) return [];

    var clusters = [];
    var visited = new Array(paths.length).fill(false);

    // For each unvisited path, start a new cluster
    for (var i = 0; i < paths.length; i++) {
        if (visited[i]) continue;

        var cluster = [paths[i]];
        visited[i] = true;

        // Find all nearby paths and add them to this cluster
        var changed = true;
        while (changed) {
            changed = false;
            for (var j = 0; j < paths.length; j++) {
                if (visited[j]) continue;

                // Check if this path is near any path in the current cluster
                var isNearby = false;
                for (var k = 0; k < cluster.length; k++) {
                    if (pathsAreNearby(cluster[k], paths[j], threshold)) {
                        isNearby = true;
                        break;
                    }
                }

                if (isNearby) {
                    cluster.push(paths[j]);
                    visited[j] = true;
                    changed = true;
                }
            }
        }

        clusters.push(cluster);
    }

    return clusters;
}

function mergePathsByColorAndProximity(pathIndices) {
    // Group paths by style (color + stroke + linewidth)
    var styleGroups = {};

    pathIndices.forEach(function(idx) {
        var comp = components[idx];
        if (comp.type !== 'pdfpath') return;

        var key = makeStyleKey(comp.pathData);
        if (!styleGroups[key]) {
            styleGroups[key] = {
                paths: [],
                style: {
                    fill: comp.pathData.fill,
                    stroke: comp.pathData.stroke,
                    lw: comp.pathData.lw
                }
            };
        }
        styleGroups[key].paths.push(comp);
    });

    // For each style group, cluster by proximity
    var merged = [];
    Object.values(styleGroups).forEach(function(group) {
        var clusters = clusterPathsByProximity(group.paths, 50); // 50mm threshold

        // Merge each cluster into a single path
        clusters.forEach(function(cluster) {
            var allOps = [];
            cluster.forEach(function(path) {
                allOps = allOps.concat(path.pathData.ops);
            });

            var bbox = calculateBBox(allOps);
            merged.push({
                type: 'pdfpath',
                x: bbox.x,
                y: bbox.y,
                w: bbox.w,
                h: bbox.h,
                pathData: {
                    ops: allOps,
                    fill: group.style.fill,
                    stroke: group.style.stroke,
                    lw: group.style.lw
                },
                visible: true,
                locked: false,
                groupId: null
            });
        });
    });

    return merged;
}

function groupSelected() {
    if (selectedSet.length < 2) return;

    captureState();

    // Assign same groupId to all selected components (no merging)
    var groupId = 'grp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    selectedSet.forEach(function(idx) {
        components[idx].groupId = groupId;
    });

    renderCanvas();
    renderComponentList();
    renderPropertiesPanel();
    renderColorPalette();
}

function ungroupSelected() {
    captureState();
    // Collect all groupIds from selected components
    var groupIds = {};
    selectedSet.forEach(function(idx) {
        if (components[idx].groupId) {
            groupIds[components[idx].groupId] = true;
        }
    });
    // Remove groupId from ALL members of those groups
    components.forEach(function(comp) {
        if (comp.groupId && groupIds[comp.groupId]) {
            comp.groupId = null;
        }
    });

    renderCanvas();
    renderComponentList();
    renderPropertiesPanel();
}

function deleteSelected() {
    captureState();
    // Sort in reverse order to delete from end
    selectedSet.sort(function(a, b) { return b - a; });

    selectedSet.forEach(function(idx) {
        components.splice(idx, 1);
    });

    selectedIdx = -1;
    selectedSet = [];

    renderCanvas();
    renderComponentList();
    renderPropertiesPanel();
    renderColorPalette();
}

function fitCanvas() {
    pan.x = 0;
    pan.y = 0;
    pan.zoom = 1;
    _el('zoom-level').textContent = '100%';
    renderCanvas();
}

function resetViewport() {
    centerPdfOnCanvas();
    renderCanvas();
}

function centerPdfOnCanvas() {
    var container = _el('canvas-container');
    var containerW = container.clientWidth;
    var containerH = container.clientHeight;

    if (pdfWidth > 0 && pdfHeight > 0) {
        // Add padding to prevent canvas from touching edges
        var padding = 40;
        var availableW = containerW - padding * 2;
        var availableH = containerH - padding * 2;

        // Calculate scale to fit PDF in available space
        var fitScale = Math.min(availableW / pdfWidth, availableH / pdfHeight, 6);

        // Calculate canvas size at this scale
        var canvasW = pdfWidth * fitScale;
        var canvasH = pdfHeight * fitScale;

        // Center the canvas (flexbox will handle this, but we set pan offsets to 0)
        pan.x = 0;
        pan.y = 0;
        pan.zoom = 1;
    }
}

function captureState() {
    // Deep clone components array
    var state = {
        components: JSON.parse(JSON.stringify(components)),
        selectedIdx: selectedIdx,
        selectedSet: selectedSet.slice()
    };

    // Remove future history if we're not at the end
    if (historyIndex < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyIndex + 1);
    }

    // Add new state
    historyStack.push(state);

    // Limit history size
    if (historyStack.length > maxHistorySize) {
        historyStack.shift();
    } else {
        historyIndex++;
    }

    updateUndoRedoButtons();
}

function undo() {
    console.log('Undo called - historyIndex:', historyIndex, 'historyStack.length:', historyStack.length);
    if (historyIndex > 0) {
        historyIndex--;
        var state = historyStack[historyIndex];
        components = JSON.parse(JSON.stringify(state.components));
        selectedIdx = state.selectedIdx;
        selectedSet = state.selectedSet.slice();

        renderCanvas();
        renderComponentList();
        renderPropertiesPanel();
        renderColorPalette();
        updateUndoRedoButtons();
        console.log('Undo completed - new historyIndex:', historyIndex);
    } else {
        console.log('Cannot undo - at beginning of history');
    }
}

function redo() {
    console.log('Redo called - historyIndex:', historyIndex, 'historyStack.length:', historyStack.length);
    if (historyIndex < historyStack.length - 1) {
        historyIndex++;
        var state = historyStack[historyIndex];
        components = JSON.parse(JSON.stringify(state.components));
        selectedIdx = state.selectedIdx;
        selectedSet = state.selectedSet.slice();

        renderCanvas();
        renderComponentList();
        renderPropertiesPanel();
        renderColorPalette();
        updateUndoRedoButtons();
        console.log('Redo completed - new historyIndex:', historyIndex);
    } else {
        console.log('Cannot redo - at end of history');
    }
}

function updateUndoRedoButtons() {
    var undoBtn = _el('undo-btn');
    var redoBtn = _el('redo-btn');

    if (undoBtn) undoBtn.disabled = historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = historyIndex >= historyStack.length - 1;
}

function saveComponents() {
    console.log('Save components:', components);
    alert('Components saved (in-memory only for now)');
}

function exportFile(type, outlined) {
    var data = {
        label: { width: pdfWidth, height: pdfHeight },
        components: components.map(function(c) {
            return {
                type: c.type,
                x: c.x,
                y: c.y,
                width: c.w,
                height: c.h,
                content: c.content,
                fontFamily: c.fontFamily,
                fontId: c.fontId || null,
                fontSize: c.fontSize,
                bold: c.bold || false,
                italic: c.italic || false,
                color: c.color || '#000000',
                letterSpacing: c.letterSpacing || 0,
                alignH: c.alignH || 'left',
                alignV: c.alignV || 'top',
                pathData: c.pathData,
                visible: c.visible,
                imageUrl: c.imageUrl,
                imageFit: c.imageFit,
                qrData: c.qrData,
                barcodeData: c.barcodeData,
                barcodeFormat: c.barcodeFormat,
                page: 0
            };
        })
    };

    if (type === 'ai' || type === 'ai-separate') {
        data.outlined = outlined || false;
    }

    if (type === 'ai-separate') {
        data.separateInvisible = true;
    }

    var endpoint = type === 'pdf' ? '/export/pdf' : '/export/ai';

    fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    })
    .then(function(response) {
        if (!response.ok) throw new Error('Export failed');
        return response.blob();
    })
    .then(function(blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'export.' + (type === 'pdf' ? 'pdf' : 'ai');
        a.click();
        URL.revokeObjectURL(url);
    })
    .catch(function(err) {
        alert('Export failed: ' + err.message);
    });
}

// Pending overwrite data (used by confirmation flow)
var _pendingOverwrite = null;

// Save layout to database
function saveLayoutToDatabase() {
    // Show modal and load customers
    const modal = _el('save-layout-modal');
    const customerSelect = _el('layout-customer');
    const nameInput = _el('layout-name');
    const formView = _el('save-layout-form-view');
    const confirmView = _el('save-layout-confirm-view');

    // Reset to form view
    formView.style.display = '';
    confirmView.style.display = 'none';
    _pendingOverwrite = null;

    // Pre-fill if we loaded a layout
    if (state && state.currentLayoutId) {
        nameInput.value = state.currentLayoutName || '';
    } else {
        nameInput.value = '';
    }

    // Clear customer select
    customerSelect.innerHTML = '<option value="">Loading customers...</option>';

    // Show modal
    modal.classList.add('active');

    // Load customers
    fetch('/customer/list')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.customers) {
                customerSelect.innerHTML = '<option value="">Select a customer...</option>';
                data.customers.forEach(customer => {
                    const option = document.createElement('option');
                    option.value = customer.customer_id;
                    option.textContent = customer.company_name;
                    customerSelect.appendChild(option);
                });
                // Pre-select customer if loaded from existing layout
                if (state && state.currentCustomerId) {
                    customerSelect.value = state.currentCustomerId;
                }
            } else {
                customerSelect.innerHTML = '<option value="">Error loading customers</option>';
                showLayoutMessage('Error loading customers', 'error');
            }
        })
        .catch(error => {
            customerSelect.innerHTML = '<option value="">Error loading customers</option>';
            showLayoutMessage('Error loading customers: ' + error, 'error');
        });

    // Handle form submission
    const form = _el('save-layout-form');
    form.onsubmit = function(e) {
        e.preventDefault();

        const customerId = customerSelect.value;
        const layoutName = nameInput.value.trim();

        if (!customerId) {
            showLayoutMessage('Please select a customer', 'error');
            return;
        }

        if (!layoutName) {
            showLayoutMessage('Please enter a layout name', 'error');
            return;
        }

        const layoutData = {
            name: layoutName,
            type: 'pdf',
            data: {
                components: components,
                pdfWidth: pdfWidth,
                pdfHeight: pdfHeight,
                scale: scale,
                edges: state ? state.edges : []
            },
            customer_id: customerId
        };

        // Check for existing layout with same customer+name
        fetch('/layout/check-duplicate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customer_id: customerId, name: layoutName })
        })
        .then(r => r.json())
        .then(result => {
            if (result.success && result.exists) {
                // Show overwrite confirmation
                _pendingOverwrite = { layoutData: layoutData, existingId: result.layout.id };
                var msg = _el('overwrite-message');
                msg.textContent = 'A layout named "' + layoutName + '" already exists for this customer. Do you want to overwrite it?';
                formView.style.display = 'none';
                confirmView.style.display = '';
            } else {
                // No duplicate — save as new
                doSaveLayout(layoutData, null);
            }
        })
        .catch(error => {
            showLayoutMessage('Error checking layout: ' + error, 'error');
        });
    };
}

// Actually save (new) or update (overwrite) the layout
function doSaveLayout(layoutData, overwriteId) {
    var url, method;
    if (overwriteId) {
        url = '/layout/' + overwriteId;
        method = 'PUT';
    } else {
        url = '/layout/save';
        method = 'POST';
    }

    fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(layoutData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            var savedId = overwriteId || data.id;
            // Track the saved layout
            if (state) {
                state.currentLayoutId = savedId;
                state.currentLayoutName = layoutData.name;
                state.currentCustomerId = layoutData.customer_id;
            }
            showLayoutMessage('Layout saved successfully!', 'success');
            closeSaveModal();
        } else {
            showLayoutMessage('Error saving layout: ' + data.error, 'error');
        }
    })
    .catch(error => {
        showLayoutMessage('Error saving layout: ' + error, 'error');
    });
}

// Confirm overwrite
function confirmOverwrite() {
    if (_pendingOverwrite) {
        doSaveLayout(_pendingOverwrite.layoutData, _pendingOverwrite.existingId);
        _pendingOverwrite = null;
    }
}

// Cancel overwrite — go back to form
function cancelOverwrite() {
    var formView = _el('save-layout-form-view');
    var confirmView = _el('save-layout-confirm-view');
    formView.style.display = '';
    confirmView.style.display = 'none';
    _pendingOverwrite = null;
}

// Close save modal
function closeSaveModal() {
    const modal = _el('save-layout-modal');
    modal.classList.remove('active');
}

// Show layout message
function showLayoutMessage(text, type) {
    // Remove existing message if any
    const existingMessage = document.querySelector('.layout-message');
    if (existingMessage) {
        existingMessage.remove();
    }

    // Create new message
    const messageDiv = document.createElement('div');
    messageDiv.className = 'layout-message ' + type;
    messageDiv.textContent = text;
    document.body.appendChild(messageDiv);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        messageDiv.remove();
    }, 5000);
}

// Load layout from database
function loadLayoutFromDatabase(layoutId) {
    console.log('Loading layout from database:', layoutId);
    fetch('/layout/' + layoutId)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const layout = data.layout;
                const layoutData = layout.data;

                // Track loaded layout for overwrite detection
                if (state) {
                    state.currentLayoutId = layout.id;
                    state.currentLayoutName = layout.name;
                    state.currentCustomerId = layout.customer_id;
                    state.edges = layoutData.edges || [];
                }

                // Restore layout state
                components = layoutData.components || [];
                pdfWidth = layoutData.pdfWidth || 0;
                pdfHeight = layoutData.pdfHeight || 0;
                scale = layoutData.scale || 1;

                // Clear history and add initial state
                historyStack = [];
                historyIndex = -1;
                captureState();

                // Render
                renderCanvas();
                renderComponentList();
                renderColorPalette();
                renderEdgeList();
                updateActionButtons();

                // Update customer display
                if (layout.customer_id) {
                    fetch('/customer/' + layout.customer_id)
                        .then(function(r) { return r.json(); })
                        .then(function(cdata) {
                            if (cdata.success && cdata.customer) {
                                state.currentCustomerName = cdata.customer.company_name;
                                updateCustomerDisplay();
                            }
                        });
                }

                // Hide empty state and enable export buttons
                _el('empty-state').style.display = 'none';
                _el('btn-export-pdf').disabled = false;
                _el('btn-export-ai-editable').disabled = false;
                _el('btn-export-ai-outlined').disabled = false;
            } else {
                alert('Error loading layout: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Error loading layout:', error);
            alert('Error loading layout: ' + error);
        });
}

// Add text to canvas from font manager
window.addTextToCanvas = function(char, fontName) {
    if (!canvas || !pdfWidth || !pdfHeight) {
        alert('Please load a PDF first');
        return;
    }

    // Add text component at center of canvas
    var newComponent = {
        type: 'text',
        content: char,
        x: pdfWidth / 2,
        y: pdfHeight / 2,
        w: 10,
        h: 5,
        fontFamily: fontName,
        fontSize: 24,
        visible: true,
        locked: false,
        groupId: null
    };

    components.push(newComponent);
    captureState();
    renderCanvas();
    renderComponentList();
    updateActionButtons();

    // Select the new component
    selectedSet = [components.length - 1];
    selectedIdx = components.length - 1;
    renderCanvas();
    renderPropertiesPanel();
};

// ============================================================
// Collapsible Sections
// ============================================================

function setupCollapsibleSections() {
    var tabPane = canvas ? canvas.closest('.tab-pane') : document;
    var headers = tabPane.querySelectorAll('.collapsible-header');
    headers.forEach(function(header) {
        if (header._collapsibleSetup) return;
        header._collapsibleSetup = true;
        header.addEventListener('click', function() {
            var section = header.closest('.panel-section');
            section.classList.toggle('collapsed');
        });
    });
}

// ============================================================
// Customer Display & Selection
// ============================================================

function updateCustomerDisplay() {
    var label = _el('customer-name-label');
    if (label && state) {
        label.textContent = state.currentCustomerName || 'No customer selected';
    }
}

function showCustomerSelectModal() {
    var modal = _el('customer-select-modal');
    if (!modal) return;
    var select = _el('customer-select-dropdown');
    // Clear and reload
    select.innerHTML = '<option value="">Select a customer...</option>';
    fetch('/customer/list')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success && data.customers) {
                data.customers.forEach(function(c) {
                    var opt = document.createElement('option');
                    opt.value = c.customer_id;
                    opt.textContent = c.company_name;
                    select.appendChild(opt);
                });
            }
        });
    modal.classList.add('active');
}

function closeCustomerSelectModal() {
    var modal = _el('customer-select-modal');
    if (modal) modal.classList.remove('active');
}

function confirmCustomerSelect() {
    var select = _el('customer-select-dropdown');
    var val = select.value;
    var text = select.options[select.selectedIndex].text;
    if (!val) return;
    if (state) {
        state.currentCustomerId = val;
        state.currentCustomerName = text;
    }
    updateCustomerDisplay();
    closeCustomerSelectModal();
}

// ============================================================
// Edge Detection & Define Edge
// ============================================================

function extractCandidateEdges() {
    var edges = [];
    components.forEach(function(comp) {
        if (comp.type !== 'pdfpath') return;
        var ops = comp.pathData.ops;
        var lastPt = null;
        ops.forEach(function(op) {
            if (op.o === 'M') {
                lastPt = { x: op.a[0], y: op.a[1] };
            } else if (op.o === 'L' && lastPt) {
                var dx = op.a[0] - lastPt.x;
                var dy = op.a[1] - lastPt.y;
                var len = Math.sqrt(dx * dx + dy * dy);
                if (len > 0.5) {
                    edges.push({ x1: lastPt.x, y1: lastPt.y, x2: op.a[0], y2: op.a[1] });
                }
                lastPt = { x: op.a[0], y: op.a[1] };
            } else if (op.o === 'C') {
                lastPt = { x: op.a[4], y: op.a[5] };
            } else if (op.o === 'Z') {
                lastPt = null;
            }
        });
    });
    return edges;
}

function distToSegment(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1, dy = y2 - y1;
    var lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
    var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    var projX = x1 + t * dx, projY = y1 + t * dy;
    return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
}

function findNearestEdge(px, py, candidates, threshold) {
    var best = null, bestDist = threshold;
    candidates.forEach(function(edge) {
        var d = distToSegment(px, py, edge.x1, edge.y1, edge.x2, edge.y2);
        if (d < bestDist) {
            bestDist = d;
            best = edge;
        }
    });
    return best;
}

function extractSnapPoints() {
    var points = [];
    var seen = {};
    components.forEach(function(comp) {
        if (comp.type !== 'pdfpath') return;
        var ops = comp.pathData.ops;
        ops.forEach(function(op) {
            var px, py;
            if (op.o === 'M' || op.o === 'L') {
                px = op.a[0]; py = op.a[1];
            } else if (op.o === 'C') {
                px = op.a[4]; py = op.a[5];
            } else {
                return;
            }
            // Deduplicate by rounding to 0.1mm
            var key = Math.round(px * 10) + ',' + Math.round(py * 10);
            if (!seen[key]) {
                seen[key] = true;
                points.push({ x: px, y: py });
            }
        });
    });
    return points;
}

function findNearestSnapPoint(px, py, points, threshold) {
    var best = null, bestDist = threshold;
    points.forEach(function(pt) {
        var dx = px - pt.x, dy = py - pt.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) {
            bestDist = d;
            best = pt;
        }
    });
    return best;
}

function toggleEdgeMode() {
    if (!state) return;
    if (state.contentMode) {
        toggleContentMode();
    }
    state.edgeMode = !state.edgeMode;
    var btn = _el('btn-define-edge');
    if (btn) {
        if (state.edgeMode) {
            btn.classList.add('btn-active');
            canvas.style.cursor = 'crosshair';
            state.candidateEdges = extractCandidateEdges();
            state.snapPoints = extractSnapPoints();
        } else {
            btn.classList.remove('btn-active');
            canvas.style.cursor = 'default';
            state.candidateEdges = [];
            state.snapPoints = [];
            state.highlightedEdge = null;
            state.edgeDrawing = null;
            state.snapStart = null;
            state.snapEnd = null;
        }
    }
    renderCanvas();
}

function renderEdgeList() {
    var list = _el('edge-list');
    if (!list || !state) return;
    if (state.edges.length === 0) {
        list.innerHTML = '<div class="empty-message">No edges defined</div>';
        return;
    }
    list.innerHTML = '';
    state.edges.forEach(function(edge, i) {
        var div = document.createElement('div');
        div.className = 'edge-item' + (edge.confirmed ? ' confirmed' : '');

        // Find content regions belonging to this block
        var regionIndices = [];
        if (edge.confirmed) {
            components.forEach(function(comp, idx) {
                if (comp.snappedEdgeId === edge.id) regionIndices.push(idx);
            });
        }

        var isExpanded = state.blockExpanded[edge.id] !== false;
        var expandBtn = '';
        if (edge.confirmed && regionIndices.length > 0) {
            expandBtn = '<span class="block-expand-btn" data-edge-id="' + edge.id + '">' + (isExpanded ? '▼' : '▶') + '</span>';
        }

        var actions = '';
        if (!edge.confirmed) {
            actions = '<button class="edge-btn-confirm" onclick="confirmEdge(\'' + edge.id + '\')" title="Confirm">✓</button>';
        } else {
            actions = '<button class="edge-btn-edit" onclick="editEdge(\'' + edge.id + '\')" title="Edit">✎</button>';
        }
        actions += '<button class="edge-btn-remove" onclick="deleteEdge(\'' + edge.id + '\')" title="Remove">✕</button>';
        div.innerHTML = '<div class="edge-info">' +
            expandBtn +
            '<span class="edge-dim">Block ' + (i + 1) + '</span> ' +
            '<span>W: ' + edge.w.toFixed(1) + 'mm  H: ' + edge.h.toFixed(1) + 'mm</span>' +
            '</div>' +
            '<div class="edge-actions">' + actions + '</div>';

        // Wire expand/collapse click
        var expEl = div.querySelector('.block-expand-btn');
        if (expEl) {
            expEl.addEventListener('click', function(e) {
                e.stopPropagation();
                state.blockExpanded[edge.id] = !isExpanded;
                renderEdgeList();
            });
        }

        list.appendChild(div);

        // Render nested content regions if expanded
        if (edge.confirmed && isExpanded && regionIndices.length > 0) {
            regionIndices.forEach(function(compIdx) {
                var comp = components[compIdx];
                var regionDiv = createBlockRegionItem(comp, compIdx, edge);
                list.appendChild(regionDiv);
            });
        }
    });
}

function createBlockRegionItem(comp, compIdx, block) {
    var div = document.createElement('div');
    div.className = 'block-region-item';

    var labelMap = {
        'textregion': 'Text Region',
        'imageregion': 'Image',
        'qrcoderegion': 'QR Code',
        'barcoderegion': 'Barcode'
    };
    var labelText = labelMap[comp.type] || comp.type;

    var eyeBtn = document.createElement('button');
    eyeBtn.className = 'icon-btn';
    eyeBtn.textContent = comp.visible ? '👁' : '-';
    eyeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleVisibility(compIdx);
        renderEdgeList();
    });

    var lockBtn = document.createElement('button');
    lockBtn.className = 'icon-btn';
    lockBtn.textContent = comp.locked ? '🔒' : '🔓';
    lockBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleLock(compIdx);
        renderEdgeList();
    });

    var label = document.createElement('span');
    label.className = 'block-region-label';
    label.textContent = labelText;
    label.addEventListener('dblclick', function(e) {
        e.stopPropagation();
        editContentRegion(compIdx);
    });

    div.appendChild(eyeBtn);
    div.appendChild(lockBtn);
    div.appendChild(label);

    // Delete button
    var delBtn = document.createElement('button');
    delBtn.className = 'icon-btn block-region-delete';
    delBtn.textContent = '✕';
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (confirm('Delete this ' + labelText + '?')) {
            components.splice(compIdx, 1);
            captureState();
            selectedSet = [];
            selectedIdx = -1;
            renderCanvas();
            renderEdgeList();
            renderComponentList();
            renderPropertiesPanel();
        }
    });
    div.appendChild(delBtn);

    // Click to select/highlight on canvas
    div.addEventListener('click', function() {
        selectedSet = [compIdx];
        selectedIdx = compIdx;
        renderCanvas();
        renderEdgeList();
        renderPropertiesPanel();
    });
    if (selectedSet.indexOf(compIdx) !== -1) {
        div.classList.add('selected');
    }

    // Toggle buttons row (lock + variable)
    var toggleRow = document.createElement('div');
    toggleRow.className = 'block-region-toggles';

    var lockToggle = document.createElement('button');
    lockToggle.className = 'toggle-btn' + (comp.locked ? ' active' : '');
    lockToggle.textContent = comp.locked ? '🔒 Locked' : '🔓 Lock';
    lockToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleLock(compIdx);
        renderEdgeList();
    });

    var varToggle = document.createElement('button');
    varToggle.className = 'toggle-btn' + (comp.isVariable ? ' active' : '');
    varToggle.textContent = comp.isVariable ? '⚡ Variable' : '○ Variable';
    varToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        comp.isVariable = !comp.isVariable;
        captureState();
        renderEdgeList();
        renderCanvas();
    });

    toggleRow.appendChild(lockToggle);
    toggleRow.appendChild(varToggle);
    div.appendChild(toggleRow);

    // Arrow buttons for moving within block (only if not locked)
    if (!comp.locked) {
        var arrows = document.createElement('span');
        arrows.className = 'block-region-arrows';
        ['←', '→', '↑', '↓'].forEach(function(arrow) {
            var dirMap = { '←': 'left', '→': 'right', '↑': 'up', '↓': 'down' };
            var btn = document.createElement('button');
            btn.className = 'block-region-arrow-btn';
            btn.textContent = arrow;
            btn.title = 'Move ' + dirMap[arrow];
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                moveRegionInBlock(compIdx, dirMap[arrow]);
            });
            arrows.appendChild(btn);
        });
        div.appendChild(arrows);
    }

    return div;
}

function moveRegionInBlock(compIdx, direction) {
    if (!state) return;
    var comp = components[compIdx];
    if (!comp || !comp.snappedEdgeId) return;

    var block = null;
    for (var i = 0; i < state.edges.length; i++) {
        if (state.edges[i].id === comp.snappedEdgeId) { block = state.edges[i]; break; }
    }
    if (!block) return;

    var step = 1; // 1mm
    var nx = comp.x, ny = comp.y;
    if (direction === 'left') nx -= step;
    else if (direction === 'right') nx += step;
    else if (direction === 'up') ny -= step;
    else if (direction === 'down') ny += step;

    // Clamp to block boundaries
    comp.x = Math.max(block.x, Math.min(block.x + block.w - comp.w, nx));
    comp.y = Math.max(block.y, Math.min(block.y + block.h - comp.h, ny));

    renderCanvas();
    renderEdgeList();
}

function confirmEdge(edgeId) {
    if (!state) return;
    state.edges.forEach(function(e) {
        if (e.id === edgeId) e.confirmed = true;
    });
    renderEdgeList();
    renderCanvas();
}

function editEdge(edgeId) {
    if (!state) return;
    state.edges.forEach(function(e) {
        if (e.id === edgeId) e.confirmed = false;
    });
    renderEdgeList();
    renderCanvas();
}

function deleteEdge(edgeId) {
    if (!state) return;
    state.edges = state.edges.filter(function(e) { return e.id !== edgeId; });
    renderEdgeList();
    renderCanvas();
}

// ============================================================
// Edge Resize Handles
// ============================================================

function getEdgeHandles(edge) {
    return [
        { x: edge.x,             y: edge.y,             type: 'tl' },
        { x: edge.x + edge.w / 2, y: edge.y,             type: 't'  },
        { x: edge.x + edge.w,    y: edge.y,             type: 'tr' },
        { x: edge.x + edge.w,    y: edge.y + edge.h / 2, type: 'r'  },
        { x: edge.x + edge.w,    y: edge.y + edge.h,    type: 'br' },
        { x: edge.x + edge.w / 2, y: edge.y + edge.h,    type: 'b'  },
        { x: edge.x,             y: edge.y + edge.h,    type: 'bl' },
        { x: edge.x,             y: edge.y + edge.h / 2, type: 'l'  }
    ];
}

function hitTestEdgeHandle(x, y) {
    if (!state) return null;
    var hitSize = 2.5 / (pan.zoom || 1);
    for (var i = 0; i < state.edges.length; i++) {
        var edge = state.edges[i];
        if (edge.confirmed) continue;
        var handles = getEdgeHandles(edge);
        for (var j = 0; j < handles.length; j++) {
            var h = handles[j];
            if (Math.abs(x - h.x) <= hitSize && Math.abs(y - h.y) <= hitSize) {
                return { edgeId: edge.id, handle: h.type, edgeIndex: i };
            }
        }
    }
    return null;
}

function resizeEdgeByHandle(edge, handle, x, y) {
    var minSize = 2;
    var nx = edge.x, ny = edge.y, nw = edge.w, nh = edge.h;

    if (handle === 'tl') {
        nw = edge.x + edge.w - x; nh = edge.y + edge.h - y;
        nx = x; ny = y;
    } else if (handle === 't') {
        nh = edge.y + edge.h - y; ny = y;
    } else if (handle === 'tr') {
        nw = x - edge.x; nh = edge.y + edge.h - y; ny = y;
    } else if (handle === 'r') {
        nw = x - edge.x;
    } else if (handle === 'br') {
        nw = x - edge.x; nh = y - edge.y;
    } else if (handle === 'b') {
        nh = y - edge.y;
    } else if (handle === 'bl') {
        nw = edge.x + edge.w - x; nh = y - edge.y; nx = x;
    } else if (handle === 'l') {
        nw = edge.x + edge.w - x; nx = x;
    }

    if (nw < minSize) { nw = minSize; if (handle.indexOf('l') !== -1) nx = edge.x + edge.w - minSize; }
    if (nh < minSize) { nh = minSize; if (handle.indexOf('t') !== -1) ny = edge.y + edge.h - minSize; }

    edge.x = nx; edge.y = ny; edge.w = nw; edge.h = nh;
}

function snapToEdgeIndicator(x, y) {
    if (!state || !state.edges.length) return null;
    for (var i = 0; i < state.edges.length; i++) {
        var edge = state.edges[i];
        if (x >= edge.x && x <= edge.x + edge.w && y >= edge.y && y <= edge.y + edge.h) {
            return edge;
        }
    }
    return null;
}

function toggleContentMode() {
    if (!state) return;
    if (state.edgeMode) {
        toggleEdgeMode();
    }
    state.contentMode = !state.contentMode;
    var btn = _el('btn-add-content');
    var panel = _el('content-type-panel');
    if (state.contentMode) {
        if (btn) btn.classList.add('btn-active');
    } else {
        if (btn) btn.classList.remove('btn-active');
        if (panel) panel.style.display = 'none';
        state.contentSelectedBlock = null;
        state.contentRegionMode = false;
        state.contentRegionDraw = null;
        state.contentRegionBlock = null;
        state.pendingContentRegion = null;
        state.pendingContentType = null;
        canvas.style.cursor = 'default';
    }
    renderCanvas();
}

function editContentRegion(compIdx) {
    if (!state) return;
    var comp = components[compIdx];
    if (!comp) return;

    // Map component type to content type value
    var typeMap = {
        'textregion': 'text',
        'imageregion': 'image',
        'qrcoderegion': 'qrcode',
        'barcoderegion': 'barcode'
    };
    var contentType = typeMap[comp.type];
    if (!contentType) return;

    // Set pending region from existing component
    state.pendingContentRegion = {
        x: comp.x, y: comp.y, w: comp.w, h: comp.h,
        snappedEdgeId: comp.snappedEdgeId || null
    };
    state.pendingContentType = contentType;
    state.editingComponentIdx = compIdx;

    // Show content type panel and select the type
    showContentTypePanel();
    var typeSelect = _el('ct-type-select');
    if (typeSelect) {
        typeSelect.value = contentType;
        onContentTypeChange();
    }

    // Pre-fill form fields based on type
    if (contentType === 'text') {
        var tv = _el('ct-text-value'); if (tv) tv.value = comp.content || '';
        var fs = _el('ct-font-size'); if (fs) fs.value = comp.fontSize || 12;
        var cc = _el('ct-color'); if (cc) cc.value = comp.color || '#000000';
        var ls = _el('ct-letter-spacing'); if (ls) ls.value = comp.letterSpacing || 0;
        var bb = _el('ct-bold-btn');
        if (bb) { if (comp.bold) bb.classList.add('active'); else bb.classList.remove('active'); }
        var ib = _el('ct-italic-btn');
        if (ib) { if (comp.italic) ib.classList.add('active'); else ib.classList.remove('active'); }

        // Set alignment buttons
        var ah = _el('ct-align-h');
        if (ah) {
            ah.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
            var hBtn = ah.querySelector('[data-val="' + (comp.alignH || 'left') + '"]');
            if (hBtn) hBtn.classList.add('active');
        }
        var av = _el('ct-align-v');
        if (av) {
            av.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
            var vBtn = av.querySelector('[data-val="' + (comp.alignV || 'top') + '"]');
            if (vBtn) vBtn.classList.add('active');
        }

        // Pre-select font (after dropdown is populated)
        if (comp.fontId) {
            var fontSelect = _el('ct-font-select');
            if (fontSelect) {
                // Try to select immediately, or wait for populate
                var trySelect = function() {
                    for (var j = 0; j < fontSelect.options.length; j++) {
                        if (fontSelect.options[j].value == comp.fontId) {
                            fontSelect.selectedIndex = j;
                            return true;
                        }
                    }
                    return false;
                };
                if (!trySelect()) {
                    // Font dropdown may still be loading, retry after short delay
                    setTimeout(trySelect, 300);
                }
            }
        }
    } else if (contentType === 'image') {
        var iu = _el('ct-image-url'); if (iu) iu.value = comp.imageUrl || '';
        var imf = _el('ct-image-fit'); if (imf) imf.value = comp.imageFit || 'contain';
    } else if (contentType === 'qrcode') {
        var qd = _el('ct-qr-data'); if (qd) qd.value = comp.qrData || '';
    } else if (contentType === 'barcode') {
        var bd = _el('ct-barcode-data'); if (bd) bd.value = comp.barcodeData || '';
        var bf = _el('ct-barcode-format'); if (bf) bf.value = comp.barcodeFormat || 'code128';
    }

    renderCanvas();
}

function populateContentFontDropdown() {
    var fontSelect = _el('ct-font-select');
    if (!fontSelect) return;
    fontSelect.innerHTML = '<option value="">Select a font...</option>';
    var url = '/font/list';
    if (state && state.currentCustomerId) {
        url = '/font/list/' + state.currentCustomerId;
    }
    fetch(url)
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.success && data.fonts) {
                data.fonts.forEach(function(f) {
                    var opt = document.createElement('option');
                    opt.value = f.id;
                    opt.textContent = f.font_name;
                    opt.dataset.fontName = f.font_name;
                    fontSelect.appendChild(opt);
                });
            }
        });
}

function resetContentForms() {
    var el = function(id) { return _el(id); };
    var fs = el('ct-font-size'); if (fs) fs.value = 12;
    var tc = el('ct-color'); if (tc) tc.value = '#000000';
    var ls = el('ct-letter-spacing'); if (ls) ls.value = 0;
    var bb = el('ct-bold-btn'); if (bb) bb.classList.remove('active');
    var ib = el('ct-italic-btn'); if (ib) ib.classList.remove('active');
    var tv = el('ct-text-value'); if (tv) tv.value = '';
    var iu = el('ct-image-url'); if (iu) iu.value = '';
    var imf = el('ct-image-fit'); if (imf) imf.value = 'contain';
    var qd = el('ct-qr-data'); if (qd) qd.value = '';
    var bd = el('ct-barcode-data'); if (bd) bd.value = '';
    var bf = el('ct-barcode-format'); if (bf) bf.value = 'code128';
    var ts = el('ct-type-select'); if (ts) ts.value = '';
    resetAlignmentButtons();
}

function cancelContentSettings() {
    if (state) {
        state.pendingContentRegion = null;
        state.pendingContentType = null;
        state.previewDragState = { active: false, startX: 0, startY: 0 };
        state.editingComponentIdx = -1;
    }
    hideContentTypePanel();
    renderCanvas();
}

function showContentTypePanel() {
    var panel = _el('content-type-panel');
    if (panel) panel.style.display = '';
    resetContentForms();
    var picker = _el('content-type-picker');
    if (picker) picker.style.display = '';
    var forms = document.querySelectorAll('.ct-form');
    forms.forEach(function(f) { f.style.display = 'none'; });
    var buttons = _el('ct-buttons');
    if (buttons) buttons.style.display = 'none';
}

function hideContentTypePanel() {
    var panel = _el('content-type-panel');
    if (panel) panel.style.display = 'none';
}

function onContentTypeChange() {
    var typeSelect = _el('ct-type-select');
    var selectedType = typeSelect ? typeSelect.value : '';
    var forms = document.querySelectorAll('.ct-form');
    forms.forEach(function(f) { f.style.display = 'none'; });
    var buttons = _el('ct-buttons');
    if (!selectedType) {
        if (buttons) buttons.style.display = 'none';
        if (state) state.pendingContentType = null;
        return;
    }
    if (state) state.pendingContentType = selectedType;
    var formId = 'ct-form-' + selectedType;
    var form = _el(formId);
    if (form) form.style.display = '';
    if (buttons) buttons.style.display = '';
    if (selectedType === 'text') {
        populateContentFontDropdown();
    }
}

function getBlockForPendingRegion() {
    if (!state || !state.pendingContentRegion || !state.pendingContentRegion.snappedEdgeId) return null;
    var id = state.pendingContentRegion.snappedEdgeId;
    for (var i = 0; i < state.edges.length; i++) {
        if (state.edges[i].id === id) return state.edges[i];
    }
    return null;
}

function buildPreviewComponent() {
    if (!state || !state.pendingContentRegion || state.pendingContentType !== 'text') return null;
    var region = state.pendingContentRegion;
    var fontSelect = _el('ct-font-select');
    var selectedOpt = fontSelect ? fontSelect.options[fontSelect.selectedIndex] : null;
    var fontName = selectedOpt ? selectedOpt.dataset.fontName || '' : '';
    var fontId = fontSelect ? fontSelect.value : '';
    var fontSize = parseFloat((_el('ct-font-size') || {}).value) || 12;
    var bold = _el('ct-bold-btn') ? _el('ct-bold-btn').classList.contains('active') : false;
    var italic = _el('ct-italic-btn') ? _el('ct-italic-btn').classList.contains('active') : false;
    var color = (_el('ct-color') || {}).value || '#000000';
    var letterSpacing = parseFloat((_el('ct-letter-spacing') || {}).value) || 0;
    var alignH = 'left';
    var alignHBtns = _el('ct-align-h');
    if (alignHBtns) { var a = alignHBtns.querySelector('.active'); if (a) alignH = a.dataset.val; }
    var alignV = 'top';
    var alignVBtns = _el('ct-align-v');
    if (alignVBtns) { var a = alignVBtns.querySelector('.active'); if (a) alignV = a.dataset.val; }
    return {
        type: 'textregion',
        x: region.x, y: region.y, w: region.w, h: region.h,
        snappedEdgeId: region.snappedEdgeId || null,
        fontFamily: fontName, fontId: fontId ? parseInt(fontId) : null,
        fontSize: fontSize, bold: bold, italic: italic,
        color: color, letterSpacing: letterSpacing,
        alignH: alignH, alignV: alignV,
        content: (_el('ct-text-value') || {}).value || '',
        visible: true, locked: false, groupId: null
    };
}

function applyContentSettings() {
    if (!state || !state.pendingContentRegion || !state.pendingContentType) return;

    var region = state.pendingContentRegion;
    var type = state.pendingContentType;
    var comp = null;

    if (type === 'text') {
        comp = buildPreviewComponent();
        if (comp && comp.fontId && comp.fontFamily) {
            loadFontForCanvas(comp.fontId, comp.fontFamily);
        }
    } else if (type === 'image') {
        comp = {
            type: 'imageregion',
            x: region.x, y: region.y, w: region.w, h: region.h,
            snappedEdgeId: region.snappedEdgeId || null,
            imageUrl: (_el('ct-image-url') || {}).value || '',
            imageFit: (_el('ct-image-fit') || {}).value || 'contain',
            content: (_el('ct-image-url') || {}).value || '', visible: true, locked: false, groupId: null
        };
    } else if (type === 'qrcode') {
        comp = {
            type: 'qrcoderegion',
            x: region.x, y: region.y, w: region.w, h: region.h,
            snappedEdgeId: region.snappedEdgeId || null,
            qrData: (_el('ct-qr-data') || {}).value || '',
            content: (_el('ct-qr-data') || {}).value || '', visible: true, locked: false, groupId: null
        };
    } else if (type === 'barcode') {
        comp = {
            type: 'barcoderegion',
            x: region.x, y: region.y, w: region.w, h: region.h,
            snappedEdgeId: region.snappedEdgeId || null,
            barcodeData: (_el('ct-barcode-data') || {}).value || '',
            barcodeFormat: (_el('ct-barcode-format') || {}).value || 'code128',
            content: (_el('ct-barcode-data') || {}).value || '', visible: true, locked: false, groupId: null
        };
    }

    if (!comp) return;

    // Edit mode: update existing component instead of creating new
    if (state.editingComponentIdx >= 0 && state.editingComponentIdx < components.length) {
        var editIdx = state.editingComponentIdx;
        // Preserve locked/visible/groupId from original
        comp.locked = components[editIdx].locked;
        comp.visible = components[editIdx].visible;
        comp.groupId = components[editIdx].groupId;
        components[editIdx] = comp;
        captureState();

        state.pendingContentRegion = null;
        state.pendingContentType = null;
        state.previewDragState = { active: false, startX: 0, startY: 0 };
        state.editingComponentIdx = -1;
        hideContentTypePanel();

        selectedSet = [editIdx];
        selectedIdx = editIdx;
        renderCanvas();
        renderComponentList();
        renderEdgeList();
        renderPropertiesPanel();
        updateActionButtons();
        return;
    }

    components.push(comp);
    captureState();

    state.pendingContentRegion = null;
    state.pendingContentType = null;
    state.previewDragState = { active: false, startX: 0, startY: 0 };
    state.editingComponentIdx = -1;
    hideContentTypePanel();

    renderCanvas();
    renderComponentList();
    renderEdgeList();
    updateActionButtons();

    selectedSet = [components.length - 1];
    selectedIdx = components.length - 1;
    renderCanvas();
    renderPropertiesPanel();
}

async function loadFontForCanvas(fontId, fontName) {
    try {
        var fontFace = new FontFace(fontName, 'url(/font/download/' + fontId + ')');
        await fontFace.load();
        document.fonts.add(fontFace);
        renderCanvas();
    } catch (err) {
        console.error('Error loading font for canvas:', err);
    }
}

function setupAlignmentButtons() {
    var tabPane = canvas ? canvas.closest('.tab-pane') : document;
    ['ct-align-h', 'ct-align-v'].forEach(function(id) {
        var container = tabPane.querySelector('#' + id);
        if (!container || container._alignSetup) return;
        container._alignSetup = true;
        container.addEventListener('click', function(e) {
            var btn = e.target.closest('button');
            if (!btn) return;
            container.querySelectorAll('button').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
        });
    });
}

function resetAlignmentButtons() {
    var tabPane = canvas ? canvas.closest('.tab-pane') : document;
    ['ct-align-h', 'ct-align-v'].forEach(function(id) {
        var container = tabPane.querySelector('#' + id);
        if (!container) return;
        container.querySelectorAll('button').forEach(function(b, i) {
            if (i === 0) b.classList.add('active');
            else b.classList.remove('active');
        });
    });
}

// ============================================================
// Draw Text Region on Canvas
// ============================================================

function drawTextRegion(comp, idx) {
    if (!comp.visible) {
        ctx.globalAlpha = 0.15;
    }

    var x = comp.x * scale;
    var y = comp.y * scale;
    var w = comp.w * scale;
    var h = comp.h * scale;

    // Draw region rectangle — 2nd level green box
    ctx.fillStyle = 'rgba(0, 200, 0, 0.05)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#00cc00';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    // Draw text content if any
    if (comp.content && comp.fontFamily) {
        var fontSizePx = comp.fontSize * scale / 2.835;
        var fontStyle = '';
        if (comp.italic) fontStyle += 'italic ';
        if (comp.bold) fontStyle += 'bold ';
        fontStyle += fontSizePx + 'px ';
        fontStyle += "'" + comp.fontFamily + "', sans-serif";
        ctx.font = fontStyle;
        ctx.fillStyle = comp.color || '#000000';

        if (comp.alignH === 'center') ctx.textAlign = 'center';
        else if (comp.alignH === 'right') ctx.textAlign = 'right';
        else ctx.textAlign = 'left';

        ctx.textBaseline = 'top';

        var tx = x;
        if (comp.alignH === 'center') tx = x + w / 2;
        else if (comp.alignH === 'right') tx = x + w;

        var lines = comp.content.split('\n');
        var lineHeight = fontSizePx * 1.2;
        var totalTextH = lines.length * lineHeight;

        var startY = y;
        if (comp.alignV === 'center') startY = y + (h - totalTextH) / 2;
        else if (comp.alignV === 'bottom') startY = y + h - totalTextH;

        // Clip text to region
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();

        for (var li = 0; li < lines.length; li++) {
            ctx.fillText(lines[li], tx, startY + li * lineHeight);
        }
        ctx.restore();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
    }

    // Draw label in green
    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#00cc00';
    ctx.fillText('Text Region', x + 2, y - 3);

    // Selection highlight (stays blue for contrast)
    if (selectedSet.indexOf(idx) !== -1) {
        ctx.strokeStyle = '#0066ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);

        // Draw resize handles (8 points)
        var hs = 3;
        var handles = [
            { x: x, y: y }, { x: x + w / 2, y: y }, { x: x + w, y: y },
            { x: x, y: y + h / 2 }, { x: x + w, y: y + h / 2 },
            { x: x, y: y + h }, { x: x + w / 2, y: y + h }, { x: x + w, y: y + h }
        ];
        ctx.fillStyle = '#0066ff';
        handles.forEach(function(hp) {
            ctx.fillRect(hp.x - hs, hp.y - hs, hs * 2, hs * 2);
        });
    }

    ctx.globalAlpha = 1;
}

function drawImageRegion(comp, idx) {
    if (!comp.visible) ctx.globalAlpha = 0.15;
    var x = comp.x * scale, y = comp.y * scale;
    var w = comp.w * scale, h = comp.h * scale;

    ctx.fillStyle = 'rgba(0, 200, 0, 0.05)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#00cc00';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    // Placeholder X-cross
    ctx.strokeStyle = 'rgba(0, 200, 0, 0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
    ctx.moveTo(x + w, y); ctx.lineTo(x, y + h);
    ctx.stroke();

    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#00cc00';
    ctx.fillText('Image', x + 2, y - 3);

    if (selectedSet.indexOf(idx) !== -1) {
        ctx.strokeStyle = '#0066ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
    ctx.globalAlpha = 1;
}

function drawQrCodeRegion(comp, idx) {
    if (!comp.visible) ctx.globalAlpha = 0.15;
    var x = comp.x * scale, y = comp.y * scale;
    var w = comp.w * scale, h = comp.h * scale;

    ctx.fillStyle = 'rgba(0, 200, 0, 0.05)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#00cc00';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    // Placeholder grid pattern
    ctx.fillStyle = 'rgba(0, 200, 0, 0.2)';
    var cellSize = Math.min(w, h) / 5;
    for (var r = 0; r < 5; r++) {
        for (var c = 0; c < 5; c++) {
            if ((r + c) % 2 === 0) {
                ctx.fillRect(x + c * cellSize, y + r * cellSize, cellSize, cellSize);
            }
        }
    }

    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#00cc00';
    ctx.fillText('QR Code', x + 2, y - 3);

    if (selectedSet.indexOf(idx) !== -1) {
        ctx.strokeStyle = '#0066ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
    ctx.globalAlpha = 1;
}

function drawBarcodeRegion(comp, idx) {
    if (!comp.visible) ctx.globalAlpha = 0.15;
    var x = comp.x * scale, y = comp.y * scale;
    var w = comp.w * scale, h = comp.h * scale;

    ctx.fillStyle = 'rgba(0, 200, 0, 0.05)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#00cc00';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    // Placeholder vertical bars
    ctx.fillStyle = 'rgba(0, 200, 0, 0.25)';
    var barW = Math.max(1, w / 20);
    for (var i = 0; i < 10; i++) {
        var bx = x + (i * 2) * barW;
        ctx.fillRect(bx, y + 2, barW, h - 4);
    }

    ctx.font = '9px sans-serif';
    ctx.fillStyle = '#00cc00';
    ctx.fillText('Barcode', x + 2, y - 3);

    if (selectedSet.indexOf(idx) !== -1) {
        ctx.strokeStyle = '#0066ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }
    ctx.globalAlpha = 1;
}