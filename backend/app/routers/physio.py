from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Optional, Any
from pydantic import BaseModel

from app.models.schemas import SuccessResponse
from app.services import gemini

router = APIRouter(prefix="/physio", tags=["physio"])


class AuditSessionRequest(BaseModel):
    exercise: dict
    telemetry: dict


class SessionSummaryRequest(BaseModel):
    telemetry: dict


@router.post("/parse-prescription", response_model=SuccessResponse)
async def parse_prescription(report_file: Optional[UploadFile] = File(None)):
    """Upload physiotherapy report document (PDF/image) → Gemini extraction → prescription JSON."""
    file_bytes = b""
    mime_type = "image/jpeg"

    if report_file:
        file_bytes = await report_file.read()
        mime_type = report_file.content_type or "image/jpeg"

    try:
        parsed = await gemini.parse_prescription(file_bytes, mime_type)
        return SuccessResponse(data=parsed)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail={"code": "PRESCRIPTION_PARSE_ERROR", "message": str(e)}
        )


@router.post("/audit-session", response_model=SuccessResponse)
async def audit_session(body: AuditSessionRequest):
    """Periodic rehabilitation movement telemetry audit with Gemini."""
    try:
        telemetry = {**body.telemetry, "exercise_details": body.exercise}
        audit = await gemini.audit_rehab_session(telemetry)
        return SuccessResponse(data=audit)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail={"code": "AUDIT_ERROR", "message": str(e)}
        )


@router.post("/session-summary", response_model=SuccessResponse)
async def session_summary(body: SessionSummaryRequest):
    """Generate session summary clinical adherence analysis."""
    try:
        summary = await gemini.generate_physio_summary(body.telemetry)
        return SuccessResponse(data=summary)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail={"code": "SUMMARY_ERROR", "message": str(e)}
        )
