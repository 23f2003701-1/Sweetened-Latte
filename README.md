# ZiddiFit 🏋️‍♀️ — Dual-Mode AI Fitness & Physiotherapy Ecosystem

> **Personal AI Fitness & Clinical Rehabilitation Loop** — Powered by Gemini 3.5/3.6 Multimodal + MediaPipe Vision + Supabase

ZiddiFit is an intelligent, dual-mode application combining active fitness coaching with AI-assisted clinical movement monitoring:

1. **Mode Selection (App Entry)**: Choose between **Workout Mode** (fitness, nutrition, hydration) and **Physiotherapy Mode** (**PhysioGuard AI** clinical movement observer).
2. **Physiotherapy Prescription Parsing**: **Gemini Vision** parses unstructured therapist reports (PDF/image) into structured JSON clinical guardrails.
3. **Real-time Movement Observer & Kinematic Guardrails**: **MediaPipe Pose** detects body landmarks in-browser with zero-latency joint angle calculation, movement state machine, and instant voice safety corrections (< 15 words) when safe Range of Motion (ROM) limits are exceeded.
4. **Periodic Rehab Telemetry Auditing**: Gemini receives compact movement telemetry (not raw video frames) to generate clinical adherence notes.
5. **AI Workout Generation & Adaptive Form Coaching**: Gemini writes personalized workout plans and provides set coaching and adaptive re-planning based on form scores.
6. **Range-Based Nutrition & Calorie Adaptation**: **Gemini Vision** estimates meal calories and macros in ranges (e.g. `650 - 800 kcal`). For calorie-heavy meals, **Gemini Nano AI** suggests a lower-calorie alternative complete with a generated food visual. Logging your meal choice automatically adapts tomorrow's workout plan to burn those calories!

---

## 🌟 Dual Operational Modes

```text
                                  ZIDDIFIT
                                     │
                           Mode Selection Screen
                                     │
           ┌─────────────────────────┴─────────────────────────┐
           ▼                                                   ▼
     WORKOUT MODE                                     PHYSIOTHERAPY MODE
 (Personalized Fitness Loop)                          (PhysioGuard AI Rehab)
           │                                                   │
   Onboarding Flow                                     Upload Report (PDF/Image)
           │                                                   │
  Dashboard & Weekly Plan                              Gemini Prescription Parsing
           │                                                   │
   Real-Time Form Coach                               Prescription Review & Guardrails
           │                                                   │
Food Range & Alternative AI                            Camera Observer (MediaPipe)
           │                                                   │
Hydration Tracking & Adaptation                      Real-time Safe ROM Voice Check
                                                               │
                                                     Gemini Audit & Session Summary
```

---

## 📁 Project Structure

```text
Sweetened-Latte/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ModeSelection/   # ModeSelectionScreen.jsx (Workout vs Physio)
│   │   │   ├── Physio/          # PhysioFlow, Upload, Review, Observer, Summary
│   │   │   ├── Dashboard/       # Weekly Workout Plan Dashboard
│   │   │   ├── ExerciseSession/ # MediaPipe Squat Form Tracker
│   │   │   ├── FoodScanner/     # Range Nutrition, AI Alternative & Image Gen
│   │   │   └── HydrationWidget/ # Hydration Logger & Reminders
│   │   ├── lib/
│   │   │   └── api.js           # Frontend API Client
│   │   └── App.jsx              # Top-Level Router & Mode Controller
├── backend/
│   ├── app/
│   │   ├── routers/
│   │   │   ├── physio.py        # Physiotherapy API Endpoints
│   │   │   ├── meals.py         # Range Nutrition & Meal Choice Endpoints
│   │   │   ├── exercise.py      # Workout Session Endpoints
│   │   │   ├── plans.py         # Plan Generation & Regeneration
│   │   │   ├── users.py         # Profile & Onboarding Endpoints
│   │   │   └── hydration.py     # Water Intake Endpoints
│   │   ├── services/
│   │   │   ├── gemini.py        # Gemini Text/Vision/Imagen Integration
│   │   │   └── supabase_client.py # Database Persistence
│   │   └── main.py              # FastAPI Application Entry
└── supabase/
    └── schema.sql               # Database Schemas & Tables
```

---

## ⚡ Quick Start

### 1. Backend Setup

```bash
cd backend

# Copy environment variables
cp .env.example .env

# Install dependencies
pip install -r requirements.txt

# Start FastAPI dev server (port 8000)
uvicorn app.main:app --reload
```

> **Demo/Fallback Mode:** If no `GEMINI_API_KEY` is set, the backend operates in structured fallback mode with complete clinical mock data and SVG generated visuals so all features remain fully demonstrable offline.

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server (port 5173)
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🔐 Environment Variables (`backend/.env`)

```env
GEMINI_API_KEY=your_gemini_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
ALLOWED_ORIGINS=http://localhost:5173
```

---

## 🚀 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend Framework** | React 19 (Vite) |
| **Pose Detection** | MediaPipe Tasks Vision (Client-side WASM PoseLandmarker) |
| **Speech Engine** | Browser Web Speech API (`SpeechSynthesis`) |
| **Backend Framework** | FastAPI (Python 3.10+) |
| **AI Models** | Gemini 3.5 Flash / Gemini 3.6 Flash / Imagen 3 |
| **Database & Storage** | Supabase (PostgreSQL) |

---

## 🔒 Privacy & Safety Boundaries

- **Raw camera video frames never leave the browser.** All pose detection and joint angle computations are executed client-side via MediaPipe WASM.
- **Immediate Local Safety Corrections:** Real-time ROM limit guardrails trigger instant local speech feedback without waiting for API network roundtrips.
- **Clinical Monitoring Disclosure:** PhysioGuard AI is presented as an AI-assisted movement observer, not a substitute for clinical medical evaluation.

---

## 📡 API Reference

See full interactive documentation at `http://localhost:8000/docs`.

### Physiotherapy Endpoints (`/api/physio`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/physio/parse-prescription` | Upload report (PDF/image) → Gemini extracts structured JSON prescription |
| `POST` | `/api/physio/audit-session` | Send movement telemetry → Gemini audits ROM compliance & coaching |
| `POST` | `/api/physio/session-summary` | Send telemetry → Gemini generates natural-language clinical summary |

### Food & Workout Endpoints (`/api/meals` & `/api/exercise`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/meals/analyze` | Upload meal photo → Range nutrition & Gemini Nano AI alternative suggestion |
| `POST` | `/api/meals/log-choice` | Log meal choice → Adapts next day's workout plan to burn excess calories |
| `POST` | `/api/exercise/session/start` | Start live exercise session |
| `POST` | `/api/exercise/session/{id}/set-complete` | Rep aggregated metrics → Gemini set coaching |
| `POST` | `/api/exercise/session/{id}/end` | End session → Gemini adaptive plan update |

---

Built with ❤️ for Gemini Hackathon 🚀