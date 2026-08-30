"""Gemini service — uses google-genai SDK with automatic fallbacks."""
import os
import json
import asyncio
from typing import Any

from dotenv import load_dotenv

load_dotenv()

# Supported models in Google GenAI SDK
PRIMARY_MODEL = "gemini-3.5-flash"
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
    from datetime import datetime, timedelta
    today = datetime.now()
    days_count = min(7, max(1, int(profile.get('days_per_week', 3))))
    
    step = max(1, 7 // days_count) if days_count > 1 else 1
    scheduled_days = [(today + timedelta(days=i * step)).strftime("%A") for i in range(days_count)]

    foci = ["Full Body", "Upper Body & Core", "Lower Body & Mobility", "Cardio & Stamina", "HIIT & Core", "Active Recovery", "Strength & Balance"]
    
    schedule = []
    for idx, day_name in enumerate(scheduled_days):
        focus = foci[idx % len(foci)]
        schedule.append({
            "day": day_name,
            "focus": focus,
            "exercises": [
                {"name": "Squat", "sets": 3, "reps": 10, "rest_seconds": 60, "why_this_exercise": "Builds strong legs and core — the foundation of movement.", "equipment": "bodyweight_only"},
                {"name": "Push-up", "sets": 3, "reps": 8, "rest_seconds": 60, "why_this_exercise": "Strengthens your chest, shoulders, and arms together.", "equipment": "bodyweight_only"},
                {"name": "Plank", "sets": 3, "reps": 1, "rest_seconds": 60, "why_this_exercise": "A rock-solid core protects your lower back.", "equipment": "bodyweight_only"}
            ]
        })

    return {
        "plan_summary": f"Here's a {days_count}-day-a-week plan starting today ({scheduled_days[0]}) built around your goal to {profile.get('goal', 'get fit').replace('_', ' ')}. Let's crush day one!",
        "weekly_schedule": schedule,
        "nutrition_tips": [
            "Drink a glass of water before every meal — it helps you stay hydrated and energetic.",
            "Include some protein at every meal to help your muscles recover.",
            "Consistency beats perfection — focus on completing today's workout."
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


def _get_realistic_food_image_url(food_name: str, prompt: str = "") -> str:
    import urllib.parse
    clean_name = food_name.strip() if food_name else "healthy delicious dish"
    photo_prompt = f"appetizing gourmet photograph of {clean_name}, plated beautifully on a modern dish, high resolution food photography, natural lighting, studio quality"
    encoded = urllib.parse.quote(photo_prompt)
    return f"https://image.pollinations.ai/prompt/{encoded}?width=600&height=400&nologo=true"


async def generate_alternative_food_image(prompt: str, food_name: str = "", description: str = "") -> str:
    """Generate alternative food image using Gemini nano-banana-pro-preview / gemini-2.5-flash-image with graceful fallback."""
    clean_name = food_name or "Healthy Meal Alternative"
    photo_prompt = prompt or f"appetizing delicious high-resolution food photography of {clean_name}"

    if _is_configured():
        try:
            import base64
            client = _get_client()
            for model_name in ["nano-banana-pro-preview", "gemini-2.5-flash-image", "gemini-3.1-flash-image"]:
                try:
                    response = await asyncio.wait_for(
                        asyncio.to_thread(
                            client.models.generate_content,
                            model=model_name,
                            contents=f"Generate an appetizing gourmet photograph of {clean_name}: {photo_prompt}",
                        ),
                        timeout=12
                    )
                    if response and response.candidates:
                        for part in response.candidates[0].content.parts:
                            if hasattr(part, "inline_data") and part.inline_data and part.inline_data.data:
                                mime = part.inline_data.mime_type or "image/jpeg"
                                encoded = base64.b64encode(part.inline_data.data).decode("utf-8")
                                return f"data:{mime};base64,{encoded}"
                except Exception as ex:
                    print(f"[Gemini Image Model: {model_name}] Quota/call note: {ex}")
        except Exception as e:
            print(f"[Gemini Image Generation Error]: {e}")

    return _get_realistic_food_image_url(clean_name, prompt)


# ── Public API ─────────────────────────────────────────────────────────────────

async def generate_plan(profile: dict) -> dict:
    from datetime import datetime
    today_name = datetime.now().strftime("%A")

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

    user_notes = f"\nUser specific feedback/request: {profile.get('additional_notes')}" if profile.get('additional_notes') else ""

    prompt = f"""Create a personalized weekly workout plan for this person:

Today is: {today_name}
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
Constraints/injuries: {constraints_str}{user_notes}

Rules:
- CRITICAL RULE: The weekly_schedule MUST start with TODAY ({today_name}) as Day 1 in the list, followed by the remaining workout days across the week.
- Use only the equipment listed.
- Respect all constraints and injuries strictly.
- Keep exercise names simple and common.
- Give plain-language reasons for each exercise.
- Include nutrition tips tailored to their dietary preference ({profile.get('dietary_preference', 'no_preference')}) and goal.

Return JSON:
{{
  "plan_summary": "1-2 sentence friendly overview mentioning starting today on {today_name}",
  "weekly_schedule": [
    {{
      "day": "{today_name}",
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
    """Dynamically adjust the workout plan based on whether the user ate the calorie-heavy meal or lower-calorie alternative."""
    from datetime import datetime
    today_name = datetime.now().strftime("%A")

    system = (
        "You are an adaptive fitness coach and nutritionist. Modify the user's active weekly workout plan based on their meal choice. "
        "If they ate a high-calorie/calorie-heavy meal, adapt their upcoming workout session by adding specific calorie-burning exercises "
        "(e.g., Burpees, Mountain Climbers, High Knees, Jump Ropes, HIIT cardio) to burn off those extra calories. "
        "If they ate the low-calorie healthy alternative, adjust the workout to focus on lean strength and optimal performance. "
        "CRITICAL RULE FOR LAST DAY OF PLAN: If today is the last scheduled workout day of the week (or the final day in weekly_schedule), "
        "do not adjust a day that already passed today. Instead, adapt the first workout of their next week's schedule (e.g. Monday kickoff), "
        "and clearly mention in change_summary that since today was the final workout of this week's schedule, the adjustment will take effect in next week's kickoff workout! "
        "Return valid JSON only."
    )
    
    first_scheduled_day = previous_plan.get("weekly_schedule", [{}])[0].get("day", "Monday") if previous_plan.get("weekly_schedule") else "Monday"

    prompt = f"""Active Workout Plan: {json.dumps(previous_plan)}

Current Day of the Week: {today_name}
Meal Choice Logged:
User choice: {meal_choice_data.get('choice')} ('original' = ate calorie-heavy meal, 'alternative' = ate healthy lower calorie alternative)
Meal Name: {meal_choice_data.get('meal_name')}
Calories Consumed Range: {meal_choice_data.get('calories_consumed_range', '450-600 kcal')}
Is High Calorie: {meal_choice_data.get('is_calorie_heavy', True)}

Instructions:
1. Look at weekly_schedule in the plan and find the next upcoming workout day relative to {today_name}.
2. If today is the last scheduled day of the week, target the first workout day of the upcoming cycle ({first_scheduled_day}).
3. If choice == 'original' (high calories):
   - Append 1-2 high-intensity calorie-burning exercises (e.g., 'Burpees (Calorie Burner)', 'Mountain Climbers HIIT') with appropriate sets/reps.
   - Set change_summary explaining clearly which day was adjusted (and if today was the last day, state that it's queued for next week's {first_scheduled_day} kickoff!).
4. If choice == 'alternative' (low calories):
   - Set change_summary congratulating the user on choosing the healthy alternative and keeping their plan optimized.

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
            last_day_name = schedule[-1].get("day", "")
            is_last_day = (today_name.lower() == last_day_name.lower()) or (len(schedule) == 1)
            target_day = schedule[0] if is_last_day else (schedule[1] if len(schedule) > 1 else schedule[0])
            exercises = target_day.get("exercises", [])
            
            if choice == "original":
                exercises.append({
                    "name": "Burpees & Mountain Climbers (Calorie Burner)",
                    "sets": 4,
                    "reps": 15,
                    "rest_seconds": 30,
                    "why_this_exercise": "Added specifically to burn off excess calories from your recent meal!",
                    "equipment": "bodyweight_only"
                })
                if is_last_day:
                    result["change_summary"] = f"Since today was the last workout of this week's plan, we've updated your next week's kickoff ({target_day.get('day', 'Monday')}) with 4 sets of Burpees to burn off the extra calories!"
                else:
                    result["change_summary"] = f"Next workout ({target_day.get('day', 'Tomorrow')}) adjusted: Added 4 sets of Burpees & Mountain Climbers to burn off the extra calories from your meal!"
            else:
                if is_last_day:
                    result["change_summary"] = f"Great job choosing the healthy alternative! Your next week's kickoff workout ({target_day.get('day', 'Monday')}) is primed for peak energy."
                else:
                    result["change_summary"] = f"Great job choosing the healthy alternative! Your {target_day.get('day', 'next')} workout is optimized for peak performance and recovery."
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

