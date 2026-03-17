# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Environment

- **Python:** 3.12.0 at `D:\python\python.exe`
- **Virtual environment:** `.venv/` (virtualenv 20.24.5)
- **Activate venv:** `source .venv/Scripts/activate` (bash) or `.venv\Scripts\activate` (cmd)
- **Install a package:** `pip install <package>` (with venv active)

No build system, test framework, or linter is configured yet. No `requirements.txt` exists — installed packages are `pyinputplus`, `pyperclip`, `openpyxl`, `Send2Trash`, `stdiomask`, `pysimplevalidate`.

## Repository Structure

This is currently a collection of standalone Python scripts organized by category:

- `Animations/` — terminal animations (Conway's Game of Life, Matrix, snow, zigzag) using `time`, `os`, `sys`
- `Games/` — CLI games (tic-tac-toe, rock-paper-scissors) with colored terminal output
- `Other project/` — utility scripts (clipboard tools, CSV processing, quiz generator, phone/email extractor, zip backup)

Each script is self-contained with no shared modules or imports between files.

## Planned Project: Tutorial Website (`tutorial_site/`)

A full-stack tutorial platform is being built in this repo. See `C:\Users\dwan0\.claude\plans\stateful-marinating-plum.md` for the complete implementation plan. Key architectural decisions:

- **Backend:** FastAPI (Python 3.12) + PostgreSQL + Redis/Celery for async jobs
- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **PDF processing:** PyMuPDF (`fitz`) for extraction and page thumbnails
- **ML layer:** Unified `model_selector.py` abstracts Claude, GPT-4o, and self-hosted models behind a common interface; active model override stored in Redis
- **Real-time chat:** One WebSocket connection per context card (`/ws/cards/{card_id}/chat`); every completed exchange is written to `training_samples` for fine-tuning
- **Self-owned model:** User Q&A collected → quality-scored nightly → exported as HuggingFace dataset → LoRA fine-tuned on rented GPU → served via vLLM → promoted via Redis key (no redeploy needed)
- **Community layer:** Users publish summaries publicly; ratings feed back into training data weighting (highly-rated Q&A gets priority in fine-tuning)
