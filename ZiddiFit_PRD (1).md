# ZiddiFit — Product Requirements Document (PRD)
**Version:** 1.0
**Owner:** Product / Engineering
**Status:** Ready for build
**Scope:** End-to-end implementation spec — frontend, backend, AI (Gemini), computer vision (MediaPipe), and storage (Supabase)

---

## 1. Product Summary

ZiddiFit is a personal fitness loop, not four separate features:

1. **Gemini** builds a plan based on who the user is.
2. **MediaPipe** observes how the user actually moves during a workout.
3. **Gemini** interprets that performance and adapts the plan.
4. **Gemini (multimodal)** helps the user understand their food choices.
5. **Hydration** ties activity to a simple reminder-and-log loop.

Every module writes to and reads from one shared user context in Supabase, so each module gets smarter using data from the others.

### 1.1 Goals
- Give a first-time user a usable, jargon-free workout plan in under 60 seconds.
- Give live, understandable form feedback during a squat set (initial exercise).
- Turn a meal photo into a plain-language verdict, not just numbers.
- Make the plan visibly adapt after every workout — this is the "wow" moment.
- No static screens: every button triggers a real API call and changes real state.

### 1.2 Non-Goals (v1)
- No medical/clinical diagnosis or calorie-restriction enforcement.
- No multi-exercise CV in v1 (squat only; curl/push-up are stretch goals).
- No native mobile app — responsive web app (mobile browser + webcam access).

---

## 2. System Architecture

```
                              ZIDDIFIT
                                 │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
   PERSONALIZE               EXERCISE                  FOOD
        │                       │                       │
   Gemini Pro (text)     MediaPipe (client)      Gemini Pro (vision)
        │                       │                       │
        ▼                       ▼                       ▼
  Workout + nutrition    Landmarks → angles →     Nutrition analysis
  guidance (JSON)        reps → form (client)     + contextual verdict
        │                       │                       │
        │                 Gemini Pro (text)              │
        │                 (set summary + coaching)       │
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                                 ▼
                          BACKEND API (FastAPI)
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
             Supabase      Supabase      Supabase
           (Postgres)   (Postgres)    (Postgres +
          Users/Plans     Workouts    Storage: Meals/
                                       Hydration/Photos)
                    │
                    ▼
              Gemini Pro (adaptive re-plan trigger)
```

### 2.1 Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | React (Vite) + Tailwind CSS | Fast, component-driven, minimalist styling |
| Pose detection | MediaPipe Pose (Tasks Vision, WASM, runs in-browser) | Runs client-side, no video ever leaves the device |
| Backend | FastAPI (Python) | Easy Gemini SDK + Supabase Python client integration, async |
| AI | Gemini Pro (`gemini-2.5-pro` or `gemini-2.5-flash` for low-latency calls) | Text reasoning + vision (food photos) |
| Database | Supabase (Postgres) | Free tier, instant REST/RPC layer, no AWS credits needed, generous free quota |
| File storage | Supabase Storage (optional, only if storing meal photos) | Built into Supabase, bucket-based, free tier included |
| Auth | Supabase Auth (email/OTP or anonymous sessions for hackathon) | User identity for `user_id`, issues JWTs Supabase RLS understands natively |
| Hosting | Frontend: Vercel/Netlify. Backend: Render/Fly.io/Railway (or a Supabase Edge Function for lightweight endpoints) | No AWS dependency, free/low-cost tiers |

### 2.2 Data Flow Principle
**The camera video frame never leaves the browser.** MediaPipe runs client-side and only structured JSON (angles, landmark coordinates, rep summaries) is sent to the backend/Gemini. This keeps the app fast (no video upload latency) and privacy-friendly.

---

## 3. Feature 1 — Personalized Fitness Engine

### 3.1 Input Schema (Onboarding Form)

```json
{
  "user_id": "string (uuid)",
  "age": "number",
  "height_cm": "number",
  "weight_kg": "number",
  "sex": "male | female | other | prefer_not_to_say",
  "fitness_experience": "beginner | intermediate | advanced",
  "goal": "lose_weight | build_muscle | general_fitness | improve_endurance | improve_flexibility",
  "dietary_preference": "vegetarian | non_vegetarian | vegan | eggetarian | no_preference",
  "available_equipment": ["bodyweight_only", "dumbbells", "resistance_bands", "full_gym"],
  "available_time_minutes": "number (per session)",
  "days_per_week": "number",
  "constraints": ["knee_pain", "back_pain", "none", "..."]
}
```

### 3.2 Gemini Prompt — Plan Generation

**System instruction (sent once per request):**
```
You are a certified fitness coach writing for a general audience. Never use
technical jargon (no "hypertrophy", "RPE", "eccentric phase" etc.) — explain
things the way you'd explain them to a friend who has never worked out.
Keep tone encouraging, concrete, and specific. Always respond with valid JSON
matching the schema provided. Do not include markdown, comments, or text
outside the JSON object.
```

**User prompt (templated):**
```
Create a personalized weekly workout plan for this person:

Age: {age}
Height: {height_cm} cm
Weight: {weight_kg} kg
Experience: {fitness_experience}
Goal: {goal}
Equipment available: {available_equipment}
Time per session: {available_time_minutes} minutes
Days per week: {days_per_week}
Constraints/injuries: {constraints}

Rules:
- Use only the equipment listed.
- Respect all constraints (e.g. if "knee_pain" is listed, avoid deep knee flexion exercises).
- Keep exercise names simple and common (e.g. "Squat", "Push-up", not "Goblet Bulgarian Split Squat").
- Give plain-language reasons for each exercise, not scientific ones.
- Include a short general nutrition tip section written simply, no calorie targets.

Return JSON in this exact schema:
{
  "plan_summary": "1-2 sentence friendly overview of the week",
  "weekly_schedule": [
    {
      "day": "Monday",
      "focus": "Full Body",
      "exercises": [
        {
          "name": "Squat",
          "sets": 3,
          "reps": 10,
          "rest_seconds": 60,
          "why_this_exercise": "plain language reason",
          "equipment": "bodyweight_only"
        }
      ]
    }
  ],
  "nutrition_tips": ["plain-language tip 1", "plain-language tip 2"]
}
```

### 3.3 Output Handling
- Backend validates the JSON against the schema (`pydantic` model) before saving.
- If Gemini returns malformed JSON, backend retries once with `"Return ONLY valid JSON, no other text."` appended.
- Saved to Supabase `plans` table (see §7.2) keyed by `user_id`.

### 3.4 Adaptive Loop (runs after every workout session)

**Trigger:** `POST /api/workouts/{workout_id}/complete`

**Gemini prompt — Plan Update:**
```
You are updating this person's fitness plan based on their most recent
workout. Keep the same plain, encouraging, jargon-free tone as before.

Previous plan (JSON): {previous_plan_json}

Most recent workout performance:
Exercise: {exercise_name}
Sets completed: {sets_completed}
Average form score: {avg_form_score}/100
Notes from this session: {session_notes}

User feedback: "{user_feedback_text}"

Update the plan slightly based on this. If form was strong (>85), you may
increase difficulty slightly (more reps or an added set). If form was weak
(<60), reduce reps or suggest an easier variation. Otherwise keep it the same
but acknowledge progress.

Return JSON in the same schema as the original plan, plus:
{
  "change_summary": "1-2 sentences, plain language, explaining what changed and why"
}
```
The `change_summary` is what gets shown to the user — this is the visible "your plan just adapted" moment.

### 3.5 API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/users/onboard` | Save profile, trigger initial plan generation |
| GET | `/api/users/{user_id}/plan` | Fetch current active plan |
| POST | `/api/plans/{user_id}/regenerate` | Force full regeneration (user-triggered "I want a new plan" button) |
| POST | `/api/workouts/{workout_id}/complete` | Triggers adaptive re-plan |

---

## 4. Feature 2 — Real-Time Exercise Coach (Squat, v1)

### 4.1 MediaPipe Pose Setup
- Use **MediaPipe Tasks Vision — Pose Landmarker (Lite or Full model)**, running in-browser via WASM, at 30fps target from webcam `<video>` stream.
- Output: 33 landmarks per frame, each with `{x, y, z, visibility}` (normalized 0–1 image coordinates, z is depth relative to hips).

### 4.2 Landmark Index Reference (MediaPipe Pose, 33 points)

| Index | Name | Used for Squat? |
|---|---|---|
| 0 | nose | No |
| 11 | left_shoulder | Yes — back angle |
| 12 | right_shoulder | Yes — back angle |
| 13 | left_elbow | No |
| 14 | right_elbow | No |
| 23 | left_hip | **Yes — core joint** |
| 24 | right_hip | **Yes — core joint** |
| 25 | left_knee | **Yes — core joint** |
| 26 | right_knee | **Yes — core joint** |
| 27 | left_ankle | **Yes — core joint** |
| 28 | right_ankle | **Yes — core joint** |
| 29 | left_heel | Yes — balance check |
| 30 | right_heel | Yes — balance check |
| 31 | left_foot_index | Yes — knee-over-toe check |
| 32 | right_foot_index | Yes — knee-over-toe check |

Only landmarks with `visibility > 0.6` are used in angle math; if visibility drops below threshold for >1 second, the UI shows "Can't see you clearly — step back or adjust lighting" instead of guessing.

### 4.3 Client-Side Angle & Metric Calculations

Use the **average of left and right side** where both are visible (handles slight camera angle); fall back to whichever side is more visible.

**Knee angle** (hip–knee–ankle), per side:
```js
function angleAt(a, b, c) {
  // b is the vertex (e.g. knee)
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);
  const cos = dot / (mag1 * mag2);
  return Math.acos(Math.min(1, Math.max(-1, cos))) * (180 / Math.PI);
}
kneeAngle = angleAt(hip, knee, ankle);
```

**Depth score** — squat depth is "good" when `kneeAngle <= 100°` (thigh roughly parallel to floor or lower):
```js
depthScore = kneeAngle <= 100 ? 100 : Math.max(0, 100 - (kneeAngle - 100) * 2);
```

**Back angle** (shoulder–hip vertical lean), to catch excessive forward lean:
```js
backAngle = angleAt(shoulder, hip, { x: hip.x, y: hip.y - 1 }); // hip to vertical-up point
// backAngle close to 0 = upright, higher = leaning forward
```

**Knee alignment (valgus/knee-over-toe check)** — compare knee x-position to ankle x-position:
```js
kneeAlignmentOffset = Math.abs(knee.x - ankle.x);
// threshold tuned per calibration frame (person's stance width)
alignmentOk = kneeAlignmentOffset < stanceWidth * 0.15;
```

**Tempo** — time (seconds) from top-of-rep to bottom-of-rep to top-of-rep again, tracked via a state machine (§4.4).

### 4.4 Rep Detection State Machine

States: `STANDING → DESCENDING → BOTTOM → ASCENDING → STANDING`

```
if kneeAngle > 160°           → state = STANDING
if state==STANDING and kneeAngle dropping → state = DESCENDING
if kneeAngle <= localMinimum for 200ms    → state = BOTTOM (record depthScore here)
if state==BOTTOM and kneeAngle rising     → state = ASCENDING
if state==ASCENDING and kneeAngle > 160°  → state = STANDING, rep++ (record full rep metrics)
```

Each completed rep produces:
```json
{
  "rep_number": 7,
  "depth_score": 91,
  "alignment_ok": true,
  "back_angle_max": 34,
  "tempo_seconds": 2.2
}
```

### 4.5 Real-Time UI Feedback (client-only, no API call — must feel instant)

Rendered directly from the current frame's computed metrics, no Gemini involved here (too slow for per-frame use):

```
REP 7
✓ Depth
✓ Tempo
⚠ Knee alignment  →  "Keep your knees aligned with your feet."
```

Simple rule-based micro-feedback strings (client-side lookup table), e.g.:
- `alignment_ok == false` → "Keep your knees aligned with your feet."
- `depth_score < 60` → "Try going a little lower."
- `back_angle_max > 45` → "Keep your chest up a bit more."

An optional **ghost skeleton** (a translucent reference pose overlay) can be drawn on the `<canvas>` at the ideal bottom position for visual comparison, using a static reference angle set (knee ≈ 90°, back angle ≈ 20–30°, hips back).

### 4.6 Gemini Role — Post-Set Coaching (this is where Gemini genuinely adds value)

Gemini is **not** called per frame or per rep — only once per completed set, with an aggregated summary. This keeps latency and cost low.

**Payload sent to backend → Gemini:**
```json
{
  "exercise": "Squat",
  "reps_completed": 10,
  "avg_depth_score": 88,
  "avg_tempo_seconds": 2.1,
  "alignment_issues_count": 3,
  "per_rep": [
    {"rep": 1, "depth_score": 95, "alignment_ok": true, "tempo_seconds": 2.0},
    {"rep": 2, "depth_score": 93, "alignment_ok": true, "tempo_seconds": 2.1},
    "...",
    {"rep": 10, "depth_score": 70, "alignment_ok": false, "tempo_seconds": 2.4}
  ]
}
```

**Gemini prompt — Set Summary + Coaching:**
```
You are a supportive fitness coach. Below is data from ONE set of squats,
captured automatically by motion tracking. Analyze the trend across reps
(not just the average) and give the user friendly, specific, non-technical
feedback in 2-3 sentences. Point out one thing they did well and one thing
to focus on next set. Avoid jargon (no "valgus", "eccentric" etc.) — describe
things in plain terms like "your knees moved inward" instead.

Set data: {json_payload}

Return JSON:
{
  "headline": "one short encouraging sentence",
  "what_went_well": "plain language, specific to the data",
  "focus_next_set": "plain language, specific to the data",
  "form_score": 0-100
}
```

### 4.7 API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/exercise/session/start` | Create session record, returns `session_id` |
| POST | `/api/exercise/session/{session_id}/set-complete` | Sends aggregated rep data → Gemini → returns coaching JSON, saves to Supabase |
| POST | `/api/exercise/session/{session_id}/end` | Marks session complete, triggers §3.4 adaptive re-plan |
| GET | `/api/exercise/session/{session_id}` | Fetch session history/results |

---

## 5. Feature 3 — "Can I Eat This?" Food Assistant

### 5.1 Flow
```
User takes photo → uploaded as base64 to backend (or directly to
Supabase Storage from the client) →
backend calls Gemini Vision with image + user's nutrition context →
Gemini returns structured nutrition + plain-language verdict →
saved to Supabase `meals` table (photo path referencing Supabase Storage) →
shown to user
```

### 5.2 Gemini Prompt — Meal Analysis (multimodal)

**System instruction:**
```
You are a friendly nutrition assistant. You are given a photo of a meal and
some context about what the user has already eaten today and their goal.
Estimate the meal's contents and nutrition as best you can from the image —
be clear these are estimates. Give a short, non-judgmental, plain-language
verdict. Never tell the user to restrict food harshly or give exact calorie
limits. Encourage balance, not restriction. Always respond in valid JSON only.
```

**User prompt (with image attached):**
```
User's goal: {goal}
Dietary preference: {dietary_preference}
Meals already logged today: {todays_meals_summary}

Analyze the attached meal photo.

Return JSON:
{
  "identified_items": ["Rice", "Dal", "Mixed vegetables"],
  "estimated_nutrition": {
    "energy_kcal": 450,
    "protein_g": 14,
    "carbs_g": 70,
    "fat_g": 10
  },
  "confidence": "low | medium | high",
  "verdict": "1-2 sentence plain-language, encouraging, contextual guidance"
}
```

### 5.3 API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/meals/analyze` | multipart image upload → Gemini Vision → returns nutrition JSON, saves to Supabase |
| GET | `/api/meals/{user_id}/today` | Fetch today's logged meals for context/display |

---

## 6. Feature 4 — Hydration Tracker

Simple, no Gemini call needed.

### 6.1 Logic
- Client-side timer fires a reminder every N minutes (default 60, configurable).
- User taps **"Drank water"** → `POST /api/hydration/log`.
- Optionally: if a workout session just ended (`workout activity` event), reduce the next reminder interval by 15 minutes (simple rule, no AI needed).

### 6.2 API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/hydration/log` | Log a water intake event, returns updated today's log |
| GET | `/api/hydration/{user_id}/today` | Fetch today's hydration log for the progress UI |

---

## 7. Supabase Data Architecture (Postgres)

No AWS dependency — everything below runs on Supabase's free tier: Postgres database, Auth, and Storage (for meal photos, if retained).

### 7.1 Table: `users`
```sql
create table users (
  user_id uuid primary key default gen_random_uuid() references auth.users(id),
  age int,
  height_cm numeric,
  weight_kg numeric,
  sex text check (sex in ('male','female','other','prefer_not_to_say')),
  fitness_experience text check (fitness_experience in ('beginner','intermediate','advanced')),
  goal text,
  dietary_preference text,
  available_equipment text[],
  available_time_minutes int,
  days_per_week int,
  constraints text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### 7.2 Table: `plans`
```sql
create table plans (
  plan_id uuid primary key default gen_random_uuid(),
  user_id uuid references users(user_id) not null,
  plan_json jsonb not null,        -- full plan object from §3.2
  change_summary text,             -- populated on adaptive updates
  is_active boolean default true,
  created_at timestamptz default now()
);
create index on plans (user_id, created_at desc);
```
Only one active plan per user: when creating a new plan, run both statements inside a single Postgres transaction (`begin; ... commit;`) —
```sql
update plans set is_active = false where user_id = :user_id and is_active = true;
insert into plans (user_id, plan_json, change_summary, is_active) values (:user_id, :plan_json, :change_summary, true);
```

### 7.3 Table: `workout_sessions`
```sql
create table workout_sessions (
  session_id uuid primary key default gen_random_uuid(),
  user_id uuid references users(user_id) not null,
  exercise text not null,          -- "Squat"
  sets jsonb default '[]'::jsonb,  -- array of {reps, avg_depth_score, form_score, coaching}
  started_at timestamptz default now(),
  ended_at timestamptz
);
create index on workout_sessions (user_id, started_at desc);
```

### 7.4 Table: `meals`
```sql
create table meals (
  meal_id uuid primary key default gen_random_uuid(),
  user_id uuid references users(user_id) not null,
  identified_items text[],
  estimated_nutrition jsonb,       -- {energy_kcal, protein_g, carbs_g, fat_g}
  verdict text,
  image_storage_path text,         -- e.g. "meal-photos/{user_id}/{meal_id}.jpg" in Supabase Storage
  created_at timestamptz default now()
);
create index on meals (user_id, created_at desc);
```

### 7.5 Table: `hydration_logs`
```sql
create table hydration_logs (
  user_id uuid references users(user_id) not null,
  log_date date not null default current_date,
  logs jsonb default '[]'::jsonb,  -- array of ISO timestamps of each "drank water" tap
  target_ml int,
  primary key (user_id, log_date)
);
```

### 7.6 Storage
- Bucket: `meal-photos` (private). Backend uploads via the Supabase service-role key and stores only the `image_storage_path`; the frontend never gets direct write access to the bucket, keeping it consistent with server-side credential handling.
- Signed URLs (`storage.from('meal-photos').createSignedUrl(...)`, short TTL) are generated on demand when the frontend needs to display a photo — never store or expose permanent public URLs.

### 7.7 Access Pattern & Security Summary
- The FastAPI backend uses the Supabase **service-role key** (server-side only, never shipped to the client) via the `supabase-py` client for all writes — this bypasses Row Level Security (RLS) safely because only the trusted backend holds this key.
- If any Supabase calls are ever made directly from the frontend (e.g. to speed up read-only queries), use the **anon key** plus **Row Level Security policies** scoped to `auth.uid() = user_id` so a user can only ever read their own rows:
```sql
alter table plans enable row level security;
create policy "Users can read own plans" on plans
  for select using (auth.uid() = user_id);
```
- Supabase Auth issues the JWT used as the `user_id` identity across all tables — no separate identity system needed.

---

## 8. Backend API — Full Reference

Base URL: `/api`

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/users/onboard` | — | Create user, generate initial plan |
| GET | `/users/{user_id}/plan` | JWT | Fetch active plan |
| POST | `/plans/{user_id}/regenerate` | JWT | Force new plan generation |
| POST | `/workouts/{workout_id}/complete` | JWT | Trigger adaptive re-plan |
| POST | `/exercise/session/start` | JWT | Start a tracked exercise session |
| POST | `/exercise/session/{id}/set-complete` | JWT | Send set data → get coaching |
| POST | `/exercise/session/{id}/end` | JWT | End session, trigger adaptive loop |
| GET | `/exercise/session/{id}` | JWT | Session detail |
| POST | `/meals/analyze` | JWT | Upload meal photo → nutrition + verdict |
| GET | `/meals/{user_id}/today` | JWT | Today's meals |
| POST | `/hydration/log` | JWT | Log water intake |
| GET | `/hydration/{user_id}/today` | JWT | Today's hydration log |

All responses follow:
```json
{ "success": true, "data": { ... } }
```
or on error:
```json
{ "success": false, "error": { "code": "GEMINI_TIMEOUT", "message": "..." } }
```

### 8.1 Error Handling Rules
- Gemini call timeout → retry once (max 8s timeout), then return a friendly fallback message, never a raw stack trace.
- Malformed Gemini JSON → one retry with a stricter "JSON only" instruction, then fallback to a generic templated response so the UI never breaks.
- Supabase write failure → return `success:false`, frontend shows a retry toast, no silent data loss.

---

## 9. Frontend Architecture (React)

### 9.1 Design Principle: Minimalist, Never Static
- Every screen fetches live data on mount (`useEffect` → API call) — no hardcoded placeholder content ships to production.
- Loading states use skeleton placeholders, not spinners-only, so the UI never looks "frozen."
- Every primary button is wired to a real handler that calls a real endpoint and updates state from the response — no dummy `onClick={() => {}}`.

### 9.2 Component Tree

```
App
├── OnboardingFlow
│   └── ProfileForm            → POST /users/onboard
├── Dashboard
│   ├── PlanCard                → GET /users/{id}/plan
│   │   └── "Regenerate Plan" button → POST /plans/{id}/regenerate
│   ├── HydrationWidget          → GET/POST /hydration/...
│   └── TodaysMealsSummary       → GET /meals/{id}/today
├── ExerciseSession
│   ├── CameraView (MediaPipi Pose loop, client-only)
│   ├── LiveMetricsOverlay (rep count, depth/tempo/alignment ticks)
│   ├── "Start Set" button       → POST /exercise/session/start
│   ├── "End Set" button         → POST /exercise/session/{id}/set-complete
│   └── CoachingFeedbackCard     → renders Gemini response
├── FoodScanner
│   ├── PhotoCapture / Upload
│   ├── "Analyze Meal" button    → POST /meals/analyze
│   └── NutritionResultCard
└── PlanChangeToast (shown whenever change_summary is non-null after a session ends)
```

### 9.3 Button → API Mapping (explicit, per requirement)

| UI Element | Screen | API Call |
|---|---|---|
| "Get My Plan" (onboarding submit) | OnboardingFlow | `POST /users/onboard` |
| "Regenerate Plan" | Dashboard | `POST /plans/{user_id}/regenerate` |
| "Start Set" | ExerciseSession | `POST /exercise/session/start` |
| "Finish Set" | ExerciseSession | `POST /exercise/session/{id}/set-complete` |
| "End Workout" | ExerciseSession | `POST /exercise/session/{id}/end` |
| "Analyze Meal" | FoodScanner | `POST /meals/analyze` |
| "Drank Water" | HydrationWidget | `POST /hydration/log` |
| "View Session History" | Dashboard | `GET /exercise/session/{id}` |

### 9.4 Minimalist UI Guidelines
- Neutral base palette (off-white / charcoal), one accent color used sparingly (for progress rings, primary buttons, and form-alert ticks — e.g. green ✓ / amber ⚠).
- One primary action per screen, clearly emphasized; secondary actions as text links.
- Generous whitespace, large legible numerals for rep count / metrics (this is glanced at mid-workout, not read carefully).
- No dense tables in the workout view — use progress rings / simple bar indicators for depth, tempo, alignment.

### 9.5 State Management
- React Query (TanStack Query) for all server state — handles caching, retries, and loading/error states automatically, and re-fetches after mutations (e.g. after `/plans/regenerate`, invalidate the `plan` query so `PlanCard` re-renders with fresh data).
- Local component state (`useState`) only for transient UI state (camera on/off, current rep count during a live set).

---

## 10. End-to-End Demo Script (validates the "loop," not four features)

1. User fills onboarding form → **Gemini generates plan** → Dashboard shows plan in plain language.
2. User starts a Squat set → webcam turns on → **MediaPipe** tracks joints live → on-screen ✓/⚠ ticks per rep.
3. User finishes the set → aggregated data sent to **Gemini** → coaching card appears with headline + focus tip.
4. User ends the workout → adaptive loop fires → **Gemini updates the plan** → toast: "Your plan just changed because..." with `change_summary`.
5. User photographs a meal → **Gemini Vision** returns nutrition + a contextual verdict referencing today's other meals.
6. Hydration reminder fires → user taps "Drank water" → progress log updates.

---

## 11. Build Plan (7-Hour Hackathon Timeline)

| Hours | Milestone |
|---|---|
| 0 – 1 | Supabase project created, tables provisioned via SQL editor, FastAPI skeleton, Gemini SDK wired with a test call |
| 1 – 2.5 | Feature 1: onboarding form → plan generation → Dashboard render |
| 2.5 – 4.5 | Feature 2: MediaPipe squat tracking, angle/rep logic, live overlay, post-set Gemini coaching |
| 4.5 – 6 | Feature 3: food photo upload → Gemini Vision → result card |
| 6 – 6.5 | Feature 4: hydration widget (simple CRUD) |
| 6.5 – 7 | End-to-end demo run-through, error-state polish, deploy |

**Stretch (if time remains):** bicep curl / push-up support, ghost-pose overlay, voice feedback via Web Speech API.

---

## 12. Non-Functional Requirements

- **Latency:** live per-rep feedback must be client-side only (<50ms) — never route through the backend/Gemini per frame.
- **Privacy:** raw video frames never transmitted or stored; only derived angle/metric JSON and (optionally, with consent) meal photos.
- **Reliability:** every Gemini-dependent screen has a graceful fallback message so a slow/failed AI call never blocks the workout UI.
- **Cost control:** Gemini is called at most twice per workout session (post-set coaching, end-of-session re-plan) and once per meal photo — never per video frame.

---

## 13. Success Metrics (for demo/judging)

- Time from onboarding submit to visible plan: **< 5 seconds**.
- Live form feedback visibly updates within one rep of a deliberate bad-form demo (e.g., judge intentionally lets knees cave in).
- Plan visibly changes (`change_summary` shown) immediately after ending a workout.
- Meal photo → verdict round trip: **< 6 seconds**.
