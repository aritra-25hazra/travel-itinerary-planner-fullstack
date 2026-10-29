"""API tests. Run with:  pytest -q   (from backend/). No network access needed."""

from __future__ import annotations

import json
import os
import sys
import uuid

import httpx
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import Settings, get_settings  # noqa: E402
from services import planner, storage  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    db = tmp_path / "trips.db"
    test_settings = Settings(sqlite_path=str(db), rate_limit_per_hour=5, _env_file=None)
    import main
    monkeypatch.setattr(main, "settings", test_settings)
    main.app.dependency_overrides[get_settings] = lambda: test_settings
    storage.reset_sqlite()
    main._HITS.clear()
    with TestClient(main.app) as c:
        yield c
    main.app.dependency_overrides.clear()


PREFS = {"destination": "Goa", "vibe": "Beach", "days": 4, "start_date": "2026-12-10", "budget_level": "Moderate",
         "party": "Friends", "group_size": 3, "pace": "Moderate", "interests": ["Food", "Nightlife"]}
GUEST = {"X-Guest-Id": str(uuid.uuid4())}


def test_health_demo(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ai_mode"] == "demo" and r.json()["storage"] == "sqlite"


def test_recommendations_demo(client):
    r = client.post("/api/recommendations", json={**PREFS, "destination": ""}, headers=GUEST)
    assert r.status_code == 200, r.text
    recs = r.json()
    assert len(recs) == 3 and all("image" in x and x["match_score"] > 0 for x in recs)


def test_generate_demo_full_pipeline(client):
    r = client.post("/api/itineraries/generate", json=PREFS, headers=GUEST)
    assert r.status_code == 200, r.text
    plan = r.json()
    assert len(plan["days"]) == 4
    for d in plan["days"]:
        assert [a["slot"] for a in d["activities"]] == ["Morning Sightseeing", "Lunch Recommendation", "Afternoon Leisure", "Evening Dining & Entertainment"]
        assert d["area"] and d["total_hours"] <= planner.PACE_MAX_HOURS["Moderate"] + 0.01
        for a in d["activities"]:
            assert a["transport_from_prev"]["mode"] and a["transport_from_prev"]["minutes"] >= 0
    assert plan["accommodation"]["est_total_local"] > 0
    t = plan["totals"]
    assert t["per_person_inr"] > 0 and t["budget_status"]["state"] in ("under", "close", "over")
    assert plan["cluster_report"]["km_after"] <= plan["cluster_report"]["km_before"] + 0.01
    assert plan["cover_image"]["gradient"]  # no Unsplash key -> placeholder


def test_generate_requires_destination(client):
    r = client.post("/api/itineraries/generate", json={**PREFS, "destination": ""}, headers=GUEST)
    assert r.status_code == 502 and "destination" in r.json()["detail"].lower()


def test_hard_budget_cap_over(client):
    r = client.post("/api/itineraries/generate", json={**PREFS, "total_budget_inr": 500}, headers=GUEST)
    assert r.json()["totals"]["budget_status"]["state"] == "over"


def test_regenerate_day_only_touches_that_day(client):
    plan = client.post("/api/itineraries/generate", json=PREFS, headers=GUEST).json()
    body = {"preferences": PREFS, "plan": plan, "day_index": 1, "instruction": "Find a vegetarian lunch spot"}
    r = client.post("/api/itineraries/regenerate-day", json=body, headers=GUEST)
    assert r.status_code == 200, r.text
    new = r.json()
    assert new["days"][1]["activities"][1]["name"] != plan["days"][1]["activities"][1]["name"]
    assert "egetarian" in new["days"][1]["activities"][1]["name"]
    for i in (0, 2, 3):
        assert [a["name"] for a in new["days"][i]["activities"]] == [a["name"] for a in plan["days"][i]["activities"]]
    assert new["last_change"]["day"] == 2


def test_recompute_after_manual_edit(client):
    plan = client.post("/api/itineraries/generate", json=PREFS, headers=GUEST).json()
    plan["days"][0]["activities"][0]["cost_local"] = 99999
    r = client.post("/api/itineraries/recompute", json={"preferences": PREFS, "plan": plan})
    assert r.status_code == 200 and r.json()["totals"]["activities_local"] >= 99999


def test_pdf(client):
    plan = client.post("/api/itineraries/generate", json=PREFS, headers=GUEST).json()
    r = client.post("/api/itineraries/pdf", json={"preferences": PREFS, "plan": plan})
    assert r.status_code == 200 and r.content[:4] == b"%PDF"
    assert "goa-itinerary.pdf" in r.headers["content-disposition"]


def test_trips_crud_guest_sqlite(client):
    plan = client.post("/api/itineraries/generate", json=PREFS, headers=GUEST).json()
    r = client.post("/api/trips", json={"name": "Goa with friends", "preferences": PREFS, "plan": plan}, headers=GUEST)
    assert r.status_code == 201, r.text
    tid = r.json()["id"]
    assert client.get("/api/trips", headers=GUEST).json()[0]["id"] == tid
    assert client.get(f"/api/trips/{tid}", headers=GUEST).json()["plan"]["destination"] == "Goa"
    # another guest cannot see it
    other = {"X-Guest-Id": str(uuid.uuid4())}
    assert client.get("/api/trips", headers=other).json() == []
    assert client.get(f"/api/trips/{tid}", headers=other).status_code == 404
    r = client.put(f"/api/trips/{tid}", json={"name": "Goa v2", "preferences": PREFS, "plan": plan}, headers=GUEST)
    assert r.json()["name"] == "Goa v2"
    assert client.delete(f"/api/trips/{tid}", headers=GUEST).status_code == 204
    assert client.get("/api/trips", headers=GUEST).json() == []


def test_rate_limit(client):
    for _ in range(5):
        assert client.post("/api/recommendations", json=PREFS, headers=GUEST).status_code == 200
    r = client.post("/api/recommendations", json=PREFS, headers=GUEST)
    assert r.status_code == 429


def test_images_placeholder_without_key(client):
    r = client.get("/api/images", params={"query": "Kyoto"})
    assert r.status_code == 200 and r.json()["source"] is None and r.json()["gradient"]


def test_groq_path_with_mock(client, monkeypatch, tmp_path):
    """Live-AI branch: a malformed first answer triggers the retry, then a valid plan flows through the pipeline."""
    live = Settings(sqlite_path=str(tmp_path / "x.db"), groq_api_key="gsk_test", _env_file=None)
    import main
    main.app.dependency_overrides[get_settings] = lambda: live
    fake_plan = {
        "destination": "Lisbon", "country": "Portugal", "currency_code": "EUR", "overview": "ok",
        "accommodation": {"name": "Alfama guesthouse", "area": "Alfama", "type": "boutique", "est_cost_per_night_local": 90},
        "days": [{"day": 1, "theme": "Alfama", "area": "Alfama", "activities": [
            {"slot": s, "name": f"A{i}", "area": "Alfama", "description": "d", "duration_hours": 2, "cost_local": 10,
             "category": "Food", "lat": 38.71 + i * 0.002, "lng": -9.13, "transport_from_prev": {"mode": "walk", "minutes": 8}}
            for i, s in enumerate(["Morning Sightseeing", "Lunch Recommendation", "Afternoon Leisure", "Evening Dining & Entertainment"])]}],
        "emergency": {"police": "112"}, "packing": ["x"], "tips": ["y"],
    }
    calls = {"n": 0}

    async def fake_post(self, url, headers=None, json=None, **kw):
        calls["n"] += 1
        content = "not json at all" if calls["n"] == 1 else __import__("json").dumps(fake_plan)
        return httpx.Response(200, json={"choices": [{"message": {"content": content}}]}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    r = client.post("/api/itineraries/generate", json={**PREFS, "destination": "Lisbon", "days": 1}, headers=GUEST)
    assert r.status_code == 200, r.text
    plan = r.json()
    assert calls["n"] == 2 and plan["ai_mode"] == "groq" and plan["currency_code"] == "EUR"
    assert plan["accommodation"]["name"] == "Alfama guesthouse"
    assert plan["days"][0]["activities"][1]["transport_from_prev"]["mode"] == "walk"

    async def bad_post(self, url, headers=None, json=None, **kw):
        return httpx.Response(401, json={"error": {"message": "bad key"}}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", bad_post)
    r = client.post("/api/itineraries/generate", json={**PREFS, "destination": "Lisbon"}, headers=GUEST)
    assert r.status_code == 502 and "401" in r.json()["detail"]


def test_supabase_identity_and_storage_with_mock(client, monkeypatch, tmp_path):
    """Bearer token -> verified against Supabase Auth; trips go through PostgREST with the user's JWT."""
    live = Settings(sqlite_path=str(tmp_path / "x.db"), supabase_url="https://proj.supabase.co", supabase_anon_key="anon", _env_file=None)
    import main
    main.app.dependency_overrides[get_settings] = lambda: live
    seen = []

    async def fake_get(self, url, headers=None, params=None, **kw):
        seen.append(("GET", url, headers, params))
        if url.endswith("/auth/v1/user"):
            ok = headers["Authorization"] == "Bearer good"
            return httpx.Response(200 if ok else 401, json={"id": "user-1", "email": "a@b.c"} if ok else {}, request=httpx.Request("GET", url))
        return httpx.Response(200, json=[{"id": "t1", "name": "Saved", "destination": "Goa", "days": 2, "budget_level": "Moderate",
                                          "cover_image": None, "created_at": "2026-01-01T00:00:00", "updated_at": "2026-01-01T00:00:00"}],
                              request=httpx.Request("GET", url))

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    r = client.get("/api/trips", headers={"Authorization": "Bearer good"})
    assert r.status_code == 200 and r.json()[0]["id"] == "t1"
    rest_call = [s for s in seen if "/rest/v1/trips" in s[1]][0]
    assert rest_call[2]["Authorization"] == "Bearer good" and rest_call[3]["user_id"] == "eq.user-1"
    r = client.get("/api/trips", headers={"Authorization": "Bearer bad"})
    assert r.status_code == 401
    assert client.get("/api/health").json()["auth"] is True


def test_storage_summary_handles_dict_cover():
    s = storage._summary({"destination": "X", "days": [1, 2], "cover_image": {"url": "http://img"}})
    assert s == {"destination": "X", "days": 2, "cover_image": "http://img"}
    assert json.dumps(s)


# --------------------------------------------------------------------------- v1.1: schedule, group fit, sharing


def test_schedule_times_and_lunch_anchor(client):
    plan = client.post("/api/itineraries/generate", json={**PREFS, "day_start": "08:30"}, headers=GUEST).json()
    for d in plan["days"]:
        acts = d["activities"]
        assert acts[0]["start_time"] == "08:30"
        # sequential: each activity starts at or after the previous one ends
        for prev, cur in zip(acts, acts[1:]):
            assert cur["start_time"] >= prev["end_time"]
        assert acts[1]["start_time"] >= "11:30"  # lunch never before 11:30
        assert "ends_at" in d and isinstance(d["schedule_warnings"], list)


def test_schedule_warning_when_day_runs_late(client):
    late = {**PREFS, "day_start": "15:30", "pace": "Fast-Paced"}  # late start + packed day -> past 23:00
    plan = client.post("/api/itineraries/generate", json=late, headers=GUEST).json()
    assert any("runs until" in w for w in plan["days"][0]["schedule_warnings"]), plan["days"][0]
    # normal start -> no late warning
    ok = client.post("/api/itineraries/generate", json=PREFS, headers=GUEST).json()
    assert not any("runs until" in w for d in ok["days"] for w in d["schedule_warnings"])


def test_group_fit_report(client):
    prefs = {**PREFS, "party": "Friends", "group_size": 3, "interests": [],
             "travellers": [{"name": "Aman", "interests": ["Food", "Nightlife"]},
                            {"name": "Riya", "interests": ["Wellness"]},
                            {"name": "Zed", "interests": ["Art & Museums"]}]}
    plan = client.post("/api/itineraries/generate", json=prefs, headers=GUEST).json()
    gf = plan["group_fit"]
    assert [m["name"] for m in gf["members"]] == ["Aman", "Riya", "Zed"]
    aman = gf["members"][0]
    assert aman["matched_activities"] > 0 and aman["uncovered"] == []
    assert isinstance(gf["conflicts"], list) and "summary" in gf
    # merged interests reach the engine (prompt/demo) - the legacy prefs carry the union
    from models import Preferences
    assert Preferences(**prefs).merged_interests() == ["Food", "Nightlife", "Wellness", "Art & Museums"]
    # no travellers -> no report
    assert client.post("/api/itineraries/generate", json=PREFS, headers=GUEST).json()["group_fit"] is None


def test_share_link_flow_sqlite(client):
    plan = client.post("/api/itineraries/generate", json=PREFS, headers=GUEST).json()
    tid = client.post("/api/trips", json={"name": "Goa squad", "preferences": PREFS, "plan": plan}, headers=GUEST).json()["id"]
    # not shared yet
    assert client.get("/api/shared/not-a-real-token-xyz").status_code == 404
    r = client.post(f"/api/trips/{tid}/share", headers=GUEST)
    assert r.status_code == 200, r.text
    token = r.json()["share_token"]
    assert token and r.json()["share_path"] == f"/share/{token}"
    # idempotent
    assert client.post(f"/api/trips/{tid}/share", headers=GUEST).json()["share_token"] == token
    # only the owner can share
    other = {"X-Guest-Id": str(uuid.uuid4())}
    assert client.post(f"/api/trips/{tid}/share", headers=other).status_code == 404
    # anyone can read, without any identity header, and the owner id is not exposed
    pub = client.get(f"/api/shared/{token}")
    assert pub.status_code == 200 and pub.json()["name"] == "Goa squad" and pub.json()["plan"]["destination"] == "Goa"
    assert "owner_id" not in pub.json() and "id" not in pub.json()
    # listing shows the token to the owner
    assert client.get("/api/trips", headers=GUEST).json()[0]["share_token"] == token
    # another person clones it into their own trips
    c = client.post(f"/api/shared/{token}/clone", headers=other)
    assert c.status_code == 201 and c.json()["name"] == "Goa squad (copy)"
    assert client.get("/api/trips", headers=other).json()[0]["id"] == c.json()["id"]
    # revoke -> link dies
    assert client.delete(f"/api/trips/{tid}/share", headers=GUEST).json()["share_token"] is None
    assert client.get(f"/api/shared/{token}").status_code == 404


def test_share_supabase_rpc_with_mock(client, monkeypatch, tmp_path):
    live = Settings(sqlite_path=str(tmp_path / "x.db"), supabase_url="https://proj.supabase.co", supabase_anon_key="anon", _env_file=None)
    import main
    main.app.dependency_overrides[get_settings] = lambda: live
    calls = []

    async def fake_post(self, url, headers=None, content=None, json=None, **kw):
        calls.append((url, headers, content))
        if url.endswith("/rpc/get_shared_trip"):
            body = __import__("json").loads(content)
            if body["token"] == "tok_abcdefgh":
                return httpx.Response(200, json=[{"name": "Shared", "destination": "Goa", "days": 2, "budget_level": "Moderate",
                                                  "cover_image": None, "updated_at": "2026-01-01T00:00:00+00:00",
                                                  "preferences": PREFS, "plan": {"destination": "Goa", "days": []}}],
                                      request=httpx.Request("POST", url))
            return httpx.Response(200, json=[], request=httpx.Request("POST", url))
        return httpx.Response(404, json={}, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    r = client.get("/api/shared/tok_abcdefgh")
    assert r.status_code == 200 and r.json()["name"] == "Shared"
    assert calls[0][1]["Authorization"] == "Bearer anon"  # anon key only, never a user token
    assert client.get("/api/shared/tok_unknown1").status_code == 404
