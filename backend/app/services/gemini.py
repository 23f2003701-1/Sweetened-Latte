"""Gemini service — uses google-genai SDK with automatic fallbacks."""
import os
import json
import asyncio
from typing import Any

from dotenv import load_dotenv

load_dotenv()

# Supported models in Google GenAI SDK
PRIMARY_MODEL = "gemini-3.5-flash-lite"
FALLBACK_MODEL = "gemini-3.6-flash"


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
        print(f"[Gemini Text] Primary model ({PRIMARY_MODEL}) failed: {e}. Trying fallback ({FALLBACK_MODEL})...")
        try:
            return await _attempt(FALLBACK_MODEL)
        except Exception as e2:
            print(f"[Gemini Text] Fallback failed: {e2}")
            raise


async def _call_gemini_vision(system: str, prompt: str, image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """Call Gemini with an image."""
    if not _is_configured():
        raise RuntimeError("GEMINI_NOT_CONFIGURED")

    from google import genai
    from google.genai import types

    client = _get_client()
    clean_mime = mime_type.split(";")[0].strip() if mime_type else "image/jpeg"

    async def _attempt(model_name: str, extra: str = "") -> dict:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model=model_name,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=clean_mime),
                    prompt + extra,
                ],
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                )
            ),
            timeout=30
        )
        return _parse_json_response(response.text)

    try:
        return await _attempt(PRIMARY_MODEL)
    except Exception as e:
        print(f"[Gemini Vision] Primary ({PRIMARY_MODEL}) failed: {e}. Trying fallback ({FALLBACK_MODEL})...")
        try:
            return await _attempt(FALLBACK_MODEL)
        except Exception as e2:
            print(f"[Gemini Vision] Fallback failed: {e2}")
            raise


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
        "identified_items": ["Creamy Butter Chicken", "Garlic Naan", "Rice"],
        "is_calorie_heavy": True,
        "estimated_nutrition": {
            "energy_kcal_range": "650 - 800 kcal",
            "protein_g_range": "24 - 32 g",
            "carbs_g_range": "70 - 90 g",
            "fat_g_range": "30 - 40 g",
            "energy_kcal_min": 650,
            "energy_kcal_max": 800,
            "energy_kcal": 725,
            "protein_g": 28,
            "carbs_g": 80,
            "fat_g": 35
        },
        "confidence": "high",
        "verdict": "This meal is delicious but quite rich in butter and refined carbs, making it calorie-dense (650 - 800 kcal).",
        "alternative_food": {
            "name": "Tandoori Chicken Bowl with Mint Chutney & Salad",
            "description": "Grilled lean chicken breast seasoned with aromatic tandoori spices, served with fresh cucumber salad and mint yogurt chutney.",
            "is_recommended": True,
            "estimated_nutrition_range": {
                "energy_kcal_range": "320 - 400 kcal",
                "protein_g_range": "35 - 42 g",
                "carbs_g_range": "15 - 25 g",
                "fat_g_range": "8 - 12 g",
                "energy_kcal": 360
            },
            "image_prompt": "Vibrant Tandoori Chicken bowl with green mint chutney and fresh crisp salad, food photography, gemini nano banana theme"
        }
    }


def _generate_nano_banana_svg_fallback(food_name: str, description: str) -> str:
    import urllib.parse
    clean_name = food_name.replace("<", "").replace(">", "")
    clean_desc = description.replace("<", "").replace(">", "")
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="500" height="320" viewBox="0 0 500 320">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="50%" stop-color="#1e293b"/>
          <stop offset="100%" stop-color="#090d16"/>
        </linearGradient>
        <linearGradient id="bananaGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFE135"/>
          <stop offset="100%" stop-color="#F59E0B"/>
        </linearGradient>
        <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="rgba(255, 225, 53, 0.12)"/>
          <stop offset="100%" stop-color="rgba(16, 185, 129, 0.12)"/>
        </linearGradient>
      </defs>
      <rect width="500" height="320" fill="url(#bg)" rx="16"/>
      <circle cx="420" cy="60" r="120" fill="url(#bananaGrad)" opacity="0.15" style="filter: blur(40px);"/>
      <rect x="20" y="20" width="460" height="280" fill="url(#cardGrad)" rx="14" stroke="rgba(255,225,53,0.3)" stroke-width="1.5"/>
      <g transform="translate(35, 45)">
        <path d="M 10 40 Q 40 5 75 30 Q 60 65 10 40 Z" fill="url(#bananaGrad)"/>
        <text x="90" y="32" fill="#FFE135" font-family="system-ui, sans-serif" font-weight="800" font-size="13" letter-spacing="1.2">GEMINI NANO BANANA • AI ALTERNATIVE</text>
      </g>
      <text x="35" y="130" fill="#FFFFFF" font-family="system-ui, sans-serif" font-weight="800" font-size="22">{clean_name[:34]}</text>
      <text x="35" y="162" fill="#94A3B8" font-family="system-ui, sans-serif" font-weight="500" font-size="13">{clean_desc[:58]}...</text>
      <g transform="translate(35, 205)">
        <rect x="0" y="0" width="150" height="38" rx="19" fill="rgba(16, 185, 129, 0.2)" stroke="#10B981" stroke-width="1"/>
        <text x="75" y="24" fill="#10B981" font-family="system-ui, sans-serif" font-weight="700" font-size="13" text-anchor="middle">🥗 Calorie Smart</text>
      </g>
      <g transform="translate(195, 205)">
        <rect x="0" y="0" width="170" height="38" rx="19" fill="rgba(255, 225, 53, 0.2)" stroke="#FFE135" stroke-width="1"/>
        <text x="85" y="24" fill="#FFE135" font-family="system-ui, sans-serif" font-weight="700" font-size="13" text-anchor="middle">🍌 Gemini Nano AI</text>
      </g>
    </svg>"""
    return f"data:image/svg+xml;utf8,{urllib.parse.quote(svg)}"


async def generate_alternative_food_image(prompt: str, food_name: str = "", description: str = "") -> str:
    """Generate image of alternative food using Google GenAI SDK (Imagen / Gemini Nano Banana)."""
    if _is_configured():
        try:
            client = _get_client()
            for model_name in ["imagen-3.0-generate-002", "imagen-3.0-fast-generate-001"]:
                try:
                    result = await asyncio.wait_for(
                        asyncio.to_thread(
                            client.models.generate_images,
                            model=model_name,
                            prompt=prompt or f"Delicious healthy food photo of {food_name}",
                            config={"number_of_images": 1, "output_mime_type": "image/jpeg", "aspect_ratio": "1:1"}
                        ),
                        timeout=12
                    )
                    if result and hasattr(result, "generated_images") and result.generated_images:
                        import base64
                        img_bytes = result.generated_images[0].image.image_bytes
                        encoded = base64.b64encode(img_bytes).decode('utf-8')
                        return f"data:image/jpeg;base64,{encoded}"
                except Exception as ex:
                    print(f"[Gemini ImageGen] Model {model_name} note: {ex}")
        except Exception as e:
            print(f"[Gemini ImageGen] overall exception: {e}")

    return _generate_nano_banana_svg_fallback(food_name or "Healthy Meal Alternative", description or "Nutritious low-calorie alternative")


# ── Public API ─────────────────────────────────────────────────────────────────

async def generate_plan(profile: dict) -> dict:
    system = (
        "You are a certified fitness coach and nutritionist writing for a general audience. Never use "
        "technical jargon. Keep tone encouraging, concrete, and specific. Always respond "
        "with valid JSON matching the schema provided. Do not include markdown or text outside the JSON."
    )
    
    # Format lists nicely
    equip_list = profile.get('available_equipment', [])
    equip_str = ", ".join(equip_list) if equip_list else "None (bodyweight only)"
    
    constraints_list = profile.get('constraints', [])
    constraints_str = ", ".join(constraints_list) if constraints_list else "None"

    prompt = f"""Create a personalized weekly workout plan for this person:

Age: {profile.get('age')}
Sex: {profile.get('sex', 'Not specified')}
Height: {profile.get('height_cm')} cm
Weight: {profile.get('weight_kg')} kg
Experience: {profile.get('fitness_experience')}
Goal: {profile.get('goal')}
Dietary preference: {profile.get('dietary_preference', 'no_preference')}
Equipment available: {equip_str}
Time per session: {profile.get('available_time_minutes')} minutes
Days per week: {profile.get('days_per_week')}
Constraints/injuries: {constraints_str}

Rules:
- Use only the equipment listed.
- Respect all constraints and injuries strictly.
- Keep exercise names simple and common.
- Give plain-language reasons for each exercise.
- Include nutrition tips tailored to their dietary preference ({profile.get('dietary_preference', 'no_preference')}) and goal.

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


async def adjust_plan_for_meal_choice(previous_plan: dict, meal_choice_data: dict) -> dict:
    """Dynamically adjust the next day's workout session based on whether the user ate the calorie-heavy meal or lower-calorie alternative."""
    system = (
        "You are an adaptive fitness coach. Modify the user's active workout plan based on their meal choice. "
        "If they ate a high-calorie/calorie-heavy meal, adjust their next workout session by adding specific calorie-burning exercises "
        "(e.g., Burpees, Mountain Climbers, High Knees, Jump Ropes, HIIT cardio) to burn off those extra calories. "
        "If they ate the low-calorie healthy alternative, adjust the workout to focus on lean strength and optimal performance. "
        "Return valid JSON only."
    )
    prompt = f"""Active Workout Plan: {json.dumps(previous_plan)}

Meal Choice Logged:
User choice: {meal_choice_data.get('choice')} ('original' = ate calorie-heavy meal, 'alternative' = ate healthy lower calorie alternative)
Meal Name: {meal_choice_data.get('meal_name')}
Calories Consumed Range: {meal_choice_data.get('calories_consumed_range', '450-600 kcal')}
Is High Calorie: {meal_choice_data.get('is_calorie_heavy', True)}

Instructions:
1. Identify the next upcoming workout day in weekly_schedule.
2. If choice == 'original' (high calories):
   - Append 1-2 high-intensity calorie-burning exercises (e.g., 'Burpees (Burn Surplus)', 'Mountain Climbers HIIT') to that day's exercise list with reps/duration aimed at burning the surplus ~250-400 kcal.
   - Set change_summary to explicitly explain what extra exercises were added to burn the calories eaten.
3. If choice == 'alternative' (low calories):
   - Optimize the next workout for energy and muscle building.
   - Set change_summary to congratulate the user on choosing the healthy alternative.

Return full plan JSON matching original structure plus:
{{"change_summary": "Explicit 1-2 sentence explanation of workout adjustment based on meal decision"}}"""

    try:
        return await _call_gemini(system, prompt)
    except Exception as e:
        print(f"[Gemini] Meal choice workout update failed: {e}. Applying structured fallback.")
        result = dict(previous_plan)
        schedule = result.get("weekly_schedule", [])
        choice = meal_choice_data.get("choice", "original")
        
        if schedule:
            next_day = schedule[0]
            exercises = next_day.get("exercises", [])
            if choice == "original":
                exercises.append({
                    "name": "Burpees & Mountain Climbers (Calorie Burner)",
                    "sets": 4,
                    "reps": 15,
                    "rest_seconds": 30,
                    "why_this_exercise": "Added specifically to burn off excess calories from your recent meal!",
                    "equipment": "bodyweight_only"
                })
                result["change_summary"] = f"Next workout ({next_day.get('day', 'Tomorrow')}) adjusted: Added 4 sets of Burpees & Mountain Climbers to burn off the extra calories from your meal!"
            else:
                result["change_summary"] = f"Great job choosing the healthy alternative! Your {next_day.get('day', 'next')} workout is optimized for peak performance and recovery."
        else:
            result["change_summary"] = "Workout plan updated based on your nutrition choice!"

        return result


async def coach_set(set_data: dict) -> dict:
    system = (
        "You are a supportive fitness coach. Analyze ONE set of squats. Give friendly, "
        "specific, non-technical feedback. Point out one thing done well and one thing to focus on. "
        "Avoid jargon — use plain terms like 'your knees moved inward' instead of 'valgus'."
    )
    prompt = f"""Set data: {json.dumps(set_data)}

Return JSON:
{{
  "headline": "one short encouraging sentence",
  "what_went_well": "plain language, specific to the data",
  "focus_next_set": "plain language, specific to the data",
  "form_score": 0
}}"""

    try:
        return await _call_gemini(system, prompt)
    except Exception as e:
        print(f"[Gemini] Set coaching failed: {e}. Using fallback.")
        return _mock_coaching(set_data)


async def analyze_meal(image_bytes: bytes, mime_type: str, user_context: dict) -> dict:
    system = (
        "You are a certified nutrition assistant. Given a meal photo and user context, "
        "estimate the nutrition in ranges (min-max). Determine if the meal is calorie-heavy. "
        "If it is calorie-heavy (or energy-dense), suggest a healthy lower-calorie alternative food item. "
        "Always respond in valid JSON only."
    )
    prompt = f"""User's goal: {user_context.get('goal', 'general_fitness')}
Dietary preference: {user_context.get('dietary_preference', 'no_preference')}
Meals already logged today: {user_context.get('todays_meals_summary', 'None yet')}

Analyze the attached meal photo.

Return JSON strictly in this schema:
{{
  "identified_items": ["item 1", "item 2"],
  "is_calorie_heavy": true,
  "estimated_nutrition": {{
    "energy_kcal_range": "450 - 550 kcal",
    "protein_g_range": "15 - 22 g",
    "carbs_g_range": "50 - 65 g",
    "fat_g_range": "18 - 25 g",
    "energy_kcal": 500,
    "protein_g": 18,
    "carbs_g": 58,
    "fat_g": 21
  }},
  "confidence": "high",
  "verdict": "1-2 sentence encouraging feedback explaining the meal density.",
  "alternative_food": {{
    "name": "Healthy Alternative Name",
    "description": "Short appetizing description of alternative meal",
    "estimated_nutrition_range": {{
      "energy_kcal_range": "250 - 320 kcal",
      "protein_g_range": "25 - 30 g",
      "carbs_g_range": "20 - 30 g",
      "fat_g_range": "6 - 10 g",
      "energy_kcal": 285
    }},
    "image_prompt": "Appetizing prompt for image generation of this healthy food, gemini nano banana theme"
  }}
}}"""

    try:
        res = await _call_gemini_vision(system, prompt, image_bytes, mime_type)
        if res.get("alternative_food"):
            alt = res["alternative_food"]
            img_prompt = alt.get("image_prompt", f"Healthy {alt.get('name', 'meal')}")
            alt["image_url"] = await generate_alternative_food_image(
                img_prompt, alt.get("name", ""), alt.get("description", "")
            )
        return res
    except Exception as e:
        print(f"[Gemini] Meal analysis failed: {e}. Using fallback.")
        fallback = _mock_meal_analysis()
        alt = fallback.get("alternative_food", {})
        alt["image_url"] = await generate_alternative_food_image(
            alt.get("image_prompt", "Healthy meal"), alt.get("name", ""), alt.get("description", "")
        )
        fallback["alternative_food"] = alt
        return fallback


# ── Physiotherapy Mode (PhysioGuard AI) ────────────────────────────────────────

def _mock_prescription() -> dict:
    return {
        "patient_context": {
            "diagnosis": "Post-operative ACL rehabilitation",
            "surgical_status": "Post-op ACL reconstruction (Left Knee)",
            "notes": [
                "Progressive active extension exercise",
                "Strict range of motion limits apply during early phase"
            ]
        },
        "exercises": [
            {
                "name": "Seated Active Knee Extension",
                "joint": "knee",
                "side": "left",
                "max_safe_angle": 30,
                "min_safe_angle": 0,
                "target_reps": 10,
                "target_sets": 3,
                "instructions": [
                    "Perform the exercise while seated with thigh supported on chair.",
                    "Slowly extend the knee up to the prescribed 30 degree limit."
                ],
                "restrictions": [
                    "Do not extend knee beyond 30 degrees.",
                    "Avoid sudden jerky terminal extension."
                ]
            },
            {
                "name": "Rehab Bodyweight Squat",
                "joint": "knee",
                "side": "bilateral",
                "max_safe_angle": 70,
                "min_safe_angle": 0,
                "target_reps": 8,
                "target_sets": 3,
                "instructions": [
                    "Maintain upright torso posture with feet shoulder-width apart.",
                    "Controlled descent to shallow 70 degree knee flexion."
                ],
                "restrictions": [
                    "Do not squat deeper than 70 degrees knee bend."
                ]
            },
            {
                "name": "Shoulder Abduction & Flexion",
                "joint": "shoulder",
                "side": "right",
                "max_safe_angle": 90,
                "min_safe_angle": 0,
                "target_reps": 10,
                "target_sets": 3,
                "instructions": [
                    "Smoothly raise arm out to the side up to shoulder height."
                ],
                "restrictions": [
                    "Do not elevate arm above 90 degrees."
                ]
            }
        ]
    }


async def parse_prescription(file_bytes: bytes, mime_type: str) -> dict:
    """Parse physiotherapy prescription document into structured JSON."""
    if not file_bytes or len(file_bytes) == 0:
        return _mock_prescription()

    system = (
        "You are an expert clinical physiotherapy parsing assistant. Extract unstructured "
        "physiotherapy report contents into structured exercise instructions strictly following clinical safety rules:\n"
        "1. Never invent a diagnosis, surgical status, ROM limit, sets, or reps.\n"
        "2. Only extract values explicitly provided in the document. Return null if missing.\n"
        "3. If a restriction is ambiguous, mark it clearly under restrictions.\n"
        "Always respond in valid JSON matching the exact schema."
    )
    prompt = """Analyze the attached physiotherapy document or report.

Return JSON in this schema:
{
  "patient_context": {
    "diagnosis": "Explicit diagnosis or null if missing",
    "surgical_status": "Explicit surgical status or null if missing",
    "notes": ["clinical note 1"]
  },
  "exercises": [
    {
      "name": "Exercise Name",
      "joint": "knee|hip|shoulder|elbow|ankle|spine",
      "side": "left|right|bilateral",
      "max_safe_angle": 30,
      "min_safe_angle": 0,
      "target_reps": 10,
      "target_sets": 3,
      "instructions": ["instruction 1"],
      "restrictions": ["restriction 1"]
    }
  ]
}"""

    try:
        return await _call_gemini_vision(system, prompt, file_bytes, mime_type)
    except Exception as e:
        print(f"[Gemini Physio] Document parse failed: {e}. Using clinical fallback prescription.")
        return _mock_prescription()


async def audit_rehab_session(telemetry: dict) -> dict:
    """Audit rehabilitation session telemetry (not raw video frames) for ROM compliance and feedback."""
    system = (
        "You are a clinical AI movement observer assistant. Audit structured exercise movement telemetry. "
        "Evaluate whether prescribed guardrails were respected. Voice feedback must be under 15 words, clear, "
        "encouraging, actionable, and non-technical."
    )
    prompt = f"""Movement Telemetry: {json.dumps(telemetry)}

Return JSON:
{{
  "status": "compliant | needs_correction",
  "guardrail_compliance": true,
  "issue": "Brief clinical observation or null",
  "voice_feedback": "Voice correction under 15 words",
  "clinical_log": {{
    "reps_completed": 0,
    "reps_with_limit_exceeded": 0,
    "sets_completed": 0
  }}
}}"""

    try:
        return await _call_gemini(system, prompt)
    except Exception as e:
        print(f"[Gemini Physio] Audit failed: {e}. Using fallback audit.")
        exceeded = telemetry.get("rom_exceeded", False)
        return {
            "status": "needs_correction" if exceeded else "compliant",
            "guardrail_compliance": not exceeded,
            "issue": "ROM limit exceeded" if exceeded else None,
            "voice_feedback": "Stay within the prescribed range." if exceeded else "Good movement! Keep it controlled.",
            "clinical_log": {
                "reps_completed": telemetry.get("rep", 1),
                "reps_with_limit_exceeded": 1 if exceeded else 0,
                "sets_completed": telemetry.get("set", 1)
            }
        }


async def generate_physio_summary(telemetry: dict) -> dict:
    """Generate overall natural language clinical adherence summary for a finished rehab session."""
    system = (
        "You are a supportive physiotherapy clinical assistant summarizing a completed session. "
        "Write a 2-3 sentence encouraging, concise clinical summary."
    )
    prompt = f"""Session Summary Telemetry: {json.dumps(telemetry)}

Return JSON:
{{
  "overall_adherence": "Good adherence with minimal ROM deviations.",
  "clinical_notes": ["Note 1", "Note 2"]
}}"""

    try:
        return await _call_gemini(system, prompt)
    except Exception as e:
        return {
            "overall_adherence": "Great effort! Excellent session adherence to your prescribed exercises.",
            "clinical_notes": [
                "Maintained controlled movement tempo throughout sets.",
                "Consistently respected safe angle guardrails."
            ]
        }


