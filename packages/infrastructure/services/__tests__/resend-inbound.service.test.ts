import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Webhook } from 'svix';
import { ResendInboundService } from '../resend-inbound.service.js';

const webhookSecret = 'whsec_dGVzdF9yZXNlbmRfd2ViaG9va19zZWNyZXQ=';
const apiKey = 're_test_api_key';
const originalResendApiKey = process.env['RESEND_API_KEY'];
const originalResendWebhookSecret = process.env['RESEND_WEBHOOK_SECRET'];

function signedWebhook(input: {
  payload: unknown;
  eventId?: string;
  secret?: string;
}): { rawBody: string; headers: Record<string, string> } {
  const rawBody = JSON.stringify(input.payload);
  const eventId = input.eventId ?? 'evt_resend_123';
  const timestamp = new Date();
  const signature = new Webhook(input.secret ?? webhookSecret).sign(eventId, timestamp, rawBody);

  return {
    rawBody,
    headers: {
      'svix-id': eventId,
      'svix-timestamp': Math.floor(timestamp.getTime() / 1000).toString(),
      'svix-signature': signature,
    },
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function emailReceivedPayload(emailId = 'email_received_123') {
  return {
    type: 'email.received',
    data: {
      email_id: emailId,
      message_id: '<rfc-message-id@example.com>',
      from: 'Patient One <patient@example.com>',
      to: ['reply+token@medicaltourismchina.health'],
      subject: 'Re: Care plan',
      attachments: [
        {
          id: 'att_webhook_1',
          filename: 'webhook-only.pdf',
          content_type: 'application/pdf',
          size: 22,
        },
      ],
    },
  };
}

describe('ResendInboundService', () => {
  beforeEach(() => {
    delete process.env['RESEND_API_KEY'];
    delete process.env['RESEND_WEBHOOK_SECRET'];
  });

  afterEach(() => {
    if (originalResendApiKey === undefined) {
      delete process.env['RESEND_API_KEY'];
    } else {
      process.env['RESEND_API_KEY'] = originalResendApiKey;
    }

    if (originalResendWebhookSecret === undefined) {
      delete process.env['RESEND_WEBHOOK_SECRET'];
    } else {
      process.env['RESEND_WEBHOOK_SECRET'] = originalResendWebhookSecret;
    }

    vi.unstubAllGlobals();
  });

  it('verifies Svix headers, extracts ids, retrieves full email, and normalizes content', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(jsonResponse({
        id: 'email_received_123',
        message_id: '<rfc-message-id@example.com>',
        from: 'Patient One <patient@example.com>',
        to: ['Medora Reply <reply+token@medicaltourismchina.health>'],
        subject: 'Re: Care plan',
        text: 'Here is my reply.',
        html: '<p>Here is my reply.</p>',
        headers: {
          'X-Resend-SPF': 'pass',
          'x-resend-dkim': 'pass',
          'x-resend-dmarc': 'fail',
          'Authentication-Results': 'mx.example; spf=pass',
        },
        attachments: [
          {
            id: 'att_123',
            filename: 'scan.pdf',
            content_type: 'application/pdf',
            content_disposition: 'attachment',
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'att_123',
        size: 4096,
        download_url: 'https://download.resend.test/att_123',
      }));
    const service = new ResendInboundService({
      apiKey,
      webhookSecret,
      fetchImpl: fetchMock,
    });
    const webhook = signedWebhook({
      eventId: 'evt_resend_123',
      payload: emailReceivedPayload(),
    });

    const normalized = await service.verifyAndNormalizeWebhook(webhook);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails/receiving/email_received_123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${apiKey}`,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails/receiving/email_received_123/attachments/att_123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${apiKey}`,
        }),
      }),
    );
    expect(normalized).toEqual({
      provider: 'resend',
      providerEventId: 'evt_resend_123',
      providerMessageId: 'email_received_123',
      fromEmail: 'patient@example.com',
      to: ['reply+token@medicaltourismchina.health'],
      subject: 'Re: Care plan',
      text: 'Here is my reply.',
      html: '<p>Here is my reply.</p>',
      headers: {
        'X-Resend-SPF': 'pass',
        'x-resend-dkim': 'pass',
        'x-resend-dmarc': 'fail',
        'Authentication-Results': 'mx.example; spf=pass',
      },
      auth: {
        spf: 'pass',
        dkim: 'pass',
        dmarc: 'fail',
      },
      attachments: [
        {
          providerAttachmentId: 'att_123',
          fileName: 'scan.pdf',
          mimeType: 'application/pdf',
          fileSize: 4096,
        },
      ],
    });
  });

  it('accepts standard Headers objects when verifying webhooks', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockResolvedValue(
      jsonResponse({
        id: 'email_received_456',
        from: 'patient@example.com',
        to: ['reply@example.com'],
        subject: null,
        text: null,
        html: null,
        headers: {},
        attachments: [],
      }),
    );
    const service = new ResendInboundService({ apiKey, webhookSecret, fetchImpl: fetchMock });
    const webhook = signedWebhook({
      eventId: 'evt_headers_object',
      payload: emailReceivedPayload('email_received_456'),
    });

    const normalized = await service.verifyAndNormalizeWebhook({
      rawBody: webhook.rawBody,
      headers: new Headers(webhook.headers),
    });

    expect(normalized?.providerEventId).toBe('evt_headers_object');
    expect(normalized?.providerMessageId).toBe('email_received_456');
  });

  it('rejects webhooks with invalid Svix signatures before fetching email content', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
    const service = new ResendInboundService({ apiKey, webhookSecret, fetchImpl: fetchMock });
    const webhook = signedWebhook({
      secret: 'whsec_b3RoZXJfc2VjcmV0',
      payload: emailReceivedPayload(),
    });

    await expect(service.verifyAndNormalizeWebhook(webhook)).rejects.toThrow(/webhook signature/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null for non-email.received events without calling the Resend API', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
    const service = new ResendInboundService({ apiKey, webhookSecret, fetchImpl: fetchMock });
    const webhook = signedWebhook({
      payload: {
        type: 'email.sent',
        data: {
          email_id: 'sent_email_123',
        },
      },
    });

    await expect(service.verifyAndNormalizeWebhook(webhook)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retrieves attachment metadata, fetches the signed download URL without bearer auth, and returns bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(jsonResponse({ download_url: 'https://download.resend.test/att_123' }))
      .mockResolvedValueOnce(new Response(bytes));
    const service = new ResendInboundService({ apiKey, webhookSecret, fetchImpl: fetchMock });

    const result = await service.getAttachmentBytes({
      provider: 'resend',
      providerMessageId: 'email_received_123',
      providerAttachmentId: 'att_123',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.resend.com/emails/receiving/email_received_123/attachments/att_123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${apiKey}`,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://download.resend.test/att_123',
      expect.not.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.any(String),
        }),
      }),
    );
    expect(result).toEqual(bytes);
  });

  it('hydrates attachment size during webhook normalization but refreshes metadata before fetching bytes', async () => {
    const bytes = new Uint8Array([5, 6, 7, 8]);
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockResolvedValueOnce(jsonResponse({
        id: 'email_received_123',
        from: 'patient@example.com',
        to: ['reply@example.com'],
        subject: 'Cached metadata',
        text: 'See attached.',
        html: null,
        headers: {},
        attachments: [
          {
            id: 'att_123',
            filename: 'scan.pdf',
            content_type: 'application/pdf',
          },
        ],
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'att_123',
        size: 4096,
        download_url: 'https://download.resend.test/expired-att_123',
        expires_at: '2024-01-01T00:00:00.000Z',
      }))
      .mockResolvedValueOnce(jsonResponse({
        id: 'att_123',
        size: 4096,
        download_url: 'https://download.resend.test/fresh-att_123',
        expires_at: '2999-01-01T00:00:00.000Z',
      }))
      .mockResolvedValueOnce(new Response(bytes));
    const service = new ResendInboundService({ apiKey, webhookSecret, fetchImpl: fetchMock });
    const webhook = signedWebhook({ payload: emailReceivedPayload() });

    const normalized = await service.verifyAndNormalizeWebhook(webhook);
    const result = await service.getAttachmentBytes({
      provider: 'resend',
      providerMessageId: 'email_received_123',
      providerAttachmentId: 'att_123',
    });

    expect(normalized?.attachments[0]?.fileSize).toBe(4096);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://api.resend.com/emails/receiving/email_received_123/attachments/att_123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${apiKey}`,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      'https://download.resend.test/fresh-att_123',
      expect.not.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.any(String),
        }),
      }),
    );
    expect(result).toEqual(bytes);
  });

  it('maps missing webhook secret and api key to clear configuration errors', async () => {
    const webhook = signedWebhook({ payload: emailReceivedPayload() });

    await expect(
      new ResendInboundService({ apiKey }).verifyAndNormalizeWebhook(webhook),
    ).rejects.toThrow(/RESEND_WEBHOOK_SECRET/);

    await expect(
      new ResendInboundService({ webhookSecret }).verifyAndNormalizeWebhook(webhook),
    ).rejects.toThrow(/RESEND_API_KEY/);

    await expect(
      new ResendInboundService({ webhookSecret }).getAttachmentBytes({
        provider: 'resend',
        providerMessageId: 'email_received_123',
        providerAttachmentId: 'att_123',
      }),
    ).rejects.toThrow(/RESEND_API_KEY/);
  });

  it('uses RESEND_API_KEY and RESEND_WEBHOOK_SECRET env defaults when config values are undefined', async () => {
    process.env['RESEND_API_KEY'] = apiKey;
    process.env['RESEND_WEBHOOK_SECRET'] = webhookSecret;
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockResolvedValue(
      jsonResponse({
        id: 'email_received_123',
        from: 'patient@example.com',
        to: ['reply@example.com'],
        subject: 'Env defaults',
        text: 'Configured through env.',
        html: null,
        headers: {},
        attachments: [],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const webhook = signedWebhook({ payload: emailReceivedPayload() });
    const service = new ResendInboundService();

    const normalized = await service.verifyAndNormalizeWebhook(webhook);

    expect(normalized?.providerMessageId).toBe('email_received_123');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails/receiving/email_received_123',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${apiKey}`,
        }),
      }),
    );
  });

  it('keeps explicit empty config values as missing instead of falling back to env', async () => {
    process.env['RESEND_API_KEY'] = apiKey;
    process.env['RESEND_WEBHOOK_SECRET'] = webhookSecret;
    const webhook = signedWebhook({ payload: emailReceivedPayload() });

    await expect(
      new ResendInboundService({ apiKey: '', webhookSecret }).verifyAndNormalizeWebhook(webhook),
    ).rejects.toThrow(/RESEND_API_KEY/);

    await expect(
      new ResendInboundService({ apiKey, webhookSecret: '' }).verifyAndNormalizeWebhook(webhook),
    ).rejects.toThrow(/RESEND_WEBHOOK_SECRET/);
  });

  it('throws readable errors for failed Resend API responses', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockResolvedValue(
      jsonResponse({ error: 'Nope' }, { status: 502 }),
    );
    const service = new ResendInboundService({ apiKey, webhookSecret, fetchImpl: fetchMock });
    const webhook = signedWebhook({ payload: emailReceivedPayload() });

    await expect(service.verifyAndNormalizeWebhook(webhook)).rejects.toThrow(
      'Resend retrieve received email failed: 502 {"error":"Nope"}',
    );
  });
});
