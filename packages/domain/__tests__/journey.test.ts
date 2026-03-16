import { describe, it, expect } from 'vitest';
import { CaseJourney } from '../src/entities/case-journey.entity.js';
import { JourneyMilestone } from '../src/entities/journey-milestone.entity.js';

// ============================================================================
// CaseJourney Entity
// ============================================================================
describe('CaseJourney entity', () => {
  function createTestJourney(overrides: Partial<ConstructorParameters<typeof CaseJourney>[0]> = {}) {
    return new CaseJourney({
      id: 'journey-1',
      caseId: 'case-1',
      visa: null,
      insurance: null,
      accommodation: null,
      transportation: null,
      postCare: null,
      createdAt: new Date('2026-03-16'),
      updatedAt: new Date('2026-03-16'),
      ...overrides,
    });
  }

  describe('constructor', () => {
    it('creates a journey with all fields', () => {
      const j = createTestJourney();
      expect(j.id).toBe('journey-1');
      expect(j.caseId).toBe('case-1');
      expect(j.visa).toBeNull();
      expect(j.insurance).toBeNull();
      expect(j.accommodation).toBeNull();
      expect(j.transportation).toBeNull();
      expect(j.postCare).toBeNull();
    });

    it('creates a journey with JSONB data', () => {
      const visaData = { type: 'tourist', country: 'KR', expiresAt: '2027-01-01' };
      const j = createTestJourney({ visa: visaData });
      expect(j.visa).toEqual(visaData);
    });
  });

  describe('update', () => {
    it('updates visa field', () => {
      const j = createTestJourney();
      const visaData = { status: 'approved', number: 'V123' };
      j.update({ visa: visaData });
      expect(j.visa).toEqual(visaData);
    });

    it('updates insurance field', () => {
      const j = createTestJourney();
      j.update({ insurance: { provider: 'AIG', policyNumber: 'P123' } });
      expect(j.insurance).toEqual({ provider: 'AIG', policyNumber: 'P123' });
    });

    it('updates accommodation field', () => {
      const j = createTestJourney();
      j.update({ accommodation: { hotel: 'Seoul Grand', nights: 7 } });
      expect(j.accommodation).toEqual({ hotel: 'Seoul Grand', nights: 7 });
    });

    it('updates transportation field', () => {
      const j = createTestJourney();
      j.update({ transportation: { flights: ['SFO-ICN'] } });
      expect(j.transportation).toEqual({ flights: ['SFO-ICN'] });
    });

    it('updates postCare field', () => {
      const j = createTestJourney();
      j.update({ postCare: { followUp: '2 weeks' } });
      expect(j.postCare).toEqual({ followUp: '2 weeks' });
    });

    it('updates multiple fields at once', () => {
      const j = createTestJourney();
      j.update({
        visa: { status: 'approved' },
        insurance: { provider: 'AIG' },
      });
      expect(j.visa).toEqual({ status: 'approved' });
      expect(j.insurance).toEqual({ provider: 'AIG' });
    });

    it('updates updatedAt on any change', () => {
      const j = createTestJourney();
      const before = j.updatedAt;
      j.update({ visa: { status: 'pending' } });
      expect(j.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('does not change fields not in the update', () => {
      const j = createTestJourney({ visa: { original: true } });
      j.update({ insurance: { new: true } });
      expect(j.visa).toEqual({ original: true });
    });

    it('can set a field to null', () => {
      const j = createTestJourney({ visa: { status: 'approved' } });
      j.update({ visa: null });
      expect(j.visa).toBeNull();
    });
  });
});

// ============================================================================
// JourneyMilestone Entity
// ============================================================================
describe('JourneyMilestone entity', () => {
  function createTestMilestone(overrides: Partial<ConstructorParameters<typeof JourneyMilestone>[0]> = {}) {
    return new JourneyMilestone({
      id: 'milestone-1',
      caseId: 'case-1',
      eventType: 'SURGERY_DATE',
      eventDate: new Date('2026-04-15'),
      note: 'Main procedure',
      isVisibleToPatient: true,
      createdBy: 'admin-1',
      createdAt: new Date('2026-03-16'),
      updatedAt: new Date('2026-03-16'),
      ...overrides,
    });
  }

  describe('constructor', () => {
    it('creates a milestone with all fields', () => {
      const m = createTestMilestone();
      expect(m.id).toBe('milestone-1');
      expect(m.caseId).toBe('case-1');
      expect(m.eventType).toBe('SURGERY_DATE');
      expect(m.eventDate).toEqual(new Date('2026-04-15'));
      expect(m.note).toBe('Main procedure');
      expect(m.isVisibleToPatient).toBe(true);
      expect(m.createdBy).toBe('admin-1');
    });

    it('creates a milestone with null note and createdBy', () => {
      const m = createTestMilestone({ note: null, createdBy: null });
      expect(m.note).toBeNull();
      expect(m.createdBy).toBeNull();
    });
  });

  describe('update', () => {
    it('updates eventType', () => {
      const m = createTestMilestone();
      m.update({ eventType: 'POST_OP_CHECKUP' });
      expect(m.eventType).toBe('POST_OP_CHECKUP');
    });

    it('updates eventDate', () => {
      const m = createTestMilestone();
      const newDate = new Date('2026-05-01');
      m.update({ eventDate: newDate });
      expect(m.eventDate).toEqual(newDate);
    });

    it('updates note', () => {
      const m = createTestMilestone();
      m.update({ note: 'Updated note' });
      expect(m.note).toBe('Updated note');
    });

    it('updates isVisibleToPatient', () => {
      const m = createTestMilestone({ isVisibleToPatient: true });
      m.update({ isVisibleToPatient: false });
      expect(m.isVisibleToPatient).toBe(false);
    });

    it('updates multiple fields at once', () => {
      const m = createTestMilestone();
      m.update({
        eventType: 'FOLLOW_UP_REMOTE',
        note: 'Remote check-in',
        isVisibleToPatient: false,
      });
      expect(m.eventType).toBe('FOLLOW_UP_REMOTE');
      expect(m.note).toBe('Remote check-in');
      expect(m.isVisibleToPatient).toBe(false);
    });

    it('updates updatedAt on any change', () => {
      const m = createTestMilestone();
      const before = m.updatedAt;
      m.update({ note: 'Changed' });
      expect(m.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('does not change fields not in the update', () => {
      const m = createTestMilestone();
      m.update({ note: 'Changed' });
      expect(m.eventType).toBe('SURGERY_DATE');
      expect(m.eventDate).toEqual(new Date('2026-04-15'));
      expect(m.isVisibleToPatient).toBe(true);
    });

    it('can set note to null', () => {
      const m = createTestMilestone({ note: 'Something' });
      m.update({ note: null });
      expect(m.note).toBeNull();
    });
  });
});
