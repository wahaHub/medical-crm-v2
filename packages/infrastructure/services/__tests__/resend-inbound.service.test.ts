import { describe, expect, it, vi } from 'vitest';
import { Webhook } from 'svix';
import { ResendInboundService } from '../resend-inbound.service.js';

const webhookSecret = 'whsec_dGVzdF9yZXNlbmRfd2ViaG9va19zZWNyZXQ=';
const apiKey = 're_test_api_key';

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
  it('verifies Svix headers, extracts ids, retrieves full email, and normalizes content', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockResolvedValue(
      jsonResponse({
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
            size: 4096,
          },
        ],
      }),
    );
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

  it('throws readable errors for failed Resend API responses', async () => {
    const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>().mockResolvedValue(
      jsonResponse({ error: 'Nope' }, { status: 502 }),
    );
    const service = new ResendInboundService({ apiKey, webhookSecret, fetchImpl: fetchMock });
    const webhook = signedWebhook({ payload: emailReceivedPayload() });

    await expect(service.verifyAndNormalizeWebhook(webhook)).rejects.toThrow(
      'Resend retrieve received email failed: 502',
    );
  });
});
