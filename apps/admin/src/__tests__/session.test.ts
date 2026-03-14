import { describe, it, expect, vi } from 'vitest';

// Mock iron-session
vi.mock('iron-session', () => ({
  getIronSession: vi.fn(() =>
    Promise.resolve({
      access_token: 'test-token',
      refresh_token: 'test-refresh',
      id_token: 'test-id-token',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      save: vi.fn(),
      destroy: vi.fn(),
    }),
  ),
}));

// Mock next/headers
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve(new Map())),
}));

describe('admin session', () => {
  it('getSession returns session data', async () => {
    const { getSession } = await import('../lib/session');
    const session = await getSession();
    expect(session.access_token).toBe('test-token');
    expect(session.id_token).toBe('test-id-token');
  });
});
