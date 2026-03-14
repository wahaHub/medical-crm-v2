import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@medical-crm/infrastructure/database', () => ({
  getCrmDb: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/supabase-main', () => ({
  getMainSupabase: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/infrastructure/supabase-china', () => ({
  getChinaSupabase: vi.fn(() => ({})),
}));
vi.mock('@medical-crm/config', () => ({
  getServerEnv: vi.fn(() => ({
    DATABASE_URL: 'postgresql://localhost/test',
    MAIN_SUPABASE_URL: 'https://main.supabase.co',
    MAIN_SUPABASE_SERVICE_KEY: 'key',
    CHINA_MEDICAL_SUPABASE_URL: 'https://china.supabase.co',
    CHINA_MEDICAL_SUPABASE_SERVICE_KEY: 'key',
  })),
}));

describe('composition root', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates infrastructure clients without throwing', async () => {
    const { getInfrastructure } = await import('../composition-root');
    expect(() => getInfrastructure()).not.toThrow();
  });

  it('returns all expected clients', async () => {
    const { getInfrastructure } = await import('../composition-root');
    const infra = getInfrastructure();
    expect(infra).toHaveProperty('crmDb');
    expect(infra).toHaveProperty('mainSupabase');
    expect(infra).toHaveProperty('chinaSupabase');
  });
});
