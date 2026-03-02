# Product Requirements Document (PRD)

## Illustrator Layout Manager

**Version:** 1.0
**Date:** 2026-03-02
**Status:** In Production (Internal Tool)

---

## 1. Product Overview

**Illustrator Layout Manager** is an internal web application for managing print label production workflows. It allows operators to:

- Manage customers and their contact members
- Create and store label layout templates (from Adobe Illustrator JSON exports or PDF uploads)
- Build orders by combining layout templates with variable data
- Export production-ready files in **Adobe Illustrator (.ai)** and **PDF** formats

The system bridges the gap between design (Adobe Illustrator) and production, enabling repeatable, variable-data label printing without requiring designers for every order.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | **Flask** (Python 3.11), running on port 5001 |
| Database | **SQLite** (`database.db` at project root) |
| Frontend | **Jinja2** templates + vanilla JavaScript (no framework) |
| PDF/AI Generation | **ReportLab** (Python) for PDF-based `.ai` and `.pdf` files |
| Font Handling | **fontTools** for text-to-path (outlining) conversion |
| Excel I/O | **openpyxl** for template generation, dummy data, and upload parsing |
| Barcode/QR | **python-barcode**, **qrcode** libraries |
| UI Style | Black-and-white minimal design, no color accents |

---

## 3. Architecture

```
Flask App (app.py)
├── Blueprints
│   ├── customer_bp  (/customer/...)
│   ├── layout_bp    (/layout/...)
│   ├── font_bp      (/font/...)
│   └── order_bp     (/order/...)
├── Models (SQLite ORM-less, raw queries)
│   ├── Customer
│   ├── Member
│   ├── Layout
│   ├── Font
│   └── Order / OrderLine
├── Tools (Python scripts)
│   ├── export_ai.py      - .ai file generation
│   ├── export_pdf.py      - .pdf file generation
│   ├── flatten_tree.py    - Illustrator JSON tree → flat components
│   ├── fonttools_outline.py - Text → vector path conversion
│   └── excel_order.py     - Excel template/dummy/upload handling
└── Static Assets
    ├── css/ (base, customer, font, layout, order styles)
    └── js/  (navigation, component, customer, layout, font, order, pdf/json managers)
```

### UI Architecture
- **Single-page app shell** with sidebar navigation and tabbed content area
- Sidebar (20% width) contains collapsible menu tree
- Content area (80%) uses dynamically loaded iframes per tab
- Tab state persisted in `sessionStorage` across page reloads

---

## 4. Database Schema

### 4.1 `customers`
| Column | Type | Constraint |
|--------|------|-----------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| customer_id | TEXT | UNIQUE NOT NULL (format: `CUST-XXXXXXXX`) |
| company_name | TEXT | NOT NULL |
| email_domain | TEXT | NOT NULL |
| company_type | TEXT | |
| address | TEXT | |
| notes | TEXT | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### 4.2 `members`
| Column | Type | Constraint |
|--------|------|-----------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| member_id | TEXT | UNIQUE NOT NULL (format: `MEM-XXXXXXXX`) |
| customer_id | TEXT | FK → customers.customer_id, ON DELETE CASCADE |
| name | TEXT | |
| title | TEXT | |
| email | TEXT | |
| phone | TEXT | |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### 4.3 `layouts`
| Column | Type | Constraint |
|--------|------|-----------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| customer_id | TEXT | FK → customers.customer_id |
| name | TEXT | NOT NULL |
| type | TEXT | NOT NULL (`json` or `pdf`) |
| data | TEXT | JSON blob storing full layout definition |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### 4.4 `fonts`
| Column | Type | Constraint |
|--------|------|-----------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| font_name | TEXT | NOT NULL |
| filename | TEXT | NOT NULL |
| file_path | TEXT | NOT NULL |
| customer_id | TEXT | nullable (NULL = public/global font) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### 4.5 `orders`
| Column | Type | Constraint |
|--------|------|-----------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| order_id | TEXT | UNIQUE NOT NULL (format: `ORD-00001`) |
| customer_id | TEXT | FK → customers.customer_id |
| po_number | TEXT | NOT NULL |
| status | TEXT | DEFAULT `draft` (`draft` / `confirmed`) |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |
| updated_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

### 4.6 `order_lines`
| Column | Type | Constraint |
|--------|------|-----------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| order_id | TEXT | FK → orders.order_id |
| layout_id | INTEGER | FK → layouts.id |
| quantity | INTEGER | DEFAULT 1 |
| variable_values | TEXT | JSON mapping variable index → value |
| generated_data | TEXT | JSON blob with flattened export-ready data |
| created_at | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP |

---

## 5. Feature Modules

### 5.1 Customer Management

**Pages:**
- `/customer/create` — Create new customer form
- `/customer/view` — Customer list with expandable member sections

**Capabilities:**
- Create customer with company name, email domain, company type, address, notes
- Auto-generated customer ID (`CUST-XXXXXXXX`)
- View all customers in a table
- Add/edit/delete contact members per customer (name, title, email, phone)
- Auto-generated member ID (`MEM-XXXXXXXX`)
- Delete customer (cascades to members)

**API Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/customer/create` | Create customer |
| GET | `/customer/list` | List all customers (with member count) |
| GET | `/customer/<id>` | Get single customer + members |
| PUT | `/customer/<id>` | Update customer |
| DELETE | `/customer/<id>` | Delete customer |
| POST | `/customer/<id>/members` | Add member |
| GET | `/customer/<id>/members` | List members |
| PUT | `/customer/members/<id>` | Update member |
| DELETE | `/customer/members/<id>` | Delete member |

---

### 5.2 Layout Management

**Pages:**
- `/layout/create/draw` — Draw tool (placeholder/future)
- `/layout/create/json` — JSON layout editor with canvas preview
- `/layout/create/pdf` — PDF upload and layout extraction
- `/layout/view` — Layout list

**Layout Types:**

#### JSON Layout (`type: json`)
- Import Illustrator document tree via `export_to_json.jsx` (Adobe ExtendScript)
- Renders full vector document tree on HTML5 canvas
- Supports: paths, compound paths, text, groups, clipping masks
- Visual overlays system: add text regions, barcode regions, QR code regions on top of the base design
- Overlay properties: position (x,y), size (w,h), font, size, color, alignment (H+V), letter spacing, rotation
- Variable marking: any overlay can be flagged `isVariable` for per-order customization
- BoundsRects: named rectangular zones defining label repeat areas for multi-up layouts
- Duplicate detection: warns if same customer+name layout already exists

#### PDF Layout (`type: pdf`)
- Upload PDF files and extract page content
- Parse PDF structure into path/text components
- Same overlay and variable system as JSON layouts

**Data Structure (stored in `layouts.data` as JSON):**
```json
{
  "documentTree": [...],       // Illustrator layer/group/path hierarchy
  "overlays": [...],           // User-added text/barcode/QR regions
  "docWidth": 100,             // Document width in mm
  "docHeight": 50,             // Document height in mm
  "boundsRects": [...],        // Label repeat zones
  "boundsRectRotations": [...],// Per-zone rotation values
  "components": [...]          // Flattened export-ready components
}
```

**API Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/layout/save` | Save new layout |
| POST | `/layout/check-duplicate` | Check for existing customer+name |
| GET | `/layout/list` | List all layouts |
| GET | `/layout/<id>` | Get layout with parsed data |
| PUT | `/layout/<id>` | Update layout |
| DELETE | `/layout/<id>` | Delete layout |

---

### 5.3 Font Management

**Pages:**
- `/font/upload-page` — Upload .ttf/.otf fonts with optional customer assignment
- `/font/view` — Font library with live preview rendering

**Capabilities:**
- Upload `.ttf` and `.otf` font files
- Assign fonts to specific customers or keep as global (NULL customer)
- Same font file can be uploaded for multiple customers (separate DB records)
- Rename fonts
- Delete fonts (removes file + DB record)
- Serve fonts to browser for live CSS rendering (`@font-face`)
- Download font files
- Fonts used in exports are embedded in PDF/AI output

**API Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/font/upload` | Upload font file |
| GET | `/font/list` | List all fonts |
| GET | `/font/list/<customer_id>` | List fonts for customer + globals |
| PUT | `/font/<id>/rename` | Rename font |
| DELETE | `/font/<id>` | Delete font |
| GET | `/font/file/<id>` | Serve font for browser use |
| GET | `/font/download/<id>` | Download font file |

---

### 5.4 Order Management

**Pages:**
- `/order/create` — 3-step order creation wizard
- `/order/view` — Order list with status, actions
- `/order/detail/<id>` — Full order detail with line items and export actions

**Order Creation Wizard (3 Steps):**

1. **Step 1 — Select Customer**: Pick from existing customers
2. **Step 2 — Order Details**: Enter PO number (order ID is auto-generated as `ORD-XXXXX`)
3. **Step 3 — Order Lines**:
   - Select layout template (filtered by customer)
   - If layout has variables: fill variable values manually, or use Excel workflow
   - Set quantity per line
   - Add multiple lines
   - Save as draft order

**Excel Variable Data Workflow:**
- **Download Template**: Generate `.xlsx` with variable column headers + hidden `_metadata` sheet mapping column positions to variable indices
- **Download Dummy**: Generate `.xlsx` pre-filled with contextual random placeholder data (names, addresses, phones, etc.)
- **Upload Data**: Parse uploaded `.xlsx`, validate columns/rows, map to variable values, auto-create order lines

**Order Confirmation:**
- Confirms order → generates full export-ready data for every line
- Runs `flatten_layout_for_export()` on each line's layout + variable values
- Stores generated data in `order_lines.generated_data`
- Changes order status from `draft` to `confirmed`

**API Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/order/api/create` | Create order + lines |
| GET | `/order/api/list` | List all orders |
| GET | `/order/api/<id>` | Get order detail + lines |
| DELETE | `/order/api/<id>` | Delete order + lines |
| POST | `/order/api/<id>/confirm` | Confirm order (generate data) |
| POST | `/order/api/<id>/generate` | Generate preview data without confirming |
| GET | `/order/api/layouts/<customer_id>` | Get layouts for customer (with variable count) |
| POST | `/order/api/excel/template` | Download Excel template |
| POST | `/order/api/excel/dummy` | Download Excel with dummy data |
| POST | `/order/api/excel/upload` | Upload and parse Excel data |

---

### 5.5 Export System

**Export Endpoints:**
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/export/pdf` | Generate single-page PDF |
| POST | `/export/ai` | Generate single-page .ai file |
| POST | `/export/ai/batch` | Generate multi-page .ai file |

**Export Payload Structure (POST body):**
```json
{
  "label": { "width": 100, "height": 50 },
  "components": [
    {
      "type": "pdfpath",
      "x": 0, "y": 0, "width": 10, "height": 10,
      "visible": true,
      "pathData": {
        "ops": [{"o": "M", "a": [0, 0]}, {"o": "L", "a": [10, 0]}, ...],
        "fill": [1, 0, 0],
        "stroke": [0, 0, 0],
        "lw": 0.5
      }
    },
    {
      "type": "text" | "textregion",
      "x": 10, "y": 10, "width": 50, "height": 8,
      "content": "Hello World",
      "fontFamily": "Arial", "fontId": 5,
      "fontSize": 12, "color": "#000000",
      "alignH": "left", "alignV": "top",
      "bold": false, "italic": false,
      "letterSpacing": 0
    },
    {
      "type": "barcoderegion",
      "barcodeData": "123456", "barcodeFormat": "code128"
    },
    {
      "type": "qrcoderegion",
      "qrData": "https://example.com"
    }
  ],
  "boundsRects": [
    { "x": 0, "y": 0, "w": 100, "h": 50, "rotation": 0 }
  ],
  "outlined": false,
  "separateInvisible": true
}
```

**AI Export Features:**
- PDF-based `.ai` format (Adobe Illustrator can open PDF natively)
- Full font embedding for fonts under 2MB (non-subsetted, so AI matches local fonts)
- Text outlining option: converts text to vector paths using fontTools
- Invisible separator layer: hidden paths drawn first, red separator line placed off-artboard, visible paths drawn on top — allows Illustrator users to select hidden/visible layers easily
- Barcode rendering: Code128, EAN13, Code39, UPC-A as vector rectangles
- QR code rendering: vector grid of black/white modules
- Multi-page batch export: single `.ai` file with multiple artboards
- BoundsRect rotation support with canvas state save/restore
- Compound path support with even-odd fill rule

**PDF Export Features:**
- Same component rendering as AI export
- Custom font registration
- Vector barcode/QR output

---

## 6. Frontend JavaScript Modules

| Module | File | Purpose |
|--------|------|---------|
| Navigation | `navigation.js` | Tab management, sidebar toggle, iframe-based page loading, sessionStorage persistence |
| Component | `component.js` | Canvas rendering engine for layout preview (paths, text, overlays, boundsRects, selection, drag, resize) |
| Layout | `layout.js` | Layout creation UI logic, overlay management, save/load |
| JSON Manager | `json_manager.js` | Illustrator JSON import, document tree parsing, tree-to-canvas flattening, export payload building |
| PDF Manager | `pdf_manager.js` | PDF upload/parsing, PDF page rendering, overlay system for PDF-based layouts |
| Customer | `customer.js` | Customer CRUD UI, member management |
| Font Manager | `font_manager.js` | Font list, rename, delete UI |
| Font Upload | `font_upload.js` | Font file upload with customer assignment |
| Font View | `font_view.js` | Font library with live preview text rendering |

---

## 7. Adobe Illustrator Integration

### ExtendScript (`ai.jsx`)
- Runs inside Adobe Illustrator to export document structure as JSON
- Extracts: layers, groups, paths (with bezier control points), compound paths, text (with paragraph/run formatting), clipping masks
- Captures: fill colors (RGB, CMYK, spot, gradient), stroke properties, opacity, visibility, bounds
- Output: JSON file loadable by the web app's JSON manager

### ExtendScript (`export_to_json.jsx`)
- Alternative/complementary Illustrator export script
- Focused on structured JSON output for the layout system

---

## 8. Key Workflows

### Workflow A: New Label Design → Production
1. Designer creates label in Adobe Illustrator
2. Run `ai.jsx` or `export_to_json.jsx` to export JSON
3. In web app: Layout > Create > JSON — import the JSON file
4. Add text overlay regions where variable content goes (name, address, barcode, etc.)
5. Mark overlays as `isVariable`
6. Save layout linked to a customer

### Workflow B: Order with Variable Data
1. Order > Create — select customer, enter PO#
2. Select layout template for the customer
3. If variables exist:
   - Option A: Fill values manually one-by-one
   - Option B: Download Excel template → fill in bulk → upload
   - Option C: Download dummy data for testing
4. Set quantity per line, add multiple lines
5. Save draft → review → confirm order
6. Confirmation generates export-ready data for every line

### Workflow C: Export for Production
1. From Order Detail: select line items
2. Export single .ai or batch .ai (all lines in one file)
3. Export PDF for proofing
4. Open .ai in Adobe Illustrator for final adjustments if needed

---

## 9. File Structure

```
illustrator-layout/
├── app.py                    # Flask application entry point
├── database.db               # SQLite database (production data)
├── start.bat                 # Startup script (py app.py)
├── CLAUDE.md                 # AI agent instructions
├── PRD.md                    # This document
│
├── models/                   # Data models (SQLite, raw queries)
│   ├── __init__.py
│   ├── database.py           # DB init, connection manager, query executor
│   ├── customer.py           # Customer CRUD
│   ├── member.py             # Member CRUD
│   ├── layout.py             # Layout CRUD
│   ├── font.py               # Font CRUD + table migration
│   └── order.py              # Order + OrderLine CRUD + data generation
│
├── blueprints/               # Flask route handlers
│   ├── __init__.py
│   ├── customer.py           # Customer + Member endpoints
│   ├── layout.py             # Layout CRUD + duplicate check
│   ├── font.py               # Font upload/serve/manage
│   └── order.py              # Order CRUD + Excel workflow + confirm/generate
│
├── tools/                    # Python export/processing scripts
│   ├── export_ai.py          # .ai file generator (PDF-based)
│   ├── export_pdf.py         # .pdf file generator
│   ├── flatten_tree.py       # Illustrator JSON tree → flat components
│   ├── fonttools_outline.py  # Text → vector path conversion
│   ├── excel_order.py        # Excel template/dummy/upload handling
│   └── export_to_json.jsx    # Illustrator ExtendScript export
│
├── templates/                # Jinja2 HTML templates
│   ├── base.html             # App shell (sidebar + tab container)
│   ├── index.html            # Welcome page
│   ├── customer/
│   │   ├── create.html       # Customer creation form
│   │   └── view.html         # Customer list
│   ├── layout/
│   │   ├── create_draw.html  # Draw tool (placeholder)
│   │   ├── create_json.html  # JSON layout editor + canvas
│   │   ├── create_pdf.html   # PDF upload + layout editor
│   │   └── view.html         # Layout list
│   ├── font/
│   │   ├── upload.html       # Font upload form
│   │   ├── view.html         # Font library
│   │   ├── manage.html       # Font management
│   │   └── test.html         # Font testing
│   └── order/
│       ├── create.html       # 3-step order wizard
│       ├── view.html         # Order list
│       └── detail.html       # Order detail + export actions
│
├── static/
│   ├── css/                  # Stylesheets (black & white theme)
│   │   ├── base.css
│   │   ├── style.css
│   │   ├── customer.css
│   │   ├── order.css
│   │   ├── font_manager.css
│   │   ├── font_view.css
│   │   ├── layout_modal.css
│   │   └── pdf_manager.css
│   └── js/                   # Client-side JavaScript
│       ├── navigation.js
│       ├── component.js
│       ├── layout.js
│       ├── json_manager.js
│       ├── pdf_manager.js
│       ├── customer.js
│       ├── font_manager.js
│       ├── font_upload.js
│       └── font_view.js
│
├── fonts/                    # Uploaded font files (.ttf, .otf)
├── .tmp/                     # Temporary export files (disposable)
├── docs/                     # Technical documentation
└── ai.jsx                    # Adobe Illustrator ExtendScript
```

---

## 10. Non-Functional Requirements

| Requirement | Implementation |
|-------------|---------------|
| Authentication | None (internal LAN tool) |
| Styling | Strict black-and-white, minimal design |
| Python executable | Uses `py` command (not `python` or `python3`) |
| Temp files | All exports generated in `.tmp/` (disposable) |
| Font size limit | Full font embedding capped at 2MB per font |
| Database | Single SQLite file, no migration framework |
| Startup | `start.bat` → `py app.py` on port 5001 |

---

## 11. Known Limitations / Future Work

- **No authentication** — suitable only for internal/trusted network use
- **Layout Draw tool** — placeholder page, not yet implemented
- **Edit Customer** — backend exists but UI uses placeholder alert
- **No image overlay export** — image overlays render on canvas but are not included in AI/PDF export
- **Single SQLite file** — not suitable for concurrent multi-user heavy load
- **No undo/redo** — layout editor changes are immediate
- **Font embedding** — fonts over 2MB are subsetted (may not match in Illustrator)
