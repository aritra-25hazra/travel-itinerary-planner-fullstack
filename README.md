# 🧭 Personalized Travel Itinerary Planner — Full-stack

## 🔗 Live demo

- **App (Vercel):** https://travel-itinerary-planner-lilac.vercel.app
- **API (Render):** https://travel-planner-api-nteb.onrender.com — health: https://travel-planner-api-nteb.onrender.com/api/health · docs: https://travel-planner-api-nteb.onrender.com/docs

> The API runs on Render's free tier and sleeps when idle, so the first request after a quiet spell can take ~50 s.

AI-powered travel SaaS: tell it where (or just what vibe), when, who and how much, and get an optimised
day-by-day itinerary — attractions grouped by neighbourhood, transport between every stop, costed in local
currency / USD / INR, a stay suggestion, per-day customisation and an offline PDF guide.

**Stack:** React + Vite + TypeScript + Tailwind (Vercel) · FastAPI (Render) · Supabase (Auth + Postgres) · Groq LLM · Unsplash

> Runs end-to-end **with zero API keys**: a deterministic demo planner replaces Groq, gradient placeholders replace
> Unsplash, and guest mode with local SQLite replaces Supabase. Add keys and the real services switch on automatically.

---

## Architecture

```
            ┌───────────────────────────┐          ┌──────────────────────────┐
            │  Frontend  (Vercel)       │  /api/*  │  Backend  (Render)        │
  User ───▶ │  React + Vite + TS        │ ───────▶ │  FastAPI                  │
            │  Tailwind, zustand,       │ ◀─────── │  planner · clustering ·   │
            │  supabase-js (login only) │   JSON   │  budget · PDF · rate-limit│
            └───────────┬───────────────┘          └───┬──────────┬─────────┬─┘
                        │ email/password                │          │         │
                        ▼                               ▼          ▼         ▼
                 ┌─────────────┐                 ┌──────────┐ ┌────────┐ ┌──────────┐
                 │ Supabase    │ ◀── PostgREST ──│ Supabase │ │ Groq   │ │ Unsplash │
                 │ Auth        │   (user JWT,    │ trips    │ │ LLM    │ │ images   │
                 └─────────────┘    RLS applies) │ table    │ └────────┘ └──────────┘
                                                 └──────────┘
                                                 (SQLite fallback for guests)
```

Groq and Unsplash keys live only on the backend. The browser never sees them.

## Features ↔ project steps

| # | Step | Where it lives |
|---|------|----------------|
| 1 | Development environment | `dev.sh`, `backend/requirements.txt`, `frontend/package.json`, `.env.example` files |
| 2 | System architecture | diagram above; `backend/main.py` (API), `frontend/src/lib/api.ts` (client) |
| 3 | User input handling | `frontend/src/pages/Plan.tsx` — 4-step wizard: destination/vibe, dates & party, budget/pace/interests/style, review |
| 4 | AI itinerary generator | `backend/services/planner.py` + prompts in `services/engine.py` — Groq JSON mode, 1 retry, demo fallback; day-wise plan with attractions, dining, accommodation and transport |
| 5 | FastAPI backend APIs | `/api/recommendations`, `/api/itineraries/generate`, `/api/itineraries/regenerate-day`, `/api/itineraries/recompute`, `/api/itineraries/pdf`, `/api/images`, `/api/trips` CRUD, `/api/health` |
| 6 | Supabase integration | `supabase/schema.sql` (trips table + RLS), `backend/auth.py` (token verification), `services/storage.py` (PostgREST with the user's JWT; SQLite for guests) |
| 7 | React dashboard | Landing, Smart trip builder, Itinerary viewer (timeline, budget, stay, emergency), My trips, Login |
| 8 | Customisation | Regenerate one day with quick chips or free text (other days locked), inline edit/delete of activities, regenerate whole trip; **share a read-only link** so friends can view, **clone** and refine their own copy |
| 9 | Optimisation logic | One neighbourhood per day → greedy same-slot swaps that cut haversine distance → transport mode/minutes per hop → pace cap on hours → **timed schedule** (start/end per activity, lunch anchored ≥ 11:30, warnings for days past 23:00) → budget status vs tier or hard cap → **group-fit report** (per-traveller interest coverage + conflicts) |
| 10 | Deploy & test | `render.yaml`, `frontend/vercel.json`, `backend/tests/` (14 API tests), Playwright E2E flow run before shipping |

## Scenarios it covers

- **Solo weekend getaway** – destination, dates, budget tier, interests → clustered days, timed schedule, affordable dining, transport between stops.
- **Couple's personalised vacation** – Relaxed pace, Nature/Wellness interests, Luxury tier → premium stay suggestion; edit activities, regenerate single days, track costs; share the link with your partner, who can clone and refine.
- **Small group multi-day trip** – group size + each traveller's interests → the plan covers everyone, the **Group fit** card shows who is under-served and which days serve whom, schedule warnings catch over-packed days, and the share link keeps the whole group on one plan.

## API (backend)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | `{ai_mode: groq\|demo, storage: supabase\|sqlite, images, auth}` |
| POST | `/api/recommendations` | Top 3 destinations for the preferences (with images) |
| POST | `/api/itineraries/generate` | Full plan: days → 4 slots each, clustering, transport, accommodation, totals |
| POST | `/api/itineraries/regenerate-day` | `{preferences, plan, day_index, instruction}` → plan with only that day changed |
| POST | `/api/itineraries/recompute` | Refresh transport / hours / totals after manual edits (no AI) |
| POST | `/api/itineraries/pdf` | Offline PDF guide (ReportLab) |
| POST/DELETE | `/api/trips/{id}/share` | Turn a public read-only share link on / off (owner only) |
| GET | `/api/shared/{token}` | Public view of a shared trip (no login) · POST `/api/shared/{token}/clone` copies it into the caller's trips |
| GET | `/api/images?query=` | Unsplash photo (24 h cache) or gradient placeholder |
| GET/POST | `/api/trips` · GET/PUT/DELETE `/api/trips/{id}` | Trip persistence (Supabase for signed-in users, SQLite for guests) |

Auth: `Authorization: Bearer <supabase access token>` for users, `X-Guest-Id: <uuid>` for guests. AI endpoints are
rate-limited per identity (`RATE_LIMIT_PER_HOUR`, default 20). Interactive docs at `/docs`.

## Run locally

Requirements: Python 3.11+ and Node 18+.

```bash
git clone https://github.com/aritra-25hazra/travel-itinerary-planner-fullstack.git
cd travel-itinerary-planner-fullstack
./dev.sh            # creates backend/.venv, installs frontend deps, starts both servers
```

Or manually:

```bash
# backend
cd backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000        # http://localhost:8000/docs

# frontend (new terminal)
cd frontend && npm install && npm run dev    # http://localhost:5173 (proxies /api → :8000)
```

Optional keys: copy `backend/.env.example` → `backend/.env` and `frontend/.env.example` → `frontend/.env`, fill what you have.

Tests: `cd backend && pip install -r requirements-dev.txt && pytest -q` · `cd frontend && npm run build`

## Deploy (all free tiers)

### 1. Supabase (optional — enables login + cloud storage)
1. Create a project at supabase.com → **SQL Editor** → paste `supabase/schema.sql` → Run.
2. **Authentication → Providers → Email**: enabled. For a demo you can turn off *Confirm email* so sign-ups work instantly.
3. **Settings → API**: copy the **Project URL** and the **anon public** key. (Never use the service_role key anywhere.)

### 2. Backend on Render
1. render.com → **New → Blueprint** → select the repo (uses `render.yaml`), or **New → Web Service** with
   root directory `backend`, build `pip install -r requirements.txt`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`.
2. Environment variables (all optional): `GROQ_API_KEY`, `UNSPLASH_ACCESS_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
3. Deploy; note the URL, e.g. `https://travel-planner-api.onrender.com`. Check `/api/health`.
4. Free tier sleeps after 15 min idle — the first request takes ~50 s. The frontend shows a hint when that happens.

### 3. Frontend on Vercel
1. vercel.com → **Add New → Project** → import the repo → **Root Directory: `frontend`** (framework: Vite).
2. Environment variables: `VITE_API_URL` = your Render URL (no trailing slash); `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` if you set up Supabase.
3. Deploy; note the URL, e.g. `https://travel-planner.vercel.app`.

### 4. Lock CORS
Back on Render set `ALLOWED_ORIGINS=https://travel-planner.vercel.app` (comma-separate several) and redeploy.

### Keys (free)
- Groq: https://console.groq.com/keys — default model `openai/gpt-oss-120b`
- Unsplash: https://unsplash.com/developers → New application → Access Key (demo tier: 50 req/h, cached 24 h here)

## Project structure

```
backend/
  main.py              FastAPI app, routes, CORS, rate limiting
  config.py            env settings (pydantic-settings)
  models.py            request/response schemas
  auth.py              Supabase token verification / guest identity
  services/engine.py   demo data, prompts, normalisation, clustering, PDF (ported from the Streamlit version)
  services/planner.py  Groq calls + optimisation pipeline (transport, pace cap, accommodation, totals)
  services/storage.py  Supabase PostgREST (user JWT + RLS) / SQLite guest storage
  services/images.py   Unsplash search with cache + placeholders
  tests/test_api.py    14 API tests, no network
frontend/src/
  lib/                 api client, auth context, supabase client, store (zustand), types, formatting
  components/          Layout, DayTimeline, ui primitives
  pages/               Landing, Plan (wizard), Itinerary, Trips, Login
supabase/schema.sql    trips table + row-level security + updated_at trigger
render.yaml            Render blueprint · frontend/vercel.json  SPA rewrite · dev.sh  local runner
```

## Notes & limits
- Currency conversion uses a static table (`USD_PER_UNIT`, `INR_PER_USD` in `engine.py`) to avoid another external API.
- The demo planner has curated, geographically clustered data for Goa, Jaipur, Bali, Paris, Tokyo and Dubai, and a
  vibe-based template with real coordinates for ~60 other cities.
- Guest trips on Render's free tier live in the service's local SQLite file, which resets on redeploy; sign in with
  Supabase for durable storage.

Built as a capstone project. Verify opening hours, prices and emergency numbers before travelling.
