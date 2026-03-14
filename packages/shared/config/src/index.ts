import { serverEnvSchema, clientEnvSchema } from './env';
import type { ServerEnv, ClientEnv } from './env';

export { serverEnvSchema, clientEnvSchema };
export type { ServerEnv, ClientEnv };

// Lazy-parsed singletons for runtime use (fail-fast on first access)
let _serverEnv: ServerEnv | null = null;
let _clientEnv: ClientEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (!_serverEnv) {
    _serverEnv = serverEnvSchema.parse(process.env);
  }
  return _serverEnv!;
}

export function getClientEnv(): ClientEnv {
  if (!_clientEnv) {
    _clientEnv = clientEnvSchema.parse({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_KEYCLOAK_URL: process.env.NEXT_PUBLIC_KEYCLOAK_URL,
      NEXT_PUBLIC_KEYCLOAK_REALM: process.env.NEXT_PUBLIC_KEYCLOAK_REALM,
      NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID,
    });
  }
  return _clientEnv!;
}
