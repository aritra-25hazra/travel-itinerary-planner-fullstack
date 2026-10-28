import { CalendarDays, FolderOpen, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Card, Skeleton } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateLabel, gradientStyle } from "../lib/format";
import { useStore } from "../lib/store";
import type { TripSummary } from "../lib/types";

export default function Trips() {
  const nav = useNavigate();
  const { session, enabled } = useAuth();
  const setPlan = useStore((s) => s.setPlan);
  const setPrefs = useStore((s) => s.setPreferences);
  const setTripId = useStore((s) => s.setCurrentTripId);
  const toast = useStore((s) => s.toast);
  const [trips, setTrips] = useState<TripSummary[] | null>(null);

  async function load() {
    try {
      setTrips(await api.trips.list());
    } catch (e) {
      setTrips([]);
      toast("error", e instanceof ApiError ? e.message : "Could not load trips");
    }
  }

  useEffect(() => {
    load();
    // reload when the login state changes (guest -> user switches storage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  async function open(t: TripSummary) {
    try {
      const full = await api.trips.get(t.id);
      if (full.plan && full.preferences) {
        setPlan(full.plan);
        setPrefs(full.preferences);
        setTripId(full.id);
        nav("/itinerary");
      }
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Could not open trip");
    }
  }

  async function remove(t: TripSummary) {
    if (!confirm(`Delete "${t.name}"?`)) return;
    try {
      await api.trips.remove(t.id);
      setTrips((xs) => (xs ?? []).filter((x) => x.id !== t.id));
      toast("success", "Trip deleted.");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-teal">My trips</h1>
          <p className="text-sm text-muted mt-1">
            {session ? `Saved to your account (${session.user.email}).` : enabled ? "Guest trips live in this browser. Sign in to keep them in your account." : "Stored in the local database (guest mode)."}
          </p>
        </div>
        <Link to="/plan"><Button>New trip</Button></Link>
      </div>

      {trips === null && <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56" />)}</div>}
      {trips && trips.length === 0 && (
        <Card className="p-10 text-center text-sm text-muted">No saved trips yet. Generate an itinerary and click <b>Save to My trips</b>.</Card>
      )}
      {trips && trips.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {trips.map((t) => (
            <Card key={t.id} className="overflow-hidden">
              <div className="h-32 relative" style={t.cover_image ? undefined : gradientStyle(null)}>
                {t.cover_image && <img src={t.cover_image} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                <div className="absolute bottom-3 left-4 text-white"><div className="font-display text-xl">{t.destination}</div></div>
              </div>
              <div className="p-4 space-y-2">
                <div className="font-semibold truncate" title={t.name}>{t.name}</div>
                <div className="flex flex-wrap gap-1.5 text-xs text-muted items-center">
                  <Badge tone="teal">{t.days} days</Badge><Badge tone="neutral">{t.budget_level}</Badge>
                  <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {dateLabel(t.updated_at.slice(0, 10))}</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button className="flex-1 !py-2" onClick={() => open(t)}><FolderOpen className="w-4 h-4" /> Open</Button>
                  <Button variant="danger" className="!py-2" onClick={() => remove(t)} title="Delete"><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
