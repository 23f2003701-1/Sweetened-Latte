from fastapi import APIRouter, HTTPException
import uuid

from app.models.schemas import OnboardRequest, SuccessResponse
from app.services import gemini, supabase_client as db

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/onboard", response_model=SuccessResponse)
async def onboard_user(body: OnboardRequest):
    """Create a user profile and generate their initial fitness plan."""
    user_id = str(uuid.uuid4())
    profile = body.model_dump()

    # Normalize height if entered in feet or meters
    h = profile.get("height_cm", 170.0)
    if h and h < 10:
        profile["height_cm"] = round(h * 30.48, 1)
    elif h and h < 30:
        profile["height_cm"] = round(h * 100, 1)

    # Save user profile
    db.upsert_user(user_id, profile)

    # Generate plan with Gemini (has fallback internally)
    try:
        plan_json = await gemini.generate_plan(profile)
    except Exception as e:
        print(f"[Onboard] Gemini generate_plan error: {e}")
        plan_json = gemini._mock_plan(profile)

    # Save plan
    saved_plan = db.save_plan(user_id, plan_json)

    return SuccessResponse(data={
        "user_id": user_id,
        "plan": plan_json,
        "plan_id": saved_plan.get("plan_id")
    })


@router.get("/{user_id}/plan", response_model=SuccessResponse)
async def get_plan(user_id: str):
    """Fetch the active plan for a user."""
    plan = db.get_active_plan(user_id)
    if plan is None:
        raise HTTPException(status_code=404, detail={"code": "PLAN_NOT_FOUND", "message": "No active plan found"})
    return SuccessResponse(data=plan)
