import { describe, it, expect } from 'vitest';
import { CaseAssignmentService } from '../src/services/case-assignment.service.js';
import { Case } from '../src/entities/case.entity.js';
import { CaseNumber } from '../src/value-objects/case-number.js';

describe('CaseAssignmentService', () => {
  const service = new CaseAssignmentService();

  function createTestCase(overrides: Record<string, unknown> = {}) {
    return new Case({
      id: 'case-1',
      caseNumber: new CaseNumber('CASE-2026-0001'),
      patientId: 'patient-1',
      patientName: 'John Doe',
      patientCountry: null,
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
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
  }

  it('passes for ACTIVE hospital and unassigned case', () => {
    const c = createTestCase();
    expect(() => service.validateAssignment(c, 'h-1', 'ACTIVE')).not.toThrow();
  });

  it('throws if hospital is PENDING', () => {
    const c = createTestCase();
    expect(() => service.validateAssignment(c, 'h-1', 'PENDING')).toThrow(
      'Hospital must be ACTIVE',
    );
  });

  it('throws if hospital is INACTIVE', () => {
    const c = createTestCase();
    expect(() => service.validateAssignment(c, 'h-1', 'INACTIVE')).toThrow(
      'Hospital must be ACTIVE',
    );
  });

  it('passes if case already assigned but stage is PENDING_ASSIGNMENT', () => {
    const c = createTestCase({ assignedHospitalId: 'old-hospital', stage: 'PENDING_ASSIGNMENT' });
    expect(() => service.validateAssignment(c, 'h-2', 'ACTIVE')).not.toThrow();
  });

  it('throws if case is assigned and stage is past PENDING_ASSIGNMENT', () => {
    const c = createTestCase({ assignedHospitalId: 'old-hospital', stage: 'HOSPITAL_CONTACTED' });
    expect(() => service.validateAssignment(c, 'h-2', 'ACTIVE')).toThrow(
      'Case is already assigned',
    );
  });
});
