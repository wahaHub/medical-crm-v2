import { describe, it, expect } from 'vitest';
import { CaseHospitalContact } from '../src/entities/case-hospital-contact.entity.js';
import type { CHCSubStatus } from '../src/enums/index.js';

describe('CaseHospitalContact entity', () => {
  function createTestCHC(overrides: Partial<ConstructorParameters<typeof CaseHospitalContact>[0]> = {}) {
    return new CaseHospitalContact({
      id: 'chc-1',
      caseId: 'case-1',
      hospitalId: 'hospital-1',
      subStatus: 'DISTRIBUTED',
      selectedByPatientAt: null,
      distributedAt: new Date('2026-01-01'),
      firstReplyAt: null,
      quoteId: null,
      patientViewedQuoteAt: null,
      patientAcceptedAt: null,
      patientRejectedAt: null,
      reminderSentAt: null,
      removedAt: null,
      removedReason: null,
      version: 1,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    });
  }

  describe('constructor', () => {
    it('creates a CHC with all fields', () => {
      const chc = createTestCHC();
      expect(chc.id).toBe('chc-1');
      expect(chc.caseId).toBe('case-1');
      expect(chc.hospitalId).toBe('hospital-1');
      expect(chc.subStatus).toBe('DISTRIBUTED');
      expect(chc.version).toBe(1);
    });
  });

  describe('transitionSubStatus', () => {
    // DISTRIBUTED transitions
    it('allows DISTRIBUTED -> NEED_INFO', () => {
      const chc = createTestCHC({ subStatus: 'DISTRIBUTED' });
      chc.transitionSubStatus('NEED_INFO');
      expect(chc.subStatus).toBe('NEED_INFO');
    });

    it('allows DISTRIBUTED -> QUOTED', () => {
      const chc = createTestCHC({ subStatus: 'DISTRIBUTED' });
      chc.transitionSubStatus('QUOTED');
      expect(chc.subStatus).toBe('QUOTED');
    });

    it('allows DISTRIBUTED -> REMOVED', () => {
      const chc = createTestCHC({ subStatus: 'DISTRIBUTED' });
      chc.transitionSubStatus('REMOVED');
      expect(chc.subStatus).toBe('REMOVED');
    });

    // NEED_INFO transitions
    it('allows NEED_INFO -> QUOTED', () => {
      const chc = createTestCHC({ subStatus: 'NEED_INFO' });
      chc.transitionSubStatus('QUOTED');
      expect(chc.subStatus).toBe('QUOTED');
    });

    it('allows NEED_INFO -> REMOVED', () => {
      const chc = createTestCHC({ subStatus: 'NEED_INFO' });
      chc.transitionSubStatus('REMOVED');
      expect(chc.subStatus).toBe('REMOVED');
    });

    // QUOTED transitions
    it('allows QUOTED -> ACCEPTED', () => {
      const chc = createTestCHC({ subStatus: 'QUOTED' });
      chc.transitionSubStatus('ACCEPTED');
      expect(chc.subStatus).toBe('ACCEPTED');
    });

    it('allows QUOTED -> REJECTED', () => {
      const chc = createTestCHC({ subStatus: 'QUOTED' });
      chc.transitionSubStatus('REJECTED');
      expect(chc.subStatus).toBe('REJECTED');
    });

    it('allows QUOTED -> EXPIRED', () => {
      const chc = createTestCHC({ subStatus: 'QUOTED' });
      chc.transitionSubStatus('EXPIRED');
      expect(chc.subStatus).toBe('EXPIRED');
    });

    it('allows QUOTED -> REMOVED', () => {
      const chc = createTestCHC({ subStatus: 'QUOTED' });
      chc.transitionSubStatus('REMOVED');
      expect(chc.subStatus).toBe('REMOVED');
    });

    // REJECTED -> QUOTED (ResendQuote)
    it('allows REJECTED -> QUOTED (via ResendQuote)', () => {
      const chc = createTestCHC({ subStatus: 'REJECTED' });
      chc.transitionSubStatus('QUOTED');
      expect(chc.subStatus).toBe('QUOTED');
    });

    // EXPIRED -> QUOTED (ResendQuote)
    it('allows EXPIRED -> QUOTED (via ResendQuote)', () => {
      const chc = createTestCHC({ subStatus: 'EXPIRED' });
      chc.transitionSubStatus('QUOTED');
      expect(chc.subStatus).toBe('QUOTED');
    });

    // Terminal states
    it('throws on ACCEPTED -> any (terminal state)', () => {
      const chc = createTestCHC({ subStatus: 'ACCEPTED' });
      const allStatuses: CHCSubStatus[] = ['DISTRIBUTED', 'NEED_INFO', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REMOVED'];
      for (const status of allStatuses) {
        expect(() => chc.transitionSubStatus(status)).toThrow(
          `Cannot transition CHC sub-status from ACCEPTED to ${status}`,
        );
      }
    });

    it('throws on REMOVED -> any (terminal state)', () => {
      const chc = createTestCHC({ subStatus: 'REMOVED' });
      const allStatuses: CHCSubStatus[] = ['DISTRIBUTED', 'NEED_INFO', 'QUOTED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'REMOVED'];
      for (const status of allStatuses) {
        expect(() => chc.transitionSubStatus(status)).toThrow(
          `Cannot transition CHC sub-status from REMOVED to ${status}`,
        );
      }
    });

    // Invalid transitions
    it('throws on invalid DISTRIBUTED -> ACCEPTED', () => {
      const chc = createTestCHC({ subStatus: 'DISTRIBUTED' });
      expect(() => chc.transitionSubStatus('ACCEPTED')).toThrow(
        'Cannot transition CHC sub-status from DISTRIBUTED to ACCEPTED',
      );
    });

    it('throws on invalid NEED_INFO -> ACCEPTED', () => {
      const chc = createTestCHC({ subStatus: 'NEED_INFO' });
      expect(() => chc.transitionSubStatus('ACCEPTED')).toThrow(
        'Cannot transition CHC sub-status from NEED_INFO to ACCEPTED',
      );
    });

    it('updates updatedAt on transition', () => {
      const chc = createTestCHC({ subStatus: 'DISTRIBUTED' });
      const before = chc.updatedAt;
      chc.transitionSubStatus('NEED_INFO');
      expect(chc.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('remove', () => {
    it('transitions to REMOVED and sets removedAt', () => {
      const chc = createTestCHC({ subStatus: 'DISTRIBUTED' });
      chc.remove();
      expect(chc.subStatus).toBe('REMOVED');
      expect(chc.removedAt).toBeInstanceOf(Date);
      expect(chc.removedReason).toBeNull();
    });

    it('sets removedReason when provided', () => {
      const chc = createTestCHC({ subStatus: 'QUOTED' });
      chc.remove('Patient withdrew');
      expect(chc.subStatus).toBe('REMOVED');
      expect(chc.removedReason).toBe('Patient withdrew');
    });

    it('throws when removing from terminal state ACCEPTED', () => {
      const chc = createTestCHC({ subStatus: 'ACCEPTED' });
      expect(() => chc.remove()).toThrow(
        'Cannot transition CHC sub-status from ACCEPTED to REMOVED',
      );
    });

    it('throws when removing from terminal state REMOVED', () => {
      const chc = createTestCHC({ subStatus: 'REMOVED' });
      expect(() => chc.remove()).toThrow(
        'Cannot transition CHC sub-status from REMOVED to REMOVED',
      );
    });
  });
});
