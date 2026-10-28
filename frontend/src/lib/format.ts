const SYMBOLS: Record<string, string> = {
  USD: "$", INR: "₹", EUR: "€", GBP: "£", JPY: "¥", AED: "AED ", SGD: "S$", THB: "฿", IDR: "Rp", CHF: "CHF ",
  TRY: "₺", AUD: "A$", CAD: "C$", MYR: "RM", VND: "₫", LKR: "Rs ", NPR: "Rs ", KRW: "₩", CNY: "¥", HKD: "HK$",
};
const NO_DECIMALS = new Set(["IDR", "VND", "KRW", "JPY", "INR", "LKR", "NPR", "HUF", "CLP", "COP", "ARS"]);

export function money(amount: number, currency: string): string {
  const sym = SYMBOLS[currency] ?? `${currency} `;
  const digits = NO_DECIMALS.has(currency) ? 0 : amount % 1 === 0 ? 0 : 2;
  return `${sym}${amount.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}

export function inr(amount: number): string {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

export function dateLabel(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-IN", opts);
}

export function hours(h: number): string {
  return Number.isInteger(h) ? `${h} h` : `${h.toFixed(1)} h`;
}

export const transportIcon: Record<string, string> = {
  start: "🏁", walk: "🚶", metro: "🚇", bus: "🚌", taxi: "🚕", auto: "🛺", train: "🚆", boat: "⛵", bike: "🚲", car: "🚗",
};

export function gradientStyle(g: [string, string] | null | undefined): React.CSSProperties {
  const [a, b] = g ?? ["#0F5C5C", "#FF8A70"];
  return { backgroundImage: `linear-gradient(120deg, ${a} 0%, ${b} 100%)` };
}
