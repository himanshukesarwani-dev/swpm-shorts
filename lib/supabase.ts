import { createClient } from '@supabase/supabase-js';

// Service key: never import this module from client components.
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

export const MEDIA_BUCKET = 'media';

export const supabase = createClient(
  requireEnv('SUPABASE_URL'),
  requireEnv('SUPABASE_SERVICE_KEY'),
  { auth: { persistSession: false } }
);
