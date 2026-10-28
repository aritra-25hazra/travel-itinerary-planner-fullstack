"""Unsplash image lookup with an in-memory cache. Returns a placeholder descriptor when no key is configured."""

from __future__ import annotations

import time

import httpx

from config import Settings

_CACHE: dict[str, tuple[float, dict]] = {}
_TTL = 24 * 3600

# Deterministic gradients so the UI never shows a broken image when Unsplash is off.
_GRADIENTS = [
    ("#0F5C5C", "#FF8A70"), ("#1D8A8A", "#F6C177"), ("#2B4C7E", "#8FD3F4"),
    ("#5E3A8A", "#FF6B5B"), ("#0B6E4F", "#E3F7EA"), ("#8A3B1D", "#FFD7B5"),
]


def placeholder(query: str) -> dict:
    g = _GRADIENTS[sum(ord(c) for c in query.lower()) % len(_GRADIENTS)]
    return {"url": None, "thumb": None, "photographer": None, "photographer_url": None,
            "source": None, "gradient": [g[0], g[1]], "query": query}


async def search_image(query: str, settings: Settings) -> dict:
    q = " ".join(query.split())[:80]
    if not q:
        return placeholder("travel")
    key = q.lower()
    now = time.time()
    hit = _CACHE.get(key)
    if hit and hit[0] > now:
        return hit[1]
    if not settings.unsplash_access_key:
        return placeholder(q)
    params = {"query": f"{q} travel", "per_page": 1, "orientation": "landscape", "content_filter": "high"}
    headers = {"Authorization": f"Client-ID {settings.unsplash_access_key}", "Accept-Version": "v1"}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get("https://api.unsplash.com/search/photos", params=params, headers=headers)
        if resp.status_code != 200:
            return placeholder(q)
        results = resp.json().get("results") or []
        if not results:
            return placeholder(q)
        photo = results[0]
        out = {
            "url": photo["urls"].get("regular"),
            "thumb": photo["urls"].get("small"),
            "photographer": (photo.get("user") or {}).get("name"),
            "photographer_url": ((photo.get("user") or {}).get("links") or {}).get("html"),
            "source": "unsplash",
            "gradient": None,
            "query": q,
        }
    except (httpx.HTTPError, KeyError, ValueError):
        return placeholder(q)
    if len(_CACHE) > 2000:
        _CACHE.clear()
    _CACHE[key] = (now + _TTL, out)
    return out
