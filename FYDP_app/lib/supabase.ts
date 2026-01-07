import { createClient } from "@supabase/supabase-js";

console.log("SUPABASE_URL:", process.env.EXPO_PUBLIC_SUPABASE_URL);
console.log("SUPABASE_KEY exists:", !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
