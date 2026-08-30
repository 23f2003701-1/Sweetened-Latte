from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.models.schemas import SuccessResponse
from app.services import gemini, supabase_client as db

router = APIRouter(prefix="/plans", tags=["plans"])


class RegeneratePlanRequest(BaseModel):
    user_feedback: Optional[str] = None


@router.get("/{user_id}", response_model=SuccessResponse)
async def get_plan(user_id: str):
    """Fetch the active plan for a user."""
    plan = db.get_active_plan(user_id)
    if plan is None:
        raise HTTPException(status_code=404, detail={"code": "PLAN_NOT_FOUND", "message": "No active plan found"})
    return SuccessResponse(data=plan)


@router.post("/{user_id}/regenerate", response_model=SuccessResponse)
async def regenerate_plan(user_id: str, body: RegeneratePlanRequest = RegeneratePlanRequest()):
    """Force a full regeneration of the user's plan."""
    user = db.get_user(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "User not found"})

    profile = {k: user[k] for k in user if k != "user_id"}
    if body.user_feedback:
        profile["additional_notes"] = body.user_feedback

    try:
        plan_json = await gemini.generate_plan(profile)
    except Exception as e:
        raise HTTPException(status_code=502, detail={"code": "GEMINI_ERROR", "message": str(e)})

    saved = db.save_plan(user_id, plan_json, change_summary=None)
    return SuccessResponse(data={"plan": plan_json, "plan_id": saved.get("plan_id")})

