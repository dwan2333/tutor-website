# Tutor Website — Local Build Plan

## What We're Building

An AI-powered tutorial website that runs **entirely on your local machine**. Upload PDF books, select pages to study, and get AI-generated summaries broken into concept cards. Each card has a visual diagram and a chatbox for questions. Everything runs locally — no cloud deployment, no Docker required, no managed database servers.

---

## Local Tech Stack

| Layer | Technology | Why (Local) |
|-------|-----------|-------------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS | Same as online plan |
| Backend | FastAPI (Python 3.12) | Same as online plan |
| Database | SQLite + WAL mode (SQLAlchemy async + aiosqlite) | Replaces PostgreSQL — zero setup, single file; WAL mode prevents lock errors |
| Task Queue | FastAPI BackgroundTasks + `asyncio.to_thread()` | Replaces Celery + Redis; CPU-bound work offloaded to thread pool |
| PDF Parsing | PyMuPDF (fitz) | Same as online plan — runs in thread pool to avoid blocking event loop |
| AI Model | Anthropic Claude API (streaming via WebSocket) | Needs your ANTHROPIC_API_KEY in `.env`; streamed token-by-token |
| Visualizations | Mermaid.js + React Error Boundary | Same as online plan; error boundary catches bad syntax gracefully |
| File Storage | Local folder `storage/uploads/` | Replaces cloud storage |

---

## Features Included (Local)

### 1. PDF Upload & Page Selection
- Upload any PDF from your machine
- Thumbnail strip showing every page
- Drag handles or number inputs to select a page range (e.g. pages 10–45)
- "Full Book" toggle
- Background task processes the PDF while a progress bar shows status

### 2. Context Cards (Summarized Chunks)
- Selected pages split into chunks (~3 pages per card)
- Each chunk becomes a **Context Card** with:
  - A title and the page range it covers
  - A summary written by Claude
  - A badge showing which model generated it
- Cards displayed in reading order on the Study page

### 3. Visual Diagrams
- Each Context Card has a diagram toggle: **Concept Map**, **Flowchart**, **Sequence Diagram**
- Clicking a type calls Claude to generate Mermaid.js diagram code
- Diagram renders as SVG directly in the browser
- If rendering fails, a "Regenerate" button appears

### 4. Per-Card Chatbox (WebSocket Streaming)
- Every Context Card has its own chat interface below it
- User types a question; Claude streams the answer token-by-token via WebSocket
- Text appears in real time — no frozen UI while waiting 10–15 seconds for a full response
- Full chat history preserved per card in SQLite

### 5. User Accounts (Local Auth)
- Simple register/login with username + password
- JWT tokens stored in localStorage
- All documents and cards tied to your local user account

---

## Features Excluded (Online-Only, Added Later)

| Feature | Reason Excluded |
|---------|----------------|
| Community Library | Requires a shared database and user discovery |
| Resource Discovery (YouTube/SerpAPI) | Requires paid API keys + external calls |
| Self-Owned TutorAI Training | Requires GPU infrastructure + HuggingFace pipeline |
| Docker Compose | Not needed — run services directly |
| PostgreSQL | Replaced by SQLite + WAL mode |
| Redis + Celery | Replaced by FastAPI BackgroundTasks + asyncio.to_thread() |

---

## Project Folder Structure

```
tutor-website/                        ← root of repo
├── backend/
│   ├── app/
│   │   ├── main.py                   ← FastAPI app, CORS, lifespan
│   │   ├── config.py                 ← Settings (reads from .env)
│   │   ├── database.py               ← SQLite engine, session, init_db()
│   │   ├── models.py                 ← SQLAlchemy ORM models
│   │   ├── schemas.py                ← Pydantic request/response schemas
│   │   ├── routers/
│   │   │   ├── auth.py               ← /api/auth/register, login, me
│   │   │   ├── documents.py          ← /api/documents/ (upload, list, pages, generate)
│   │   │   └── context_cards.py      ← /api/cards/ (list, diagram, chat)
│   │   ├── services/
│   │   │   ├── pdf_service.py        ← PyMuPDF extract text + thumbnails (runs via asyncio.to_thread)
│   │   │   ├── summarizer.py         ← Claude API: generate titles + summaries
│   │   │   ├── diagram_service.py    ← Claude API: generate + validate Mermaid code
│   │   │   └── chat_service.py       ← Claude API: streaming card Q&A over WebSocket
│   │   └── utils/
│   │       ├── auth.py               ← JWT encode/decode, password hashing
│   │       ├── chunking.py           ← Text chunking helpers
│   │       └── db_retry.py           ← Exponential backoff retry for DB writes
│   └── requirements.txt
│
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── layout.tsx            ← Root layout + Navbar
│       │   ├── globals.css           ← Tailwind base + dark theme
│       │   ├── page.tsx              ← Redirect → /dashboard
│       │   ├── login/page.tsx        ← Login form
│       │   ├── register/page.tsx     ← Register form
│       │   ├── dashboard/page.tsx    ← List of user's documents
│       │   ├── upload/page.tsx       ← PDF upload + page selection
│       │   └── study/[documentId]/
│       │       └── page.tsx          ← Study page with cards
│       ├── components/
│       │   ├── Navbar.tsx            ← Top nav (logo, login/logout)
│       │   ├── StudyCard.tsx         ← Single context card (summary + diagram + chat)
│       │   ├── MermaidDiagram.tsx    ← Mermaid SVG renderer
│       │   └── MermaidErrorBoundary.tsx  ← React Error Boundary: catches bad syntax, shows Regenerate button
│       └── lib/
│           └── api.ts                ← Axios instance + all API call functions
│
├── storage/
│   ├── uploads/                      ← Uploaded PDFs stored here
│   └── tutor.db                      ← SQLite database file (auto-created)
│
├── .env                              ← Your API keys (not committed to git)
├── .env.example                      ← Template showing required env vars
├── .gitignore
├── start.bat                         ← Windows: starts backend + frontend
├── start.sh                          ← Mac/Linux: starts backend + frontend
├── PLAN.md                           ← Original online plan
├── PLAN_LOCAL.md                     ← This file
└── CLAUDE.md                         ← Claude Code guidance
```

---

## Architectural Fixes (Applied from Code Review)

### Fix 1 — CPU-Bound PDF Parsing (asyncio.to_thread)
PyMuPDF text extraction is CPU-intensive. Running it synchronously inside `BackgroundTasks` blocks the entire Python async event loop, freezing the server.

**Solution:** Wrap all PyMuPDF calls with `asyncio.to_thread()` so they run in a separate thread pool without blocking:
```python
pages = await asyncio.to_thread(extract_text_from_pages, file_path, start, end)
```

### Fix 2 — SQLite "Database is Locked" Errors (WAL mode + retry)
SQLite locks the entire database file during writes. Concurrent inserts (generating cards) while the frontend polls for status causes 500 errors.

**Solution — three layers:**
1. **WAL mode on startup** in `database.py`:
   ```python
   async with engine.connect() as conn:
       await conn.execute(text("PRAGMA journal_mode=WAL;"))
   ```
2. **Timeout in connection string:**
   ```
   sqlite+aiosqlite:///./storage/tutor.db?timeout=30
   ```
3. **Retry helper** in `utils/db_retry.py` — exponential backoff (100ms → 200ms → 400ms, max 3 attempts) wrapping any `INSERT` or `UPDATE` that could hit contention.

### Fix 3 — Silent Background Task Failures (try/except + status update)
FastAPI `BackgroundTasks` have no built-in retry or error reporting. A Claude API timeout or PDF parse crash leaves the document stuck in `"processing"` forever.

**Solution:** Wrap the entire background task in `try/except`. On any exception:
- Update document `status` to `"failed"`
- Save the error message to a new `error_message` column on the `documents` table
- The frontend reads this and shows a **"Retry"** button

The `documents` table gains one new column:

| Column | Type | Notes |
|--------|------|-------|
| error_message | TEXT | nullable — populated on failure |

### Fix 4 — WebSocket Streaming for Chat
Claude 3.5 can take 10–15 seconds for long answers. A plain HTTP response leaves the UI frozen and looking broken.

**Solution:** Replace the HTTP `POST /api/cards/{card_id}/chat` endpoint with a **WebSocket** endpoint:
```
WS  /ws/cards/{card_id}/chat
```
- Client sends a JSON message `{"message": "..."}` over the socket
- Backend calls `client.messages.stream(...)` and forwards each text delta to the frontend as it arrives
- Frontend renders tokens in real time as they stream in
- On completion, the full exchange is saved to `chat_messages` in SQLite

### Fix 5 — Mermaid Hallucination Handling
Claude frequently produces invalid Mermaid DSL (bad bracket syntax, unsupported keywords). Passing this to the frontend crashes the renderer.

**Solution — two layers:**

**Backend** (`diagram_service.py`) — lightweight validation before returning:
```python
VALID_STARTS = ("graph ", "flowchart ", "sequenceDiagram", "mindmap", "classDiagram", "erDiagram")
if not any(code.strip().startswith(s) for s in VALID_STARTS):
    raise ValueError(f"Invalid Mermaid output: {code[:80]}")
```
If validation fails, the endpoint retries once with a stricter prompt before raising a 422 error.

**Frontend** (`MermaidErrorBoundary.tsx`) — React Error Boundary wrapping `<MermaidDiagram>`:
- If the SVG renderer throws, the boundary catches it
- Displays: `"Syntax Error — click Regenerate to try again"` with a **Regenerate** button
- Prevents the crash from propagating and tearing down the whole Study page

---

## Database Schema (SQLite)

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| username | TEXT UNIQUE | |
| email | TEXT UNIQUE | |
| hashed_password | TEXT | bcrypt |
| created_at | DATETIME | default now |

### `documents`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| user_id | INTEGER FK | → users |
| filename | TEXT | stored filename on disk |
| original_name | TEXT | user's original file name |
| page_count | INTEGER | |
| selected_start | INTEGER | nullable |
| selected_end | INTEGER | nullable |
| status | TEXT | uploaded / processing / done / failed |
| error_message | TEXT | nullable — set on failure, shown as "Retry" prompt |
| created_at | DATETIME | |

### `context_cards`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| document_id | INTEGER FK | → documents |
| title | TEXT | |
| summary | TEXT | |
| page_range_start | INTEGER | |
| page_range_end | INTEGER | |
| model_used | TEXT | e.g. "claude-3-5-haiku" |
| order_index | INTEGER | display order |
| created_at | DATETIME | |

### `chat_messages`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| card_id | INTEGER FK | → context_cards |
| role | TEXT | "user" or "assistant" |
| content | TEXT | |
| created_at | DATETIME | |

---

## All API Endpoints

### Auth — `/api/auth`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create local account |
| POST | `/api/auth/login` | Get JWT token |
| GET | `/api/auth/me` | Current user info |

### Documents — `/api/documents`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/documents/upload` | Upload PDF file |
| GET | `/api/documents/` | List your documents |
| GET | `/api/documents/{id}` | Get single document |
| DELETE | `/api/documents/{id}` | Delete document + file |
| PUT | `/api/documents/{id}/pages` | Set selected page range |
| GET | `/api/documents/{id}/thumbnail/{page}` | Get page thumbnail (PNG) |
| POST | `/api/documents/generate-cards` | Start background card generation |
| GET | `/api/documents/{id}/status` | Poll processing status |

### Context Cards — `/api/cards`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cards/document/{doc_id}` | List all cards for a document |
| GET | `/api/cards/{card_id}` | Get single card |
| POST | `/api/cards/{card_id}/diagram` | Generate + validate Mermaid diagram for a card |
| GET | `/api/cards/{card_id}/messages` | Get chat history for a card |
| **WS** | `/ws/cards/{card_id}/chat` | **WebSocket** — stream AI reply token-by-token |

---

## Environment Variables (`.env`)

```
# Required
ANTHROPIC_API_KEY=your_key_here

# Optional — defaults work for local use
SECRET_KEY=local-dev-secret-change-me
DATABASE_URL=sqlite+aiosqlite:///./storage/tutor.db
UPLOAD_DIR=storage/uploads
ACCESS_TOKEN_EXPIRE_MINUTES=1440
```

---

## Backend Dependencies (`requirements.txt`)

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy[asyncio]==2.0.35
aiosqlite==0.20.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.9
PyMuPDF==1.24.9
anthropic==0.34.0
httpx==0.27.2
python-dotenv==1.0.1
pydantic==2.9.0
pydantic-settings==2.5.2
Pillow==10.4.0
```

## Frontend Dependencies (`package.json`)

```json
{
  "dependencies": {
    "next": "14.2.14",
    "react": "^18",
    "react-dom": "^18",
    "mermaid": "^11.2.1",
    "axios": "^1.7.7"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "autoprefixer": "^10.0.1",
    "postcss": "^8",
    "tailwindcss": "^3.4.1",
    "typescript": "^5"
  }
}
```

---

## How to Run Locally

### One-time setup
```bash
# 1. Copy env file and add your Anthropic API key
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=sk-ant-...

# 2. Backend — set up virtual environment
cd backend
python -m venv .venv
source .venv/Scripts/activate   # Windows bash
# .venv\Scripts\activate         # Windows cmd
pip install -r requirements.txt

# 3. Frontend — install packages
cd frontend
npm install
```

### Start (every time)
```bash
# Terminal 1 — Backend
cd backend
source .venv/Scripts/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Open `http://localhost:3000`

---

## Implementation Phases

| Phase | What Gets Built | Output |
|-------|----------------|--------|
| 1 | Project scaffold, git setup, `.env`, folder structure | Repo pushed to GitHub |
| 2 | Backend: database (WAL mode), models + `error_message` column, schemas, auth | `/api/auth/*` working, WAL enabled |
| 3 | Backend: PDF upload, file storage, page count | `/api/documents/upload` working |
| 4 | Backend: page selection, thumbnail endpoint | Page range + thumbnails working |
| 5 | Backend: summarizer + card generation task (`asyncio.to_thread` + try/except + db_retry) | Cards generated; failures surface "failed" status |
| 6 | Backend: diagram service (Mermaid generation + syntax validation + retry) | Valid diagrams per card; 422 on bad output |
| 7 | Backend: WebSocket chat endpoint (`/ws/cards/{card_id}/chat`) with streaming | Tokens stream to frontend in real time |
| 8 | Frontend: login, register, dashboard pages (shows error_message + Retry button) | Auth flow + failure recovery working |
| 9 | Frontend: upload page (drag-drop, page selector, generate) | Full upload flow |
| 10 | Frontend: study page (cards, status polling, diagram toggle) | Cards visible |
| 11 | Frontend: streaming chatbox (WebSocket) + MermaidDiagram + MermaidErrorBoundary | Full local app working, resilient to crashes |

---

## Local Testing Checklist

- [ ] Register account → login → dashboard loads
- [ ] Upload PDF → page count shown
- [ ] Set page range → hit "Generate Cards" → spinner shows
- [ ] Poll until status = "done" → cards appear
- [ ] Simulate failure (bad API key) → status shows "failed" + Retry button appears
- [ ] Toggle diagram type on a card → Mermaid SVG renders
- [ ] Trigger bad Mermaid output → Error Boundary shows "Regenerate" instead of crashing
- [ ] Ask a question in card chat → tokens stream in real time via WebSocket
- [ ] Send multiple chat messages rapidly → no SQLite lock errors
- [ ] Delete a document → removed from dashboard
- [ ] Refresh page → cards still there (persisted in SQLite)
