"""Trip persistence with two interchangeable backends.

- SupabaseStorage: PostgREST calls made with the *user's own JWT*, so Supabase Row Level Security decides what
  they can see. No service-role key is ever needed on the server.
- SQLiteStorage: local file used for guests and whenever Supabase is not configured.
"""

from __future__ import annotations

import json
import secrets
import sqlite3
import uuid
from datetime import datetime, timezone
from typing import Protocol

import httpx

from auth import Identity
from config import Settings


def new_share_token() -> str:
    return secrets.token_urlsafe(12)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _summary(plan: dict) -> dict:
    return {
        "destination": str(plan.get("destination") or ""),
        "days": len(plan.get("days") or []),
        "cover_image": (plan.get("cover_image") or {}).get("url") if isinstance(plan.get("cover_image"), dict) else plan.get("cover_image"),
    }


class Storage(Protocol):
    async def list(self, who: Identity) -> list[dict]: ...
    async def get(self, who: Identity, trip_id: str) -> dict | None: ...
    async def create(self, who: Identity, name: str, preferences: dict, plan: dict) -> dict: ...
    async def update(self, who: Identity, trip_id: str, name: str, preferences: dict, plan: dict) -> dict | None: ...
    async def delete(self, who: Identity, trip_id: str) -> bool: ...
    async def set_share(self, who: Identity, trip_id: str, enabled: bool) -> str | None: ...
    async def get_shared(self, token: str) -> dict | None: ...


# --------------------------------------------------------------------------- SQLite


class SQLiteStorage:
    def __init__(self, path: str) -> None:
        self.path = path
        with self._conn() as c:
            c.execute(
                """CREATE TABLE IF NOT EXISTS trips (
                    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, destination TEXT, days INTEGER,
                    budget_level TEXT, cover_image TEXT, preferences TEXT NOT NULL, plan TEXT NOT NULL,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, share_token TEXT)"""
            )
            c.execute("CREATE INDEX IF NOT EXISTS idx_trips_owner ON trips(owner_id, updated_at)")
            cols = {r["name"] for r in c.execute("PRAGMA table_info(trips)")}
            if "share_token" not in cols:  # migrate databases created before sharing existed
                c.execute("ALTER TABLE trips ADD COLUMN share_token TEXT")
            c.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_trips_share ON trips(share_token)")

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _row(r: sqlite3.Row, full: bool) -> dict:
        d = {
            "id": r["id"], "name": r["name"], "destination": r["destination"], "days": r["days"],
            "budget_level": r["budget_level"], "cover_image": r["cover_image"],
            "created_at": r["created_at"], "updated_at": r["updated_at"], "share_token": r["share_token"],
        }
        if full:
            d["preferences"] = json.loads(r["preferences"])
            d["plan"] = json.loads(r["plan"])
        return d

    async def list(self, who: Identity) -> list[dict]:
        with self._conn() as c:
            rows = c.execute("SELECT * FROM trips WHERE owner_id=? ORDER BY updated_at DESC", (who.id,)).fetchall()
        return [self._row(r, full=False) for r in rows]

    async def get(self, who: Identity, trip_id: str) -> dict | None:
        with self._conn() as c:
            r = c.execute("SELECT * FROM trips WHERE id=? AND owner_id=?", (trip_id, who.id)).fetchone()
        return self._row(r, full=True) if r else None

    async def create(self, who: Identity, name: str, preferences: dict, plan: dict) -> dict:
        s = _summary(plan)
        tid, now = str(uuid.uuid4()), _now()
        with self._conn() as c:
            c.execute(
                "INSERT INTO trips (id, owner_id, name, destination, days, budget_level, cover_image, preferences, plan, created_at, updated_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (tid, who.id, name, s["destination"], s["days"], preferences.get("budget_level"), s["cover_image"],
                 json.dumps(preferences, default=str), json.dumps(plan, default=str), now, now),
            )
        return (await self.get(who, tid)) or {}

    async def update(self, who: Identity, trip_id: str, name: str, preferences: dict, plan: dict) -> dict | None:
        s = _summary(plan)
        with self._conn() as c:
            cur = c.execute(
                "UPDATE trips SET name=?, destination=?, days=?, budget_level=?, cover_image=?, preferences=?, plan=?, updated_at=? "
                "WHERE id=? AND owner_id=?",
                (name, s["destination"], s["days"], preferences.get("budget_level"), s["cover_image"],
                 json.dumps(preferences, default=str), json.dumps(plan, default=str), _now(), trip_id, who.id),
            )
            if cur.rowcount == 0:
                return None
        return await self.get(who, trip_id)

    async def delete(self, who: Identity, trip_id: str) -> bool:
        with self._conn() as c:
            cur = c.execute("DELETE FROM trips WHERE id=? AND owner_id=?", (trip_id, who.id))
            return cur.rowcount > 0

    async def set_share(self, who: Identity, trip_id: str, enabled: bool) -> str | None:
        with self._conn() as c:
            row = c.execute("SELECT share_token FROM trips WHERE id=? AND owner_id=?", (trip_id, who.id)).fetchone()
            if row is None:
                raise KeyError(trip_id)
            if not enabled:
                c.execute("UPDATE trips SET share_token=NULL WHERE id=?", (trip_id,))
                return None
            token = row["share_token"] or new_share_token()
            c.execute("UPDATE trips SET share_token=? WHERE id=?", (token, trip_id))
            return token

    async def get_shared(self, token: str) -> dict | None:
        with self._conn() as c:
            r = c.execute("SELECT * FROM trips WHERE share_token=?", (token,)).fetchone()
        if not r:
            return None
        d = self._row(r, full=True)
        d.pop("id", None)
        return d


# --------------------------------------------------------------------------- Supabase (PostgREST)


class SupabaseStorage:
    def __init__(self, settings: Settings) -> None:
        self.base = f"{settings.supabase_url.rstrip('/')}/rest/v1/trips"
        self.anon = settings.supabase_anon_key

    def _headers(self, who: Identity, prefer: str | None = None) -> dict[str, str]:
        h = {"apikey": self.anon, "Authorization": f"Bearer {who.token}", "Content-Type": "application/json"}
        if prefer:
            h["Prefer"] = prefer
        return h

    @staticmethod
    def _raise(resp: httpx.Response) -> None:
        if resp.status_code >= 400:
            raise RuntimeError(f"Supabase error {resp.status_code}: {resp.text[:300]}")

    async def list(self, who: Identity) -> list[dict]:
        params = {"select": "id,name,destination,days,budget_level,cover_image,created_at,updated_at,share_token",
                  "user_id": f"eq.{who.id}", "order": "updated_at.desc"}
        async with httpx.AsyncClient(timeout=15) as c:
            resp = await c.get(self.base, headers=self._headers(who), params=params)
        self._raise(resp)
        return resp.json()

    async def get(self, who: Identity, trip_id: str) -> dict | None:
        params = {"select": "*", "id": f"eq.{trip_id}", "user_id": f"eq.{who.id}"}
        async with httpx.AsyncClient(timeout=15) as c:
            resp = await c.get(self.base, headers=self._headers(who), params=params)
        self._raise(resp)
        rows = resp.json()
        return rows[0] if rows else None

    async def create(self, who: Identity, name: str, preferences: dict, plan: dict) -> dict:
        s = _summary(plan)
        body = {"user_id": who.id, "name": name, "destination": s["destination"], "days": s["days"],
                "budget_level": preferences.get("budget_level"), "cover_image": s["cover_image"],
                "preferences": preferences, "plan": plan}
        async with httpx.AsyncClient(timeout=20) as c:
            resp = await c.post(self.base, headers=self._headers(who, "return=representation"), content=json.dumps(body, default=str))
        self._raise(resp)
        return resp.json()[0]

    async def update(self, who: Identity, trip_id: str, name: str, preferences: dict, plan: dict) -> dict | None:
        s = _summary(plan)
        body = {"name": name, "destination": s["destination"], "days": s["days"], "budget_level": preferences.get("budget_level"),
                "cover_image": s["cover_image"], "preferences": preferences, "plan": plan, "updated_at": _now()}
        params = {"id": f"eq.{trip_id}", "user_id": f"eq.{who.id}"}
        async with httpx.AsyncClient(timeout=20) as c:
            resp = await c.patch(self.base, headers=self._headers(who, "return=representation"), params=params,
                                 content=json.dumps(body, default=str))
        self._raise(resp)
        rows = resp.json()
        return rows[0] if rows else None

    async def delete(self, who: Identity, trip_id: str) -> bool:
        params = {"id": f"eq.{trip_id}", "user_id": f"eq.{who.id}"}
        async with httpx.AsyncClient(timeout=15) as c:
            resp = await c.delete(self.base, headers=self._headers(who, "return=representation"), params=params)
        self._raise(resp)
        return bool(resp.json())

    async def set_share(self, who: Identity, trip_id: str, enabled: bool) -> str | None:
        current = await self.get(who, trip_id)
        if current is None:
            raise KeyError(trip_id)
        token = None if not enabled else (current.get("share_token") or new_share_token())
        params = {"id": f"eq.{trip_id}", "user_id": f"eq.{who.id}"}
        async with httpx.AsyncClient(timeout=15) as c:
            resp = await c.patch(self.base, headers=self._headers(who, "return=representation"), params=params,
                                 content=json.dumps({"share_token": token}))
        self._raise(resp)
        return token

    async def get_shared(self, token: str) -> dict | None:
        """Public read through the `get_shared_trip` SECURITY DEFINER function (see supabase/schema.sql),
        so no user JWT is needed and RLS stays closed for everything else."""
        url = self.base.replace("/rest/v1/trips", "/rest/v1/rpc/get_shared_trip")
        headers = {"apikey": self.anon, "Authorization": f"Bearer {self.anon}", "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=15) as c:
            resp = await c.post(url, headers=headers, content=json.dumps({"token": token}))
        self._raise(resp)
        rows = resp.json()
        if not rows:
            return None
        row = rows[0] if isinstance(rows, list) else rows
        row.pop("id", None)
        row.pop("user_id", None)
        return row


# --------------------------------------------------------------------------- factory

_sqlite: SQLiteStorage | None = None


def storage_for(who: Identity, settings: Settings) -> Storage:
    """Logged-in users on a configured Supabase project go to Postgres; everyone else to SQLite."""
    global _sqlite
    if who.is_user and settings.storage_mode == "supabase":
        return SupabaseStorage(settings)
    if _sqlite is None or _sqlite.path != settings.sqlite_path:
        _sqlite = SQLiteStorage(settings.sqlite_path)
    return _sqlite


def public_storage(settings: Settings) -> Storage:
    """Storage used for anonymous share-link reads: Supabase when configured, else the local SQLite file."""
    global _sqlite
    if settings.storage_mode == "supabase":
        return SupabaseStorage(settings)
    if _sqlite is None or _sqlite.path != settings.sqlite_path:
        _sqlite = SQLiteStorage(settings.sqlite_path)
    return _sqlite


def reset_sqlite() -> None:
    global _sqlite
    _sqlite = None
