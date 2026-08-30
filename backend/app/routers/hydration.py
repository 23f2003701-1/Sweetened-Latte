from fastapi import APIRouter

from app.models.schemas import HydrationLogRequest, SuccessResponse
from app.services import supabase_client as db

router = APIRouter(prefix="/hydration", tags=["hydration"])


@router.post("/log", response_model=SuccessResponse)
async def log_water(body: HydrationLogRequest):
    """Log a water intake event."""
    result = db.log_hydration(body.user_id, body.amount_ml or 250)
    return SuccessResponse(data=result)


@router.get("/{user_id}/today", response_model=SuccessResponse)
async def get_hydration_today(user_id: str):
    """Fetch today's hydration log."""
    result = db.get_todays_hydration(user_id)
    return SuccessResponse(data=result)
