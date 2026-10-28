import type { ButtonHTMLAttributes, ReactNode } from "react";
import { gradientStyle } from "../lib/format";
import type { ImageInfo } from "../lib/types";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-teal text-white hover:bg-teal-700 shadow-sm",
    secondary: "bg-white border border-gray-200 text-ink hover:border-teal hover:text-teal",
    ghost: "text-muted hover:text-ink hover:bg-gray-50",
    danger: "bg-white border border-red-200 text-red-700 hover:bg-red-50",
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-gray-100 shadow-card ${className}`}>{children}</div>;
}

export function Chip({ active, children, onClick, className = "" }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium border transition ${active ? "bg-teal text-white border-teal" : "bg-white border-gray-200 text-ink hover:border-teal"} ${className}`}>
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-ink mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted mt-1">{hint}</span>}
    </label>
  );
}

export const inputClass = "w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal/30 focus:border-teal bg-white";

export function Badge({ tone = "neutral", children }: { tone?: "good" | "warn" | "bad" | "neutral" | "teal"; children: ReactNode }) {
  const t = { good: "bg-emerald-50 text-emerald-700", warn: "bg-amber-50 text-amber-700", bad: "bg-red-50 text-red-700", neutral: "bg-gray-100 text-muted", teal: "bg-teal-50 text-teal" }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${t}`}>{children}</span>;
}

/** Cover image with Unsplash attribution, or a deterministic gradient when no photo is available. */
export function Cover({ image, title, subtitle, className = "h-56" }: { image?: ImageInfo | null; title: string; subtitle?: string; className?: string }) {
  const hasPhoto = !!image?.url;
  return (
    <div className={`relative rounded-2xl overflow-hidden ${className}`} style={hasPhoto ? undefined : gradientStyle(image?.gradient)}>
      {hasPhoto && <img src={image!.url!} alt={title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
        <h2 className="font-display text-3xl leading-tight drop-shadow">{title}</h2>
        {subtitle && <p className="text-sm opacity-90 mt-1">{subtitle}</p>}
      </div>
      {hasPhoto && image?.photographer && (
        <a href={`${image.photographer_url ?? "https://unsplash.com"}?utm_source=travel_itinerary_planner&utm_medium=referral`} target="_blank" rel="noreferrer"
          className="absolute top-2 right-3 text-[10px] text-white/80 hover:text-white bg-black/30 rounded px-1.5 py-0.5">
          Photo: {image.photographer} / Unsplash
        </a>
      )}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-gray-100 rounded-xl ${className}`} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <span className="w-5 h-5 rounded-full border-2 border-teal border-t-transparent animate-spin" />
      {label}
    </div>
  );
}
