// Supabase connection. Leave both empty to run local-only (data stays on this device).
//
// Find these in your Supabase dashboard → Project Settings → API Keys / Data API.
// The publishable (or "anon") key is designed to be public: Row Level Security
// in supabase/migrations makes sure each signed-in user can only see their own rows.
// NEVER put the secret / service_role key here.
export const SUPABASE_URL = '';       // e.g. 'https://abcdefghijkl.supabase.co'
export const SUPABASE_ANON_KEY = '';  // e.g. 'sb_publishable_...' or 'eyJhbGciOi...'
