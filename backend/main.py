"""Personalized Travel Itinerary Planner - FastAPI backend.

Run locally:  uvicorn main:app --reload --port 8000
Docs:         http://localhost:8000/docs
"""

from __future__ import annotations

import json
import time
from collections import defaultdict, deque

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from auth import Identity, get_identity
from config import Settings, get_settings
from models import (Health, PlanRequest, Preferences, Recommendation, RegenerateDayRequest, SharedTripOut, ShareOut,
                    TripIn, TripOut)
from services import engine, planner
from services.images import search_image
from services.storage import SQLiteStorage, public_storage, storage_for

settings = get_settings()

app = FastAPI(
    title="Personalized Travel Itinerary Planner API",
    version="1.0.0",
    description="AI-generated, geographically clustered day-by-day itineraries with Supabase persistence.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------- rate limiting (AI endpoints)

_HITS: dict[str, deque] = defaultdict(deque)


def rate_limit(who: Identity = Depends(get_identity), settings: Settings = Depends(get_settings)) -> Identity:
    now = time.time()
    q = _HITS[who.id]
    while q and q[0] < now - 3600:
        q.popleft()
    if len(q) >= settings.rate_limit_per_hour:
        retry = int(3600 - (now - q[0]))
        raise HTTPException(status_code=429, detail=f"Rate limit reached ({settings.rate_limit_per_hour}/hour). Try again in ~{retry // 60 + 1} min.")
    q.append(now)
    return who


@app.exception_handler(planner.PlannerError)
async def planner_error(_: Request, exc: planner.PlannerError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


@app.exception_handler(RuntimeError)
async def runtime_error(_: Request, exc: RuntimeError):
    return JSONResponse(status_code=502, content={"detail": str(exc)})


# --------------------------------------------------------------------------- routes


@app.get("/")
async def root():
    return {"name": "Personalized Travel Itinerary Planner API", "docs": "/docs", "health": "/api/health"}


@app.get("/api/health", response_model=Health)
async def health(settings: Settings = Depends(get_settings)):
    return Health(ai_mode=settings.ai_mode, storage=settings.storage_mode, images=bool(settings.unsplash_access_key),
                  auth=settings.storage_mode == "supabase")


@app.post("/api/recommendations", response_model=list[Recommendation])
async def recommendations(prefs: Preferences, _: Identity = Depends(rate_limit), settings: Settings = Depends(get_settings)):
    return await planner.recommend(prefs, settings)


@app.post("/api/itineraries/generate")
async def generate(prefs: Preferences, _: Identity = Depends(rate_limit), settings: Settings = Depends(get_settings)):
    return await planner.generate(prefs, settings)


@app.post("/api/itineraries/regenerate-day")
async def regenerate_day(body: RegenerateDayRequest, _: Identity = Depends(rate_limit), settings: Settings = Depends(get_settings)):
    return await planner.regenerate_day(body.preferences, body.plan, body.day_index, body.instruction, settings)


@app.post("/api/itineraries/recompute")
async def recompute(body: PlanRequest):
    """Cheap, no AI: refresh transport / hours / totals after manual edits in the UI."""
    return planner.recompute(body.plan, body.preferences)


@app.post("/api/itineraries/pdf")
async def pdf(body: PlanRequest):
    try:
        data = planner.pdf_bytes(body.plan, body.preferences)
    except Exception as exc:  # noqa: BLE001 - surface ReportLab problems as a clean 400
        raise HTTPException(status_code=400, detail=f"Could not build the PDF: {exc}") from exc
    fname = planner.safe_filename(str(body.plan.get("destination", "trip")))
    return Response(content=data, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{fname}-itinerary.pdf"'})


@app.get("/api/images")
async def images(query: str = Query(min_length=1, max_length=80), settings: Settings = Depends(get_settings)):
    return await search_image(query, settings)


# ---- trips (CRUD)


@app.get("/api/trips", response_model=list[TripOut])
async def list_trips(who: Identity = Depends(get_identity), settings: Settings = Depends(get_settings)):
    return await storage_for(who, settings).list(who)


@app.post("/api/trips", response_model=TripOut, status_code=201)
async def create_trip(body: TripIn, who: Identity = Depends(get_identity), settings: Settings = Depends(get_settings)):
    return await storage_for(who, settings).create(who, body.name, body.preferences.model_dump(mode="json"), body.plan)


@app.get("/api/trips/{trip_id}", response_model=TripOut)
async def get_trip(trip_id: str, who: Identity = Depends(get_identity), settings: Settings = Depends(get_settings)):
    trip = await storage_for(who, settings).get(who, trip_id)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@app.put("/api/trips/{trip_id}", response_model=TripOut)
async def update_trip(trip_id: str, body: TripIn, who: Identity = Depends(get_identity), settings: Settings = Depends(get_settings)):
    trip = await storage_for(who, settings).update(who, trip_id, body.name, body.preferences.model_dump(mode="json"), body.plan)
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@app.delete("/api/trips/{trip_id}", status_code=204)
async def delete_trip(trip_id: str, who: Identity = Depends(get_identity), settings: Settings = Depends(get_settings)):
    if not await storage_for(who, settings).delete(who, trip_id):
        raise HTTPException(status_code=404, detail="Trip not found")
    return Response(status_code=204)


# ---- sharing (read-only links + clone)


@app.post("/api/trips/{trip_id}/share", response_model=ShareOut)
async def share_trip(trip_id: str, who: Identity = Depends(get_identity), settings: Settings = Depends(get_settings)):
    """Turn on a public read-only link for a trip you own (idempotent: returns the existing token)."""
    try:
        token = await storage_for(who, settings).set_share(who, trip_id, True)
    except KeyError:
        raise HTTPException(status_code=404, detail="Trip not found")
    return ShareOut(trip_id=trip_id, share_token=token, share_path=f"/share/{token}" if token else None)


@app.delete("/api/trips/{trip_id}/share", response_model=ShareOut)
async def unshare_trip(trip_id: str, who: Identity = Depends(get_identity), settings: Settings = Depends(get_settings)):
    try:
        await storage_for(who, settings).set_share(who, trip_id, False)
    except KeyError:
        raise HTTPException(status_code=404, detail="Trip not found")
    return ShareOut(trip_id=trip_id, share_token=None, share_path=None)


async def _find_shared(token: str, settings: Settings) -> dict:
    if not (8 <= len(token) <= 64) or not token.replace("-", "").replace("_", "").isalnum():
        raise HTTPException(status_code=404, detail="Shared trip not found")
    trip = await public_storage(settings).get_shared(token)
    if trip is None and settings.storage_mode == "supabase":
        # guests' trips live in SQLite even when Supabase is configured
        trip = await SQLiteStorage(settings.sqlite_path).get_shared(token)
    if trip is None:
        raise HTTPException(status_code=404, detail="Shared trip not found or sharing was turned off")
    return trip


@app.get("/api/shared/{token}", response_model=SharedTripOut)
async def get_shared_trip(token: str, settings: Settings = Depends(get_settings)):
    """Public: anyone with the link can view (no login, no guest id needed)."""
    trip = await _find_shared(token, settings)
    return {**trip, "share_token": token}


@app.post("/api/shared/{token}/clone", response_model=TripOut, status_code=201)
async def clone_shared_trip(token: str, who: Identity = Depends(get_identity), settings: Settings = Depends(get_settings)):
    """Copy a shared trip into the caller's own trips so they can edit their version."""
    trip = await _find_shared(token, settings)
    name = f"{trip['name']} (copy)"
    return await storage_for(who, settings).create(who, name, trip["preferences"], trip["plan"])


@app.get("/api/meta")
async def meta():
    """Static option lists so the frontend and backend never drift."""
    return {"vibes": engine.VIBES, "budget_levels": engine.BUDGET_LEVELS, "parties": engine.PARTIES,
            "paces": engine.PACES, "interests": engine.INTERESTS, "slots": engine.SLOTS,
            "demo_cities": sorted(k.title() for k in engine.DEMO_CITY_DATA), "json": json.dumps({"ok": True})}
