from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime
import uuid


# ── Shared response wrapper ────────────────────────────────────────────────────

class SuccessResponse(BaseModel):
    success: bool = True
    data: Any = None


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    success: bool = False
    error: ErrorDetail


# ── User / Onboarding ──────────────────────────────────────────────────────────

class OnboardRequest(BaseModel):
    age: Optional[int] = Field(default=25, ge=1, le=120)
    height_cm: Optional[float] = Field(default=170.0, ge=0.5, le=300)
    weight_kg: Optional[float] = Field(default=70.0, ge=1, le=500)
    sex: Optional[str] = Field(default="prefer_not_to_say")
    fitness_experience: Optional[str] = Field(default="beginner")
    goal: Optional[str] = Field(default="general_fitness")
    dietary_preference: Optional[str] = Field(default="no_preference")
    available_equipment: List[str] = Field(default_factory=lambda: ["bodyweight_only"])
    available_time_minutes: Optional[int] = Field(default=30, ge=1, le=300)
    days_per_week: Optional[int] = Field(default=3, ge=1, le=7)
    constraints: List[str] = Field(default_factory=list)


class OnboardResponse(BaseModel):
    user_id: str
    plan: dict


# ── Plans ──────────────────────────────────────────────────────────────────────

class RegeneratePlanRequest(BaseModel):
    user_feedback: Optional[str] = None


# ── Exercise Session ───────────────────────────────────────────────────────────

class RepData(BaseModel):
    rep_number: int
    depth_score: float
    alignment_ok: bool
    back_angle_max: float
    tempo_seconds: float


class SetCompleteRequest(BaseModel):
    user_id: str
    exercise: str = "Squat"
    reps_completed: int
    avg_depth_score: float
    avg_tempo_seconds: float
    alignment_issues_count: int
    per_rep: List[RepData]
    set_summary: Optional[dict] = None


class SessionStartRequest(BaseModel):
    user_id: str
    exercise: str = "Squat"


class SessionEndRequest(BaseModel):
    user_id: str
    session_notes: Optional[str] = ""
    user_feedback: Optional[str] = ""


# ── Per-Rep Gemini Feedback ────────────────────────────────────────────────────

class RepFeedbackRequest(BaseModel):
    exercise: str  # "Bicep Curls" | "Push-Ups" | "Squats" | "Lunges"
    rep_number: int = 1
    # Common fields
    depth_score: Optional[float] = None      # 0-100 (squats / lunges)
    alignment_ok: Optional[bool] = True
    back_angle: Optional[float] = None       # degrees from vertical
    # Exercise-specific
    elbow_angle: Optional[float] = None      # bicep curls / push-ups (degrees)
    body_line_angle: Optional[float] = None  # push-up straightness
    front_knee_angle: Optional[float] = None # lunges


class RepFeedbackResponse(BaseModel):
    phrase: str  # Short coaching phrase ≤ 12 words


# ── Meals ──────────────────────────────────────────────────────────────────────

class MealAnalysisResponse(BaseModel):
    meal_id: str
    identified_items: List[str]
    estimated_nutrition: dict
    confidence: str
    verdict: str


# ── Hydration ──────────────────────────────────────────────────────────────────

class HydrationLogRequest(BaseModel):
    user_id: str
    amount_ml: Optional[int] = 250


class HydrationLogResponse(BaseModel):
    user_id: str
    log_date: str
    logs: List[str]
    total_ml: int
    target_ml: int
