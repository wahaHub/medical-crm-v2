import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getServerEnv } from '@medical-crm/config';
import * as schema from './schema/index.js';

let _crmDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getCrmDb() {
  if (!_crmDb) {
    const env = getServerEnv();
    const client = postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
    _crmDb = drizzle(client, { schema });
  }
  return _crmDb;
}

export type CrmDb = ReturnType<typeof getCrmDb>;
