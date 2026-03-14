import { getCrmDb } from '@medical-crm/infrastructure/database';
import { getMainSupabase } from '@medical-crm/infrastructure/supabase-main';
import { getChinaSupabase } from '@medical-crm/infrastructure/supabase-china';

interface Infrastructure {
  crmDb: ReturnType<typeof getCrmDb>;
  mainSupabase: ReturnType<typeof getMainSupabase>;
  chinaSupabase: ReturnType<typeof getChinaSupabase>;
}

let _infra: Infrastructure | null = null;

/** Wire all infrastructure adapters. Lazy singleton — created on first call. */
export function getInfrastructure(): Infrastructure {
  if (!_infra) {
    _infra = {
      crmDb: getCrmDb(),
      mainSupabase: getMainSupabase(),
      chinaSupabase: getChinaSupabase(),
    };
  }
  return _infra;
}
