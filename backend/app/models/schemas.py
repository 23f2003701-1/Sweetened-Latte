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
    age: int = Field(..., ge=10, le=100)
    height_cm: float = Field(..., ge=100, le=250)
    weight_kg: float = Field(..., ge=20, le=300)
    sex: str = Field(..., pattern="^(male|female|other|prefer_not_to_say)$")
    fitness_experience: str = Field(..., pattern="^(beginner|intermediate|advanced)$")
    goal: str  # lose_weight | build_muscle | general_fitness | improve_endurance | improve_flexibility
    dietary_preference: str  # vegetarian | non_vegetarian | vegan | eggetarian | no_preference
    available_equipment: List[str] = Field(default_factory=list)
    available_time_minutes: int = Field(..., ge=10, le=180)
    days_per_week: int = Field(..., ge=1, le=7)
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


class SessionStartRequest(BaseModel):
    user_id: str
    exercise: str = "Squat"


class SessionEndRequest(BaseModel):
    user_id: str
    session_notes: Optional[str] = ""
    user_feedback: Optional[str] = ""


# ── Meals ──────────────────────────────────────────────────────────────────────

class MealAnalysisResponse(BaseModel):
    meal_id: str
    identified_items: List[str]
    is_calorie_heavy: Optional[bool] = False
    estimated_nutrition: dict
    confidence: str
    verdict: str
    alternative_food: Optional[dict] = None


class LogMealChoiceRequest(BaseModel):
    user_id: str
    meal_id: Optional[str] = None
    choice: str  # "original" | "alternative"
    meal_name: Optional[str] = ""
    calories_consumed_range: Optional[str] = ""
    is_calorie_heavy: Optional[bool] = False



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
