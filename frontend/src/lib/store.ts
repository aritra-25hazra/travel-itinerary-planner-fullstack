import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Plan, Preferences, Recommendation } from "./types";

function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

export const defaultPreferences = (): Preferences => ({
  destination: "",
  vibe: "Beach",
  days: 4,
  start_date: defaultStart(),
  budget_level: "Moderate",
  total_budget_inr: null,
  party: "Couple",
  group_size: 2,
  pace: "Moderate",
  interests: ["Food", "History"],
  travel_style: "",
  travellers: [],
  day_start: "09:00",
});

interface Toast {
  id: number;
  kind: "error" | "success" | "info";
  text: string;
}

interface State {
  preferences: Preferences;
  plan: Plan | null;
  recommendations: Recommendation[];
  currentTripId: string | null;
  toasts: Toast[];
  setPreferences: (patch: Partial<Preferences>) => void;
  resetPreferences: () => void;
  setPlan: (plan: Plan | null) => void;
  setRecommendations: (r: Recommendation[]) => void;
  setCurrentTripId: (id: string | null) => void;
  toast: (kind: Toast["kind"], text: string) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 1;

export const useStore = create<State>()(
  persist(
    (set) => ({
      preferences: defaultPreferences(),
      plan: null,
      recommendations: [],
      currentTripId: null,
      toasts: [],
      setPreferences: (patch) => set((s) => ({ preferences: { ...s.preferences, ...patch } })),
      resetPreferences: () => set({ preferences: defaultPreferences(), recommendations: [] }),
      setPlan: (plan) => set({ plan }),
      setRecommendations: (recommendations) => set({ recommendations }),
      setCurrentTripId: (currentTripId) => set({ currentTripId }),
      toast: (kind, text) => {
        const id = toastSeq++;
        set((s) => ({ toasts: [...s.toasts, { id, kind, text }] }));
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4500);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: "tip.state",
      version: 2,
      migrate: (persisted: unknown) => {
        const s = (persisted ?? {}) as Partial<State>;
        return { ...s, preferences: { ...defaultPreferences(), ...(s.preferences ?? {}) } } as State;
      },
      partialize: (s) => ({ preferences: s.preferences, plan: s.plan, recommendations: s.recommendations, currentTripId: s.currentTripId }),
    },
  ),
);
