import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerEnv } from '@medical-crm/config';

let client: SupabaseClient | null = null;

export function getCrmSupabase(): SupabaseClient {
  if (!client) {
    const env = getServerEnv();
    client = createClient(
      env.CRM_SUPABASE_URL,
      env.CRM_SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }

  return client;
}
