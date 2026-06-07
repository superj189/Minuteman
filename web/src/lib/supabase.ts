import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n' +
      'Create web/.env.local (see web/.env.example) with your Supabase project URL and anon key.',
  )
}

// The anon key is safe to ship in the client bundle: Row Level Security (migration
// 0006) enforces who can see what. A logged-out user sees nothing.
export const supabase = createClient(url, anonKey)
