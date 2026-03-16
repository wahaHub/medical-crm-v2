import { describe, it, expect } from 'vitest';
import { Quote } from '../src/entities/quote.entity.js';
import { QuoteNumber } from '../src/value-objects/quote-number.js';
import type { QuoteStatus } from '../src/enums/index.js';

describe('Quote entity', () => {
  function createTestQuote(overrides: Partial<ConstructorParameters<typeof Quote>[0]> = {}) {
    return new Quote({
      id: 'quote-1',
      caseId: 'case-1',
      hospitalId: 'hospital-1',
      quoteNumber: new QuoteNumber('QT-20260101-0001'),
      version: 1,
      status: 'PENDING',
      isDraft: true,
      totalAmount: '10000.00',
      currency: 'USD',
      validUntil: new Date('2026-02-01'),
      treatmentPlan: null,
      lineItems: null,
      notes: null,
      sentAt: null,
      createdBy: 'user-1',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    });
  }

  describe('constructor', () => {
    it('creates a quote with all fields', () => {
      const q = createTestQuote();
      expect(q.id).toBe('quote-1');
      expect(q.caseId).toBe('case-1');
      expect(q.hospitalId).toBe('hospital-1');
      expect(q.quoteNumber.value).toBe('QT-20260101-0001');
      expect(q.status).toBe('PENDING');
      expect(q.isDraft).toBe(true);
      expect(q.totalAmount).toBe('10000.00');
      expect(q.currency).toBe('USD');
      expect(q.version).toBe(1);
    });
  });

  describe('transitionStatus', () => {
    it('allows PENDING -> ACCEPTED', () => {
      const q = createTestQuote({ status: 'PENDING' });
      q.transitionStatus('ACCEPTED');
      expect(q.status).toBe('ACCEPTED');
    });

    it('allows PENDING -> REJECTED', () => {
      const q = createTestQuote({ status: 'PENDING' });
      q.transitionStatus('REJECTED');
      expect(q.status).toBe('REJECTED');
    });

    it('allows PENDING -> EXPIRED', () => {
      const q = createTestQuote({ status: 'PENDING' });
      q.transitionStatus('EXPIRED');
      expect(q.status).toBe('EXPIRED');
    });

    it('allows REJECTED -> PENDING (resend)', () => {
      const q = createTestQuote({ status: 'REJECTED' });
      q.transitionStatus('PENDING');
      expect(q.status).toBe('PENDING');
    });

    it('allows EXPIRED -> PENDING (resend)', () => {
      const q = createTestQuote({ status: 'EXPIRED' });
      q.transitionStatus('PENDING');
      expect(q.status).toBe('PENDING');
    });

    it('throws on ACCEPTED -> any (terminal state)', () => {
      const q = createTestQuote({ status: 'ACCEPTED' });
      const allStatuses: QuoteStatus[] = ['PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED'];
      for (const status of allStatuses) {
        expect(() => q.transitionStatus(status)).toThrow(
          `Cannot transition quote status from ACCEPTED to ${status}`,
        );
      }
    });

    it('throws on invalid PENDING -> PENDING', () => {
      const q = createTestQuote({ status: 'PENDING' });
      expect(() => q.transitionStatus('PENDING')).toThrow(
        'Cannot transition quote status from PENDING to PENDING',
      );
    });

    it('updates updatedAt on transition', () => {
      const q = createTestQuote({ status: 'PENDING' });
      const before = q.updatedAt;
      q.transitionStatus('ACCEPTED');
      expect(q.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('accept', () => {
    it('transitions to ACCEPTED', () => {
      const q = createTestQuote({ status: 'PENDING' });
      q.accept();
      expect(q.status).toBe('ACCEPTED');
    });

    it('throws from terminal state', () => {
      const q = createTestQuote({ status: 'ACCEPTED' });
      expect(() => q.accept()).toThrow();
    });
  });

  describe('reject', () => {
    it('transitions to REJECTED', () => {
      const q = createTestQuote({ status: 'PENDING' });
      q.reject();
      expect(q.status).toBe('REJECTED');
    });

    it('throws from terminal state', () => {
      const q = createTestQuote({ status: 'ACCEPTED' });
      expect(() => q.reject()).toThrow();
    });
  });

  describe('send', () => {
    it('sets isDraft to false and sentAt', () => {
      const q = createTestQuote({ isDraft: true });
      q.send();
      expect(q.isDraft).toBe(false);
      expect(q.sentAt).toBeInstanceOf(Date);
    });

    it('throws if already sent (isDraft is false)', () => {
      const q = createTestQuote({ isDraft: false });
      expect(() => q.send()).toThrow('Quote is already sent');
    });

    it('updates updatedAt', () => {
      const q = createTestQuote({ isDraft: true });
      const before = q.updatedAt;
      q.send();
      expect(q.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('resend', () => {
    it('transitions REJECTED -> PENDING and increments version', () => {
      const q = createTestQuote({ status: 'REJECTED', version: 1 });
      q.resend();
      expect(q.status).toBe('PENDING');
      expect(q.version).toBe(2);
    });

    it('transitions EXPIRED -> PENDING and increments version', () => {
      const q = createTestQuote({ status: 'EXPIRED', version: 3 });
      q.resend();
      expect(q.status).toBe('PENDING');
      expect(q.version).toBe(4);
    });

    it('throws from ACCEPTED (terminal)', () => {
      const q = createTestQuote({ status: 'ACCEPTED' });
      expect(() => q.resend()).toThrow();
    });

    it('throws from PENDING (cannot resend pending)', () => {
      const q = createTestQuote({ status: 'PENDING' });
      expect(() => q.resend()).toThrow();
    });
  });
});
