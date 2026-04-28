import { Webhook } from 'svix';

const RESEND_RECEIVING_API_BASE = 'https://api.resend.com/emails/receiving';

type FetchImpl = typeof fetch;

export interface NormalizedInboundEmail {
  provider: 'resend';
  providerEventId: string | null;
  providerMessageId: string | null;
  fromEmail: string;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
  auth: { spf?: string | null; dkim?: string | null; dmarc?: string | null };
  attachments: Array<{
    providerAttachmentId: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }>;
}

interface ResendInboundConfig {
  apiKey?: string;
  webhookSecret?: string;
  fetchImpl?: FetchImpl;
}

interface ResendWebhookPayload {
  type?: string;
  data?: {
    email_id?: string;
  };
}

interface ResendAttachment {
  id?: string;
  filename?: string;
  content_type?: string;
  size?: number;
}

interface ResendReceivedEmail {
  message_id?: string | null;
  from?: unknown;
  to?: unknown;
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  headers?: unknown;
  attachments?: ResendAttachment[];
}

export class ResendInboundService {
  private readonly apiKey?: string;
  private readonly webhookSecret?: string;
  private readonly fetchImpl: FetchImpl;

  constructor(config: ResendInboundConfig = {}) {
    this.apiKey = config.apiKey;
    this.webhookSecret = config.webhookSecret;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async verifyAndNormalizeWebhook(input: {
    rawBody: string;
    headers: Headers | Record<string, string>;
  }): Promise<NormalizedInboundEmail | null> {
    const webhookSecret = this.requireWebhookSecret();
    const normalizedHeaders = normalizeIncomingHeaders(input.headers);
    const payload = this.verifyWebhook(input.rawBody, normalizedHeaders, webhookSecret);

    if (payload.type !== 'email.received') {
      return null;
    }

    const emailId = payload.data?.email_id;
    if (!emailId) {
      throw new Error('Resend email.received webhook missing data.email_id');
    }

    const email = await this.retrieveReceivedEmail(emailId);
    const headers = normalizeEmailHeaders(email.headers);

    return {
      provider: 'resend',
      providerEventId: normalizedHeaders['svix-id'] ?? null,
      providerMessageId: emailId,
      fromEmail: parseEmailAddress(email.from),
      to: parseRecipientList(email.to),
      subject: email.subject ?? null,
      text: email.text ?? null,
      html: email.html ?? null,
      headers,
      auth: extractAuth(headers),
      attachments: normalizeAttachments(email.attachments),
    };
  }

  async getAttachmentBytes(input: {
    provider: 'resend';
    providerMessageId: string;
    providerAttachmentId: string;
  }): Promise<Uint8Array> {
    if (input.provider !== 'resend') {
      throw new Error(`Unsupported inbound email provider: ${input.provider}`);
    }

    const apiKey = this.requireApiKey();
    const metadataResponse = await this.fetchImpl(
      `${RESEND_RECEIVING_API_BASE}/${encodeURIComponent(input.providerMessageId)}/attachments/${encodeURIComponent(input.providerAttachmentId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!metadataResponse.ok) {
      throw new Error(`Resend retrieve attachment metadata failed: ${metadataResponse.status}`);
    }

    const metadata = await metadataResponse.json() as { download_url?: unknown };
    if (typeof metadata.download_url !== 'string' || !metadata.download_url) {
      throw new Error('Resend attachment metadata missing download_url');
    }

    const downloadResponse = await this.fetchImpl(metadata.download_url, { method: 'GET' });
    if (!downloadResponse.ok) {
      throw new Error(`Resend attachment download failed: ${downloadResponse.status}`);
    }

    return new Uint8Array(await downloadResponse.arrayBuffer());
  }

  private verifyWebhook(
    rawBody: string,
    headers: Record<string, string>,
    webhookSecret: string,
  ): ResendWebhookPayload {
    try {
      return new Webhook(webhookSecret).verify(rawBody, headers) as ResendWebhookPayload;
    } catch (error) {
      throw new Error('Invalid Resend webhook signature', { cause: error });
    }
  }

  private async retrieveReceivedEmail(emailId: string): Promise<ResendReceivedEmail> {
    const apiKey = this.requireApiKey();
    const response = await this.fetchImpl(`${RESEND_RECEIVING_API_BASE}/${encodeURIComponent(emailId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Resend retrieve received email failed: ${response.status}`);
    }

    return await response.json() as ResendReceivedEmail;
  }

  private requireApiKey(): string {
    if (!this.apiKey) {
      throw new Error('RESEND_API_KEY is required for Resend inbound email API access');
    }
    return this.apiKey;
  }

  private requireWebhookSecret(): string {
    if (!this.webhookSecret) {
      throw new Error('RESEND_WEBHOOK_SECRET is required to verify Resend inbound webhooks');
    }
    return this.webhookSecret;
  }
}

function normalizeIncomingHeaders(headers: Headers | Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};

  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized[key.toLowerCase()] = value;
    });
    return normalized;
  }

  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }

  return normalized;
}

function normalizeEmailHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(headers)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function extractAuth(headers: Record<string, string>): NormalizedInboundEmail['auth'] {
  const lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );

  return {
    spf: lowerHeaders['x-resend-spf'] ?? null,
    dkim: lowerHeaders['x-resend-dkim'] ?? null,
    dmarc: lowerHeaders['x-resend-dmarc'] ?? null,
  };
}

function normalizeAttachments(attachments: ResendAttachment[] | undefined): NormalizedInboundEmail['attachments'] {
  if (!attachments) return [];

  return attachments.map((attachment) => ({
    providerAttachmentId: attachment.id ?? '',
    fileName: attachment.filename ?? '',
    mimeType: attachment.content_type ?? 'application/octet-stream',
    fileSize: typeof attachment.size === 'number' ? attachment.size : 0,
  }));
}

function parseRecipientList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(parseEmailAddress).filter(Boolean);
  }

  const email = parseEmailAddress(value);
  return email ? [email] : [];
}

function parseEmailAddress(value: unknown): string {
  if (typeof value === 'string') {
    const angleMatch = value.match(/<([^<>]+)>/);
    return (angleMatch?.[1] ?? value).trim();
  }

  if (value && typeof value === 'object' && 'email' in value && typeof value.email === 'string') {
    return value.email.trim();
  }

  return '';
}
