"""Gemini service — uses google-genai SDK with automatic fallbacks."""
import os
import json
import asyncio
from typing import Any

from dotenv import load_dotenv

load_dotenv()

# Supported models in Google GenAI SDK
PRIMARY_MODEL = "gemini-2.0-flash"
FALLBACK_MODEL = "gemini-1.5-flash"


def _get_api_key() -> str:
    load_dotenv(override=True)
    return os.getenv("GEMINI_API_KEY", "")


def _is_configured() -> bool:
    key = _get_api_key()
    return bool(key and not key.startswith("your_"))


def _get_client():
    from google import genai
    return genai.Client(api_key=_get_api_key())


# ── Helpers ────────────────────────────────────────────────────────────────────

def _parse_json_response(text: str) -> dict:
    """Strip markdown fences and parse JSON."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        # Remove opening ```json or ``` and closing ```
        if lines[-1].strip() == "```":
            text = "\n".join(lines[1:-1])
        else:
            text = "\n".join(lines[1:])
    return json.loads(text.strip())


async def _call_gemini(system: str, prompt: str, timeout: int = 15) -> dict:
    """Call Gemini text model with retry on malformed JSON."""
    if not _is_configured():
        raise RuntimeError("GEMINI_NOT_CONFIGURED")

    from google import genai
    from google.genai import types

    client = _get_client()

    async def _attempt(model_name: str, extra: str = "") -> dict:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=model_name,
                contents=prompt + extra,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                )
            ),
            timeout=timeout
        )
        return _parse_json_response(response.text)

    try:
        return await _attempt(PRIMARY_MODEL)
    except Exception as e:
        print(f"[Gemini] Primary model ({PRIMARY_MODEL}) failed: {e}. Trying fallback ({FALLBACK_MODEL})...")
        try:
            return await _attempt(FALLBACK_MODEL)
        except Exception as e2:
            print(f"[Gemini] Fallback failed: {e2}")
            raise


async def _call_gemini_vision(system: str, prompt: str, image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """Call Gemini with an image."""
    if not _is_configured():
        raise RuntimeError("GEMINI_NOT_CONFIGURED")

    from google import genai
    from google.genai import types

    client = _get_client()

    async def _attempt(model_name: str, extra: str = "") -> dict:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=model_name,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    prompt + extra,
                ],
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                )
            ),
            timeout=25
        )
        return _parse_json_response(response.text)

    try:
        return await _attempt(PRIMARY_MODEL)
    except Exception as e:
        print(f"[Gemini Vision] Primary failed: {e}. Trying fallback...")
        return await _attempt(FALLBACK_MODEL)


# ── Mock fallbacks ─────────────────────────────────────────────────────────────

def _mock_plan(profile: dict) -> dict:
    return {
        "plan_summary": f"Here's a {profile.get('days_per_week', 3)}-day-a-week plan built around your goal to {profile.get('goal', 'get fit').replace('_', ' ')}. We'll keep things simple and fun!",
        "weekly_schedule": [
            {
                "day": "Monday",
                "focus": "Full Body",
                "exercises": [
                    {"name": "Squat", "sets": 3, "reps": 10, "rest_seconds": 60, "why_this_exercise": "Builds strong legs and core — the foundation of everything.", "equipment": "bodyweight_only"},
                    {"name": "Push-up", "sets": 3, "reps": 8, "rest_seconds": 60, "why_this_exercise": "Strengthens your chest, shoulders, and arms all at once.", "equipment": "bodyweight_only"},
                    {"name": "Plank", "sets": 3, "reps": 1, "rest_seconds": 60, "why_this_exercise": "A rock-solid core protects your back.", "equipment": "bodyweight_only"}
                ]
            },
            {
                "day": "Wednesday",
                "focus": "Cardio & Core",
                "exercises": [
                    {"name": "Jumping Jacks", "sets": 3, "reps": 20, "rest_seconds": 30, "why_this_exercise": "Gets your heart pumping and warms up your whole body.", "equipment": "bodyweight_only"},
                    {"name": "Mountain Climbers", "sets": 3, "reps": 15, "rest_seconds": 45, "why_this_exercise": "Cardio and core in one move.", "equipment": "bodyweight_only"}
                ]
            },
            {
                "day": "Friday",
                "focus": "Upper Body",
                "exercises": [
                    {"name": "Push-up", "sets": 3, "reps": 10, "rest_seconds": 60, "why_this_exercise": "Great for building pushing strength.", "equipment": "bodyweight_only"},
                    {"name": "Tricep Dip", "sets": 3, "reps": 10, "rest_seconds": 60, "why_this_exercise": "Tones the back of your arms.", "equipment": "bodyweight_only"}
                ]
            }
        ],
        "nutrition_tips": [
            "Drink a glass of water before every meal — it helps you feel full and stay hydrated.",
            "Try to have some protein at every meal to help your muscles recover.",
            "Don't skip breakfast — even something small gives you energy for the day."
        ]
    }


def _mock_coaching(set_data: dict) -> dict:
    avg_depth = set_data.get("avg_depth_score", 80)
    issues = set_data.get("alignment_issues_count", 0)
    reps = set_data.get("reps_completed", 10)

    if avg_depth >= 85:
        headline = f"Solid work on those {reps} reps — your depth looked really good! 💪"
        went_well = "Your squat depth was excellent — you're going all the way down."
        focus = "Try to keep a steady, controlled pace on the way down."
    else:
        headline = f"Good effort on {reps} reps — keep pushing! 💪"
        went_well = "You showed up and got the reps done — consistency is everything."
        focus = "Try going a little lower. Imagine sitting back into a chair."

    if issues > 2:
        focus = "Watch your knees — try to keep them pointing in the same direction as your toes."

    return {
        "headline": headline,
        "what_went_well": went_well,
        "focus_next_set": focus,
        "form_score": min(100, int(avg_depth * 0.8 + (10 - min(issues, 10)) * 2))
    }


def _mock_meal_analysis() -> dict:
    return {
        "identified_items": ["Rice", "Dal", "Mixed vegetables", "Salad"],
        "estimated_nutrition": {"energy_kcal": 450, "protein_g": 14, "carbs_g": 70, "fat_g": 8},
        "confidence": "medium",
        "verdict": "This looks like a well-balanced meal! The dal gives you plant-based protein, and the veggies add great nutrients. A good choice — enjoy it!"
    }


# ── Public API ─────────────────────────────────────────────────────────────────

async def generate_plan(profile: dict) -> dict:
    system = (
        "You are a certified fitness coach writing for a general audience. Never use "
        "technical jargon. Keep tone encouraging, concrete, and specific. Always respond "
        "with valid JSON matching the schema provided. Do not include markdown or text outside the JSON."
    )
    prompt = f"""Create a personalized weekly workout plan for this person:

Age: {profile.get('age')}
Height: {profile.get('height_cm')} cm
Weight: {profile.get('weight_kg')} kg
Experience: {profile.get('fitness_experience')}
Goal: {profile.get('goal')}
Equipment available: {profile.get('available_equipment')}
Time per session: {profile.get('available_time_minutes')} minutes
Days per week: {profile.get('days_per_week')}
Constraints/injuries: {profile.get('constraints')}

Rules:
- Use only the equipment listed.
- Respect all constraints.
- Keep exercise names simple and common.
- Give plain-language reasons for each exercise.
- Include nutrition tips.

Return JSON:
{{
  "plan_summary": "1-2 sentence friendly overview",
  "weekly_schedule": [
    {{
      "day": "Monday",
      "focus": "Full Body",
      "exercises": [
        {{
          "name": "Squat",
          "sets": 3,
          "reps": 10,
          "rest_seconds": 60,
          "why_this_exercise": "plain language reason",
          "equipment": "bodyweight_only"
        }}
      ]
    }}
  ],
  "nutrition_tips": ["tip 1", "tip 2"]
}}"""

    try:
        return await _call_gemini(system, prompt)
    except Exception as e:
        print(f"[Gemini] Plan generation failed: {e}. Using fallback plan.")
        return _mock_plan(profile)


async def update_plan_adaptive(previous_plan: dict, workout_data: dict) -> dict:
    system = (
        "You are updating a person's fitness plan based on their most recent workout. "
        "Keep plain, encouraging, jargon-free tone."
    )
    prompt = f"""Previous plan (JSON): {json.dumps(previous_plan)}

Most recent workout:
Exercise: {workout_data.get('exercise', 'Squat')}
Sets completed: {workout_data.get('sets_completed', 1)}
Average form score: {workout_data.get('avg_form_score', 75)}/100
Notes: {workout_data.get('session_notes', '')}
User feedback: "{workout_data.get('user_feedback', '')}"

Update the plan based on performance. If form > 85: increase difficulty slightly. If form < 60: reduce reps or suggest easier variation. Otherwise keep it the same but acknowledge progress.

Return JSON in the same schema as the original plan, plus:
{{"change_summary": "1-2 sentences plain language explaining what changed and why"}}"""

    try:
        return await _call_gemini(system, prompt)
    except Exception as e:
        print(f"[Gemini] Adaptive update failed: {e}. Using fallback.")
        result = dict(previous_plan)
        result["change_summary"] = "Great session! We've kept your plan the same — you're right on track. Keep showing up!"
        return result


async def coach_set(set_data: dict) -> dict:
    """Analyze a completed set with per-rep mistake identification.

    If the frontend provides a `set_summary` from the engine (with detailed
    per-rep metrics like depth, alignment, timing), we include it so Gemini
    can point out exactly which reps had issues and give targeted corrections.
    """
    exercise = set_data.get("exercise", "Squats")
    set_summary = set_data.get("set_summary")  # Rich data from engine

    system = (
        f"You are a supportive, data-driven fitness coach. Analyze ONE set of {exercise}. "
        "You have access to detailed per-rep metrics. Your job is to:\n"
        "1. Identify what went well across the set.\n"
        "2. Spot SPECIFIC reps where form broke down (e.g. 'On reps 3 and 5, your depth was only 40%').\n"
        "3. Give ONE clear, actionable correction for the NEXT set based on the pattern you see.\n"
        "4. Be encouraging but honest. Use plain language — no jargon.\n"
        "5. If form was great, say so and suggest a small progression.\n\n"
        "Metric context:\n"
    )

    # Add exercise-specific metric explanations
    if exercise == "Squats":
        system += (
            "- depth: 0.0 = standing, 1.0 = very deep squat. Target is ≥0.7 for a good squat.\n"
            "- alignment: 1.0 = knees perfectly over ankles, lower = knees caving. Target is ≥0.75.\n"
            "- min_knee_angle: smallest knee bend angle. ~90° is parallel. Lower = deeper.\n"
            "- duration_ms: time for one rep. 2000-4000ms is a controlled pace.\n"
        )
    elif exercise == "Lunges":
        system += (
            "- depth: 0.0 = standing, 1.0 = deep lunge. Target is ≥0.7.\n"
            "- alignment: 1.0 = front knee over ankle, lower = knee past toes. Target is ≥0.75.\n"
            "- min_front_knee_angle: front knee bend. ~90° is ideal.\n"
            "- back_angle: torso lean from vertical. <35° is good, >45° is leaning too much.\n"
        )
    elif exercise == "Bicep Curls":
        system += (
            "- curl_depth: 0.0 = arm extended, 1.0 = fully curled. Target is ≥0.8.\n"
            "- min_elbow_angle: smallest elbow angle. <50° is a full curl.\n"
            "- back_angle: how much the back swings. <25° is good, >40° means using momentum.\n"
            "- back_stability: 1.0 = stable, lower = swinging. Target is ≥0.6.\n"
        )

    # Build the prompt with all available data
    prompt_parts = [f"Exercise: {exercise}\n"]

    if set_summary:
        prompt_parts.append(f"Detailed set summary from pose tracker:\n{json.dumps(set_summary, indent=2)}\n")
    else:
        prompt_parts.append(f"Aggregated set data:\n{json.dumps(set_data, indent=2)}\n")

    prompt_parts.append(
        "\nAnalyze this data. Call out SPECIFIC rep numbers where issues occurred. "
        "Tell the user what pattern you see and what to fix in the upcoming set.\n\n"
        "Return JSON:\n"
        "{\n"
        '  "headline": "one short encouraging sentence summarizing the set",\n'
        '  "what_went_well": "specific praise referencing the data — mention rep numbers if relevant",\n'
        '  "focus_next_set": "specific correction for next set — reference which reps had the issue and what to do differently",\n'
        '  "form_score": 0\n'
        "}"
    )

    prompt = "\n".join(prompt_parts)

    try:
        return await _call_gemini(system, prompt)
    except Exception as e:
        print(f"[Gemini] Set coaching failed: {e}. Using fallback.")
        return _mock_coaching(set_data)


async def analyze_meal(image_bytes: bytes, mime_type: str, user_context: dict) -> dict:
    system = (
        "You are a friendly nutrition assistant. Given a meal photo and user context, "
        "estimate the nutrition. Be non-judgmental and encouraging. Always respond in valid JSON only."
    )
    prompt = f"""User's goal: {user_context.get('goal', 'general_fitness')}
Dietary preference: {user_context.get('dietary_preference', 'no_preference')}
Meals already logged today: {user_context.get('todays_meals_summary', 'None yet')}

Analyze the attached meal photo.

Return JSON:
{{
  "identified_items": ["item1", "item2"],
  "estimated_nutrition": {{
    "energy_kcal": 0,
    "protein_g": 0,
    "carbs_g": 0,
    "fat_g": 0
  }},
  "confidence": "medium",
  "verdict": "1-2 sentence plain-language encouraging guidance"
}}"""

    try:
        return await _call_gemini_vision(system, prompt, image_bytes, mime_type)
    except Exception as e:
        print(f"[Gemini] Meal analysis failed: {e}. Using fallback.")
        return _mock_meal_analysis()


# ── Per-Rep Coaching ──────────────────────────────────────────────────────────

_REP_FALLBACKS = {
    "Bicep Curls": [
        "Great curl! Keep the elbow steady.",
        "Squeeze at the top for full activation.",
        "Nice rep — control the lowering phase.",
    ],
    "Push-Ups": [
        "Keep your core tight throughout.",
        "Great push-up! Maintain a straight body line.",
        "Nice depth — control the descent.",
    ],
    "Squats": [
        "Good squat! Drive through your heels.",
        "Try going a little deeper next rep.",
        "Chest up, knees tracking over toes.",
    ],
    "Lunges": [
        "Good lunge! Keep your front knee over ankle.",
        "Stand tall — watch that torso lean.",
        "Nice step! Push through the front heel.",
    ],
}

import random

def _fallback_rep_phrase(exercise: str) -> str:
    phrases = _REP_FALLBACKS.get(exercise, ["Good rep! Keep going."])
    return random.choice(phrases)


async def coach_rep(exercise: str, rep_data: dict) -> dict:
    """Return a single short coaching phrase for one completed rep.

    Optimised for speed: tight timeout (10 s), minimal tokens.
    Falls back deterministically if Gemini is unavailable.
    """
    system = (
        "You are a concise fitness coach. Given one completed rep's metrics, "
        "respond with ONLY a valid JSON object containing a single field 'phrase'. "
        "The phrase must be a direct, friendly coaching tip in 8 words or fewer. "
        "No jargon. No markdown."
    )

    # Build a compact, exercise-aware prompt
    notes = []
    if rep_data.get("depth_score") is not None:
        d = rep_data["depth_score"]
        notes.append(f"depth score {int(d)}/100 ({'good' if d >= 70 else 'shallow'})")
    if rep_data.get("alignment_ok") is not None:
        notes.append("knees aligned" if rep_data["alignment_ok"] else "knees caved inward")
    if rep_data.get("back_angle") is not None:
        ba = rep_data["back_angle"]
        notes.append(f"back angle {int(ba)}° from vertical ({'upright' if ba < 45 else 'leaning forward'})")
    if rep_data.get("elbow_angle") is not None:
        ea = rep_data["elbow_angle"]
        notes.append(f"elbow angle {int(ea)}° ({'full curl' if ea < 50 else 'partial curl'})")
    if rep_data.get("body_line_angle") is not None:
        bl = rep_data["body_line_angle"]
        notes.append(f"body line angle {int(bl)}° ({'straight' if bl < 20 else 'sagging'})")
    if rep_data.get("front_knee_angle") is not None:
        fk = rep_data["front_knee_angle"]
        notes.append(f"front knee angle {int(fk)}°")

    observations = "; ".join(notes) if notes else "no specific issues detected"
    prompt = (
        f'Exercise: {exercise}. Rep {rep_data.get("rep_number", 1)} observation: {observations}. '
        f'Return JSON: {{"phrase": "your tip here"}}'
    )

    try:
        result = await _call_gemini(system, prompt, timeout=10)
        phrase = result.get("phrase", "").strip()
        if not phrase or len(phrase.split()) > 15:
            raise ValueError("phrase too long or empty")
        return {"phrase": phrase}
    except Exception as e:
        print(f"[Gemini] Rep coaching failed: {e}. Using deterministic fallback.")
        return {"phrase": _fallback_rep_phrase(exercise)}

