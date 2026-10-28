import { Check, Clock, MapPin, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { hours, inr, money, transportIcon } from "../lib/format";
import type { Activity, Day } from "../lib/types";
import { Badge } from "./ui";

interface Props {
  day: Day;
  currency: string;
  toInr: (local: number) => number;
  km?: number;
  onEdit: (index: number, patch: Partial<Activity>) => void;
  onDelete: (index: number) => void;
}

export default function DayTimeline({ day, currency, toInr, km, onEdit, onDelete }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ name: string; cost: string }>({ name: "", cost: "" });
  const total = day.activities.reduce((s, a) => s + a.cost_local, 0);
  const tone = km === undefined ? "neutral" : km <= 8 ? "good" : km <= 20 ? "warn" : "bad";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <MapPin className="w-4 h-4 text-coral" />
        <span className="text-sm">Cluster: <b>{day.area}</b></span>
        {km !== undefined && <Badge tone={tone}>{km <= 8 ? "Low" : km <= 20 ? "Moderate" : "High"} transit · {km.toFixed(1)} km</Badge>}
        {day.total_hours !== undefined && <Badge tone="neutral"><Clock className="w-3 h-3 inline -mt-0.5" /> {hours(day.total_hours)} active</Badge>}
      </div>

      <ol className="relative border-l-2 border-teal-100 ml-3 space-y-5">
        {day.activities.map((a, i) => {
          const t = a.transport_from_prev;
          const isEditing = editing === i;
          return (
            <li key={`${a.slot}-${i}`} className="pl-6 relative">
              <span className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white border-2 border-teal" />
              {t && t.mode !== "start" && (
                <div className="text-[11px] text-muted -mt-0.5 mb-1.5">
                  {transportIcon[t.mode] ?? "🚕"} {t.mode} · {t.minutes} min{t.km != null ? ` · ${t.km} km` : ""}
                </div>
              )}
              <div className="flex gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">{a.slot}</div>
                  {isEditing ? (
                    <div className="mt-1 flex flex-wrap gap-2 items-center">
                      <input className="rounded-lg border border-gray-200 px-2 py-1 text-sm flex-1 min-w-[160px]" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                      <input className="rounded-lg border border-gray-200 px-2 py-1 text-sm w-28" type="number" min={0} value={draft.cost} onChange={(e) => setDraft({ ...draft, cost: e.target.value })} />
                      <button className="p-1.5 rounded-lg bg-teal text-white" title="Save" onClick={() => { onEdit(i, { name: draft.name.trim() || a.name, cost_local: Math.max(0, Number(draft.cost) || 0) }); setEditing(null); }}><Check className="w-4 h-4" /></button>
                      <button className="p-1.5 rounded-lg border border-gray-200" title="Cancel" onClick={() => setEditing(null)}><X className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div className="font-semibold text-ink mt-0.5">{a.name}</div>
                  )}
                  <p className="text-sm text-[#3E4C55] mt-0.5">{a.description}</p>
                  <div className="text-xs text-muted mt-1">📍 {a.area} · ⏱ {hours(a.duration_hours)} · {a.category}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-coral">{money(a.cost_local, currency)}</div>
                  {currency !== "INR" && <div className="text-[11px] text-muted">≈ {inr(toInr(a.cost_local))}</div>}
                  {!isEditing && (
                    <div className="flex justify-end gap-1 mt-1.5 opacity-70">
                      <button className="p-1 rounded hover:bg-gray-100" title="Edit" onClick={() => { setDraft({ name: a.name, cost: String(a.cost_local) }); setEditing(i); }}><Pencil className="w-3.5 h-3.5" /></button>
                      <button className="p-1 rounded hover:bg-red-50 text-red-600" title="Remove" onClick={() => onDelete(i)}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 rounded-xl bg-sand px-4 py-2.5 text-sm font-semibold flex justify-between">
        <span>Day total</span>
        <span>{money(total, currency)}{currency !== "INR" && <span className="text-muted font-normal"> · ≈ {inr(toInr(total))}</span>}</span>
      </div>
    </div>
  );
}
