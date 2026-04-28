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

interface ResendAttachmentMetadata {
  id?: string;
  size?: number;
  download_url?: unknown;
}

interface CachedResendAttachmentMetadata {
  id?: string;
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
  private readonly attachmentMetadataCache = new Map<string, CachedResendAttachmentMetadata>();

  constructor(config: ResendInboundConfig = {}) {
    this.apiKey = config.apiKey === undefined
      ? normalizeSecret(process.env['RESEND_API_KEY'])
      : normalizeSecret(config.apiKey);
    this.webhookSecret = config.webhookSecret === undefined
      ? normalizeSecret(process.env['RESEND_WEBHOOK_SECRET'])
      : normalizeSecret(config.webhookSecret);
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
    const attachmentMetadataById = await this.retrieveAttachmentMetadataForEmail(emailId, email.attachments);

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
      attachments: normalizeAttachments(email.attachments, attachmentMetadataById),
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

    const metadata = await this.retrieveFreshAttachmentMetadata(
      input.providerMessageId,
      input.providerAttachmentId,
    );
    if (typeof metadata.download_url !== 'string' || !metadata.download_url) {
      throw new Error('Resend attachment metadata missing download_url');
    }

    const downloadResponse = await this.fetchImpl(metadata.download_url, { method: 'GET' });
    if (!downloadResponse.ok) {
      throw await buildResendError('Resend attachment download failed', downloadResponse);
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
      throw await buildResendError('Resend retrieve received email failed', response);
    }

    return await response.json() as ResendReceivedEmail;
  }

  private async retrieveAttachmentMetadataForEmail(
    emailId: string,
    attachments: ResendAttachment[] | undefined,
  ): Promise<Map<string, CachedResendAttachmentMetadata>> {
    const attachmentsWithIds = attachments?.filter(
      (attachment): attachment is ResendAttachment & { id: string } => Boolean(attachment.id),
    ) ?? [];

    const entries = await Promise.all(
      attachmentsWithIds.map(async (attachment) => [
        attachment.id,
        await this.retrieveAttachmentMetadata(emailId, attachment.id),
      ] as const),
    );

    return new Map(entries);
  }

  private async retrieveAttachmentMetadata(
    emailId: string,
    attachmentId: string,
  ): Promise<CachedResendAttachmentMetadata> {
    const cacheKey = attachmentMetadataCacheKey(emailId, attachmentId);
    const cached = this.attachmentMetadataCache.get(cacheKey);
    if (cached) return cached;

    const metadata = await this.fetchAttachmentMetadata(emailId, attachmentId);
    return this.cacheAttachmentMetadata(cacheKey, metadata);
  }

  private async retrieveFreshAttachmentMetadata(
    emailId: string,
    attachmentId: string,
  ): Promise<ResendAttachmentMetadata> {
    const metadata = await this.fetchAttachmentMetadata(emailId, attachmentId);
    this.cacheAttachmentMetadata(attachmentMetadataCacheKey(emailId, attachmentId), metadata);
    return metadata;
  }

  private async fetchAttachmentMetadata(
    emailId: string,
    attachmentId: string,
  ): Promise<ResendAttachmentMetadata> {
    const apiKey = this.requireApiKey();
    const response = await this.fetchImpl(
      `${RESEND_RECEIVING_API_BASE}/${encodeURIComponent(emailId)}/attachments/${encodeURIComponent(attachmentId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );

    if (!response.ok) {
      throw await buildResendError('Resend retrieve attachment metadata failed', response);
    }

    return await response.json() as ResendAttachmentMetadata;
  }

  private cacheAttachmentMetadata(
    cacheKey: string,
    metadata: ResendAttachmentMetadata,
  ): CachedResendAttachmentMetadata {
    const cached = {
      id: metadata.id,
      size: metadata.size,
    };
    this.attachmentMetadataCache.set(cacheKey, cached);
    return cached;
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

function normalizeSecret(value: string | undefined): string | undefined {
  return value?.trim();
}

function attachmentMetadataCacheKey(emailId: string, attachmentId: string): string {
  return `${emailId}/${attachmentId}`;
}

async function buildResendError(message: string, response: Response): Promise<Error> {
  const details = await response.text().catch(() => '');
  return new Error(`${message}: ${response.status}${details ? ` ${details}` : ''}`);
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

function normalizeAttachments(
  attachments: ResendAttachment[] | undefined,
  metadataById: Map<string, CachedResendAttachmentMetadata>,
): NormalizedInboundEmail['attachments'] {
  if (!attachments) return [];

  return attachments.map((attachment) => {
    const metadata = attachment.id ? metadataById.get(attachment.id) : undefined;

    return {
      providerAttachmentId: attachment.id ?? '',
      fileName: attachment.filename ?? '',
      mimeType: attachment.content_type ?? 'application/octet-stream',
      fileSize: typeof metadata?.size === 'number'
        ? metadata.size
        : typeof attachment.size === 'number'
          ? attachment.size
          : 0,
    };
  });
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
