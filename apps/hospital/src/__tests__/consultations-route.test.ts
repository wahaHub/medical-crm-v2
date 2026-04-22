import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const apiFetch = vi.fn();

vi.mock('@/lib/api-fetch', () => ({
  apiFetch,
}));

describe('hospital consultations route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forwards POST requests to the upstream consultations endpoint', async () => {
    const route = await import('@/app/api/consultations/route');
    apiFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: 'consultation-1' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }));

    const request = new NextRequest('http://localhost/api/consultations', {
      method: 'POST',
      body: JSON.stringify({ caseId: 'case-1', scheduledAt: '2026-04-22T12:00:00.000Z' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await route.POST(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ id: 'consultation-1' });
    expect(apiFetch).toHaveBeenCalledWith('/api/v2/consultations', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ caseId: 'case-1', scheduledAt: '2026-04-22T12:00:00.000Z' }),
    }));
  });
});
