from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional
import uuid

from app.models.schemas import SuccessResponse
from app.services import gemini, supabase_client as db

router = APIRouter(prefix="/meals", tags=["meals"])


@router.post("/analyze", response_model=SuccessResponse)
async def analyze_meal(
    user_id: str = Form(...),
    goal: str = Form("general_fitness"),
    dietary_preference: str = Form("no_preference"),
    image: UploadFile = File(...)
):
    """Upload a meal photo → Gemini Vision → nutrition JSON → save → return."""
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
        "estimated_nutrition": result.get("estimated_nutrition", {}),
        "confidence": result.get("confidence", "medium"),
        "verdict": result.get("verdict", "")
    })


@router.get("/{user_id}/today", response_model=SuccessResponse)
async def get_todays_meals(user_id: str):
    """Fetch today's logged meals."""
    meals = db.get_todays_meals(user_id)
    return SuccessResponse(data={"meals": meals})
