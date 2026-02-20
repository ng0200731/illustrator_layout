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
            maxHistorySize: 50
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

    renderCanvas();

    // Check if we should load a layout from data attribute
    console.log('Tab pane found:', tabPane);
    const layoutId = tabPane.getAttribute('data-layout-id');
    console.log('Layout ID from data attribute:', layoutId);
    if (layoutId && layoutId.trim() !== '') {
        console.log('Loading layout:', layoutId);
        loadLayoutFromDatabase(layoutId);
    } else {
        console.log('No layout ID to load');
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
        if (comp.type === 'pdfpath') {
            drawPdfPath(comp, idx);
        } else if (comp.type === 'text') {
            drawText(comp, idx);
        }
    });

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

function renderComponentList() {
    var list = _el('component-list');
    list.innerHTML = '';

    _el('component-count').textContent = '(' + components.length + ' items)';

    if (components.length === 0) {
        list.innerHTML = '<div class="empty-message">No PDF loaded</div>';
        return;
    }

    // Group components by groupId
    var groups = {};
    var ungrouped = [];

    components.forEach(function(comp, idx) {
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
        eyeBtn.textContent = allVisible ? '👁' : '👁‍🗨';
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
        label.textContent = 'Group (' + groupItems.length + ' items)';

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
    eyeBtn.textContent = comp.visible ? '👁' : '👁‍🗨';
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
    label.textContent = comp.type === 'text' ? 'Text: "' + comp.content.substring(0, 20) + '"' : 'Path ' + (idx + 1);

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
    });

    dragState.startX = x;
    dragState.startY = y;

    renderCanvas();
}

function onCanvasMouseUp(e) {
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
    if (pan.spaceDown) {
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

    // Merge paths by color and proximity
    var mergedPaths = mergePathsByColorAndProximity(selectedSet);

    // Assign group ID to merged paths
    var groupId = 'grp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    mergedPaths.forEach(function(path) {
        path.groupId = groupId;
    });

    // Remove original paths (in reverse order to maintain indices)
    var sortedIndices = selectedSet.slice().sort(function(a, b) { return b - a; });
    sortedIndices.forEach(function(idx) {
        components.splice(idx, 1);
    });

    // Add merged paths
    components = components.concat(mergedPaths);

    // Update selection to point to new merged paths
    selectedSet = [];
    var startIdx = components.length - mergedPaths.length;
    for (var i = 0; i < mergedPaths.length; i++) {
        selectedSet.push(startIdx + i);
    }
    selectedIdx = selectedSet.length === 1 ? selectedSet[0] : -1;

    renderCanvas();
    renderComponentList();
    renderPropertiesPanel();
    renderColorPalette();

    // Capture state after grouping is complete
    captureState();
}

function ungroupSelected() {
    captureState();
    selectedSet.forEach(function(idx) {
        components[idx].groupId = null;
    });

    renderComponentList();
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
                fontSize: c.fontSize,
                pathData: c.pathData,
                visible: c.visible,
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

// Save layout to database
function saveLayoutToDatabase() {
    // Show modal and load customers
    const modal = _el('save-layout-modal');
    const customerSelect = _el('layout-customer');
    const nameInput = _el('layout-name');

    // Clear previous values
    customerSelect.innerHTML = '<option value="">Loading customers...</option>';
    nameInput.value = '';

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
                scale: scale
            },
            customer_id: customerId
        };

        fetch('/layout/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(layoutData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showLayoutMessage('Layout saved successfully! ID: ' + data.id, 'success');
                closeSaveModal();
            } else {
                showLayoutMessage('Error saving layout: ' + data.error, 'error');
            }
        })
        .catch(error => {
            showLayoutMessage('Error saving layout: ' + error, 'error');
        });
    };
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

                console.log('Layout data loaded:', layoutData);

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
                updateActionButtons();

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
