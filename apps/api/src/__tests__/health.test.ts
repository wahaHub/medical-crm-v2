import { describe, it, expect } from 'vitest';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const { default: app } = await import('../index');
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.version).toBe('2.0.0');
  });
});
