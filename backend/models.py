"""Pydantic schemas for request / response bodies."""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

Vibe = Literal["Beach", "Mountains", "Cultural", "Urban"]
BudgetLevel = Literal["Budget", "Moderate", "Luxury"]
Party = Literal["Solo", "Couple", "Family", "Friends"]
Pace = Literal["Relaxed", "Moderate", "Fast-Paced"]


class Traveller(BaseModel):
    """One member of a group trip with their own interests (used for the group-fit report and the AI prompt)."""

    name: str = Field(default="", max_length=40)
    interests: list[str] = Field(default_factory=list, max_length=8)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        return v.strip()


class Preferences(BaseModel):
    """Everything the trip builder collects (Step 3 of the brief)."""

    destination: str = Field(default="", max_length=80, description="Leave empty to get recommendations")
    vibe: Vibe = "Beach"
    days: int = Field(default=4, ge=1, le=14)
    start_date: date
    budget_level: BudgetLevel = "Moderate"
    total_budget_inr: float | None = Field(default=None, ge=0, description="Optional hard cap for activities, in INR")
    party: Party = "Couple"
    group_size: int = Field(default=2, ge=1, le=20)
    pace: Pace = "Moderate"
    interests: list[str] = Field(default_factory=list, max_length=8)
    travel_style: str = Field(default="", max_length=300, description="Free text, e.g. 'slow mornings, street food, no clubs'")
    travellers: list[Traveller] = Field(default_factory=list, max_length=10, description="Optional per-person interests for group trips")
    day_start: str = Field(default="09:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$", description="When each day's schedule starts")

    @field_validator("destination", "travel_style")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    def merged_interests(self) -> list[str]:
        """Trip-level interests plus every traveller's interests, de-duplicated, order preserved."""
        seen: list[str] = []
        for i in list(self.interests) + [i for t in self.travellers for i in t.interests]:
            if i not in seen:
                seen.append(i)
        return seen

    def legacy(self) -> dict[str, Any]:
        """Shape used by the ported engine (demo data, prompts, PDF)."""
        return {
            "destination": self.destination,
            "vibe": self.vibe,
            "days": self.days,
            "start_date": self.start_date.isoformat(),
            "budget": self.budget_level,
            "party": self.party,
            "pace": self.pace,
            "interests": self.merged_interests(),
        }


class RegenerateDayRequest(BaseModel):
    preferences: Preferences
    plan: dict[str, Any]
    day_index: int = Field(ge=0, le=13)
    instruction: str = Field(min_length=2, max_length=400)


class PlanRequest(BaseModel):
    preferences: Preferences
    plan: dict[str, Any]


class TripIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    preferences: Preferences
    plan: dict[str, Any]


class TripOut(BaseModel):
    id: str
    name: str
    destination: str
    days: int
    budget_level: str
    cover_image: str | None = None
    created_at: str
    updated_at: str
    share_token: str | None = None
    preferences: dict[str, Any] | None = None
    plan: dict[str, Any] | None = None


class ShareOut(BaseModel):
    trip_id: str
    share_token: str | None
    share_path: str | None


class SharedTripOut(BaseModel):
    """Public, read-only view of a shared trip. Never includes the owner's id."""

    share_token: str
    name: str
    destination: str
    days: int
    budget_level: str
    cover_image: str | None = None
    updated_at: str
    preferences: dict[str, Any]
    plan: dict[str, Any]


class Recommendation(BaseModel):
    city: str
    country: str
    match_score: int
    why: str
    weather_in_month: str = ""
    best_season: str = ""
    estimated_daily_cost_usd: float = 0
    currency_code: str = "USD"
    highlights: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    image: dict[str, Any] | None = None


class Health(BaseModel):
    status: str = "ok"
    ai_mode: str
    storage: str
    images: bool
    auth: bool
