# Tutor Website — Local Build Plan

## What We're Building

An AI-powered tutorial website that runs **entirely on your local machine**. Upload PDF books, select pages to study, and get AI-generated summaries broken into concept cards. Each card has a visual diagram and a chatbox for questions. Everything runs locally — no cloud deployment, no Docker required, no managed database servers.

---

## Local Tech Stack

| Layer | Technology | Why (Local) |
|-------|-----------|-------------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS | Same as online plan |
| Backend | FastAPI (Python 3.12) | Same as online plan |
| Database | SQLite (SQLAlchemy async + aiosqlite) | Replaces PostgreSQL — zero setup, single file |
| Task Queue | FastAPI BackgroundTasks | Replaces Celery + Redis — no extra processes |
| PDF Parsing | PyMuPDF (fitz) | Same as online plan |
| AI Model | Anthropic Claude API | Needs your ANTHROPIC_API_KEY in `.env` |
| Visualizations | Mermaid.js | Same as online plan |
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

### 4. Per-Card Chatbox
- Every Context Card has its own chat interface below it
- User types a question; Claude answers using the card's summary as context
- Responses appear after a short loading indicator
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
| Real-time WebSocket streaming | Simplified to request/response for local use |
| Docker Compose | Not needed — run services directly |
| PostgreSQL | Replaced by SQLite |
| Redis + Celery | Replaced by FastAPI BackgroundTasks |

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
│   │   │   ├── pdf_service.py        ← PyMuPDF extract text + thumbnails
│   │   │   ├── summarizer.py         ← Claude API: generate titles + summaries
│   │   │   ├── diagram_service.py    ← Claude API: generate Mermaid code
│   │   │   └── chat_service.py       ← Claude API: card Q&A chat
│   │   └── utils/
│   │       ├── auth.py               ← JWT encode/decode, password hashing
│   │       └── chunking.py           ← Text chunking helpers
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
│       │   └── MermaidDiagram.tsx    ← Mermaid SVG renderer
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
| POST | `/api/cards/{card_id}/diagram` | Generate Mermaid diagram for a card |
| GET | `/api/cards/{card_id}/messages` | Get chat history for a card |
| POST | `/api/cards/{card_id}/chat` | Send a message, get AI reply |

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
| 2 | Backend: database, models, schemas, auth (register/login/me) | `/api/auth/*` working |
| 3 | Backend: PDF upload, file storage, page count | `/api/documents/upload` working |
| 4 | Backend: page selection, thumbnail endpoint | Page range + thumbnails working |
| 5 | Backend: summarizer service + card generation background task | Cards generated from PDF |
| 6 | Backend: diagram service (Mermaid generation via Claude) | Diagrams per card |
| 7 | Backend: chat service (per-card Q&A with Claude) | Chat messages saved + returned |
| 8 | Frontend: login, register, dashboard pages | Auth flow working |
| 9 | Frontend: upload page (drag-drop, page selector, generate) | Full upload flow |
| 10 | Frontend: study page (cards, status polling, diagram toggle) | Cards visible |
| 11 | Frontend: chatbox per card + MermaidDiagram renderer | Full local app working |

---

## Local Testing Checklist

- [ ] Register account → login → dashboard loads
- [ ] Upload PDF → page count shown
- [ ] Set page range → hit "Generate Cards" → spinner shows
- [ ] Poll until status = "done" → cards appear
- [ ] Toggle diagram type on a card → Mermaid SVG renders
- [ ] Ask a question in card chat → AI reply appears
- [ ] Delete a document → removed from dashboard
- [ ] Refresh page → cards still there (persisted in SQLite)
