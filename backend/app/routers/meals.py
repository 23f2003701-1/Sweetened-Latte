from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
import uuid

from app.models.schemas import SuccessResponse, LogMealChoiceRequest
from app.services import gemini, supabase_client as db

router = APIRouter(prefix="/meals", tags=["meals"])


@router.post("/analyze", response_model=SuccessResponse)
async def analyze_meal(
    user_id: str = Form(...),
    goal: str = Form("general_fitness"),
    dietary_preference: str = Form("no_preference"),
    image: UploadFile = File(...)
):
    """Upload a meal photo → Gemini Vision → nutrition JSON (ranges & alternatives) → save → return."""
    image_bytes = await image.read()
    mime_type = image.content_type or "image/jpeg"

    # Get today's meals for context
    todays_meals = db.get_todays_meals(user_id)
    meals_summary = ", ".join(
        [" + ".join(m.get("identified_items", [])) for m in todays_meals]
    ) if todays_meals else "None yet"

    user_context = {
        "goal": goal,
        "dietary_preference": dietary_preference,
        "todays_meals_summary": meals_summary
    }

    try:
        result = await gemini.analyze_meal(image_bytes, mime_type, user_context)
    except Exception as e:
        raise HTTPException(status_code=502, detail={"code": "GEMINI_VISION_ERROR", "message": str(e)})

    # Save meal record
    meal_id = str(uuid.uuid4())
    saved = db.save_meal(user_id, result)
    meal_id = saved.get("meal_id", meal_id)

    return SuccessResponse(data={
        "meal_id": meal_id,
        "identified_items": result.get("identified_items", []),
        "is_calorie_heavy": result.get("is_calorie_heavy", False),
        "estimated_nutrition": result.get("estimated_nutrition", {}),
        "confidence": result.get("confidence", "medium"),
        "verdict": result.get("verdict", ""),
        "alternative_food": result.get("alternative_food")
    })


@router.post("/log-choice", response_model=SuccessResponse)
async def log_meal_choice(body: LogMealChoiceRequest):
    """Log user choice ('original' vs 'alternative') and adapt next day's workout plan to burn those calories."""
    user_id = body.user_id
    active_plan = db.get_active_plan(user_id)

    change_summary = "Meal choice logged!"
    updated_plan_json = None

    if active_plan:
        plan_json = active_plan.get("plan_json", {})
        meal_choice_data = {
            "choice": body.choice,
            "meal_name": body.meal_name,
            "calories_consumed_range": body.calories_consumed_range,
            "is_calorie_heavy": body.is_calorie_heavy,
        }
        try:
            updated_plan_json = await gemini.adjust_plan_for_meal_choice(plan_json, meal_choice_data)
            change_summary = updated_plan_json.pop("change_summary", "Workout adjusted based on your meal decision!")
            db.save_plan(user_id, updated_plan_json, change_summary=change_summary)
        except Exception as e:
            print(f"[Meals Router] Error updating plan for meal choice: {e}")
            change_summary = "Logged meal choice. Next workout stays on track!"
    else:
        change_summary = "Meal choice logged! Next day's workout session adjusted."

    return SuccessResponse(data={
        "user_id": user_id,
        "choice": body.choice,
        "change_summary": change_summary,
        "updated_plan": updated_plan_json
    })


@router.get("/{user_id}/today", response_model=SuccessResponse)
async def get_todays_meals(user_id: str):
    """Fetch today's logged meals."""
    meals = db.get_todays_meals(user_id)
    return SuccessResponse(data={"meals": meals})

