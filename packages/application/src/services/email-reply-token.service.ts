import { createHash, randomBytes } from 'node:crypto';

export const PREFERRED_REPLY_DOMAIN = 'medicaltourismchina.health';
export const ALTERNATE_REPLY_DOMAIN = `reply.${PREFERRED_REPLY_DOMAIN}`;

const GENERATED_REPLY_TOKEN_LENGTH = 64;
const REPLY_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export type ReplyAddressType = 'preferred' | 'alternate';

export interface ReplyTokenGenerationResult {
  token: string;
  tokenHash: string;
  replyAddress: string;
}

export interface ParsedReplyAddress {
  token: string;
  tokenHash: string;
  addressType: ReplyAddressType;
}

export function generateReplyToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashReplyToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isValidReplyToken(token: string): boolean {
  return token.length === GENERATED_REPLY_TOKEN_LENGTH && REPLY_TOKEN_PATTERN.test(token);
}

export function buildPreferredReplyAddress(token: string): string {
  if (!isValidReplyToken(token)) {
    throw new Error('Invalid reply token');
  }

  return `reply+${token}@${PREFERRED_REPLY_DOMAIN}`;
}

export function parseReplyAddress(address: string): ParsedReplyAddress | null {
  const normalizedAddress = normalizeAddress(address);
  const atIndex = normalizedAddress.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalizedAddress.length - 1) {
    return null;
  }

  const localPart = normalizedAddress.slice(0, atIndex);
  const domain = normalizedAddress.slice(atIndex + 1).toLowerCase();

  if (domain === PREFERRED_REPLY_DOMAIN) {
    return parseTokenFromAddress(localPart, 'preferred');
  }

  if (domain === ALTERNATE_REPLY_DOMAIN) {
    return parseTokenFromAddress(localPart, 'alternate');
  }

  return null;
}

function parseTokenFromAddress(localPart: string, addressType: ReplyAddressType): ParsedReplyAddress | null {
  const token = addressType === 'preferred'
    ? parsePreferredLocalPart(localPart)
    : localPart;

  if (!token || !isValidReplyToken(token)) {
    return null;
  }

  return {
    token,
    tokenHash: hashReplyToken(token),
    addressType,
  };
}

function parsePreferredLocalPart(localPart: string): string | null {
  const prefix = 'reply+';
  if (!localPart.toLowerCase().startsWith(prefix)) {
    return null;
  }

  return localPart.slice(prefix.length);
}

function normalizeAddress(address: string): string {
  const trimmed = address.trim();

  const mailboxMatch = trimmed.match(/<([^<>\s]+@[^<>\s]+)>/);
  const mailboxAddress = mailboxMatch?.[1];
  if (mailboxAddress) {
    return mailboxAddress.trim();
  }

  if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export class EmailReplyTokenService {
  createReplyToken(): ReplyTokenGenerationResult {
    const token = generateReplyToken();

    return {
      token,
      tokenHash: hashReplyToken(token),
      replyAddress: buildPreferredReplyAddress(token),
    };
  }

  parseAddress(address: string): ParsedReplyAddress | null {
    return parseReplyAddress(address);
  }

  buildPreferredAddress(token: string): string {
    return buildPreferredReplyAddress(token);
  }
}
