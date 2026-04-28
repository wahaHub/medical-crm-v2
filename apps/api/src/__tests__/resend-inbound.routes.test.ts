import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import resendInboundRoutes from '../routes/resend-inbound.routes.js';

const mockServices = {
  resendInbound: {
    verifyAndNormalizeWebhook: vi.fn(),
  },
  processInboundEmail: {
    execute: vi.fn(),
  },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
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
    mockServices.resendInbound.verifyAndNormalizeWebhook.mockRejectedValue(
      new Error('Invalid Resend webhook signature'),
    );

    const res = await app.request('/api/webhooks/resend/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.received' }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid Resend webhook signature' });
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
    expect(mockServices.resendInbound.verifyAndNormalizeWebhook).not.toHaveBeenCalled();
    expect(mockServices.processInboundEmail.execute).not.toHaveBeenCalled();
  });

  it('accepts duplicate inbound events without creating a duplicate message', async () => {
    mockServices.resendInbound.verifyAndNormalizeWebhook.mockResolvedValue(normalizedEmail);
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
    mockServices.resendInbound.verifyAndNormalizeWebhook.mockResolvedValue(normalizedEmail);

    const res = await app.request('/api/webhooks/resend/inbound', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'svix-id': 'evt_123',
      },
      body: rawBody,
    });

    expect(res.status).toBe(204);
    expect(mockServices.resendInbound.verifyAndNormalizeWebhook).toHaveBeenCalledWith({
      rawBody,
      headers: expect.any(Headers),
    });
    expect(mockServices.processInboundEmail.execute).toHaveBeenCalledWith(normalizedEmail);
  });

  it('ignores non-email.received events', async () => {
    mockServices.resendInbound.verifyAndNormalizeWebhook.mockResolvedValue(null);

    const res = await app.request('/api/webhooks/resend/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'email.delivered' }),
    });

    expect(res.status).toBe(204);
    expect(mockServices.processInboundEmail.execute).not.toHaveBeenCalled();
  });
});
