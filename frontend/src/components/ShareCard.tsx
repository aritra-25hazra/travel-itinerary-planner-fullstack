import { Check, Copy, Link2, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useStore } from "../lib/store";
import { Button, Card } from "./ui";

interface Props {
  tripId: string | null;
  initialToken?: string | null;
  /** Called when the trip hasn't been saved yet; should save and return the new trip id. */
  onNeedSave: () => Promise<string | null>;
}

export default function ShareCard({ tripId, initialToken, onNeedSave }: Props) {
  const toast = useStore((s) => s.toast);
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Keep the link in sync with the saved trip (e.g. after opening it from My trips).
  useEffect(() => {
    setToken(initialToken ?? null);
    if (!tripId) return;
    let alive = true;
    api.trips.get(tripId).then((t) => alive && setToken(t.share_token ?? null)).catch(() => undefined);
    return () => { alive = false; };
  }, [initialToken, tripId]);

  const link = token ? `${window.location.origin}/share/${token}` : null;

  async function enable() {
    setBusy(true);
    try {
      const id = tripId ?? (await onNeedSave());
      if (!id) return;
      const info = await api.trips.share(id);
      setToken(info.share_token);
      toast("success", "Share link is on. Anyone with the link can view this trip.");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Could not create the share link");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!tripId) return;
    setBusy(true);
    try {
      await api.trips.unshare(tripId);
      setToken(null);
      toast("info", "Sharing turned off. The old link no longer works.");
    } catch (e) {
      toast("error", e instanceof ApiError ? e.message : "Could not turn sharing off");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast("info", link);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold flex items-center gap-2"><Share2 className="w-4 h-4 text-coral" /> Share with your group</h3>
      <p className="text-xs text-muted mt-1">Read-only link. Friends can view the plan and clone it into their own trips to suggest changes.</p>
      {link ? (
        <>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs">
            <Link2 className="w-3.5 h-3.5 text-muted shrink-0" />
            <span className="truncate flex-1" title={link}>{link}</span>
            <button onClick={copy} className="shrink-0 rounded-lg px-2 py-1 bg-white border border-gray-200 hover:border-teal flex items-center gap-1" title="Copy link">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <a href={link} target="_blank" rel="noreferrer" className="flex-1"><Button variant="secondary" className="w-full !py-2">Open preview</Button></a>
            <Button variant="danger" className="!py-2" onClick={disable} disabled={busy}>Turn off</Button>
          </div>
        </>
      ) : (
        <Button className="w-full mt-3" onClick={enable} disabled={busy}><Share2 className="w-4 h-4" /> {busy ? "Creating link…" : tripId ? "Create share link" : "Save & create share link"}</Button>
      )}
    </Card>
  );
}
