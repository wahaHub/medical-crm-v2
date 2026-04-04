import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetPatientSessionStateUseCase } from '../../src/use-cases/patient-auth/get-patient-session-state.use-case.js';

describe('GetPatientSessionStateUseCase', () => {
  let useCase: GetPatientSessionStateUseCase;
  let mockPatientRepo: any;
  let mockUserRepo: any;
  let mockCaseRepo: any;
  let mockChcRepo: any;
  let mockConversationRepo: any;

  beforeEach(() => {
    mockPatientRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      createTempPatient: vi.fn(),
      updatePasswordHash: vi.fn(),
    };
    mockUserRepo = {
      findById: vi.fn(),
    };
    mockCaseRepo = {
      findById: vi.fn(),
      findMany: vi.fn(),
      findByPatientId: vi.fn(),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };
    mockChcRepo = {
      findById: vi.fn(),
      findByCaseAndHospital: vi.fn(),
      findByCaseId: vi.fn(),
      findByHospitalId: vi.fn(),
      save: vi.fn(),
      rejectOthersByCaseExcept: vi.fn(),
    };
    mockConversationRepo = {
      findById: vi.fn(),
      findMany: vi.fn(),
      findByPatientId: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
    };

    useCase = new GetPatientSessionStateUseCase(
      mockPatientRepo,
      mockUserRepo,
      mockCaseRepo,
      mockChcRepo,
      mockConversationRepo,
    );
  });

  it('returns a thin patient session state with selected hospitals from the latest case', async () => {
    mockPatientRepo.findById.mockResolvedValue({
      id: 'patient-1',
      patientCode: 'P001',
      preferredLanguage: 'en',
    });
    mockUserRepo.findById.mockResolvedValue({
      id: 'patient-1',
      email: 'hao@example.com',
      name: 'Legacy Name',
      role: 'PATIENT',
      phone: '+1000000000',
      preferredLanguage: 'en',
      hospitalId: null,
      notificationSettings: null,
    });
    mockCaseRepo.findByPatientId.mockResolvedValue([
      {
        id: 'case-2',
        patientName: 'Hao Wang',
        patientCountry: 'Beijing',
        structuredData: {
          entryProfile: {
            name: 'Hao Wang',
            email: 'hao@example.com',
            phone: '+123456789',
            age: '34',
            gender: 'male',
            country: 'Singapore',
            whatsapp: '+65 11111111',
            messenger: '@hao',
            department: 'Cardiology',
            departmentCode: 'cardiology',
            disease: 'Arrhythmia',
            destination: 'Beijing',
            treatmentTime: 'Within 1 month',
          },
          patientHospitalSelection: {
            customHospitalRequest: 'Ruijin Hospital',
          },
        },
        createdAt: new Date('2026-03-02T00:00:00Z'),
      },
      { id: 'case-1', createdAt: new Date('2026-03-01T00:00:00Z') },
    ]);
    mockChcRepo.findByCaseId.mockResolvedValue([
      { hospitalId: 'hospital-1', removedAt: null },
      { hospitalId: 'hospital-2', removedAt: null },
      { hospitalId: 'hospital-3', removedAt: new Date('2026-03-03T00:00:00Z') },
    ]);

    const result = await useCase.execute({ patientId: 'patient-1' });

    expect(result).toEqual({
      id: 'patient-1',
      patientId: 'patient-1',
      name: 'Hao Wang',
      email: 'hao@example.com',
      phone: '+123456789',
      age: '34',
      gender: 'male',
      country: 'Singapore',
      whatsapp: '+65 11111111',
      messenger: '@hao',
      department: 'Cardiology',
      departmentCode: 'cardiology',
      disease: 'Arrhythmia',
      destination: 'Beijing',
      treatmentTime: 'Within 1 month',
      patientCode: 'P001',
      preferredLanguage: 'en',
      caseId: 'case-2',
      nextStep: 'select-hospitals',
      selectedHospitalIds: ['hospital-1', 'hospital-2'],
      customHospitalRequest: 'Ruijin Hospital',
      medicalFormStatus: 'NOT_STARTED',
      medicalFormSkippedAt: null,
      medicalFormSubmittedAt: null,
      medicalFormResponseId: null,
      profileSubmitted: true,
      chatUnlocked: true,
    });
    expect(mockConversationRepo.findByPatientId).toHaveBeenCalledWith('patient-1');
    expect(mockConversationRepo.save).toHaveBeenCalledOnce();
  });

  it('returns select-hospitals when the patient has no active hospital selections', async () => {
    mockPatientRepo.findById.mockResolvedValue({
      id: 'patient-1',
      patientCode: null,
      preferredLanguage: 'en',
    });
    mockUserRepo.findById.mockResolvedValue({
      id: 'patient-1',
      email: 'hao@example.com',
      name: 'Hao Wang',
      role: 'PATIENT',
      phone: '+1234',
      preferredLanguage: 'en',
      hospitalId: null,
      notificationSettings: null,
    });
    mockCaseRepo.findByPatientId.mockResolvedValue([
      {
        id: 'case-1',
        patientName: 'Hao Wang',
        patientCountry: 'Shanghai',
        structuredData: null,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ]);
    mockChcRepo.findByCaseId.mockResolvedValue([]);
    mockConversationRepo.findByPatientId.mockResolvedValue([
      { id: 'conv-1', caseId: 'case-1', category: 'ADMIN_PATIENT' },
    ]);

    const result = await useCase.execute({ patientId: 'patient-1' });

    expect(result.nextStep).toBe('select-hospitals');
    expect(result.selectedHospitalIds).toEqual([]);
    expect(result.customHospitalRequest).toBeNull();
    expect(result.caseId).toBe('case-1');
    expect(result.phone).toBe('+1234');
    expect(result.age).toBeNull();
    expect(result.destination).toBeNull();
    expect(result.gender).toBeNull();
    expect(result.country).toBe('Shanghai');
    expect(result.whatsapp).toBeNull();
    expect(result.messenger).toBeNull();
    expect(result.treatmentTime).toBeNull();
    expect(result.medicalFormStatus).toBe('NOT_STARTED');
    expect(result.medicalFormSkippedAt).toBeNull();
    expect(result.medicalFormSubmittedAt).toBeNull();
    expect(result.medicalFormResponseId).toBeNull();
    expect(mockConversationRepo.save).not.toHaveBeenCalled();
  });

  it('returns medical-form metadata when the patient has skipped the medical form', async () => {
    const skippedAt = new Date('2026-03-05T10:00:00Z');
    mockPatientRepo.findById.mockResolvedValue({
      id: 'patient-1',
      patientCode: 'P001',
      preferredLanguage: 'en',
    });
    mockUserRepo.findById.mockResolvedValue({
      id: 'patient-1',
      email: 'hao@example.com',
      name: 'Hao Wang',
      role: 'PATIENT',
      phone: null,
      preferredLanguage: 'en',
      hospitalId: null,
      notificationSettings: null,
    });
    mockCaseRepo.findByPatientId.mockResolvedValue([
      {
        id: 'case-3',
        patientName: 'Hao Wang',
        patientCountry: 'China',
        structuredData: {
          patientHospitalSelection: {
            medicalFormStatus: 'SKIPPED',
            medicalFormSkippedAt: skippedAt.toISOString(),
            medicalFormSubmittedAt: null,
            medicalFormResponseId: null,
          },
        },
        createdAt: new Date('2026-03-04T00:00:00Z'),
      },
    ]);
    mockChcRepo.findByCaseId.mockResolvedValue([
      { hospitalId: 'hospital-1', removedAt: null },
    ]);
    mockConversationRepo.findByPatientId.mockResolvedValue([
      { id: 'conv-1', caseId: 'case-3', category: 'ADMIN_PATIENT' },
    ]);

    const result = await useCase.execute({ patientId: 'patient-1' });

    expect(result.medicalFormStatus).toBe('SKIPPED');
    expect(result.medicalFormSkippedAt).toEqual(skippedAt);
    expect(result.medicalFormSubmittedAt).toBeNull();
    expect(result.medicalFormResponseId).toBeNull();
    expect(result.selectedHospitalIds).toEqual(['hospital-1']);
    expect(result.caseId).toBe('case-3');
  });

  it('returns medical-form metadata including response id when the patient has submitted the medical form', async () => {
    const submittedAt = new Date('2026-03-06T12:00:00Z');
    mockPatientRepo.findById.mockResolvedValue({
      id: 'patient-1',
      patientCode: 'P001',
      preferredLanguage: 'zh',
    });
    mockUserRepo.findById.mockResolvedValue({
      id: 'patient-1',
      email: 'hao@example.com',
      name: 'Hao Wang',
      role: 'PATIENT',
      phone: null,
      preferredLanguage: 'zh',
      hospitalId: null,
      notificationSettings: null,
    });
    mockCaseRepo.findByPatientId.mockResolvedValue([
      {
        id: 'case-4',
        patientName: 'Hao Wang',
        patientCountry: 'China',
        structuredData: {
          patientHospitalSelection: {
            medicalFormStatus: 'SUBMITTED',
            medicalFormSkippedAt: null,
            medicalFormSubmittedAt: submittedAt.toISOString(),
            medicalFormResponseId: 'form-response-abc123',
          },
        },
        createdAt: new Date('2026-03-05T00:00:00Z'),
      },
    ]);
    mockChcRepo.findByCaseId.mockResolvedValue([
      { hospitalId: 'hospital-2', removedAt: null },
    ]);
    mockConversationRepo.findByPatientId.mockResolvedValue([
      { id: 'conv-2', caseId: 'case-4', category: 'ADMIN_PATIENT' },
    ]);

    const result = await useCase.execute({ patientId: 'patient-1' });

    expect(result.medicalFormStatus).toBe('SUBMITTED');
    expect(result.medicalFormSkippedAt).toBeNull();
    expect(result.medicalFormSubmittedAt).toEqual(submittedAt);
    expect(result.medicalFormResponseId).toBe('form-response-abc123');
    expect(result.selectedHospitalIds).toEqual(['hospital-2']);
    expect(result.caseId).toBe('case-4');
  });
});
