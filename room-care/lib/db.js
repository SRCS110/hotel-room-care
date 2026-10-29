import 'server-only';
import { createClient } from '@supabase/supabase-js';

let client;
export function db() {
  if (!client) {
    // Accept the URL with or without a trailing slash or /rest/v1
    const url = (process.env.SUPABASE_URL || '').trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
    const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
    if (!url || !key) throw new Error('MISSING_ENV');
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      // Never let Next.js cache database reads: staff, tickets and rooms must always be live.
      global: { fetch: (input, init = {}) => fetch(input, { ...init, cache: 'no-store' }) }
    });
  }
  return client;
}

// Throw on Supabase errors so route handlers can catch once.
export async function q(promise) {
  const { data, error } = await promise;
  if (error) throw new Error(error.message || error.code || 'Supabase error');
  return data;
}

// Plain-English cause for setup problems. Contains no secrets.
export function setupHint(e) {
  const m = String(e?.message || e);
  if (m === 'MISSING_ENV') return 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set in Vercel. Add both, then redeploy.';
  if (/SESSION_SECRET/.test(m)) return 'SESSION_SECRET is missing or shorter than 32 characters in Vercel. Fix it, then redeploy.';
  if (/invalid api key|jwt|JWS|signature|Invalid authentication/i.test(m)) return 'SUPABASE_SERVICE_ROLE_KEY is not valid. Copy the service_role (secret) key from Supabase > Project Settings > API, then redeploy.';
  if (/permission denied/i.test(m)) return 'The key in Vercel is the anon/public key. Use the service_role (secret) key instead, then redeploy.';
  if (/kind/.test(m) && /does not exist|schema cache/i.test(m)) return 'The property-areas update has not been run. Run supabase/migrations/002_property_areas.sql in the Supabase SQL Editor.';
  if (/does not exist|could not find the table|schema cache/i.test(m)) return 'The database tables are missing. Run supabase/schema.sql in the Supabase SQL Editor.';
  if (/fetch failed|ENOTFOUND|getaddrinfo|Invalid URL|ECONNREFUSED/i.test(m)) return 'SUPABASE_URL is wrong. Use the Project URL from Supabase > Project Settings > API (https://xxxx.supabase.co), then redeploy.';
  return m.slice(0, 200);
}
