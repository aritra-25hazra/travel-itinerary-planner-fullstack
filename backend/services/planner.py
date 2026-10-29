"""Itinerary generation: Groq (live) or the deterministic demo engine, followed by the optimisation pipeline.

Pipeline for every plan, whatever produced it:
  normalize -> geographic clustering -> transport estimates -> pace cap -> accommodation -> totals & budget status
"""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any

import httpx

from config import Settings
from models import Preferences
from services import engine
from services.images import search_image

PACE_MAX_HOURS = {"Relaxed": 7.0, "Moderate": 9.0, "Fast-Paced": 11.0}
PACE_LABEL = {"Relaxed": "slow mornings, long lunches, early evenings",
              "Moderate": "a balanced day with breathing room",
              "Fast-Paced": "packed days, see as much as possible"}

# Accommodation estimates per night per room (USD) by tier; converted to local currency.
STAY_USD = {"Budget": 25, "Moderate": 70, "Luxury": 220}
STAY_TYPE = {"Budget": "Hostel / guesthouse", "Moderate": "3-star hotel / boutique stay", "Luxury": "5-star hotel / resort"}


class PlannerError(Exception):
    pass


# --------------------------------------------------------------------------- Groq


async def call_groq(prompt: str, settings: Settings, temperature: float = 0.7) -> str:
    body = {
        "model": settings.groq_model,
        "temperature": temperature,
        "max_tokens": 16384,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": "You are a senior travel planner. Always respond with valid JSON only."},
            {"role": "user", "content": prompt},
        ],
    }
    headers = {"Authorization": f"Bearer {settings.groq_api_key}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post("https://api.groq.com/openai/v1/chat/completions", headers=headers, json=body)
    except httpx.HTTPError as exc:
        raise PlannerError(f"Network error while calling Groq: {exc}") from exc
    if resp.status_code != 200:
        raise PlannerError(f"Groq API error {resp.status_code}: {resp.text[:300]}")
    try:
        return resp.json()["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, ValueError) as exc:
        raise PlannerError("Unexpected Groq response shape") from exc


async def groq_json(prompt: str, settings: Settings, temperature: float = 0.7) -> Any:
    """Parse JSON from Groq; one retry with a stricter nudge if the first answer was malformed."""
    try:
        return engine.extract_json(await call_groq(prompt, settings, temperature))
    except (ValueError, json.JSONDecodeError):
        strict = prompt + "\n\nIMPORTANT: the previous answer was not valid JSON. Keep descriptions short and return compact, complete, valid JSON only."
        return engine.extract_json(await call_groq(strict, settings, max(0.2, temperature - 0.3)))


def _extra_prompt_context(prefs: Preferences) -> str:
    lines = [f"Group size: {prefs.group_size}"]
    if prefs.total_budget_inr:
        lines.append(f"Hard cap for activities + food for the whole trip: INR {prefs.total_budget_inr:,.0f} (~USD {prefs.total_budget_inr / engine.INR_PER_USD:,.0f})")
    if prefs.travel_style:
        lines.append(f"Travel style notes from the traveller: {prefs.travel_style}")
    if prefs.travellers:
        people = "; ".join(f"{t.name or 'Traveller ' + str(i + 1)}: {', '.join(t.interests) or 'no specific interests'}"
                           for i, t in enumerate(prefs.travellers))
        lines.append(f"This is a group trip. Per-person interests - {people}. Make sure every person has at least one "
                     f"activity for their interests across the trip, and keep days together as a group (no splitting up).")
    lines.append(f"Each day starts around {prefs.day_start}.")
    lines.append("Also include an \"accommodation\" object: {\"name\": suggested hotel/area to stay, \"area\": neighbourhood, "
                 "\"type\": hostel/3-star/boutique/5-star, \"est_cost_per_night_local\": number} and for every activity a "
                 "\"transport_from_prev\": {\"mode\": walk/metro/taxi/bus/auto, \"minutes\": number} describing how to get there from the previous stop.")
    return "\n".join(lines)


# --------------------------------------------------------------------------- post-processing


def _estimate_transport(plan: dict) -> None:
    for d in plan["days"]:
        prev = None
        for a in d["activities"]:
            t = a.get("transport_from_prev") if isinstance(a.get("transport_from_prev"), dict) else None
            mode = str((t or {}).get("mode") or "").lower().strip()
            minutes = engine.safe_float((t or {}).get("minutes"), 0)
            km = None
            if prev and a.get("lat") is not None and prev.get("lat") is not None:
                km = engine.haversine_km(prev["lat"], prev["lng"], a["lat"], a["lng"])
            if minutes <= 0:
                if prev is None:
                    mode, minutes = "start", 0
                elif km is None:
                    mode, minutes = mode or "taxi", 15
                elif km < 1.5:
                    mode, minutes = "walk", max(3, round(km * 12))
                else:
                    mode, minutes = (mode if mode in ("metro", "bus", "auto", "taxi") else "taxi"), round(km * 3 + 5)
            a["transport_from_prev"] = {"mode": mode or ("start" if prev is None else "taxi"), "minutes": int(minutes),
                                        "km": round(km, 1) if km is not None else None}
            prev = a


def _apply_pace_cap(plan: dict, pace: str) -> None:
    cap = PACE_MAX_HOURS.get(pace, 9.0)
    for d in plan["days"]:
        total = sum(a["duration_hours"] for a in d["activities"])
        guard = 0
        while total > cap and guard < 6:
            guard += 1
            # trim the longest non-lunch activity, never below 1h
            cands = [a for a in d["activities"] if a["slot"] != "Lunch Recommendation" and a["duration_hours"] > 1.0]
            if not cands:
                break
            longest = max(cands, key=lambda a: a["duration_hours"])
            longest["duration_hours"] = round(max(1.0, longest["duration_hours"] - min(1.0, total - cap)), 1)
            total = sum(a["duration_hours"] for a in d["activities"])
        d["total_hours"] = round(total, 1)


def _hhmm(minutes: int) -> str:
    minutes = max(0, int(minutes))
    return f"{(minutes // 60) % 24:02d}:{minutes % 60:02d}"


def _schedule(plan: dict, day_start: str = "09:00") -> None:
    """Assign start/end clock times to every activity (sequential, including transport) and flag schedule conflicts:
    a day that runs past 23:00, or a lunch slot that lands outside 11:30-15:00."""
    try:
        h, m = day_start.split(":")
        start_min = int(h) * 60 + int(m)
    except ValueError:
        start_min = 9 * 60
    for d in plan["days"]:
        t = start_min
        warnings: list[str] = []
        for a in d["activities"]:
            tr = a.get("transport_from_prev") or {}
            t += int(tr.get("minutes") or 0)
            # lunch should not start before 11:30 - wait if the morning was short
            if a["slot"] == "Lunch Recommendation" and t < 11 * 60 + 30:
                a["wait_minutes"] = (11 * 60 + 30) - t
                t = 11 * 60 + 30
            else:
                a["wait_minutes"] = 0
            a["start_time"] = _hhmm(t)
            t += int(round(float(a["duration_hours"]) * 60))
            a["end_time"] = _hhmm(t)
            if a["slot"] == "Lunch Recommendation" and t - int(round(float(a["duration_hours"]) * 60)) > 15 * 60:
                warnings.append("Lunch lands after 3 pm - consider shortening the morning activity.")
        d["ends_at"] = _hhmm(t)
        if t > 23 * 60:
            late = _hhmm(t) + (" next day" if t >= 24 * 60 else "")
            warnings.append(f"Day runs until {late} - trim an activity, start earlier or pick a more relaxed pace.")
        if t - start_min > 15 * 60:
            warnings.append("More than 15 hours on the move - this day will be exhausting.")
        d["schedule_warnings"] = warnings


# Activity categories that satisfy each interest (categories come from the planner / demo data).
INTEREST_MATCH = {
    "Food": {"Food", "Dining"},
    "Adventure": {"Adventure"},
    "History": {"History", "Sightseeing"},
    "Nightlife": {"Nightlife"},
    "Nature": {"Nature"},
    "Shopping": {"Shopping"},
    "Art & Museums": {"Art & Museums"},
    "Wellness": {"Wellness", "Leisure"},
}


def _group_fit(plan: dict, prefs: Preferences) -> dict | None:
    """For group trips: how many activities match each traveller's interests and which interests got nothing."""
    if not prefs.travellers:
        return None
    cats_by_day = [(d["day"], [a["category"] for a in d["activities"]]) for d in plan["days"]]
    members = []
    for i, t in enumerate(prefs.travellers):
        name = t.name or f"Traveller {i + 1}"
        hits, uncovered, days_covered = 0, [], set()
        for interest in t.interests:
            match = INTEREST_MATCH.get(interest, {interest})
            n = 0
            for day, cats in cats_by_day:
                k = sum(1 for c in cats if c in match)
                n += k
                if k:
                    days_covered.add(day)
            hits += n
            if n == 0:
                uncovered.append(interest)
        total_acts = sum(len(c) for _, c in cats_by_day) or 1
        members.append({"name": name, "interests": list(t.interests), "matched_activities": hits,
                        "uncovered": uncovered, "days_with_a_match": sorted(days_covered),
                        "score": round(min(1.0, hits / max(1, len(t.interests) * 2)), 2) if t.interests else 1.0,
                        "share_of_trip": round(hits / total_acts, 2)})
    conflicts = []
    all_uncovered = {u for m in members for u in m["uncovered"]}
    for u in sorted(all_uncovered):
        who = [m["name"] for m in members if u in m["uncovered"]]
        conflicts.append(f"{', '.join(who)} wanted {u} but no activity covers it - try 'Add {u.lower()}' on a day.")
    balanced = all(m["score"] >= 0.5 for m in members)
    return {"members": members, "conflicts": conflicts, "balanced": balanced,
            "summary": "Every traveller has activities for their interests." if balanced and not conflicts
                       else "Some travellers are under-served - see conflicts."}


def _accommodation(raw: dict, plan: dict, prefs: Preferences) -> dict:
    cur = plan["currency_code"]
    rate = 1 / engine.USD_PER_UNIT.get(cur, 1.0)
    acc = raw.get("accommodation") if isinstance(raw.get("accommodation"), dict) else {}
    first_area = plan["days"][0]["area"] if plan["days"] else "city centre"
    nights = max(1, len(plan["days"]) - 1) if len(plan["days"]) > 1 else 1
    per_night = engine.safe_float(acc.get("est_cost_per_night_local"), 0) or round(STAY_USD[prefs.budget_level] * rate, 0)
    return {
        "name": str(acc.get("name") or f"{STAY_TYPE[prefs.budget_level]} near {first_area}"),
        "area": str(acc.get("area") or first_area),
        "type": str(acc.get("type") or STAY_TYPE[prefs.budget_level]),
        "est_cost_per_night_local": float(per_night),
        "nights": nights,
        "est_total_local": float(per_night * nights),
        "note": "Stay close to your Day 1 cluster; move hotels only for trips of 7+ days.",
    }


def _totals(plan: dict, prefs: Preferences) -> None:
    cur = plan["currency_code"]
    activities_local = sum(a["cost_local"] for d in plan["days"] for a in d["activities"])
    stay_local = plan.get("accommodation", {}).get("est_total_local", 0.0)
    per_person_local = activities_local
    group_local = activities_local * prefs.group_size + stay_local * max(1, -(-prefs.group_size // 2))  # rooms = ceil(size/2)
    n = max(1, len(plan["days"]))
    totals = {
        "currency_code": cur,
        "activities_local": round(activities_local, 2),
        "activities_usd": round(engine.to_usd(activities_local, cur), 2),
        "activities_inr": round(engine.to_inr(activities_local, cur), 0),
        "stay_local": round(stay_local, 2),
        "stay_inr": round(engine.to_inr(stay_local, cur), 0),
        "per_person_inr": round(engine.to_inr(per_person_local, cur), 0),
        "per_day_inr": round(engine.to_inr(per_person_local, cur) / n, 0),
        "group_total_inr": round(engine.to_inr(group_local, cur), 0),
        "group_size": prefs.group_size,
        "days": [
            {"day": d["day"], "area": d["area"],
             "local": round(sum(a["cost_local"] for a in d["activities"]), 2),
             "inr": round(engine.to_inr(sum(a["cost_local"] for a in d["activities"]), cur), 0)}
            for d in plan["days"]
        ],
    }
    cumulative = 0.0
    for row in totals["days"]:
        cumulative += row["inr"]
        row["cumulative_inr"] = round(cumulative, 0)
    # Budget status: against the hard cap if given, else the tier's daily target
    if prefs.total_budget_inr:
        cap_inr = float(prefs.total_budget_inr)
        used = totals["per_person_inr"]
        basis = "your total budget"
    else:
        cap_inr = engine.DAILY_BUDGET_USD[prefs.budget_level] * n * engine.INR_PER_USD
        used = totals["per_person_inr"]
        basis = f"the {prefs.budget_level} tier target"
    ratio = used / cap_inr if cap_inr else 0.0
    totals["budget_status"] = {
        "cap_inr": round(cap_inr, 0), "used_inr": round(used, 0), "ratio": round(ratio, 3),
        "state": "under" if ratio <= 0.85 else ("close" if ratio <= 1.0 else "over"),
        "basis": basis,
        "message": (f"{ratio * 100:.0f}% of {basis} (per person, activities + food; stay and flights extra)"),
    }
    plan["totals"] = totals


def finalize(raw: dict, prefs: Preferences) -> dict:
    """Shared pipeline for live and demo output."""
    legacy = prefs.legacy()
    plan = engine.normalize_plan(raw, legacy)
    plan, before, after = engine.optimize_clusters(plan)
    plan["cluster_report"] = {"km_before": round(before, 1), "km_after": round(after, 1),
                              "days": [{"day": d["day"], "area": d["area"], "km": round(engine.day_transit_km(d) or 0.0, 1)} for d in plan["days"]]}
    _estimate_transport(plan)
    _apply_pace_cap(plan, prefs.pace)
    _schedule(plan, prefs.day_start)
    plan["accommodation"] = _accommodation(raw, plan, prefs)
    _totals(plan, prefs)
    plan["group_fit"] = _group_fit(plan, prefs)
    plan["prefs"] = prefs.model_dump(mode="json")
    plan["pace_note"] = PACE_LABEL.get(prefs.pace, "")
    return plan


# --------------------------------------------------------------------------- public API


def _clean_rec(r: dict) -> dict:
    return {
        "city": str(r.get("city", "?")), "country": str(r.get("country", "")),
        "match_score": int(engine.safe_float(r.get("match_score"), 80)), "why": str(r.get("why", "")),
        "weather_in_month": str(r.get("weather_in_month", "")), "best_season": str(r.get("best_season", "")),
        "estimated_daily_cost_usd": engine.safe_float(r.get("estimated_daily_cost_usd"), 0),
        "currency_code": str(r.get("currency_code", "USD")).upper()[:3],
        "highlights": [str(h) for h in (r.get("highlights") or [])][:6],
        "tags": [str(t) for t in (r.get("tags") or [])][:6],
    }


async def recommend(prefs: Preferences, settings: Settings) -> list[dict]:
    legacy = prefs.legacy()
    if settings.ai_mode == "groq":
        raw = await groq_json(engine.recommendation_prompt(legacy) + "\n" + _extra_prompt_context(prefs), settings, 0.8)
    else:
        raw = engine.demo_recommendations(legacy)
    recs = raw.get("recommendations") if isinstance(raw, dict) else raw
    if not isinstance(recs, list) or not recs:
        raise PlannerError("No recommendations were returned.")
    out = [_clean_rec(r) for r in recs[:3]]
    for r in out:
        r["image"] = await search_image(f"{r['city']} {r['country']}", settings)
    return out


async def generate(prefs: Preferences, settings: Settings) -> dict:
    if not prefs.destination:
        raise PlannerError("Pick a destination first (or ask for recommendations).")
    legacy = prefs.legacy()
    if settings.ai_mode == "groq":
        raw = await groq_json(engine.itinerary_prompt(legacy) + "\n" + _extra_prompt_context(prefs), settings, 0.7)
    else:
        raw = engine.demo_itinerary(legacy)
    plan = finalize(raw, prefs)
    plan["cover_image"] = await search_image(f"{plan['destination']} {plan.get('country', '')}", settings)
    plan["generated_at"] = datetime.now().isoformat(timespec="seconds")
    plan["ai_mode"] = settings.ai_mode
    return plan


async def regenerate_day(prefs: Preferences, plan: dict, day_idx: int, instruction: str, settings: Settings) -> dict:
    if not plan.get("days") or day_idx >= len(plan["days"]):
        raise PlannerError("That day does not exist in the plan.")
    legacy = prefs.legacy()
    if settings.ai_mode == "groq":
        raw_day = await groq_json(engine.regenerate_day_prompt(legacy, plan, day_idx, instruction), settings, 0.8)
        if isinstance(raw_day, dict) and isinstance(raw_day.get("days"), list) and raw_day["days"]:
            raw_day = raw_day["days"][0]
    else:
        raw_day = engine.demo_regenerate_day(legacy, plan, day_idx, instruction)
    # Normalise just that day, then splice it into a deep copy of the plan and recompute derived fields.
    tmp = engine.normalize_plan({**plan, "days": [raw_day]}, legacy)
    new_day = tmp["days"][0]
    old_day = plan["days"][day_idx]
    new_day["day"], new_day["date"] = old_day["day"], old_day["date"]
    new_plan = json.loads(json.dumps(plan))
    new_plan["days"][day_idx] = new_day
    _estimate_transport(new_plan)
    _apply_pace_cap(new_plan, prefs.pace)
    _schedule(new_plan, prefs.day_start)
    new_plan["cluster_report"] = {**(new_plan.get("cluster_report") or {}),
                                  "days": [{"day": d["day"], "area": d["area"], "km": round(engine.day_transit_km(d) or 0.0, 1)} for d in new_plan["days"]]}
    _totals(new_plan, prefs)
    new_plan["group_fit"] = _group_fit(new_plan, prefs)
    new_plan["last_change"] = {"day": old_day["day"], "instruction": instruction, "at": datetime.now().isoformat(timespec="seconds")}
    return new_plan


def recompute(plan: dict, prefs: Preferences) -> dict:
    """Used after client-side edits (rename / cost / delete) to refresh transport, hours and totals."""
    new_plan = json.loads(json.dumps(plan))
    for d in new_plan.get("days", []):
        for a in d.get("activities", []):
            a["cost_local"] = max(0.0, engine.safe_float(a.get("cost_local"), 0.0))
            a["duration_hours"] = max(0.5, engine.safe_float(a.get("duration_hours"), 1.0))
    _estimate_transport(new_plan)
    _apply_pace_cap(new_plan, prefs.pace)
    _schedule(new_plan, prefs.day_start)
    _totals(new_plan, prefs)
    new_plan["group_fit"] = _group_fit(new_plan, prefs)
    return new_plan


def pdf_bytes(plan: dict, prefs: Preferences) -> bytes:
    return engine.build_pdf(plan, prefs.legacy())


def safe_filename(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-").lower() or "trip"
