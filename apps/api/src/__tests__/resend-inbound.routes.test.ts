import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import resendInboundRoutes from '../routes/resend-inbound.routes.js';

const {
  mockAuthMiddleware,
  mockGetServices,
  mockGetResendInboundVerifier,
  mockProcessInboundEmailExecute,
  mockVerifyAndNormalizeWebhook,
} = vi.hoisted(() => ({
  mockAuthMiddleware: vi.fn(async (_c, next) => {
    await next();
  }),
  mockGetServices: vi.fn(),
  mockGetResendInboundVerifier: vi.fn(),
  mockProcessInboundEmailExecute: vi.fn(),
  mockVerifyAndNormalizeWebhook: vi.fn(),
}));

const mockServices = {
  processInboundEmail: {
    execute: mockProcessInboundEmailExecute,
  },
};

const mockVerifier = {
  verifyAndNormalizeWebhook: mockVerifyAndNormalizeWebhook,
};

vi.mock('../composition-root.js', () => ({
  getServices: mockGetServices,
  getResendInboundVerifier: mockGetResendInboundVerifier,
}));

vi.mock('@medical-crm/infrastructure/auth', () => ({
  authMiddleware: mockAuthMiddleware,
}));

const app = new Hono();
app.route('/api/webhooks/resend', resendInboundRoutes);

const originalInboundEmailEnabled = process.env['INBOUND_EMAIL_ENABLED'];

const normalizedEmail = {
  provider: 'resend' as const,
  providerEventId: 'evt_123',
  providerMessageId: 'email_123',
  fromEmail: 'patient@example.com',
  to: ['reply+token@example.com'],
  subject: 'Re: update',
  text: 'Thanks',
  html: null,
  headers: {},
  auth: { spf: 'pass', dkim: 'pass', dmarc: 'pass' },
  attachments: [],
};

describe('Resend inbound webhook routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env['INBOUND_EMAIL_ENABLED'] = 'true';
    mockGetServices.mockReturnValue(mockServices);
    mockGetResendInboundVerifier.mockReturnValue(mockVerifier);
    mockAuthMiddleware.mockImplementation(async (_c, next) => {
      await next();
    });
    mockServices.processInboundEmail.execute.mockResolvedValue({
      status: 'PROCESSED',
      duplicate: false,
      createdMessageId: 'message-1',
    });
  });

  afterEach(() => {
    if (originalInboundEmailEnabled === undefined) {
      delete process.env['INBOUND_EMAIL_ENABLED'];
    } else {
      process.env['INBOUND_EMAIL_ENABLED'] = originalInboundEmailEnabled;
    }
  });

  it('rejects invalid Resend webhook signatures without processing', async () => {
    mockVerifier.verifyAndNormalizeWebhook.mockRejectedValue(
      new Error('Invalid Resend webhook signature'),
    );

    const res = await app.request('/api/webhooks/resend/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.received' }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid webhook signature' });
    expect(mockGetServices).not.toHaveBeenCalled();
    expect(mockServices.processInboundEmail.execute).not.toHaveBeenCalled();
  });

  it('returns 204 without verification when inbound email is not enabled', async () => {
    process.env['INBOUND_EMAIL_ENABLED'] = 'false';

    const res = await app.request('/api/webhooks/resend/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.received' }),
    });

    expect(res.status).toBe(204);
    expect(mockGetResendInboundVerifier).not.toHaveBeenCalled();
    expect(mockVerifier.verifyAndNormalizeWebhook).not.toHaveBeenCalled();
    expect(mockGetServices).not.toHaveBeenCalled();
    expect(mockServices.processInboundEmail.execute).not.toHaveBeenCalled();
  });

  it('accepts duplicate inbound events without creating a duplicate message', async () => {
    mockVerifier.verifyAndNormalizeWebhook.mockResolvedValue(normalizedEmail);
    mockServices.processInboundEmail.execute.mockResolvedValue({
      status: 'PROCESSED',
      duplicate: true,
      eventId: 'inbound-event-1',
      createdMessageId: 'message-1',
    });

    const res = await app.request('/api/webhooks/resend/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.received', data: { email_id: 'email_123' } }),
    });

    expect(res.status).toBe(204);
    expect(mockServices.processInboundEmail.execute).toHaveBeenCalledTimes(1);
    expect(mockServices.processInboundEmail.execute).toHaveBeenCalledWith(normalizedEmail);
  });

  it('processes valid email.received events', async () => {
    const rawBody = JSON.stringify({ type: 'email.received', data: { email_id: 'email_123' } });
    mockVerifier.verifyAndNormalizeWebhook.mockResolvedValue(normalizedEmail);

    const res = await app.request('/api/webhooks/resend/inbound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'evt_123',
      },
      body: rawBody,
    });

    expect(res.status).toBe(204);
    expect(mockVerifier.verifyAndNormalizeWebhook).toHaveBeenCalledWith({
      rawBody,
      headers: expect.any(Headers),
    });
    expect(mockGetServices).toHaveBeenCalledTimes(1);
    expect(mockServices.processInboundEmail.execute).toHaveBeenCalledWith(normalizedEmail);
  });

  it('ignores non-email.received events', async () => {
    mockVerifier.verifyAndNormalizeWebhook.mockResolvedValue(null);

    const res = await app.request('/api/webhooks/resend/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.delivered' }),
    });

    expect(res.status).toBe(204);
    expect(mockGetServices).not.toHaveBeenCalled();
    expect(mockServices.processInboundEmail.execute).not.toHaveBeenCalled();
  });

  it('returns a generic 400 for malformed Resend webhook payloads', async () => {
    mockVerifier.verifyAndNormalizeWebhook.mockRejectedValue(
      new Error('Resend email.received webhook missing data.email_id'),
    );

    const res = await app.request('/api/webhooks/resend/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.received' }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid webhook payload' });
    expect(mockGetServices).not.toHaveBeenCalled();
  });

  it('returns a generic 503 when inbound email verification dependencies are unavailable', async () => {
    mockVerifier.verifyAndNormalizeWebhook.mockRejectedValue(
      new Error('RESEND_API_KEY is required for Resend inbound email API access'),
    );

    const res = await app.request('/api/webhooks/resend/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.received' }),
    });

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Inbound email service unavailable' });
    expect(mockGetServices).not.toHaveBeenCalled();
  });

  it('mounts the real app webhook route outside Keycloak auth', async () => {
    mockVerifier.verifyAndNormalizeWebhook.mockResolvedValue(null);
    mockAuthMiddleware.mockImplementation(async (c) => c.json({ error: 'auth called' }, 418));

    const { default: realApp } = await import('../index.js');
    const res = await realApp.request('/api/webhooks/resend/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.delivered' }),
    });

    expect(res.status).toBe(204);
    expect(mockAuthMiddleware).not.toHaveBeenCalled();
  });
});
