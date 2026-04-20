import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getServerEnv } from '@medical-crm/config';
import * as schema from './schema/index.js';

let _crmDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

function parsePositiveInteger(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(rawValue ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getCrmDb() {
  if (!_crmDb) {
    const env = getServerEnv();
    const dbDebugEnabled = process.env['DB_DEBUG_LOGGING'] === 'true';
    const connectTimeout = parsePositiveInteger(process.env['DB_CONNECT_TIMEOUT_SECONDS'], 10);
    const idleTimeout = parsePositiveInteger(process.env['DB_IDLE_TIMEOUT_SECONDS'], 20);
    const maxLifetime = parsePositiveInteger(process.env['DB_MAX_LIFETIME_SECONDS'], 60 * 30);
    if (dbDebugEnabled) {
      console.info('[DB] Initializing CRM client', {
        maxConnections: 10,
        connectTimeout,
        idleTimeout,
        maxLifetime,
      });
    }
    const client = postgres(env.DATABASE_URL, {
      max: 10,
      idle_timeout: idleTimeout,
      connect_timeout: connectTimeout,
      max_lifetime: maxLifetime,
      onnotice: dbDebugEnabled
        ? (notice) => {
          console.warn('[DB][notice]', notice.message);
        }
        : undefined,
      debug: dbDebugEnabled
        ? (_connection, query, parameters) => {
          console.debug('[DB][query]', {
            query,
            parameterCount: parameters.length,
          });
        }
        : undefined,
    });
    _crmDb = drizzle(client, { schema });
  }
  return _crmDb;
}

export type CrmDb = ReturnType<typeof getCrmDb>;
