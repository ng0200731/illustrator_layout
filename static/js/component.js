// Global state
var components = [];
var selectedIdx = -1;
var selectedSet = [];
var canvas = null;
var ctx = null;
var scale = 1;
var pdfWidth = 0;
var pdfHeight = 0;
var pan = { x: 0, y: 0, zoom: 1, dragging: false, startX: 0, startY: 0, spaceDown: false };
var dragState = { active: false, startX: 0, startY: 0, componentIdx: -1 };

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    init();
});

function init() {
    console.log('Initializing app...');
    console.log('PDF.js available:', typeof pdfjsLib !== 'undefined');

    canvas = document.getElementById('canvas');
    ctx = canvas.getContext('2d');

    setupDragDrop();
    setupFileInput();
    setupButtons();
    setupCanvasInteraction();

    renderCanvas();
    console.log('Initialization complete');
}

function setupDragDrop() {
    var container = document.getElementById('canvas-container');

    container.addEventListener('dragover', function(e) {
        e.preventDefault();
        container.classList.add('drag-over');
    });

    container.addEventListener('dragleave', function(e) {
        e.preventDefault();
        container.classList.remove('drag-over');
    });

    container.addEventListener('drop', function(e) {
        e.preventDefault();
        container.classList.remove('drag-over');

        console.log('Drop event triggered');

        if (e.dataTransfer.files && e.dataTransfer.files.length) {
            var file = e.dataTransfer.files[0];
            console.log('File dropped:', file.name, file.type);
            if (file.name.toLowerCase().endsWith('.pdf')) {
                console.log('Starting PDF parse...');
                parsePdfFile(file);
            } else {
                console.log('Not a PDF file');
            }
        }
    });
}

function setupFileInput() {
    var fileInput = document.getElementById('file-input');
    var chooseBtn = document.getElementById('btn-choose-file');

    chooseBtn.addEventListener('click', function() {
        fileInput.click();
    });

    fileInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length) {
            parsePdfFile(e.target.files[0]);
        }
    });
}

function setupButtons() {
    document.getElementById('btn-save').addEventListener('click', saveComponents);
    document.getElementById('btn-group').addEventListener('click', groupSelected);
    document.getElementById('btn-ungroup').addEventListener('click', ungroupSelected);
    document.getElementById('btn-delete').addEventListener('click', deleteSelected);
    document.getElementById('btn-export-pdf').addEventListener('click', function() { exportFile('pdf'); });
    document.getElementById('btn-export-ai-editable').addEventListener('click', function() { exportFile('ai', false); });
    document.getElementById('btn-export-ai-outlined').addEventListener('click', function() { exportFile('ai', true); });
    document.getElementById('btn-fit').addEventListener('click', fitCanvas);
}

function setupCanvasInteraction() {
    canvas.addEventListener('mousedown', onCanvasMouseDown);
    canvas.addEventListener('wheel', onCanvasWheel);
    document.addEventListener('mousemove', onCanvasMouseMove);
    document.addEventListener('mouseup', onCanvasMouseUp);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
}

function parsePdfFile(file) {
    console.log('parsePdfFile called with:', file.name);
    var reader = new FileReader();

    reader.onload = function(e) {
        console.log('FileReader loaded, size:', e.target.result.byteLength);
        var data = new Uint8Array(e.target.result);

        console.log('Loading PDF with PDF.js...');
        pdfjsLib.getDocument({ data: data }).promise.then(function(pdf) {
            console.log('PDF loaded successfully, pages:', pdf.numPages);
            pdf.getPage(1).then(function(page) {
                console.log('Got page 1');
                var viewport = page.getViewport({ scale: 1.0 });

                // Convert PDF points to mm (72 points = 25.4mm)
                pdfWidth = viewport.width / 72 * 25.4;
                pdfHeight = viewport.height / 72 * 25.4;
                console.log('PDF dimensions:', pdfWidth, 'x', pdfHeight, 'mm');

                // Extract vector paths and text
                Promise.all([
                    extractPdfObjects(page, pdfWidth, pdfHeight),
                    extractTextContent(page, pdfHeight)
                ]).then(function(results) {
                    var paths = results[0];
                    var texts = results[1];
                    console.log('Extracted paths:', paths.length, 'texts:', texts.length);

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
                    document.getElementById('empty-state').style.display = 'none';

                    // Enable export buttons
                    document.getElementById('btn-export-pdf').disabled = false;
                    document.getElementById('btn-export-ai-editable').disabled = false;
                    document.getElementById('btn-export-ai-outlined').disabled = false;

                    console.log('Total components:', components.length);
                    renderCanvas();
                    renderComponentList();
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
        console.log('Operator list length:', opList.fnArray.length);

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

        // Log first 20 operators to see what we're dealing with
        console.log('First 20 operators:');
        for (var i = 0; i < Math.min(20, opList.fnArray.length); i++) {
            var opName = Object.keys(OPS).find(key => OPS[key] === opList.fnArray[i]);
            console.log(i + ':', opName, opList.argsArray[i]);
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
                if (i < 50) console.log('setFillRGBColor:', [args[0], args[1], args[2]], '-> normalized:', currentState.fill);
            } else if (fn === OPS.setStrokeRGBColor) {
                currentState.stroke = normalizeColor([args[0], args[1], args[2]]);
                if (i < 50) console.log('setStrokeRGBColor:', [args[0], args[1], args[2]], '-> normalized:', currentState.stroke);
            } else if (fn === OPS.setFillCMYKColor) {
                // Convert CMYK to RGB
                var c = args[0], m = args[1], y = args[2], k = args[3];
                currentState.fill = [
                    (1 - c) * (1 - k),
                    (1 - m) * (1 - k),
                    (1 - y) * (1 - k)
                ];
                if (i < 50) console.log('setFillCMYKColor:', [args[0], args[1], args[2], args[3]], '-> RGB:', currentState.fill);
            } else if (fn === OPS.setStrokeCMYKColor) {
                // Convert CMYK to RGB
                var c = args[0], m = args[1], y = args[2], k = args[3];
                currentState.stroke = [
                    (1 - c) * (1 - k),
                    (1 - m) * (1 - k),
                    (1 - y) * (1 - k)
                ];
                if (i < 50) console.log('setStrokeCMYKColor:', [args[0], args[1], args[2], args[3]], '-> RGB:', currentState.stroke);
            } else if (fn === OPS.setFillGray) {
                var gray = args[0];
                currentState.fill = [gray, gray, gray];
                if (i < 50) console.log('setFillGray:', [args[0]]);
            } else if (fn === OPS.setStrokeGray) {
                var gray = args[0];
                currentState.stroke = [gray, gray, gray];
                if (i < 50) console.log('setStrokeGray:', [args[0]]);
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
        console.log('Text items found:', textContent.items.length);
        var texts = [];

        textContent.items.forEach(function(item, idx) {
            if (idx < 5) {
                console.log('Text item', idx, ':', item.str, item);
            }

            // Filter readable text
            var readable = item.str.replace(/[\x00-\x1f\ufffd]/g, '');
            var printable = readable.replace(/[^\x20-\x7e\u00a0-\u024f\u0400-\u04ff\u4e00-\u9fff\u3000-\u30ff\uac00-\ud7af]/g, '');

            if (printable.length < readable.length * 0.5 || printable.trim().length === 0) {
                if (idx < 5) console.log('  -> Filtered out (not readable)');
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

            if (texts.length <= 5) {
                console.log('  -> Added text:', printable);
            }
        });

        console.log('Total texts extracted:', texts.length);
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

function renderCanvas() {
    if (!canvas || !ctx) return;

    var container = document.getElementById('canvas-container');
    var containerW = container.clientWidth;
    var containerH = container.clientHeight;

    if (pdfWidth > 0 && pdfHeight > 0) {
        scale = Math.min(containerW / pdfWidth, containerH / pdfHeight, 6) * pan.zoom;

        canvas.width = pdfWidth * scale;
        canvas.height = pdfHeight * scale;

        canvas.style.left = pan.x + 'px';
        canvas.style.top = pan.y + 'px';
    } else {
        canvas.width = containerW;
        canvas.height = containerH;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (components.length === 0) return;

    // Draw components
    components.forEach(function(comp, idx) {
        if (comp.type === 'pdfpath') {
            drawPdfPath(comp, idx);
        } else if (comp.type === 'text') {
            drawText(comp, idx);
        }
    });
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

function renderComponentList() {
    var list = document.getElementById('component-list');
    list.innerHTML = '';

    document.getElementById('component-count').textContent = '(' + components.length + ' items)';

    if (components.length === 0) {
        list.innerHTML = '<div class="empty-message">No PDF loaded</div>';
        return;
    }

    components.forEach(function(comp, idx) {
        var item = document.createElement('div');
        item.className = 'component-item';
        if (idx === selectedIdx || selectedSet.indexOf(idx) !== -1) {
            item.classList.add('selected');
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

        list.appendChild(item);
    });

    updateActionButtons();
}

function selectComponent(idx) {
    selectedIdx = idx;
    selectedSet = [idx];
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
    components[idx].visible = !components[idx].visible;
    renderCanvas();
    renderComponentList();
}

function toggleLock(idx) {
    components[idx].locked = !components[idx].locked;
    renderComponentList();
}

function renderPropertiesPanel() {
    var panel = document.getElementById('properties-panel');
    var section = document.getElementById('properties-section');

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

    document.getElementById('btn-group').disabled = !canGroup;
    document.getElementById('btn-ungroup').disabled = !hasSelection;
    document.getElementById('btn-delete').disabled = !hasSelection;
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

            dragState.active = true;
            dragState.startX = x;
            dragState.startY = y;
            dragState.componentIdx = i;
            return;
        }
    }

    // Clicked on empty space
    selectedIdx = -1;
    selectedSet = [];
    renderCanvas();
    renderComponentList();
    renderPropertiesPanel();
}

function onCanvasMouseMove(e) {
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

function groupSelected() {
    if (selectedSet.length < 2) return;

    var groupId = 'grp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

    selectedSet.forEach(function(idx) {
        components[idx].groupId = groupId;
    });

    renderComponentList();
}

function ungroupSelected() {
    selectedSet.forEach(function(idx) {
        components[idx].groupId = null;
    });

    renderComponentList();
}

function deleteSelected() {
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
}

function fitCanvas() {
    pan.x = 0;
    pan.y = 0;
    pan.zoom = 1;
    document.getElementById('zoom-level').textContent = '100%';
    renderCanvas();
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

    if (type === 'ai') {
        data.outlined = outlined || false;
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
