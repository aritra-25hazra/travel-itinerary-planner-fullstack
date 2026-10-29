import { Copy, Eye } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import DayTimeline from "../components/DayTimeline";
import GroupFitCard from "../components/GroupFitCard";
import { Badge, Button, Card, Cover, Skeleton } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { dateLabel, inr, money } from "../lib/format";
import { useStore } from "../lib/store";
import type { SharedTrip as SharedTripT } from "../lib/types";

/** Public, read-only view of a trip someone shared. No login needed. */
export default function SharedTrip() {
  const { token = "" } = useParams();
  const nav = useNavigate();
  const toast = useStore((s) => s.toast);
  const setPlan = useStore((s) => s.setPlan);
  const setPrefs = useStore((s) => s.setPreferences);
  const setTripId = useStore((s) => s.setCurrentTripId);
  const [trip, setTrip] = useState<SharedTripT | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [cloning, setCloning] = useState(false);

  useEffect(() => {
    setTrip(null);
    setError(null);
    api.shared.get(token).then(setTrip).catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this trip"));
  }, [token]);

  async function clone() {
    setCloning(true);
    try {
      const t = await api.shared.clone(token);
      const full = await api.trips.get(t.id);
      if (full.plan && full.preferences) {
        setPlan(full.plan);
        setPrefs(full.preferences);
        setTripId(full.id);
      }
      toast("success", "Copied to My trips — edit away, the original stays unchanged.");
      nav("/itinerary");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Could not clone");
    } finally {
      setCloning(false);
    }
  }

  if (error) {
    return (
      <Card className="p-10 text-center space-y-3">
        <h1 className="font-display text-2xl text-teal">Link not available</h1>
        <p className="text-sm text-muted">{error}</p>
        <Link to="/plan"><Button>Plan your own trip</Button></Link>
      </Card>
    );
  }
  if (!trip) {
    return <div className="space-y-4"><Skeleton className="h-64" /><Skeleton className="h-40" /></div>;
  }

  const { plan, preferences: prefs } = trip;
  const cur = plan.currency_code;
  const f = plan.totals.activities_local > 0 ? plan.totals.activities_inr / plan.totals.activities_local : cur === "INR" ? 1 : 84;
  const toInr = (v: number) => v * f;
  const day = plan.days[Math.min(dayIdx, plan.days.length - 1)];
  const dayKm = plan.cluster_report?.days?.find((d) => d.day === day.day)?.km;

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-sand px-4 py-2 text-xs text-muted flex items-center gap-2"><Eye className="w-3.5 h-3.5" /> You're viewing a shared, read-only trip: <b className="text-ink">{trip.name}</b></div>
      <Cover image={plan.cover_image} title={`${plan.destination}${plan.country ? `, ${plan.country}` : ""}`}
        subtitle={`${plan.days.length} days · ${dateLabel(plan.days[0].date)} – ${dateLabel(plan.days[plan.days.length - 1].date)} · ${prefs.party} · ${prefs.pace} pace · ${prefs.budget_level}`} className="h-60" />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="teal">Shared trip</Badge>
        <Badge tone="neutral">Per person {inr(plan.totals.per_person_inr)}</Badge>
        <Badge tone="neutral">Group of {plan.totals.group_size}: {inr(plan.totals.group_total_inr)} incl. stay</Badge>
        <div className="ml-auto"><Button onClick={clone} disabled={cloning}><Copy className="w-4 h-4" /> {cloning ? "Copying…" : "Clone to My trips"}</Button></div>
      </div>

      {plan.overview && <Card className="p-5 text-sm leading-relaxed">{plan.overview}</Card>}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <Card className="p-5 min-w-0">
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
            {plan.days.map((d, i) => (
              <button key={d.day} onClick={() => setDayIdx(i)} className={`shrink-0 rounded-xl px-3.5 py-2 text-left border transition ${i === dayIdx ? "bg-teal text-white border-teal" : "border-gray-200 hover:border-teal"}`}>
                <div className="text-xs opacity-80">Day {d.day} · {dateLabel(d.date, { day: "numeric", month: "short" })}</div>
                <div className="text-sm font-semibold truncate max-w-[150px]">{d.theme}</div>
              </button>
            ))}
          </div>
          <h2 className="font-display text-2xl text-teal mt-2 mb-4">Day {day.day} · {day.theme}</h2>
          <DayTimeline day={day} currency={cur} toInr={toInr} km={dayKm} readOnly />
        </Card>
        <div className="space-y-4">
          {plan.group_fit && <GroupFitCard fit={plan.group_fit} />}
          <Card className="p-5 text-sm">
            <h3 className="font-semibold">Where to stay</h3>
            <div className="mt-1 font-medium">{plan.accommodation.name}</div>
            <div className="text-xs text-muted">{plan.accommodation.type} · {plan.accommodation.area}</div>
            <div className="mt-1">{money(plan.accommodation.est_cost_per_night_local, cur)}/night × {plan.accommodation.nights}</div>
          </Card>
          <Card className="p-5 text-sm">
            <h3 className="font-semibold">Want to change something?</h3>
            <p className="text-xs text-muted mt-1">Clone this trip into your own account, edit any day, and send your version back with your own share link.</p>
            <Button className="w-full mt-3" variant="secondary" onClick={clone} disabled={cloning}>Clone & edit</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
