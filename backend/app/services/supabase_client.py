"""Supabase client — uses service-role or anon key for all backend writes with safe fallbacks."""
import os
import uuid
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_client: Client | None = None


def get_supabase() -> Client | None:
    global _client
    load_dotenv(override=True)
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not key or key == "your_service_role_key_here":
        key = os.getenv("SUPABASE_ANON_KEY", "")
    if not url or not key or url.startswith("https://your-") or key.startswith("your_"):
        return None
    try:
        if _client is None:
            _client = create_client(url, key)
        return _client
    except Exception as e:
        print(f"[Supabase] Init error: {e}")
        return None


# ── Users ──────────────────────────────────────────────────────────────────────

def upsert_user(user_id: str, profile: dict) -> dict:
    sb = get_supabase()
    if sb is None:
        return {"user_id": user_id, **profile}
    try:
        data = {"user_id": user_id, **profile}
        result = sb.table("users").upsert(data).execute()
        return result.data[0] if result.data else data
    except Exception as e:
        print(f"[Supabase] upsert_user warning: {e}")
        return {"user_id": user_id, **profile}


def get_user(user_id: str) -> dict | None:
    sb = get_supabase()
    if sb is None:
        return None
    try:
        result = sb.table("users").select("*").eq("user_id", user_id).single().execute()
        return result.data
    except Exception as e:
        print(f"[Supabase] get_user warning: {e}")
        return None


# ── Plans ──────────────────────────────────────────────────────────────────────

def save_plan(user_id: str, plan_json: dict, change_summary: str | None = None) -> dict:
    fallback = {"plan_id": str(uuid.uuid4()), "user_id": user_id, "plan_json": plan_json, "is_active": True}
    sb = get_supabase()
    if sb is None:
        return fallback

    try:
        # Deactivate old plans
        sb.table("plans").update({"is_active": False}).eq("user_id", user_id).eq("is_active", True).execute()
    except Exception as e:
        print(f"[Supabase] deactivate old plans warning: {e}")

    try:
        # Insert new
        result = sb.table("plans").insert({
            "user_id": user_id,
            "plan_json": plan_json,
            "change_summary": change_summary,
            "is_active": True
        }).execute()
        return result.data[0] if result.data else fallback
    except Exception as e:
        print(f"[Supabase] save_plan warning: {e}")
        return fallback


def get_active_plan(user_id: str) -> dict | None:
    sb = get_supabase()
    if sb is None:
        return None
    try:
        result = (
            sb.table("plans")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return result.data[0] if result.data else None
    except Exception as e:
        print(f"[Supabase] get_active_plan warning: {e}")
        return None


# ── Workout Sessions ───────────────────────────────────────────────────────────

def create_session(user_id: str, exercise: str) -> dict:
    fallback = {"session_id": str(uuid.uuid4()), "user_id": user_id, "exercise": exercise, "sets": []}
    sb = get_supabase()
    if sb is None:
        return fallback
    try:
        result = sb.table("workout_sessions").insert({
            "user_id": user_id,
            "exercise": exercise,
            "sets": []
        }).execute()
        return result.data[0] if result.data else fallback
    except Exception as e:
        print(f"[Supabase] create_session warning: {e}")
        return fallback


def append_set_to_session(session_id: str, set_data: dict) -> dict:
    sb = get_supabase()
    if sb is None:
        return {"session_id": session_id, "sets": [set_data]}
    try:
        current = sb.table("workout_sessions").select("sets").eq("session_id", session_id).single().execute()
        sets = current.data.get("sets", []) if current.data else []
        sets.append(set_data)
        result = sb.table("workout_sessions").update({"sets": sets}).eq("session_id", session_id).execute()
        return result.data[0] if result.data else {"session_id": session_id, "sets": sets}
    except Exception as e:
        print(f"[Supabase] append_set warning: {e}")
        return {"session_id": session_id, "sets": [set_data]}


def end_session(session_id: str) -> dict:
    from datetime import datetime, timezone
    now_iso = datetime.now(timezone.utc).isoformat()
    sb = get_supabase()
    if sb is None:
        return {"session_id": session_id, "ended_at": now_iso}
    try:
        result = sb.table("workout_sessions").update({
            "ended_at": now_iso
        }).eq("session_id", session_id).execute()
        return result.data[0] if result.data else {"session_id": session_id, "ended_at": now_iso}
    except Exception as e:
        print(f"[Supabase] end_session warning: {e}")
        return {"session_id": session_id, "ended_at": now_iso}


def get_session(session_id: str) -> dict | None:
    sb = get_supabase()
    if sb is None:
        return None
    try:
        result = sb.table("workout_sessions").select("*").eq("session_id", session_id).single().execute()
        return result.data
    except Exception as e:
        print(f"[Supabase] get_session warning: {e}")
        return None


# ── Meals ──────────────────────────────────────────────────────────────────────

def save_meal(user_id: str, meal_data: dict, image_path: str | None = None) -> dict:
    fallback = {"meal_id": str(uuid.uuid4()), "user_id": user_id, **meal_data}
    sb = get_supabase()
    if sb is None:
        return fallback
    try:
        result = sb.table("meals").insert({
            "user_id": user_id,
            "identified_items": meal_data.get("identified_items", []),
            "estimated_nutrition": meal_data.get("estimated_nutrition", {}),
            "verdict": meal_data.get("verdict", ""),
            "image_storage_path": image_path
        }).execute()
        return result.data[0] if result.data else fallback
    except Exception as e:
        print(f"[Supabase] save_meal warning: {e}")
        return fallback


def get_todays_meals(user_id: str) -> list:
    from datetime import date
    sb = get_supabase()
    if sb is None:
        return []
    today = date.today().isoformat()
    try:
        result = (
            sb.table("meals")
            .select("*")
            .eq("user_id", user_id)
            .gte("created_at", f"{today}T00:00:00")
            .execute()
        )
        return result.data or []
    except Exception as e:
        print(f"[Supabase] get_todays_meals warning: {e}")
        return []


# ── Hydration ──────────────────────────────────────────────────────────────────

def log_hydration(user_id: str, amount_ml: int = 250) -> dict:
    from datetime import date, datetime, timezone
    sb = get_supabase()
    today = date.today().isoformat()
    now = datetime.now(timezone.utc).isoformat()
    fallback = {"user_id": user_id, "log_date": today, "logs": [now], "total_ml": amount_ml, "target_ml": 2000}

    if sb is None:
        return fallback

    try:
        result = (
            sb.table("hydration_logs")
            .select("*")
            .eq("user_id", user_id)
            .eq("log_date", today)
            .execute()
        )

        if result.data:
            existing = result.data[0]
            logs = existing.get("logs", [])
            logs.append(now)
            update = sb.table("hydration_logs").update({"logs": logs}).eq("user_id", user_id).eq("log_date", today).execute()
            row = update.data[0] if update.data else existing
        else:
            insert = sb.table("hydration_logs").insert({
                "user_id": user_id,
                "log_date": today,
                "logs": [now],
                "target_ml": 2000
            }).execute()
            row = insert.data[0] if insert.data else {}

        logs = row.get("logs", [now])
        total_ml = len(logs) * amount_ml
        return {
            "user_id": user_id,
            "log_date": today,
            "logs": logs,
            "total_ml": total_ml,
            "target_ml": row.get("target_ml", 2000)
        }
    except Exception as e:
        print(f"[Supabase] log_hydration warning: {e}")
        return fallback


def get_todays_hydration(user_id: str) -> dict:
    from datetime import date
    sb = get_supabase()
    today = date.today().isoformat()

    if sb is None:
        return {"user_id": user_id, "log_date": today, "logs": [], "total_ml": 0, "target_ml": 2000}

    try:
        result = (
            sb.table("hydration_logs")
            .select("*")
            .eq("user_id", user_id)
            .eq("log_date", today)
            .execute()
        )

        if result.data:
            row = result.data[0]
            logs = row.get("logs", [])
            return {
                "user_id": user_id,
                "log_date": today,
                "logs": logs,
                "total_ml": len(logs) * 250,
                "target_ml": row.get("target_ml", 2000)
            }
        return {"user_id": user_id, "log_date": today, "logs": [], "total_ml": 0, "target_ml": 2000}
    except Exception as e:
        print(f"[Supabase] get_todays_hydration warning: {e}")
        return {"user_id": user_id, "log_date": today, "logs": [], "total_ml": 0, "target_ml": 2000}
