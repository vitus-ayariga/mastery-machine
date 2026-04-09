import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Check if URL is valid starts with http (basic validation)
const isValidUrl = supabaseUrl && (supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://'));

export const supabase = (isValidUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl!, supabaseAnonKey) 
  : null;

if (!supabase) {
  console.warn("Supabase credentials missing or invalid. Dashboard and syncing will be disabled. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.");
}
