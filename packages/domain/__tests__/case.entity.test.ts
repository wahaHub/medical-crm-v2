import { describe, it, expect } from 'vitest';
import { Case } from '../src/entities/case.entity.js';
import { CaseNumber } from '../src/value-objects/case-number.js';

describe('Case entity', () => {
  function createTestCase(overrides: Partial<ConstructorParameters<typeof Case>[0]> = {}) {
    return new Case({
      id: 'case-1',
      caseNumber: new CaseNumber('CASE-2026-0001'),
      patientId: 'patient-1',
      patientName: 'John Doe',
      patientCountry: 'US',
      patientLanguage: 'en',
      assignedHospitalId: null,
      primaryDiagnosis: null,
      diagnosisCode: null,
      symptoms: null,
      medicalHistory: null,
      aiSummary: null,
      aiSummaryLanguage: null,
      riskLevel: null,
      status: 'DRAFT',
      stage: 'PENDING_ASSIGNMENT',
      assignedAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      // New Phase 2 fields
      assignmentStatus: 'UNASSIGNED',
      treatmentStage: null,
      conditionSummary: null,
      structuredData: null,
      riskFlags: null,
      priority: null,
      lastEventAt: null,
      aiSummaryStatus: 'PENDING',
      questionCollectorTemplateId: null,
      ...overrides,
    });
  }

  describe('constructor', () => {
    it('creates a case with all fields', () => {
      const c = createTestCase();
      expect(c.id).toBe('case-1');
      expect(c.caseNumber.value).toBe('CASE-2026-0001');
      expect(c.patientId).toBe('patient-1');
      expect(c.patientName).toBe('John Doe');
      expect(c.status).toBe('DRAFT');
      expect(c.stage).toBe('PENDING_ASSIGNMENT');
    });
  });

  describe('setAiAnalysis', () => {
    it('sets all AI fields', () => {
      const c = createTestCase();
      c.setAiAnalysis('Summary text', 'zh', 'HIGH');
      expect(c.aiSummary).toBe('Summary text');
      expect(c.aiSummaryLanguage).toBe('zh');
      expect(c.riskLevel).toBe('HIGH');
    });
  });

  describe('transitionStatus', () => {
    it('allows DRAFT → ACTIVE', () => {
      const c = createTestCase({ status: 'DRAFT' });
      c.transitionStatus('ACTIVE');
      expect(c.status).toBe('ACTIVE');
    });

    it('allows DRAFT → CANCELLED', () => {
      const c = createTestCase({ status: 'DRAFT' });
      c.transitionStatus('CANCELLED');
      expect(c.status).toBe('CANCELLED');
    });

    it('allows ACTIVE → COMPLETED', () => {
      const c = createTestCase({ status: 'ACTIVE' });
      c.transitionStatus('COMPLETED');
      expect(c.status).toBe('COMPLETED');
    });

    it('allows ACTIVE → CANCELLED', () => {
      const c = createTestCase({ status: 'ACTIVE' });
      c.transitionStatus('CANCELLED');
      expect(c.status).toBe('CANCELLED');
    });

    it('allows COMPLETED → ARCHIVED', () => {
      const c = createTestCase({ status: 'COMPLETED' });
      c.transitionStatus('ARCHIVED');
      expect(c.status).toBe('ARCHIVED');
    });

    it('allows CANCELLED → ARCHIVED', () => {
      const c = createTestCase({ status: 'CANCELLED' });
      c.transitionStatus('ARCHIVED');
      expect(c.status).toBe('ARCHIVED');
    });

    it('throws on invalid DRAFT → COMPLETED', () => {
      const c = createTestCase({ status: 'DRAFT' });
      expect(() => c.transitionStatus('COMPLETED')).toThrow(
        'Cannot transition case status from DRAFT to COMPLETED',
      );
    });

    it('throws on ARCHIVED → any (terminal state)', () => {
      const c = createTestCase({ status: 'ARCHIVED' });
      expect(() => c.transitionStatus('ACTIVE')).toThrow();
    });

    it('updates updatedAt on transition', () => {
      const c = createTestCase({ status: 'DRAFT' });
      const before = c.updatedAt;
      c.transitionStatus('ACTIVE');
      expect(c.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('advanceStage', () => {
    it('allows forward movement PENDING_ASSIGNMENT → TRANSFERRED_TO_HOSPITAL', () => {
      const c = createTestCase({ stage: 'PENDING_ASSIGNMENT' });
      c.advanceStage('TRANSFERRED_TO_HOSPITAL');
      expect(c.stage).toBe('TRANSFERRED_TO_HOSPITAL');
    });

    it('allows skipping stages PENDING_ASSIGNMENT → CONSULTATION_SCHEDULED', () => {
      const c = createTestCase({ stage: 'PENDING_ASSIGNMENT' });
      c.advanceStage('CONSULTATION_SCHEDULED');
      expect(c.stage).toBe('CONSULTATION_SCHEDULED');
    });

    it('throws on backward movement', () => {
      const c = createTestCase({ stage: 'HOSPITAL_CONTACTED' });
      expect(() => c.advanceStage('TRANSFERRED_TO_HOSPITAL')).toThrow(
        'Cannot move case stage backward',
      );
    });

    it('throws on same stage (no-op)', () => {
      const c = createTestCase({ stage: 'IN_TREATMENT' });
      expect(() => c.advanceStage('IN_TREATMENT')).toThrow(
        'Cannot move case stage backward',
      );
    });
  });

  describe('assign', () => {
    it('sets hospitalId and assignedAt', () => {
      const c = createTestCase({ assignedHospitalId: null, assignedAt: null });
      c.assign('hospital-1');
      expect(c.assignedHospitalId).toBe('hospital-1');
      expect(c.assignedAt).toBeInstanceOf(Date);
    });

    it('auto-advances stage from PENDING_ASSIGNMENT to TRANSFERRED_TO_HOSPITAL', () => {
      const c = createTestCase({ stage: 'PENDING_ASSIGNMENT' });
      c.assign('hospital-1');
      expect(c.stage).toBe('TRANSFERRED_TO_HOSPITAL');
    });

    it('does NOT change stage if already past PENDING_ASSIGNMENT', () => {
      const c = createTestCase({ stage: 'HOSPITAL_CONTACTED' });
      c.assign('hospital-2');
      expect(c.stage).toBe('HOSPITAL_CONTACTED');
      expect(c.assignedHospitalId).toBe('hospital-2');
    });

    it('also sets assignmentStatus to ASSIGNED', () => {
      const c = createTestCase({ assignmentStatus: 'UNASSIGNED' });
      c.assign('hospital-1');
      expect(c.assignmentStatus).toBe('ASSIGNED');
    });
  });

  describe('transitionAssignmentStatus', () => {
    it('allows UNASSIGNED → ASSIGNED', () => {
      const c = createTestCase({ assignmentStatus: 'UNASSIGNED' });
      c.transitionAssignmentStatus('ASSIGNED');
      expect(c.assignmentStatus).toBe('ASSIGNED');
    });

    it('throws on invalid transition', () => {
      const c = createTestCase({ assignmentStatus: 'UNASSIGNED' });
      expect(() => c.transitionAssignmentStatus('UNASSIGNED')).toThrow();
    });
  });

  describe('advanceTreatmentStage', () => {
    it('allows CONFIRMED → IN_TREATMENT', () => {
      const c = createTestCase({ treatmentStage: 'CONFIRMED' });
      c.advanceTreatmentStage('IN_TREATMENT');
      expect(c.treatmentStage).toBe('IN_TREATMENT');
    });

    it('allows FOLLOW_UP → IN_TREATMENT (restart loop)', () => {
      const c = createTestCase({ treatmentStage: 'FOLLOW_UP' });
      c.advanceTreatmentStage('IN_TREATMENT');
      expect(c.treatmentStage).toBe('IN_TREATMENT');
    });

    it('throws on invalid transition', () => {
      const c = createTestCase({ treatmentStage: 'CONFIRMED' });
      expect(() => c.advanceTreatmentStage('COMPLETED')).toThrow();
    });
  });
});
