export type Vibe = "Beach" | "Mountains" | "Cultural" | "Urban";
export type BudgetLevel = "Budget" | "Moderate" | "Luxury";
export type Party = "Solo" | "Couple" | "Family" | "Friends";
export type Pace = "Relaxed" | "Moderate" | "Fast-Paced";

export interface Preferences {
  destination: string;
  vibe: Vibe;
  days: number;
  start_date: string; // ISO date
  budget_level: BudgetLevel;
  total_budget_inr: number | null;
  party: Party;
  group_size: number;
  pace: Pace;
  interests: string[];
  travel_style: string;
}

export interface ImageInfo {
  url: string | null;
  thumb: string | null;
  photographer: string | null;
  photographer_url: string | null;
  source: "unsplash" | null;
  gradient: [string, string] | null;
  query: string;
}

export interface Transport {
  mode: string;
  minutes: number;
  km: number | null;
}

export interface Activity {
  slot: string;
  name: string;
  area: string;
  description: string;
  duration_hours: number;
  cost_local: number;
  category: string;
  lat: number | null;
  lng: number | null;
  transport_from_prev?: Transport;
}

export interface Day {
  day: number;
  date: string;
  theme: string;
  area: string;
  activities: Activity[];
  total_hours?: number;
}

export interface Accommodation {
  name: string;
  area: string;
  type: string;
  est_cost_per_night_local: number;
  nights: number;
  est_total_local: number;
  note: string;
}

export interface BudgetStatus {
  cap_inr: number;
  used_inr: number;
  ratio: number;
  state: "under" | "close" | "over";
  basis: string;
  message: string;
}

export interface Totals {
  currency_code: string;
  activities_local: number;
  activities_usd: number;
  activities_inr: number;
  stay_local: number;
  stay_inr: number;
  per_person_inr: number;
  per_day_inr: number;
  group_total_inr: number;
  group_size: number;
  days: { day: number; area: string; local: number; inr: number; cumulative_inr: number }[];
  budget_status: BudgetStatus;
}

export interface Plan {
  destination: string;
  country: string;
  currency_code: string;
  overview: string;
  days: Day[];
  emergency: Record<string, string>;
  packing: string[];
  tips: string[];
  accommodation: Accommodation;
  totals: Totals;
  cover_image?: ImageInfo | null;
  cluster_report?: { km_before: number; km_after: number; days?: { day: number; area: string; km: number }[] };
  generated_at?: string;
  ai_mode?: "groq" | "demo";
  last_change?: { day: number; instruction: string; at: string };
  pace_note?: string;
}

export interface Recommendation {
  city: string;
  country: string;
  match_score: number;
  why: string;
  weather_in_month: string;
  best_season: string;
  estimated_daily_cost_usd: number;
  currency_code: string;
  highlights: string[];
  tags: string[];
  image: ImageInfo | null;
}

export interface TripSummary {
  id: string;
  name: string;
  destination: string;
  days: number;
  budget_level: string;
  cover_image: string | null;
  created_at: string;
  updated_at: string;
  preferences?: Preferences;
  plan?: Plan;
}

export interface Health {
  status: string;
  ai_mode: "groq" | "demo";
  storage: "supabase" | "sqlite";
  images: boolean;
  auth: boolean;
}

export const VIBES: Vibe[] = ["Beach", "Mountains", "Cultural", "Urban"];
export const BUDGET_LEVELS: BudgetLevel[] = ["Budget", "Moderate", "Luxury"];
export const PARTIES: Party[] = ["Solo", "Couple", "Family", "Friends"];
export const PACES: Pace[] = ["Relaxed", "Moderate", "Fast-Paced"];
export const INTERESTS = ["Food", "Adventure", "History", "Nightlife", "Nature", "Shopping", "Art & Museums", "Wellness"];

export const QUICK_SWAPS: { label: string; instruction: string }[] = [
  { label: "Vegetarian lunch", instruction: "Find a vegetarian lunch spot" },
  { label: "Museum → market", instruction: "Swap the museum or indoor activity for an outdoor market" },
  { label: "More relaxed", instruction: "Make this day more relaxed with fewer, longer activities" },
  { label: "Add nightlife", instruction: "Add a nightlife option in the evening" },
  { label: "Cut costs", instruction: "Cut costs for this day - cheaper or free alternatives" },
  { label: "Add adventure", instruction: "Add an adventure activity in the afternoon" },
];
