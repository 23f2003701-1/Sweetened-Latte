# ZiddiFit 🏋️‍♀️

> **Your personal AI fitness loop** — Gemini + MediaPipe + Supabase

ZiddiFit is a hackathon project that connects four fitness modules into one adaptive loop:

1. **Gemini** generates a personalized weekly workout plan from your profile
2. **MediaPipe** tracks your squat form live via webcam (client-side, private)
3. **Gemini** coaches you after every set and adapts your plan after every workout
4. **Gemini Vision** analyzes meal photos for nutrition estimates
5. A simple **hydration tracker** with configurable reminders

---

## Project Structure

```
Sweetened-Latte/
├── frontend/        # React (Vite) + Tailwind CSS
├── backend/         # FastAPI (Python)
└── supabase/        # schema.sql — run in Supabase SQL editor
```

---

## Quick Start

### 1. Backend

```bash
cd backend

# Copy and fill in your API keys
cp .env.example .env

# Install dependencies
pip install -r requirements.txt

# Run dev server (port 8000)
uvicorn app.main:app --reload
```

> **Without API keys:** The backend runs in demo/mock mode — all Gemini calls return realistic fake data so the UI is fully demonstrable.

### 2. Frontend

```bash
cd frontend

npm install
npm run dev
```

Visit `http://localhost:5173` — the Vite proxy forwards `/api` calls to `http://localhost:8000`.

### 3. Supabase (optional for full persistence)

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Open the SQL editor and run `supabase/schema.sql`
3. Create a private Storage bucket named `meal-photos`
4. Fill in `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `backend/.env`

---

## Environment Variables (backend/.env)

```env
GEMINI_API_KEY=your_gemini_api_key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ALLOWED_ORIGINS=http://localhost:5173
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 (Vite) + Tailwind CSS v4 |
| Pose Detection | MediaPipe Tasks Vision (WASM, runs in-browser) |
| Backend | FastAPI (Python) |
| AI | Gemini 2.5 Flash (text + vision) |
| Database | Supabase (Postgres) |
| Auth | Anonymous session (localStorage UUID) |

---

## Privacy

**Raw video frames never leave the browser.** MediaPipe runs entirely client-side. Only derived metrics (joint angles, rep counts, form scores) are sent to the backend.

---

## API Reference

See the interactive docs at `http://localhost:8000/docs` after starting the backend.

Key endpoints:

| Method | Path | Description |
|---|---|---|
| POST | `/api/users/onboard` | Create profile + generate plan |
| GET | `/api/users/{id}/plan` | Fetch active plan |
| POST | `/api/plans/{id}/regenerate` | Force new plan |
| POST | `/api/exercise/session/start` | Start workout session |
| POST | `/api/exercise/session/{id}/set-complete` | Send set data → get coaching |
| POST | `/api/exercise/session/{id}/end` | End session → adapt plan |
| POST | `/api/meals/analyze` | Meal photo → nutrition verdict |
| POST | `/api/hydration/log` | Log water intake |

---

## Demo Flow

1. Fill out the onboarding form → **Gemini generates your plan** → Dashboard appears
2. Go to **Workout** → Start a squat set → webcam turns on → see MediaPipe tracking live
3. Finish the set → **Gemini coaching card** appears with headline + tip
4. End workout → plan adapts → "Your plan changed because…" toast appears on Dashboard
5. Go to **Eat This?** → upload a meal photo → **Gemini Vision** returns verdict
6. Go to **Hydration** → set reminders → tap "I Drank Water"

---

Built for Gemini Hackathon 2026 🚀