import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  EmailReplyTokenService,
  buildPreferredReplyAddress,
  generateReplyToken,
  hashReplyToken,
  parseReplyAddress,
} from '../src/services/email-reply-token.service.js';

describe('EmailReplyTokenService', () => {
  it('generates a high-entropy token and stores only its SHA-256 hash', () => {
    const service = new EmailReplyTokenService();

    const result = service.createReplyToken();

    expect(result.token).toMatch(/^[a-f0-9]{32}$/);
    expect(result.token).toBe(result.token.toLowerCase());
    expect(result.tokenHash).toBe(hashReplyToken(result.token));
    expect(result.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.tokenHash).not.toContain(result.token);
    expect(result).not.toHaveProperty('storedToken');
  });

  it('builds the preferred reply address', () => {
    const token = generateReplyToken();

    expect(buildPreferredReplyAddress(token)).toBe(
      `reply+${token}@medicaltourismchina.health`,
    );
  });

  it('parses a lowercased recipient and hashes the generated token', () => {
    const token = generateReplyToken();
    const lowercasedRecipient = `reply+${token}@medicaltourismchina.health`.toLowerCase();

    expect(parseReplyAddress(lowercasedRecipient)).toEqual({
      token,
      tokenHash: hashReplyToken(token),
      addressType: 'preferred',
    });
  });

  it('parses preferred and alternate inbound reply addresses', () => {
    const token = generateReplyToken();

    expect(parseReplyAddress(`reply+${token}@medicaltourismchina.health`)).toEqual({
      token,
      tokenHash: hashReplyToken(token),
      addressType: 'preferred',
    });
    expect(parseReplyAddress(`${token}@reply.medicaltourismchina.health`)).toEqual({
      token,
      tokenHash: hashReplyToken(token),
      addressType: 'alternate',
    });
  });

  it('parses display-name mailbox format and bracketed bare addresses', () => {
    const token = generateReplyToken();

    expect(parseReplyAddress(`Patient <reply+${token}@medicaltourismchina.health>`)).toEqual({
      token,
      tokenHash: hashReplyToken(token),
      addressType: 'preferred',
    });
    expect(parseReplyAddress(`<${token}@reply.medicaltourismchina.health>`)).toEqual({
      token,
      tokenHash: hashReplyToken(token),
      addressType: 'alternate',
    });
  });

  it('parses uppercase domain and preferred prefix casing', () => {
    const token = generateReplyToken();

    expect(parseReplyAddress(`Reply+${token}@MEDICALTOURISMCHINA.HEALTH`)).toEqual({
      token,
      tokenHash: hashReplyToken(token),
      addressType: 'preferred',
    });
    expect(parseReplyAddress(`${token}@REPLY.MEDICALTOURISMCHINA.HEALTH`)).toEqual({
      token,
      tokenHash: hashReplyToken(token),
      addressType: 'alternate',
    });
  });

  it('parses legacy 64-hex tokens from previously sent emails', () => {
    const legacyToken = 'a'.repeat(64);

    expect(parseReplyAddress(`reply+${legacyToken}@medicaltourismchina.health`)).toEqual({
      token: legacyToken,
      tokenHash: hashReplyToken(legacyToken),
      addressType: 'preferred',
    });
    expect(parseReplyAddress(`${legacyToken}@reply.medicaltourismchina.health`)).toEqual({
      token: legacyToken,
      tokenHash: hashReplyToken(legacyToken),
      addressType: 'alternate',
    });
  });

  it('rejects malformed tokens', () => {
    const malformedAddresses = [
      'reply+short@medicaltourismchina.health',
      'reply+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@medicaltourismchina.health',
      'reply+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@medicaltourismchina.health',
      'reply+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=@medicaltourismchina.health',
      'reply+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!@medicaltourismchina.health',
      'reply+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaA@medicaltourismchina.health',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@example.com',
      'reply+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@reply.medicaltourismchina.health',
    ];

    for (const address of malformedAddresses) {
      expect(parseReplyAddress(address)).toBeNull();
    }
  });
});

describe('hashReplyToken', () => {
  it('returns the SHA-256 hex digest for the token', () => {
    const token = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    expect(hashReplyToken(token)).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
  });
});
