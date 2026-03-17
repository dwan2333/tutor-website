# Tutor Website — Full Build Plan

## What We're Building

An AI-powered tutorial website where users upload PDF books, select pages to study, and get AI-generated summaries broken into concept cards. Each card has a visual diagram, a chatbox for questions, and auto-discovered resources (YouTube videos, articles). Users can publish their summaries to a community library where others rate, clone, and discover them. Over time, all user interactions train a proprietary AI model that the platform owns and serves itself.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python 3.12) |
| Database | PostgreSQL 16 (SQLAlchemy async + asyncpg) |
| Task Queue | Celery + Redis |
| PDF Parsing | PyMuPDF (fitz) |
| AI Models (initial) | Anthropic Claude, OpenAI GPT-4o, HuggingFace open-source |
| Visualizations | Mermaid.js |
| Resource Discovery | YouTube Data API v3 + SerpAPI |
| Self-Owned Model Training | HuggingFace Transformers + LoRA (PEFT) |
| Self-Owned Model Serving | vLLM on rented GPU (RunPod / Lambda Labs) |

---

## Core Features

### 1. PDF Upload & Page Selection
- User uploads any PDF book
- After upload, a thumbnail strip shows every page
- User drags handles to select a page range (e.g., pages 10–45) or toggles "Full book"
- User picks which AI model to use for summarization (Claude, GPT-4o, or open-source)
- System enqueues a background job and shows a progress bar while processing

### 2. Context Cards (Summarized Chunks)
- The selected pages are split into semantic chunks (by heading or token budget)
- Each chunk becomes a **Context Card** with:
  - A title and the page range it covers
  - A summary written by the chosen AI model
  - A badge showing which model generated it
- Cards are displayed in reading order on the Study page

### 3. Visual Diagrams
- Each Context Card has a diagram toggle with three options: **Concept Map**, **Flowchart**, **Sequence Diagram**
- Clicking a type calls the AI to generate Mermaid.js diagram code for that card's content
- The diagram renders as an SVG directly in the browser
- If rendering fails, a "Regenerate" button appears

### 4. Per-Card Chatbox
- Every Context Card has its own independent chat interface below it
- User types a question; the AI answers using the card's summary as context
- Responses stream token-by-token in real time (WebSocket connection per card)
- After each exchange, the card summary can be automatically refined with new information
- Every completed Q&A pair is silently saved as training data for the self-owned model

### 5. Online Resource Discovery
- After cards are generated, a background job searches for related resources for each card
- **YouTube:** Top 5 videos matching the card's topic (via YouTube Data API v3)
- **Articles:** Top 5 web results (via SerpAPI or DuckDuckGo)
- Results shown in a collapsible Resource Panel below each card, with thumbnails and links
- User can remove irrelevant results

### 6. Community Library
- Any user can **publish** their summarized document to the public community
- Published summaries attach to a canonical **Book record** (title, author, ISBN, cover)
- Other users can:
  - **Browse** the community feed (trending, recent, top-rated)
  - **Search** by book title, author, or topic
  - **Rate** a summary (1–5 stars + optional written review)
  - **Clone** a summary into their own private workspace to study from
- Each book has its own page showing all community summaries ranked by rating
- Badges like "Community Pick", "Most Cloned", "Highly Rated" surface the best content
- User profiles show all published summaries and a reputation score

### 7. Self-Owned AI Model (TutorAI)
Every user interaction on the platform feeds a data pipeline that trains a model the platform fully owns:

**Data Flywheel:**
```
Users ask questions → Q&A pairs saved → Dataset grows
                                              ↓
                    Nightly quality scoring (judge AI filters bad answers)
                    Community ratings boost score of high-quality Q&A
                                              ↓
                    Weekly export to HuggingFace private dataset
                                              ↓
                    LoRA fine-tuning on Llama 3 (rented GPU, ~hours)
                                              ↓
                    Model served via vLLM → "TutorAI v1" in model picker
                                              ↓
                    More users → TutorAI v2, v3... gets smarter over time
```

**Key points:**
- Base model is open-source (Llama 3 8B or 70B, Mistral, or Qwen) — no OpenAI/Anthropic dependency for the trained model
- LoRA fine-tuning is efficient: only trains a small adapter on top of the base model, costs far less than full fine-tuning
- GPU is rented only during training (RunPod/Lambda Labs), not running 24/7
- Once trained, the model is served via vLLM and added as a selectable option: "TutorAI v1"
- Admin deploys new versions by updating a single Redis key — no code redeploy needed
- Highly-rated community Q&A gets weighted higher in training, so the community improves the model quality

---

## Project Folder Structure

```
tutorial_site/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app entry, CORS, all router mounts
│   │   ├── config.py                # Environment variables via pydantic-settings
│   │   ├── database.py              # Async SQLAlchemy engine + session factory
│   │   ├── models/                  # ORM models: user, document, context_card, chat, resource, training_sample
│   │   ├── schemas/                 # Pydantic request/response schemas
│   │   ├── routers/
│   │   │   ├── auth.py              # Register, login, /me
│   │   │   ├── documents.py         # PDF upload, page preview
│   │   │   ├── summaries.py         # Enqueue summarization job, poll status
│   │   │   ├── context_cards.py     # List cards, update summary, regenerate diagram
│   │   │   ├── chat.py              # WebSocket streaming chat + chat history
│   │   │   ├── resources.py         # Trigger discovery, list resources
│   │   │   ├── community.py         # Publish, rate, clone, feed, search, profiles
│   │   │   └── finetuning.py        # Admin: trigger training, monitor jobs, deploy model
│   │   ├── services/
│   │   │   ├── pdf_service.py       # PyMuPDF: extract text, generate page thumbnails
│   │   │   ├── summarizer.py        # Core ML dispatch — all other services depend on this
│   │   │   ├── diagram_service.py   # Prompt AI to generate Mermaid DSL
│   │   │   ├── chat_service.py      # Build context window, call AI with streaming
│   │   │   └── resource_service.py  # YouTube API + SerpAPI calls
│   │   ├── tasks/
│   │   │   ├── celery_app.py        # Celery + Redis config + Beat schedules
│   │   │   ├── summarize_task.py    # Async: chunk text → summarize → create cards
│   │   │   ├── resource_task.py     # Async: discover YouTube + articles per card
│   │   │   └── finetune_task.py     # Full 7-stage self-owned model pipeline
│   │   ├── ml/
│   │   │   ├── claude_client.py     # Anthropic API wrapper
│   │   │   ├── openai_client.py     # OpenAI API wrapper
│   │   │   ├── hf_client.py         # HuggingFace inference wrapper
│   │   │   └── model_selector.py    # Factory: returns right client; checks Redis for active fine-tuned model
│   │   └── utils/
│   │       ├── auth.py              # JWT create/verify, bcrypt helpers
│   │       ├── chunking.py          # Sliding-window token chunker + heading-based splitter
│   │       └── prompt_templates.py  # Reusable prompt strings for summarization, diagrams, QA
│   ├── alembic/                     # Database migrations
│   └── requirements.txt
│
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx             # Landing page
│       │   ├── dashboard/           # Library of uploaded PDFs
│       │   ├── upload/              # 3-step wizard: drop PDF → select pages → pick model
│       │   ├── study/[documentId]/  # Main study view: sidebar outline + card list
│       │   ├── community/           # Feed: trending, recent, top-rated summaries
│       │   ├── books/[bookId]/      # All community summaries for one book
│       │   └── profile/[userId]/    # User's publications + reputation
│       ├── components/
│       │   ├── upload/              # PDFDropzone, PageRangeSelector, ModelPicker
│       │   ├── study/               # ContextCard, ContextCardList, DiagramToggle, MermaidRenderer, ResourcePanel
│       │   └── chat/                # ChatBox, ChatMessage, ChatInput
│       ├── hooks/
│       │   ├── useWebSocket.ts      # WebSocket with exponential backoff reconnect
│       │   └── useContextCards.ts
│       ├── lib/
│       │   ├── api.ts               # Axios wrapper for all backend calls
│       │   └── mermaid.ts           # Mermaid.js init + render helper
│       └── store/
│           └── studyStore.ts        # Zustand: active document, card updates from chat
│
├── storage/uploads/                 # Local PDF storage (dev); swap for S3 in prod
└── docker-compose.yml               # PostgreSQL 16 + Redis 7
```

---

## Database Schema

### Core Tables

**users**
```
id           UUID  PK
email        VARCHAR(255) UNIQUE NOT NULL
hashed_pw    VARCHAR NOT NULL
role         ENUM('user', 'admin') DEFAULT 'user'
created_at   TIMESTAMP
```

**documents**
```
id             UUID  PK
user_id        UUID  FK → users.id
title          VARCHAR(255)
original_name  VARCHAR(255)
storage_path   VARCHAR(500)
page_count     INT
status         ENUM('uploaded', 'processing', 'ready', 'error')
created_at     TIMESTAMP
```

**document_page_selections**
```
id           UUID  PK
document_id  UUID  FK → documents.id
page_start   INT
page_end     INT
model_id     VARCHAR(100)   -- 'claude-3-5-sonnet', 'gpt-4o', 'hf:llama3', 'tutorai-v1'
created_at   TIMESTAMP
```

**context_cards**
```
id            UUID  PK
document_id   UUID  FK → documents.id
selection_id  UUID  FK → document_page_selections.id
title         VARCHAR(500)
summary_text  TEXT
diagram_dsl   TEXT           -- Mermaid DSL string
diagram_type  ENUM('concept_map', 'flowchart', 'sequence')
chunk_index   INT            -- display order
page_start    INT
page_end      INT
model_id      VARCHAR(100)
version       INT DEFAULT 1  -- incremented on chat-driven refinement
created_at    TIMESTAMP
updated_at    TIMESTAMP
```

**chat_messages**
```
id           UUID  PK
card_id      UUID  FK → context_cards.id
role         ENUM('user', 'assistant')
content      TEXT
token_count  INT
created_at   TIMESTAMP
```

**training_samples**
```
id              UUID  PK
card_id         UUID  FK → context_cards.id
question        TEXT
answer          TEXT
model_id        VARCHAR(100)
quality_score   FLOAT          -- NULL until scored; boosted by community rating
used_in_run_id  VARCHAR(100)   -- fine-tune job ID once consumed
created_at      TIMESTAMP
```

**resources**
```
id          UUID  PK
card_id     UUID  FK → context_cards.id
type        ENUM('youtube', 'article')
title       VARCHAR(500)
url         VARCHAR(1000)
thumbnail   VARCHAR(1000)
source      VARCHAR(200)   -- channel name or site domain
relevance   FLOAT          -- 0.0–1.0 embedding similarity score
created_at  TIMESTAMP
```

**finetune_jobs**
```
id                UUID  PK
provider          ENUM('openai', 'huggingface', 'self_hosted')
base_model        VARCHAR(200)
status            ENUM('pending', 'running', 'completed', 'failed')
sample_count      INT
external_job_id   VARCHAR(200)
trained_model_id  VARCHAR(200)   -- model identifier once training completes
started_at        TIMESTAMP
completed_at      TIMESTAMP
error_message     TEXT
```

### Community Tables

**books**
```
id              UUID  PK
title           VARCHAR(255)
author          VARCHAR(255)
isbn            VARCHAR(20)
cover_image_url VARCHAR(500)
created_at      TIMESTAMP
```

**published_summaries**
```
id           UUID  PK
document_id  UUID  FK → documents.id
user_id      UUID  FK → users.id
book_id      UUID  FK → books.id
title        VARCHAR(500)
description  TEXT
is_public    BOOLEAN DEFAULT false
clone_count  INT DEFAULT 0
avg_rating   FLOAT DEFAULT NULL
created_at   TIMESTAMP
```

**ratings**
```
id                   UUID  PK
published_summary_id UUID  FK → published_summaries.id
user_id              UUID  FK → users.id
stars                INT   CHECK (stars BETWEEN 1 AND 5)
review_text          TEXT
created_at           TIMESTAMP
```

**clones**
```
id                   UUID  PK
published_summary_id UUID  FK → published_summaries.id
cloned_by_user_id    UUID  FK → users.id
cloned_document_id   UUID  FK → documents.id
created_at           TIMESTAMP
```

**user_profiles**
```
id                 UUID  PK
user_id            UUID  FK → users.id UNIQUE
display_name       VARCHAR(100)
bio                TEXT
avatar_url         VARCHAR(500)
reputation_score   FLOAT DEFAULT 0
total_publications INT DEFAULT 0
```

---

## All API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get JWT token |
| GET | `/api/auth/me` | Current user info |

### Documents
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/documents/upload` | Upload PDF (multipart) |
| GET | `/api/documents/` | List user's documents |
| GET | `/api/documents/{doc_id}` | Document metadata + page count |
| DELETE | `/api/documents/{doc_id}` | Delete document + all cards |
| GET | `/api/documents/{doc_id}/pages/{page_num}/preview` | Page thumbnail image |
| POST | `/api/documents/{doc_id}/summarize` | Enqueue summarization; returns job_id |
| GET | `/api/jobs/{job_id}/status` | Poll job progress |

### Context Cards
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/documents/{doc_id}/cards` | All cards for a document |
| GET | `/api/cards/{card_id}` | Single card |
| PATCH | `/api/cards/{card_id}` | Update summary text |
| GET | `/api/cards/{card_id}/diagram` | Get current Mermaid DSL |
| POST | `/api/cards/{card_id}/diagram/regenerate` | Regenerate diagram (body: diagram_type) |

### Chat
| Method | Path | Description |
|--------|------|-------------|
| WebSocket | `/ws/cards/{card_id}/chat` | Real-time streaming chat |
| GET | `/api/cards/{card_id}/chat/history` | Full chat history |
| DELETE | `/api/cards/{card_id}/chat/history` | Clear chat history |

### Resources
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/cards/{card_id}/resources/discover` | Trigger async resource search |
| GET | `/api/cards/{card_id}/resources` | List discovered resources |
| DELETE | `/api/cards/{card_id}/resources/{resource_id}` | Remove a resource |

### Community
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/summaries/{doc_id}/publish` | Publish summary to community |
| GET | `/api/community/feed` | Paginated feed (trending/recent/top-rated) |
| GET | `/api/community/search` | Search by `?q=&book=&sort=` |
| GET | `/api/books/{book_id}` | Book page with ranked community summaries |
| POST | `/api/published/{pub_id}/rate` | Submit star rating + review |
| POST | `/api/published/{pub_id}/clone` | Clone into personal workspace |
| GET | `/api/profiles/{user_id}` | Public profile + publications |
| GET | `/api/community/recommended` | Personalized recommendations |

### Admin — Fine-Tuning
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/training-data` | View collected Q&A samples |
| POST | `/api/admin/finetune/trigger` | Manually start a training run |
| GET | `/api/admin/finetune/jobs` | List all training jobs |
| POST | `/api/admin/finetune/{job_id}/deploy` | Promote model to active |

---

## Self-Owned Model Pipeline — Full Detail

### The Goal
Build "TutorAI" — a model the platform owns outright. Not accessed through OpenAI or Anthropic. Runs on our own servers. Gets smarter as more users interact with the platform.

### Base Model Options
- **Llama 3 8B** — fast, cheap to fine-tune, good for most tasks
- **Llama 3 70B** — much more capable, higher GPU cost
- **Mistral 7B** — strong alternative to Llama 3 8B
- **Qwen 2.5** — strong multilingual option

### Stage 1 — Data Capture (real-time)
Every completed chat exchange writes one row to `training_samples`:
- `question` = what the user asked
- `answer` = the full AI response
- `model_id` = which model answered
- `quality_score` = NULL (not yet scored)

### Stage 2 — Quality Scoring (nightly, automated)
Celery Beat runs every night:
1. Fetches all `training_samples WHERE quality_score IS NULL`
2. Sends each Q&A pair to a lightweight judge model with a 0–10 rubric (relevance, accuracy, completeness)
3. Adds +1.0 bonus to Q&A pairs from cards that belong to published summaries rated 4+ stars
4. Stores the final score; samples below 6.0 are excluded from training

### Stage 3 — Dataset Export (weekly or when ≥500 new samples)
1. Queries samples with `quality_score >= 6.0 AND used_in_run_id IS NULL`
2. Formats as ChatML (HuggingFace standard):
   ```json
   {"messages": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
   ```
3. Pushes dataset to a private HuggingFace Hub repository

### Stage 4 — Fine-Tuning (GPU job)
1. Rents a GPU instance via RunPod or Lambda Labs API
2. Runs `transformers.Trainer` with **LoRA (PEFT)** — trains only a small adapter, not the full model weights. Efficient and cheap.
3. Creates a `finetune_jobs` row with `provider = 'self_hosted'`, `status = 'running'`

### Stage 5 — Monitoring (every 10 minutes)
Celery Beat polls the GPU job:
- On completion: downloads model weights + adapter to model server storage
- Updates `finetune_jobs`: `status = 'completed'`, `trained_model_id = 'tutorai-v2'`
- Notifies admin

### Stage 6 — Serving
- Loads the fine-tuned model into **vLLM** (high-performance inference server)
- Registers `tutorai-v2` as an available model option in the platform's model picker

### Stage 7 — Deployment
- Admin visits the admin panel and clicks "Deploy TutorAI v2"
- Backend writes `active_tutorai_model = tutorai-v2` to Redis
- `model_selector.py` reads this Redis key on every new request
- New summarizations and chats automatically use TutorAI v2
- Old cards retain their original `model_id` — no disruption
- Previous model versions remain available for comparison

---

## Frontend Pages

| Page | Path | Description |
|------|------|-------------|
| Landing | `/` | Hero, features, login/register CTA |
| Dashboard | `/dashboard` | Grid of uploaded PDFs with status badges |
| Upload | `/upload` | 3-step wizard: drop PDF → select pages → pick model → progress bar |
| Study | `/study/[documentId]` | Sidebar outline + scrollable context card list |
| Community | `/community` | Trending, recent, top-rated summaries feed |
| Book Page | `/books/[bookId]` | All community summaries for one book, ranked |
| Profile | `/profile/[userId]` | Published summaries, reputation, clone stats |

---

## Key Frontend Components

- **`PDFDropzone`** — drag-and-drop upload with file size validation
- **`PageRangeSelector`** — thumbnail strip with draggable range handles + "Full book" toggle
- **`ModelPicker`** — radio cards for Claude / GPT-4o / HuggingFace / TutorAI (when available)
- **`ContextCard`** — owns diagram toggling, chat integration, and resource display; most complex component
- **`MermaidRenderer`** — calls `mermaid.render()` on DSL change; outputs SVG; graceful fallback on error
- **`ChatBox`** — independent WebSocket per card; streams tokens into the last message bubble in real time
- **`ResourcePanel`** — collapsible; YouTube thumbnails + article cards with open-in-new-tab
- **`useWebSocket`** — hook managing WebSocket lifecycle with exponential backoff reconnect

---

## Backend Dependencies (requirements.txt)

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
python-multipart==0.0.9
sqlalchemy[asyncio]==2.0.36
asyncpg==0.30.0
alembic==1.13.3
psycopg2-binary==2.9.9
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
pydantic-settings==2.5.2
PyMuPDF==1.24.9
anthropic==0.34.0
openai==1.50.0
transformers==4.44.0
torch==2.4.0
datasets==2.21.0
accelerate==0.34.0
peft==0.12.0
tiktoken==0.7.0
celery==5.4.0
redis==5.0.8
flower==2.0.1
google-api-python-client==2.143.0
serpapi==0.1.5
boto3==1.35.0
httpx==0.27.2
Pillow==10.4.0
slowapi==0.1.9
loguru==0.7.2
pytest==8.3.3
pytest-asyncio==0.24.0
```

## Frontend Dependencies (package.json)

```json
{
  "dependencies": {
    "next": "14.2.x",
    "react": "18.x",
    "react-dom": "18.x",
    "typescript": "5.x",
    "tailwindcss": "3.x",
    "mermaid": "11.x",
    "zustand": "4.x",
    "axios": "1.x",
    "react-dropzone": "14.x",
    "react-markdown": "9.x",
    "react-hot-toast": "2.x",
    "lucide-react": "0.x",
    "next-auth": "4.x"
  }
}
```

---

## Implementation Order

| Phase | Days | What Gets Built |
|-------|------|----------------|
| 1 | 1–2 | docker-compose, PostgreSQL + Redis, FastAPI skeleton, all DB models, Alembic migration |
| 2 | 3 | Auth: JWT, bcrypt, register/login/me, user profiles |
| 3 | 4–5 | PDF upload, PyMuPDF extraction, page thumbnail API |
| 4 | 6–8 | ML clients (Claude/GPT/HF), text chunking, Celery summarization task, model picker UI |
| 5 | 9–10 | Context cards, Mermaid diagram generation, ContextCard + MermaidRenderer frontend |
| 6 | 11–13 | WebSocket chat streaming, ChatBox component, training_samples capture |
| 7 | 14–15 | YouTube + SerpAPI resource discovery, ResourcePanel component |
| 8 | 16–18 | Community: publish, rate, clone, book pages, feed, search |
| 9 | 19–21 | Self-owned model pipeline: dataset export, LoRA training, vLLM serving, model versioning |
| 10 | 22–24 | Community frontend pages, personalized recommendations, UI polish |
| 11 | 25–28 | Integration tests, rate limiting, Dockerfiles, .env documentation |

---

## How to Run (once built)

```bash
# Start database and cache
docker-compose up -d

# Run database migrations
cd backend
alembic upgrade head

# Start backend
uvicorn app.main:app --reload

# Start Celery worker (separate terminal)
celery -A app.tasks.celery_app worker --loglevel=info

# Start Celery Beat scheduler (separate terminal)
celery -A app.tasks.celery_app beat --loglevel=info

# Start frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Access at `http://localhost:3000`

---

## End-to-End Verification Checklist

- [ ] Upload a PDF → select pages 1–5 → choose Claude → context cards appear
- [ ] Toggle diagram type on a card → Mermaid diagram renders as SVG
- [ ] Type a question in a card's chatbox → response streams in real time
- [ ] Check resource panel → YouTube videos and articles appear
- [ ] Publish a summary → appears in `/community` feed with book association
- [ ] Rate a published summary → avg_rating updates, reorders in search
- [ ] Clone a summary → appears in personal workspace
- [ ] Visit `/profile/{userId}` → publications and reputation score shown
- [ ] Admin triggers fine-tune → `finetune_jobs` row created with status `running`
- [ ] After training completes → TutorAI appears in model picker
