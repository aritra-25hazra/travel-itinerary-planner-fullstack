import { guestId } from "./guest";
import { supabase } from "./supabase";
import type { Health, Plan, Preferences, Recommendation, TripSummary } from "./types";

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) || "").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const h: Record<string, string> = { "X-Guest-Id": guestId() };
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) h["Authorization"] = `Bearer ${data.session.access_token}`;
  }
  return h;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(await authHeaders()), ...(init.headers as Record<string, string> | undefined) };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  let resp: Response;
  try {
    resp = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Cannot reach the API. Is the backend running? (Render free tier takes ~50s to wake up.)");
  }
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const j = await resp.json();
      detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j);
    } catch {
      /* ignore */
    }
    throw new ApiError(resp.status, detail);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export const api = {
  health: () => request<Health>("/api/health"),
  recommendations: (prefs: Preferences) => request<Recommendation[]>("/api/recommendations", { method: "POST", body: JSON.stringify(prefs) }),
  generate: (prefs: Preferences) => request<Plan>("/api/itineraries/generate", { method: "POST", body: JSON.stringify(prefs) }),
  regenerateDay: (preferences: Preferences, plan: Plan, day_index: number, instruction: string) =>
    request<Plan>("/api/itineraries/regenerate-day", { method: "POST", body: JSON.stringify({ preferences, plan, day_index, instruction }) }),
  recompute: (preferences: Preferences, plan: Plan) =>
    request<Plan>("/api/itineraries/recompute", { method: "POST", body: JSON.stringify({ preferences, plan }) }),
  async pdf(preferences: Preferences, plan: Plan): Promise<Blob> {
    const headers = { ...(await authHeaders()), "Content-Type": "application/json" };
    const resp = await fetch(`${BASE}/api/itineraries/pdf`, { method: "POST", headers, body: JSON.stringify({ preferences, plan }) });
    if (!resp.ok) throw new ApiError(resp.status, "PDF export failed");
    return resp.blob();
  },
  trips: {
    list: () => request<TripSummary[]>("/api/trips"),
    get: (id: string) => request<TripSummary>(`/api/trips/${id}`),
    create: (name: string, preferences: Preferences, plan: Plan) =>
      request<TripSummary>("/api/trips", { method: "POST", body: JSON.stringify({ name, preferences, plan }) }),
    update: (id: string, name: string, preferences: Preferences, plan: Plan) =>
      request<TripSummary>(`/api/trips/${id}`, { method: "PUT", body: JSON.stringify({ name, preferences, plan }) }),
    remove: (id: string) => request<void>(`/api/trips/${id}`, { method: "DELETE" }),
  },
};
