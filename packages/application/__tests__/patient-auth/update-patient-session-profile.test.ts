import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdatePatientSessionProfileUseCase } from '../../src/use-cases/patient-auth/update-patient-session-profile.use-case.js';

describe('UpdatePatientSessionProfileUseCase', () => {
  let useCase: UpdatePatientSessionProfileUseCase;
  let mockCaseRepo: any;

  beforeEach(() => {
    mockCaseRepo = {
      findByPatientId: vi.fn(),
      save: vi.fn().mockImplementation(async (caseEntity: any) => caseEntity),
    };

    useCase = new UpdatePatientSessionProfileUseCase(mockCaseRepo);
  });

  it('persists editable intake profile fields on the latest patient case', async () => {
    const olderCase = {
      id: 'case-older',
      patientId: 'patient-1',
      structuredData: {
        entryProfile: {
          age: '41',
        },
      },
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
    };
    const latestCase = {
      id: 'case-latest',
      patientId: 'patient-1',
      patientName: 'Existing Name',
      patientCountry: 'China',
      structuredData: {
        entryProfile: {
          name: 'Existing Name',
          email: 'liuxue8901@gmail.com',
          age: '42',
          country: 'China',
        },
        patientHospitalSelection: {
          customHospitalRequest: 'Ruijin',
        },
      },
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
    };
    mockCaseRepo.findByPatientId.mockResolvedValue([olderCase, latestCase]);

    const result = await useCase.execute({
      patientId: 'patient-1',
      profile: {
        age: '43',
        country: 'Singapore',
      },
    });

    expect(result).toBe(latestCase);
    expect(mockCaseRepo.save).toHaveBeenCalledWith(latestCase);
    expect(latestCase.structuredData).toEqual({
      entryProfile: {
        name: 'Existing Name',
        email: 'liuxue8901@gmail.com',
        age: '43',
        country: 'Singapore',
      },
      patientHospitalSelection: {
        customHospitalRequest: 'Ruijin',
      },
    });
    expect(olderCase.structuredData.entryProfile.age).toBe('41');
  });
});
