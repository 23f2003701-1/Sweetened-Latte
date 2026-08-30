from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    SessionStartRequest,
    SetCompleteRequest,
    SessionEndRequest,
    SuccessResponse,
)
from app.services import gemini, supabase_client as db

router = APIRouter(prefix="/exercise", tags=["exercise"])


@router.post("/session/start", response_model=SuccessResponse)
async def start_session(body: SessionStartRequest):
    """Create a new workout session and return session_id."""
    session = db.create_session(body.user_id, body.exercise)
    return SuccessResponse(data={"session_id": session.get("session_id"), "exercise": body.exercise})


@router.post("/session/{session_id}/set-complete", response_model=SuccessResponse)
async def set_complete(session_id: str, body: SetCompleteRequest):
    """Accept aggregated rep data → call Gemini for coaching → save set → return coaching."""
    set_payload = {
        "exercise": body.exercise,
        "reps_completed": body.reps_completed,
        "avg_depth_score": body.avg_depth_score,
        "avg_tempo_seconds": body.avg_tempo_seconds,
        "alignment_issues_count": body.alignment_issues_count,
        "per_rep": [r.model_dump() for r in body.per_rep]
    }

    try:
        coaching = await gemini.coach_set(set_payload)
    except Exception as e:
        coaching = {
            "headline": "Great set! Keep it up 💪",
            "what_went_well": "You completed all your reps — that's a win.",
            "focus_next_set": "Stay consistent with your form.",
            "form_score": 75
        }

    set_record = {**set_payload, "coaching": coaching}
    db.append_set_to_session(session_id, set_record)

    return SuccessResponse(data={"session_id": session_id, "coaching": coaching})


@router.post("/session/{session_id}/end", response_model=SuccessResponse)
async def end_session(session_id: str, body: SessionEndRequest):
    """End the session and trigger adaptive plan update."""
    db.end_session(session_id)

    # Gather session data for adaptive re-plan
    session = db.get_session(session_id)
    sets = session.get("sets", []) if session else []
    all_form_scores = [s.get("coaching", {}).get("form_score", 75) for s in sets]
    avg_form = sum(all_form_scores) / len(all_form_scores) if all_form_scores else 75

    workout_data = {
        "exercise": session.get("exercise", "Squat") if session else "Squat",
        "sets_completed": len(sets),
        "avg_form_score": avg_form,
        "session_notes": body.session_notes,
        "user_feedback": body.user_feedback
    }

    # Get current plan and adapt it
    active_plan = db.get_active_plan(body.user_id)
    change_summary = None

    if active_plan:
        try:
            updated_plan = await gemini.update_plan_adaptive(active_plan.get("plan_json", {}), workout_data)
            change_summary = updated_plan.pop("change_summary", None)
            db.save_plan(body.user_id, updated_plan, change_summary=change_summary)
        except Exception:
            change_summary = "Great session! Your plan stays the same — you're on track. Keep it up!"

    return SuccessResponse(data={
        "session_id": session_id,
        "change_summary": change_summary,
        "avg_form_score": avg_form
    })


@router.get("/session/{session_id}", response_model=SuccessResponse)
async def get_session(session_id: str):
    """Fetch session details."""
    session = db.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail={"code": "SESSION_NOT_FOUND", "message": "Session not found"})
    return SuccessResponse(data=session)
