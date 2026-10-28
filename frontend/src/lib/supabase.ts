import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Null when the project isn't configured — the app then runs in guest mode. */
export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null;
export const authEnabled = supabase !== null;
