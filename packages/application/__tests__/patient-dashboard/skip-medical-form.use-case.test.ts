import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SkipMedicalFormUseCase } from '../../src/use-cases/patient-dashboard/skip-medical-form.use-case.js';

function makeCaseEntity(overrides: Record<string, unknown> = {}) {
  return {
    id: 'case-1',
    patientId: 'patient-1',
    structuredData: null as Record<string, unknown> | null,
    ...overrides,
  };
}

describe('SkipMedicalFormUseCase', () => {
  let useCase: SkipMedicalFormUseCase;
  let mockCaseRepo: any;
  let caseEntity: ReturnType<typeof makeCaseEntity>;

  beforeEach(() => {
    caseEntity = makeCaseEntity();
    mockCaseRepo = {
      findById: vi.fn().mockResolvedValue(caseEntity),
      save: vi.fn().mockImplementation(async (entity: any) => entity),
    };
    useCase = new SkipMedicalFormUseCase(mockCaseRepo);
  });

  it('marks the case medical form as SKIPPED with a timestamp', async () => {
    await useCase.execute({ caseId: 'case-1', patientId: 'patient-1' });

    expect(mockCaseRepo.save).toHaveBeenCalledTimes(1);
    const saved = mockCaseRepo.save.mock.calls[0][0];
    const selection = saved.structuredData?.patientHospitalSelection;
    expect(selection?.medicalFormStatus).toBe('SKIPPED');
    expect(typeof selection?.medicalFormSkippedAt).toBe('string');
    // Verify it's a valid ISO date string
    expect(new Date(selection.medicalFormSkippedAt).toISOString()).toBe(selection.medicalFormSkippedAt);
  });

  it('preserves existing structuredData fields when skipping', async () => {
    caseEntity.structuredData = {
      patientHospitalSelection: {
        selectedHospitalIds: ['h1', 'h2'],
        customHospitalRequest: 'some request',
      },
    };

    await useCase.execute({ caseId: 'case-1', patientId: 'patient-1' });

    const saved = mockCaseRepo.save.mock.calls[0][0];
    const selection = saved.structuredData?.patientHospitalSelection;
    expect(selection?.medicalFormStatus).toBe('SKIPPED');
    expect(selection?.selectedHospitalIds).toEqual(['h1', 'h2']);
    expect(selection?.customHospitalRequest).toBe('some request');
  });

  it('throws NotFoundError when case does not exist', async () => {
    mockCaseRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ caseId: 'case-missing', patientId: 'patient-1' }),
    ).rejects.toThrow('Case case-missing not found');
  });

  it('throws ForbiddenError when patient does not own the case', async () => {
    await expect(
      useCase.execute({ caseId: 'case-1', patientId: 'different-patient' }),
    ).rejects.toThrow('Access denied to this case');
    expect(mockCaseRepo.save).not.toHaveBeenCalled();
  });

  it('is a no-op if medical form is already SUBMITTED', async () => {
    caseEntity.structuredData = {
      patientHospitalSelection: {
        medicalFormStatus: 'SUBMITTED',
        medicalFormSubmittedAt: '2024-01-01T00:00:00.000Z',
      },
    };

    await useCase.execute({ caseId: 'case-1', patientId: 'patient-1' });

    // save should NOT be called — submitted state is preserved
    expect(mockCaseRepo.save).not.toHaveBeenCalled();
  });

  it('overwrites a prior SKIPPED state with a fresh SKIPPED timestamp', async () => {
    const oldTimestamp = '2024-01-01T00:00:00.000Z';
    caseEntity.structuredData = {
      patientHospitalSelection: {
        medicalFormStatus: 'SKIPPED',
        medicalFormSkippedAt: oldTimestamp,
      },
    };

    await useCase.execute({ caseId: 'case-1', patientId: 'patient-1' });

    const saved = mockCaseRepo.save.mock.calls[0][0];
    const selection = saved.structuredData?.patientHospitalSelection;
    expect(selection?.medicalFormStatus).toBe('SKIPPED');
    // timestamp should be updated (not equal to the old one)
    expect(selection?.medicalFormSkippedAt).not.toBe(oldTimestamp);
  });
});
