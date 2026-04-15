import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: apiFetchMock,
}));

import { POST } from './route';

describe('hospital chatbot-v3 chat proxy route', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('forwards body and cookies upstream and propagates set-cookie downstream', async () => {
    apiFetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': 'chatbot_session_secret=secret-456; Path=/; HttpOnly',
        },
      }),
    );

    const request = new NextRequest('https://hospital.example.com/api/chatbot-v3/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: 'medical-crm-hospital-session=hospital-abc; patient_session=patient-xyz',
        'Idempotency-Key': 'retry-hospital-1',
        'X-Idempotency-Key': 'legacy-hospital-1',
      },
      body: JSON.stringify({ sessionId: 'session-2', message: 'need help' }),
    });

    const response = await POST(request);

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/v3/chatbot/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sessionId: 'session-2', message: 'need help' }),
      }),
    );

    const [, init] = apiFetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('cookie')).toBe('medical-crm-hospital-session=hospital-abc; patient_session=patient-xyz');
    expect(headers.get('idempotency-key')).toBe('retry-hospital-1');
    expect(headers.get('x-idempotency-key')).toBe('legacy-hospital-1');
    expect(response.headers.get('set-cookie')).toContain('chatbot_session_secret=secret-456');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({ ok: true });
  });
});
