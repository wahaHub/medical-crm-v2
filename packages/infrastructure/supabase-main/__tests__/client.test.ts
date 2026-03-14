import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @medical-crm/config
vi.mock('@medical-crm/config', () => ({
  getServerEnv: () => ({
    MAIN_SUPABASE_URL: 'https://test.supabase.co',
    MAIN_SUPABASE_SERVICE_KEY: 'test-service-key',
  }),
}));

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

describe('getMainSupabase', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('creates a Supabase client with correct credentials', async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const { getMainSupabase } = await import('../client');

    getMainSupabase();

    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-service-key',
      expect.objectContaining({
        auth: { persistSession: false, autoRefreshToken: false },
      })
    );
  });

  it('returns singleton (same instance on second call)', async () => {
    const { getMainSupabase } = await import('../client');
    const a = getMainSupabase();
    const b = getMainSupabase();
    expect(a).toBe(b);
  });
});
