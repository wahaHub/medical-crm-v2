import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerEnv } from '@medical-crm/config';

let _client: SupabaseClient | null = null;

export function getMainSupabase(): SupabaseClient {
  if (!_client) {
    const env = getServerEnv();
    _client = createClient(env.MAIN_SUPABASE_URL, env.MAIN_SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}
