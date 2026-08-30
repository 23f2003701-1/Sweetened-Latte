import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.routers import users, plans, exercise, meals, hydration

load_dotenv()

app = FastAPI(
    title="ZiddiFit API",
    description="Personal AI fitness loop — Gemini + MediaPipe + Supabase",
    version="1.0.0"
)

# CORS — allow the Vite dev server and any production origin
origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(users.router, prefix="/api")
app.include_router(plans.router, prefix="/api")
app.include_router(exercise.router, prefix="/api")
app.include_router(meals.router, prefix="/api")
app.include_router(hydration.router, prefix="/api")


@app.get("/")
async def root():
    return {"message": "ZiddiFit API is running 🏋️", "docs": "/docs"}


@app.get("/api/health")
async def health():
    return {"status": "ok"}
