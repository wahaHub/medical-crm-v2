import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@medical-crm/config', () => ({
  getServerEnv: () => ({
    CHINA_MEDICAL_SUPABASE_URL: 'https://china-test.supabase.co',
    CHINA_MEDICAL_SUPABASE_SERVICE_KEY: 'china-test-key',
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

describe('getChinaSupabase', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates client with China Medical credentials', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const { getChinaSupabase } = await import('../client');

    getChinaSupabase();

    expect(createClient).toHaveBeenCalledWith(
      'https://china-test.supabase.co',
      'china-test-key',
      expect.objectContaining({
        auth: { persistSession: false, autoRefreshToken: false },
      })
    );
  });

  it('returns singleton', async () => {
    const { getChinaSupabase } = await import('../client');
    expect(getChinaSupabase()).toBe(getChinaSupabase());
  });
});
