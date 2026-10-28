import { Compass, LogIn, LogOut, Map, PlusCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useStore } from "../lib/store";
import type { Health } from "../lib/types";

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 rounded-lg text-sm font-medium transition ${isActive ? "bg-teal-50 text-teal" : "text-muted hover:text-ink hover:bg-gray-50"}`;

export default function Layout() {
  const { session, enabled, signOut } = useAuth();
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth(null));
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 font-display text-lg text-teal">
            <Compass className="w-6 h-6" /> <span className="hidden sm:inline">Itinerary Planner</span>
          </Link>
          <nav className="flex items-center gap-1 ml-auto">
            <NavLink to="/plan" className={navClass}><span className="flex items-center gap-1"><PlusCircle className="w-4 h-4" /> Plan</span></NavLink>
            <NavLink to="/itinerary" className={navClass}>Itinerary</NavLink>
            <NavLink to="/trips" className={navClass}><span className="flex items-center gap-1"><Map className="w-4 h-4" /> My trips</span></NavLink>
            {enabled && session ? (
              <button onClick={() => signOut()} className="px-3 py-2 rounded-lg text-sm font-medium text-muted hover:text-ink hover:bg-gray-50 flex items-center gap-1" title={session.user.email ?? ""}>
                <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sign out</span>
              </button>
            ) : (
              <NavLink to="/login" className={navClass}><span className="flex items-center gap-1"><LogIn className="w-4 h-4" /> {enabled ? "Sign in" : "Guest"}</span></NavLink>
            )}
          </nav>
        </div>
        {health && (
          <div className="bg-sand text-[11px] text-muted">
            <div className="max-w-6xl mx-auto px-4 py-1 flex flex-wrap gap-x-4">
              <span>AI: <b className="text-ink">{health.ai_mode === "groq" ? "Groq (live)" : "Demo engine"}</b></span>
              <span>Storage: <b className="text-ink">{health.storage === "supabase" ? "Supabase" : "Local SQLite (guest)"}</b></span>
              <span>Images: <b className="text-ink">{health.images ? "Unsplash" : "Placeholders"}</b></span>
              <span>Account: <b className="text-ink">{session ? session.user.email : "Guest"}</b></span>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-gray-100 py-5 text-center text-xs text-muted">
        React + FastAPI + Supabase + Groq + Unsplash · Personalized Travel Itinerary Planner
      </footer>

      <div className="fixed bottom-4 right-4 z-50 space-y-2 w-[min(92vw,380px)]">
        {toasts.map((t) => (
          <div key={t.id} className={`rounded-xl shadow-card px-4 py-3 text-sm flex items-start gap-2 border ${t.kind === "error" ? "bg-red-50 border-red-200 text-red-800" : t.kind === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-white border-gray-200 text-ink"}`}>
            <span className="flex-1">{t.text}</span>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
