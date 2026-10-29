import { Users } from "lucide-react";
import type { GroupFit } from "../lib/types";
import { Badge, Card } from "./ui";

/** Shows how well the plan serves each traveller's interests (group trips only). */
export default function GroupFitCard({ fit }: { fit: GroupFit }) {
  return (
    <Card className="p-5">
      <h3 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-coral" /> Group fit</h3>
      <p className={`text-xs mt-1 ${fit.balanced && fit.conflicts.length === 0 ? "text-emerald-700" : "text-amber-700"}`}>{fit.summary}</p>
      <ul className="mt-3 space-y-2.5">
        {fit.members.map((m) => {
          const pct = Math.round(m.score * 100);
          const tone = m.score >= 0.75 ? "good" : m.score >= 0.5 ? "warn" : "bad";
          return (
            <li key={m.name} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium truncate">{m.name}</span>
                <Badge tone={tone}>{m.matched_activities} match{m.matched_activities === 1 ? "" : "es"} · {pct}%</Badge>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
                <div className={`h-full rounded-full ${tone === "good" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-400" : "bg-red-500"}`} style={{ width: `${Math.max(4, pct)}%` }} />
              </div>
              <div className="text-[11px] text-muted mt-1">
                {m.interests.length ? m.interests.join(", ") : "no interests given"}
                {m.days_with_a_match.length > 0 && ` · days ${m.days_with_a_match.join(", ")}`}
              </div>
            </li>
          );
        })}
      </ul>
      {fit.conflicts.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 list-disc pl-6">
          {fit.conflicts.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}
    </Card>
  );
}
