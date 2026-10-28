"""Identity resolution.

- Logged-in users send `Authorization: Bearer <supabase access token>`; we verify it against Supabase Auth
  (`GET /auth/v1/user`), so it works whatever JWT signing scheme the project uses.
- Everyone else is a guest identified by the `X-Guest-Id` header (a UUID the frontend keeps in localStorage).
"""

from __future__ import annotations

import re
import time
import uuid
from dataclasses import dataclass

import httpx
from fastapi import Depends, Header, HTTPException, Request

from config import Settings, get_settings

_TOKEN_CACHE: dict[str, tuple[float, dict]] = {}
_CACHE_TTL = 300  # seconds
_GUEST_RE = re.compile(r"^[A-Za-z0-9\-]{8,64}$")


@dataclass
class Identity:
    kind: str  # "user" | "guest"
    id: str
    token: str | None = None
    email: str | None = None

    @property
    def is_user(self) -> bool:
        return self.kind == "user"


async def verify_supabase_token(token: str, settings: Settings) -> dict | None:
    now = time.time()
    hit = _TOKEN_CACHE.get(token)
    if hit and hit[0] > now:
        return hit[1]
    url = f"{settings.supabase_url.rstrip('/')}/auth/v1/user"
    headers = {"apikey": settings.supabase_anon_key, "Authorization": f"Bearer {token}"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, headers=headers)
    except httpx.HTTPError:
        return None
    if resp.status_code != 200:
        return None
    user = resp.json()
    if not isinstance(user, dict) or not user.get("id"):
        return None
    # keep the cache small
    if len(_TOKEN_CACHE) > 500:
        _TOKEN_CACHE.clear()
    _TOKEN_CACHE[token] = (now + _CACHE_TTL, user)
    return user


async def get_identity(
    request: Request,
    authorization: str | None = Header(default=None),
    x_guest_id: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> Identity:
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if settings.storage_mode == "supabase" and token:
            user = await verify_supabase_token(token, settings)
            if not user:
                raise HTTPException(status_code=401, detail="Session expired or invalid. Please sign in again.")
            return Identity(kind="user", id=user["id"], token=token, email=user.get("email"))
    if x_guest_id and _GUEST_RE.match(x_guest_id):
        return Identity(kind="guest", id=x_guest_id)
    # No identity at all: derive a stable-ish guest id from the client IP so the API still works from curl.
    ip = request.client.host if request.client else "anon"
    return Identity(kind="guest", id=f"ip-{uuid.uuid5(uuid.NAMESPACE_DNS, ip)}")
