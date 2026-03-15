import { describe, it, expect } from 'vitest';
import { RegistrationToken } from '../src/value-objects/registration-token.js';

function makeProps(overrides: Partial<Parameters<typeof RegistrationToken.prototype.constructor>[0]> = {}) {
  return {
    id: 'token-id-1',
    hospitalId: 'hospital-id-1',
    token: 'abc123',
    email: 'test@example.com',
    expiresAt: new Date(Date.now() + 60_000), // 1 minute in future
    usedAt: null,
    keycloakUserId: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('RegistrationToken', () => {
  describe('isExpired()', () => {
    it('returns true when expiresAt is in the past', () => {
      const token = new RegistrationToken(
        makeProps({ expiresAt: new Date(Date.now() - 1000) }),
      );
      expect(token.isExpired()).toBe(true);
    });

    it('returns false when expiresAt is in the future', () => {
      const token = new RegistrationToken(
        makeProps({ expiresAt: new Date(Date.now() + 60_000) }),
      );
      expect(token.isExpired()).toBe(false);
    });
  });

  describe('isUsed()', () => {
    it('returns true when usedAt is not null', () => {
      const token = new RegistrationToken(
        makeProps({ usedAt: new Date(), keycloakUserId: 'kc-user-1' }),
      );
      expect(token.isUsed()).toBe(true);
    });

    it('returns false when usedAt is null', () => {
      const token = new RegistrationToken(makeProps({ usedAt: null }));
      expect(token.isUsed()).toBe(false);
    });
  });

  describe('markUsed()', () => {
    it('sets usedAt and keycloakUserId', () => {
      const token = new RegistrationToken(makeProps());
      expect(token.usedAt).toBeNull();
      expect(token.keycloakUserId).toBeNull();

      token.markUsed('kc-user-42');

      expect(token.usedAt).toBeInstanceOf(Date);
      expect(token.keycloakUserId).toBe('kc-user-42');
    });

    it('throws ValidationError when already used', () => {
      const token = new RegistrationToken(
        makeProps({ usedAt: new Date(), keycloakUserId: 'kc-user-1' }),
      );
      expect(() => token.markUsed('kc-user-2')).toThrow(
        'Registration token has already been used',
      );
    });
  });
});
