import { BedDouble, Download, Lock, RefreshCw, Save, ShieldAlert, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import DayTimeline from "../components/DayTimeline";
import GroupFitCard from "../components/GroupFitCard";
import ShareCard from "../components/ShareCard";
import { Badge, Button, Card, Chip, Cover, inputClass, Spinner } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { dateLabel, inr, money } from "../lib/format";
import { useStore } from "../lib/store";
import { QUICK_SWAPS, type Activity, type Plan } from "../lib/types";

export default function Itinerary() {
  const nav = useNavigate();
  const plan = useStore((s) => s.plan);
  const prefs = useStore((s) => s.preferences);
  const setPlan = useStore((s) => s.setPlan);
  const tripId = useStore((s) => s.currentTripId);
  const setTripId = useStore((s) => s.setCurrentTripId);
  const toast = useStore((s) => s.toast);
  const [dayIdx, setDayIdx] = useState(0);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState<null | "day" | "trip" | "save" | "pdf">(null);
  const [tripName, setTripName] = useState("");
  const [shareToken, setShareToken] = useState<string | null>(null);

  const cur = plan?.currency_code ?? "USD";
  // INR conversion factor derived from the backend totals (keeps a single source of truth for rates).
  const toInr = useMemo(() => {
    if (!plan) return (v: number) => v;
    const f = plan.totals.activities_local > 0 ? plan.totals.activities_inr / plan.totals.activities_local : cur === "INR" ? 1 : 84;
    return (v: number) => v * f;
  }, [plan, cur]);

  if (!plan) {
    return (
      <Card className="p-10 text-center space-y-3">
        <h1 className="font-display text-2xl text-teal">No itinerary yet</h1>
        <p className="text-muted text-sm">Build one in a minute with the trip builder, or open a saved trip.</p>
        <div className="flex justify-center gap-3"><Link to="/plan"><Button>Plan a trip</Button></Link><Link to="/trips"><Button variant="secondary">My trips</Button></Link></div>
      </Card>
    );
  }

  const day = plan.days[Math.min(dayIdx, plan.days.length - 1)];
  const dayKm = plan.cluster_report?.days?.find((d) => d.day === day.day)?.km;
  const bs = plan.totals.budget_status;
  const tone = bs.state === "under" ? "good" : bs.state === "close" ? "warn" : "bad";
  const defaultName = `${plan.destination} · ${plan.days.length}-day ${prefs.vibe} trip`;

  async function run<T>(kind: typeof busy, fn: () => Promise<T>, ok?: string) {
    setBusy(kind);
    try {
      const r = await fn();
      if (ok) toast("success", ok);
      return r;
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const regenerateDay = (text: string) =>
    run("day", async () => {
      const p = await api.regenerateDay(prefs, plan, dayIdx, text);
      setPlan(p);
      setInstruction("");
    }, `Day ${day.day} updated — other days untouched.`);

  const regenerateTrip = () =>
    run("trip", async () => {
      const p = await api.generate(prefs);
      setPlan(p);
      setTripId(null);
      setDayIdx(0);
    }, "Fresh itinerary generated.");

  const saveTrip = () =>
    run("save", async () => {
      const name = tripName.trim() || defaultName;
      const t = tripId ? await api.trips.update(tripId, name, prefs, plan) : await api.trips.create(name, prefs, plan);
      setTripId(t.id);
      setShareToken(t.share_token ?? null);
    }, tripId ? "Trip updated." : "Trip saved to My trips.");

  async function saveForShare(): Promise<string | null> {
    try {
      const t = await api.trips.create(tripName.trim() || defaultName, prefs, plan!);
      setTripId(t.id);
      toast("success", "Trip saved to My trips.");
      return t.id;
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Could not save the trip");
      return null;
    }
  }

  const downloadPdf = () =>
    run("pdf", async () => {
      const blob = await api.pdf(prefs, plan);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${plan.destination.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-itinerary.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    });

  async function editActivity(i: number, patch: Partial<Activity>) {
    const next: Plan = JSON.parse(JSON.stringify(plan));
    next.days[dayIdx].activities[i] = { ...next.days[dayIdx].activities[i], ...patch };
    try {
      setPlan(await api.recompute(prefs, next));
    } catch {
      setPlan(next);
    }
  }

  async function deleteActivity(i: number) {
    if (!plan) return;
    if (plan.days[dayIdx].activities.length <= 1) return toast("info", "Keep at least one activity per day.");
    const next: Plan = JSON.parse(JSON.stringify(plan));
    next.days[dayIdx].activities.splice(i, 1);
    try {
      setPlan(await api.recompute(prefs, next));
    } catch {
      setPlan(next);
    }
  }

  const start = plan.days[0]?.date, end = plan.days[plan.days.length - 1]?.date;

  return (
    <div className="space-y-6">
      <Cover image={plan.cover_image} title={`${plan.destination}${plan.country ? `, ${plan.country}` : ""}`}
        subtitle={`${plan.days.length} days · ${dateLabel(start)} – ${dateLabel(end)} · ${prefs.party} · ${prefs.pace} pace · ${prefs.budget_level}`} className="h-64" />

      <div className="flex flex-wrap gap-2 items-center">
        <Badge tone="teal">{plan.ai_mode === "groq" ? "Groq AI" : "Demo engine"}</Badge>
        {plan.cluster_report && <Badge tone="neutral">🧲 {plan.cluster_report.km_after.toFixed(1)} km intra-day transit{plan.cluster_report.km_before - plan.cluster_report.km_after > 0.1 ? ` (optimiser saved ${(plan.cluster_report.km_before - plan.cluster_report.km_after).toFixed(1)} km)` : ""}</Badge>}
        {plan.pace_note && <Badge tone="neutral">{plan.pace_note}</Badge>}
        {plan.last_change && <Badge tone="warn">Day {plan.last_change.day} customised: “{plan.last_change.instruction}”</Badge>}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" onClick={regenerateTrip} disabled={busy !== null}><RefreshCw className={`w-4 h-4 ${busy === "trip" ? "animate-spin" : ""}`} /> Regenerate trip</Button>
          <Button variant="secondary" onClick={downloadPdf} disabled={busy !== null}><Download className="w-4 h-4" /> PDF</Button>
        </div>
      </div>

      {plan.overview && <Card className="p-5 text-sm leading-relaxed">{plan.overview}</Card>}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={`Activities (${cur})`} value={money(plan.totals.activities_local, cur)} sub={cur !== "INR" ? `≈ ${inr(plan.totals.activities_inr)} · $${plan.totals.activities_usd.toFixed(0)}` : `$${plan.totals.activities_usd.toFixed(0)}`} />
        <Stat label="Per person / day" value={inr(plan.totals.per_day_inr)} sub="food + activities" />
        <Stat label={`Group of ${plan.totals.group_size} incl. stay`} value={inr(plan.totals.group_total_inr)} sub={`stay ≈ ${inr(plan.totals.stay_inr)}`} />
        <Stat label="Budget health" value={`${Math.round(bs.ratio * 100)}%`} sub={bs.basis} tone={tone} />
      </div>
      <div>
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full rounded-full ${bs.state === "under" ? "bg-teal" : bs.state === "close" ? "bg-amber-400" : "bg-red-500"}`} style={{ width: `${Math.min(100, bs.ratio * 100)}%` }} /></div>
        <p className="text-xs text-muted mt-1">{bs.message} · cap {inr(bs.cap_inr)}</p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <Card className="p-5 min-w-0">
          <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
            {plan.days.map((d, i) => (
              <button key={d.day} onClick={() => setDayIdx(i)} className={`shrink-0 rounded-xl px-3.5 py-2 text-left border transition ${i === dayIdx ? "bg-teal text-white border-teal" : "border-gray-200 hover:border-teal"}`}>
                <div className="text-xs opacity-80">Day {d.day} · {dateLabel(d.date, { day: "numeric", month: "short" })}</div>
                <div className="text-sm font-semibold truncate max-w-[150px]">{d.theme}</div>
              </button>
            ))}
          </div>
          <h2 className="font-display text-2xl text-teal mt-2 mb-1">Day {day.day} · {day.theme}</h2>
          <p className="text-xs text-muted mb-4">{dateLabel(day.date, { weekday: "long", day: "numeric", month: "long" })}</p>
          {busy === "day" ? <Spinner label={`Rewriting Day ${day.day}…`} /> : (
            <DayTimeline day={day} currency={cur} toInr={toInr} km={dayKm} onEdit={editActivity} onDelete={deleteActivity} />
          )}
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold flex items-center gap-2"><Wand2 className="w-4 h-4 text-coral" /> Customise Day {day.day}</h3>
            <p className="text-xs text-muted mt-1 flex items-center gap-1"><Lock className="w-3 h-3" /> Other {plan.days.length - 1} day{plan.days.length !== 2 ? "s" : ""} stay locked.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {QUICK_SWAPS.map((q) => <Chip key={q.label} onClick={() => setInstruction(q.instruction)} active={instruction === q.instruction}>{q.label}</Chip>)}
            </div>
            <textarea className={`${inputClass} mt-3`} rows={3} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder='e.g. "Swap the museum for an outdoor market" or "Find a vegetarian lunch spot"' />
            <Button className="w-full mt-3" disabled={busy !== null || instruction.trim().length < 2} onClick={() => regenerateDay(instruction.trim())}>
              <RefreshCw className={`w-4 h-4 ${busy === "day" ? "animate-spin" : ""}`} /> Regenerate Day {day.day} only
            </Button>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold flex items-center gap-2"><BedDouble className="w-4 h-4 text-coral" /> Where to stay</h3>
            <div className="mt-2 text-sm font-medium">{plan.accommodation.name}</div>
            <div className="text-xs text-muted">{plan.accommodation.type} · {plan.accommodation.area}</div>
            <div className="text-sm mt-2">{money(plan.accommodation.est_cost_per_night_local, cur)}/night × {plan.accommodation.nights} = <b>{money(plan.accommodation.est_total_local, cur)}</b>{cur !== "INR" && <span className="text-muted"> (≈ {inr(plan.totals.stay_inr)})</span>}</div>
            <p className="text-xs text-muted mt-2">{plan.accommodation.note}</p>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold flex items-center gap-2"><Save className="w-4 h-4 text-coral" /> Save this trip</h3>
            <input className={`${inputClass} mt-3`} placeholder={defaultName} value={tripName} onChange={(e) => setTripName(e.target.value)} />
            <Button className="w-full mt-3" onClick={saveTrip} disabled={busy !== null}>{tripId ? "Update saved trip" : "Save to My trips"}</Button>
            {tripId && <button className="text-xs text-teal underline mt-2" onClick={() => nav("/trips")}>View in My trips</button>}
          </Card>

          <ShareCard tripId={tripId} initialToken={shareToken} onNeedSave={saveForShare} />

          {plan.group_fit && <GroupFitCard fit={plan.group_fit} />}

          <Card className="p-5 text-sm">
            <h3 className="font-semibold flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-coral" /> Emergency & packing</h3>
            <ul className="mt-2 space-y-1 text-xs">
              {Object.entries(plan.emergency).filter(([k]) => k !== "embassy_note").map(([k, v]) => <li key={k}><span className="text-muted capitalize">{k.replace("_", " ")}:</span> {v}</li>)}
              {plan.emergency.embassy_note && <li className="text-muted">{plan.emergency.embassy_note}</li>}
            </ul>
            <div className="flex flex-wrap gap-1.5 mt-3">{plan.packing.map((p) => <span key={p} className="text-[11px] bg-gray-100 rounded-full px-2 py-0.5">{p}</span>)}</div>
            {plan.tips.length > 0 && <ul className="mt-3 space-y-1 text-xs text-muted list-disc pl-4">{plan.tips.slice(0, 4).map((t) => <li key={t}>{t}</li>)}</ul>}
          </Card>
        </div>
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Running budget (per person, INR)</h3>
        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-4 gap-y-2 text-sm items-center">
          {plan.totals.days.map((d) => {
            const w = Math.max(4, (d.cumulative_inr / Math.max(1, plan.totals.per_person_inr)) * 100);
            return [
              <span key={`d${d.day}`} className="text-muted">Day {d.day}</span>,
              <div key={`b${d.day}`} className="h-2.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-teal-400 rounded-full" style={{ width: `${w}%` }} /></div>,
              <span key={`s${d.day}`}>{inr(d.inr)}</span>,
              <span key={`c${d.day}`} className="text-muted">cum. {inr(d.cumulative_inr)}</span>,
            ];
          })}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-700" : "text-ink";
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </Card>
  );
}
