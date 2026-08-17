import { createClient } from "@supabase/supabase-js";

const defaultSupabaseUrl = "https://nncuqxjhjhokkkphplvc.supabase.co";
const defaultSupabaseKey = "sb_publishable_Gw5CYEFc0cRmOhXDeLhNGg_SVy6as5L";
const cloudReady = import.meta.env.VITE_SUPABASE_READY === "true";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || defaultSupabaseUrl;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || defaultSupabaseKey;

export const cloudEnabled = cloudReady && Boolean(supabaseUrl && supabaseKey);

export const supabase = cloudEnabled
  ? createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
