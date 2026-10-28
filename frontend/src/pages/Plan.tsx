import { ArrowLeft, ArrowRight, Check, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, Chip, Cover, Field, inputClass, Skeleton } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { useStore } from "../lib/store";
import { BUDGET_LEVELS, INTERESTS, PACES, PARTIES, VIBES, type Recommendation } from "../lib/types";

const STEPS = ["Where", "When & who", "Style & budget", "Review"];
const VIBE_META: Record<string, { emoji: string; blurb: string }> = {
  Beach: { emoji: "🏖️", blurb: "Sun, sand, seafood shacks" },
  Mountains: { emoji: "🏔️", blurb: "Treks, valleys, bonfires" },
  Cultural: { emoji: "🏛️", blurb: "Heritage, temples, crafts" },
  Urban: { emoji: "🌆", blurb: "Skylines, food halls, nightlife" },
};

export default function Plan() {
  const nav = useNavigate();
  const prefs = useStore((s) => s.preferences);
  const set = useStore((s) => s.setPreferences);
  const recs = useStore((s) => s.recommendations);
  const setRecs = useStore((s) => s.setRecommendations);
  const setPlan = useStore((s) => s.setPlan);
  const setTripId = useStore((s) => s.setCurrentTripId);
  const toast = useStore((s) => s.toast);
  const [step, setStep] = useState(0);
  const [recLoading, setRecLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);

  const canNext = step !== 0 || prefs.destination.trim().length > 0;

  async function recommend() {
    setRecLoading(true);
    try {
      setRecs(await api.recommendations({ ...prefs, destination: "" }));
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Could not fetch recommendations");
    } finally {
      setRecLoading(false);
    }
  }

  async function generate() {
    setGenLoading(true);
    try {
      const plan = await api.generate(prefs);
      setPlan(plan);
      setTripId(null);
      toast("success", `Your ${plan.days.length}-day ${plan.destination} plan is ready.`);
      nav("/itinerary");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Generation failed");
    } finally {
      setGenLoading(false);
    }
  }

  function useRec(r: Recommendation) {
    set({ destination: r.city });
    toast("info", `Destination set to ${r.city}.`);
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-3xl text-teal">Smart trip builder</h1>
        <p className="text-muted text-sm mt-1">Four quick steps. You can change anything later and regenerate.</p>
      </div>

      <ol className="grid grid-cols-4 gap-2 text-xs sm:text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-xl px-3 py-2 flex items-center gap-2 ${i === step ? "bg-teal text-white" : i < step ? "bg-teal-50 text-teal" : "bg-gray-50 text-muted"}`}>
            <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-bold">{i < step ? <Check className="w-3 h-3" /> : i + 1}</span>
            <span className="truncate">{s}</span>
          </li>
        ))}
      </ol>

      <Card className="p-6 space-y-6">
        {step === 0 && (
          <>
            <Field label="Destination" hint="Leave blank and use the recommender below if you haven't decided.">
              <input className={inputClass} placeholder="e.g. Goa, Jaipur, Bali, Paris, Tokyo, Dubai" value={prefs.destination} onChange={(e) => set({ destination: e.target.value })} />
            </Field>
            <div>
              <span className="block text-sm font-semibold mb-2">Travel vibe</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {VIBES.map((v) => (
                  <button key={v} type="button" onClick={() => set({ vibe: v })}
                    className={`rounded-2xl border p-4 text-left transition ${prefs.vibe === v ? "border-teal bg-teal-50" : "border-gray-200 hover:border-teal"}`}>
                    <div className="text-2xl">{VIBE_META[v].emoji}</div>
                    <div className="font-semibold mt-1">{v}</div>
                    <div className="text-xs text-muted">{VIBE_META[v].blurb}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-sand p-4">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div>
                  <div className="font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-coral" /> Not sure where? Let the AI recommend.</div>
                  <div className="text-xs text-muted">Uses your vibe, budget tier, travel month and interests from the next steps (defaults are fine).</div>
                </div>
                <Button variant="secondary" onClick={recommend} disabled={recLoading}>{recLoading ? "Thinking…" : "Recommend destinations"}</Button>
              </div>
              {recLoading && <div className="grid sm:grid-cols-3 gap-3 mt-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56" />)}</div>}
              {!recLoading && recs.length > 0 && (
                <div className="grid sm:grid-cols-3 gap-3 mt-4">
                  {recs.map((r) => (
                    <div key={r.city} className={`bg-white rounded-2xl overflow-hidden border ${prefs.destination === r.city ? "border-teal" : "border-gray-100"}`}>
                      <Cover image={r.image} title={r.city} subtitle={r.country} className="h-28" />
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between"><Badge tone="teal">{r.match_score}% match</Badge><span className="text-xs text-muted">~${r.estimated_daily_cost_usd.toFixed(0)}/day</span></div>
                        <p className="text-xs text-ink leading-relaxed">{r.why}</p>
                        <p className="text-[11px] text-muted">🌤️ {r.weather_in_month} · best {r.best_season}</p>
                        <div className="flex flex-wrap gap-1">{r.tags.slice(0, 3).map((t) => <span key={t} className="text-[10px] bg-teal-50 text-teal rounded-full px-2 py-0.5">{t}</span>)}</div>
                        <Button variant={prefs.destination === r.city ? "primary" : "secondary"} className="w-full !py-1.5" onClick={() => useRec(r)}>
                          {prefs.destination === r.city ? "Selected" : `Use ${r.city}`}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {step === 1 && (
          <div className="grid sm:grid-cols-2 gap-5">
            <Field label="Start date">
              <input type="date" className={inputClass} value={prefs.start_date} onChange={(e) => set({ start_date: e.target.value })} />
            </Field>
            <Field label={`Duration: ${prefs.days} day${prefs.days > 1 ? "s" : ""}`}>
              <input type="range" min={1} max={14} value={prefs.days} onChange={(e) => set({ days: Number(e.target.value) })} className="w-full accent-teal" />
            </Field>
            <div>
              <span className="block text-sm font-semibold mb-2">Travel party</span>
              <div className="flex flex-wrap gap-2">{PARTIES.map((p) => <Chip key={p} active={prefs.party === p} onClick={() => set({ party: p, group_size: p === "Solo" ? 1 : p === "Couple" ? 2 : Math.max(prefs.group_size, 3) })}>{p}</Chip>)}</div>
            </div>
            <Field label="Group size" hint="Used for the group total estimate (rooms = people ÷ 2).">
              <input type="number" min={1} max={20} className={inputClass} value={prefs.group_size} onChange={(e) => set({ group_size: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} />
            </Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <span className="block text-sm font-semibold mb-2">Budget level</span>
              <div className="flex flex-wrap gap-2">{BUDGET_LEVELS.map((b) => <Chip key={b} active={prefs.budget_level === b} onClick={() => set({ budget_level: b })}>{b}</Chip>)}</div>
            </div>
            <Field label="Total activity budget per person (₹, optional)" hint="Food + activities for the whole trip. Leave empty to use the tier's daily target.">
              <input type="number" min={0} className={inputClass} placeholder="e.g. 25000" value={prefs.total_budget_inr ?? ""} onChange={(e) => set({ total_budget_inr: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} />
            </Field>
            <div>
              <span className="block text-sm font-semibold mb-2">Pace</span>
              <div className="flex flex-wrap gap-2">{PACES.map((p) => <Chip key={p} active={prefs.pace === p} onClick={() => set({ pace: p })}>{p}</Chip>)}</div>
            </div>
            <div>
              <span className="block text-sm font-semibold mb-2">Interests</span>
              <div className="flex flex-wrap gap-2">
                {INTERESTS.map((i) => (
                  <Chip key={i} active={prefs.interests.includes(i)} onClick={() => set({ interests: prefs.interests.includes(i) ? prefs.interests.filter((x) => x !== i) : [...prefs.interests, i] })}>{i}</Chip>
                ))}
              </div>
            </div>
            <Field label="Travel style notes (optional)" hint="Anything the planner should know.">
              <textarea className={inputClass} rows={2} maxLength={300} placeholder="e.g. slow mornings, street food over fine dining, no clubs, wheelchair-friendly" value={prefs.travel_style} onChange={(e) => set({ travel_style: e.target.value })} />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {[
                ["Destination", prefs.destination || "—"], ["Vibe", prefs.vibe], ["Dates", `${prefs.start_date} · ${prefs.days} days`],
                ["Party", `${prefs.party} · ${prefs.group_size} ${prefs.group_size > 1 ? "people" : "person"}`], ["Budget", `${prefs.budget_level}${prefs.total_budget_inr ? ` · cap ₹${prefs.total_budget_inr.toLocaleString("en-IN")}` : ""}`],
                ["Pace", prefs.pace], ["Interests", prefs.interests.join(", ") || "—"], ["Style notes", prefs.travel_style || "—"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-gray-50 px-3.5 py-2.5"><div className="text-[11px] uppercase tracking-wide text-muted">{k}</div><div className="font-medium">{v}</div></div>
              ))}
            </div>
            <Button onClick={generate} disabled={genLoading || !prefs.destination} className="w-full !py-3">
              <Wand2 className="w-4 h-4" /> {genLoading ? "Generating your itinerary…" : "Generate itinerary"}
            </Button>
            {genLoading && <p className="text-xs text-muted text-center">Clustering neighbourhoods, estimating transport and costs…</p>}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}><ArrowLeft className="w-4 h-4" /> Back</Button>
          {step < 3 && (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext} title={!canNext ? "Pick or type a destination first" : ""}>Next <ArrowRight className="w-4 h-4" /></Button>
          )}
        </div>
      </Card>
    </div>
  );
}
