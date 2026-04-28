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

    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
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

  it('rejects malformed tokens', () => {
    const malformedAddresses = [
      'reply+short@medicaltourismchina.health',
      'reply+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=@medicaltourismchina.health',
      'reply+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!@medicaltourismchina.health',
      'reply+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@medicaltourismchina.health',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@example.com',
      'reply+aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa@reply.medicaltourismchina.health',
    ];

    for (const address of malformedAddresses) {
      expect(parseReplyAddress(address)).toBeNull();
    }
  });
});

describe('hashReplyToken', () => {
  it('returns the SHA-256 hex digest for the token', () => {
    const token = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO12';

    expect(hashReplyToken(token)).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
  });
});
