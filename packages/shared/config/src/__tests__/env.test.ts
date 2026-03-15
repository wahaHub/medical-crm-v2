import { describe, it, expect } from 'vitest';
import { serverEnvSchema, clientEnvSchema } from '../env';

describe('serverEnvSchema', () => {
  const VALID_ENV = {
    DATABASE_URL: 'postgresql://localhost:5432/crm',
    DIRECT_URL: 'postgresql://localhost:5432/crm',
    MAIN_SUPABASE_URL: 'https://example.supabase.co',
    MAIN_SUPABASE_SERVICE_KEY: 'key123',
    CHINA_MEDICAL_SUPABASE_URL: 'https://china.supabase.co',
    CHINA_MEDICAL_SUPABASE_SERVICE_KEY: 'key456',
    KEYCLOAK_ISSUER: 'https://keycloak.example.com/realms/test',
    KEYCLOAK_CLIENT_ID: 'portal-web',
    KEYCLOAK_CLIENT_SECRET: 'secret',
    SESSION_SECRET: 'must-be-at-least-32-characters-long-change-me',
    OPENAI_API_KEY: 'sk-test',
    CRM_SUPABASE_URL: 'https://crm.supabase.co',
    CRM_SUPABASE_SERVICE_ROLE_KEY: 'role-key',
    ADMIN_ORIGIN: 'http://localhost:3002',
    HOSPITAL_ORIGIN: 'http://localhost:3003',
    API_URL: 'http://localhost:3001',
    KEYCLOAK_BASE_URL: 'https://keycloak.example.com',
    KEYCLOAK_REALM: 'medical-crm',
    KEYCLOAK_ADMIN_USERNAME: 'admin',
    KEYCLOAK_ADMIN_PASSWORD: 'admin-password',
    INTERNAL_API_SECRET: 'must-be-at-least-32-characters-long-secret-key',
  };

  it('parses valid env without throwing', () => {
    expect(() => serverEnvSchema.parse(VALID_ENV)).not.toThrow();
  });

  it('fails on missing DATABASE_URL', () => {
    const { DATABASE_URL: _DATABASE_URL, ...rest } = VALID_ENV;
    expect(() => serverEnvSchema.parse(rest)).toThrow();
  });

  it('fails on SESSION_SECRET shorter than 32 chars', () => {
    expect(() =>
      serverEnvSchema.parse({ ...VALID_ENV, SESSION_SECRET: 'short' })
    ).toThrow();
  });

  it('defaults NODE_ENV to development', () => {
    const result = serverEnvSchema.parse(VALID_ENV);
    expect(result.NODE_ENV).toBe('development');
  });

  it('allows optional RESEND_API_KEY', () => {
    const result = serverEnvSchema.parse(VALID_ENV);
    expect(result.RESEND_API_KEY).toBeUndefined();
  });
});

describe('clientEnvSchema', () => {
  it('parses valid client env', () => {
    expect(() =>
      clientEnvSchema.parse({
        NEXT_PUBLIC_SUPABASE_URL: 'https://crm.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
        NEXT_PUBLIC_KEYCLOAK_URL: 'http://localhost:8080',
        NEXT_PUBLIC_KEYCLOAK_REALM: 'medical-crm',
        NEXT_PUBLIC_KEYCLOAK_CLIENT_ID: 'portal-web',
      })
    ).not.toThrow();
  });

  it('fails on missing NEXT_PUBLIC_SUPABASE_URL', () => {
    expect(() => clientEnvSchema.parse({})).toThrow();
  });
});
