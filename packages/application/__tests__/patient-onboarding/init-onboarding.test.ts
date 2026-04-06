import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiChatSession } from '@medical-crm/domain';
import type { UserEmailState } from '@medical-crm/domain';
import {
  EmailRoleConflictError,
  InitOnboardingUseCase,
  PatientAlreadyExistsError,
} from '../../src/index.js';

describe('InitOnboardingUseCase', () => {
  let useCase: InitOnboardingUseCase;
  let mockPatientRepo: any;
  let mockUserEmailLookupRepo: any;
  let mockCaseRepo: any;
  let mockConversationRepo: any;
  let mockAiChatSessionRepo: any;
  let mockAuthService: any;

  function mockEmailState(state: UserEmailState): void {
    mockUserEmailLookupRepo.findEmailState.mockResolvedValue(state);
  }

  beforeEach(() => {
    mockPatientRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn().mockResolvedValue(null),
      findAuthByEmail: vi.fn(),
      createTempPatient: vi.fn().mockResolvedValue({
        id: 'patient-1',
        patientCode: null,
        preferredLanguage: 'en',
      }),
      updatePasswordHash: vi.fn(),
    };
    mockUserEmailLookupRepo = {
      findEmailState: vi.fn().mockResolvedValue({ state: 'NONE' }),
    };
    mockCaseRepo = {
      save: vi.fn().mockImplementation((entity: any) => Promise.resolve(entity)),
      nextCaseNumber: vi.fn().mockResolvedValue('CASE-2026-0001'),
      findById: vi.fn(),
      findMany: vi.fn(),
      findByPatientId: vi.fn().mockResolvedValue([]),
      countByFilters: vi.fn(),
    };
    mockConversationRepo = {
      findById: vi.fn(),
      findMany: vi.fn(),
      findByPatientId: vi.fn().mockResolvedValue([]),
      save: vi.fn().mockImplementation((conversation: any) => Promise.resolve(conversation)),
    };
    mockAiChatSessionRepo = {
      findBySessionId: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockImplementation((session: any) => Promise.resolve(session)),
      findByDifyConversationId: vi.fn(),
      attachPatient: vi.fn(),
      updateStatus: vi.fn(),
      patchStatus: vi.fn(),
    };
    mockAuthService = {
      createSessionToken: vi.fn().mockResolvedValue('jwt-token-123'),
      createGuestRestoreArtifacts: vi.fn().mockResolvedValue({
        restoreToken: 'restore-token-123',
        restoreCookie: 'restore-cookie-123',
      }),
      verifySessionToken: vi.fn(),
      createMagicLinkToken: vi.fn(),
      verifyMagicLinkToken: vi.fn(),
      verifyPatientEntryToken: vi.fn(),
    };
    useCase = new InitOnboardingUseCase(
      mockPatientRepo,
      mockUserEmailLookupRepo,
      mockCaseRepo,
      mockConversationRepo,
      mockAiChatSessionRepo,
      mockAuthService,
    );
  });

  it('creates a new patient, case, and admin conversation for a truly new email', async () => {
    mockEmailState({ state: 'NONE' });

    const result = await useCase.execute({
      email: 'new@test.com',
      name: 'New User',
      phone: '+1234',
      age: '34',
      gender: 'female',
      country: 'United States',
      whatsapp: '+1 555 0000',
      messenger: '@newuser',
      department: 'Cardiology',
      departmentCode: 'cardiology',
      disease: 'Arrhythmia',
      destination: 'Beijing',
      treatmentTime: 'ASAP',
      preferredLanguage: 'en',
    });

    expect(mockUserEmailLookupRepo.findEmailState).toHaveBeenCalledWith('new@test.com');
    expect(mockPatientRepo.createTempPatient).toHaveBeenCalledOnce();
    expect(mockCaseRepo.findByPatientId).not.toHaveBeenCalled();
    expect(mockCaseRepo.save).toHaveBeenCalledOnce();
    expect(mockConversationRepo.save).toHaveBeenCalledOnce();
    expect(mockConversationRepo.save.mock.calls[0]?.[0]).toMatchObject({
      caseId: result.caseId,
      category: 'ADMIN_PATIENT',
      hospitalId: null,
    });
    expect(result.patientId).toBe('patient-1');
    expect(result.nextStep).toBe('select-hospitals');
    expect(result.token).toBe('jwt-token-123');
    expect(result.restoreToken).toBe('restore-token-123');
    expect(result.isExistingPatient).toBe(false);
    expect(result.widgetChatTarget).toEqual({
      kind: 'CHATBOT_SESSION',
      sessionId: `widget-chat:${result.patientId}:${result.caseId}`,
    });
    expect(mockAiChatSessionRepo.save).toHaveBeenCalledOnce();
    expect(mockAiChatSessionRepo.save.mock.calls[0]?.[0]).toBeInstanceOf(AiChatSession);
    expect(mockAiChatSessionRepo.save.mock.calls[0]?.[0]).toMatchObject({
      sessionId: `widget-chat:${result.patientId}:${result.caseId}`,
      patientId: 'patient-1',
      hospitalType: 'REGULAR',
      status: 'ACTIVE',
    });
  });

  it('allows an authenticated patient session to create a new case when submitting their own email', async () => {
    mockEmailState({ state: 'PATIENT', userId: 'patient-123' });
    mockPatientRepo.findByEmail.mockResolvedValue({
      id: 'patient-123',
      patientCode: 'P123',
      preferredLanguage: 'en',
    });

    const result = await useCase.execute({
      email: 'existing@test.com',
      name: 'Existing Patient',
      phone: '+1234',
      preferredLanguage: 'en',
      authenticatedPatientId: 'patient-123',
    });

    expect(mockPatientRepo.createTempPatient).not.toHaveBeenCalled();
    expect(mockCaseRepo.findByPatientId).not.toHaveBeenCalled();
    expect(mockCaseRepo.save).toHaveBeenCalledOnce();
    expect(mockConversationRepo.save).toHaveBeenCalledOnce();
    expect(result.patientId).toBe('patient-123');
    expect(result.isExistingPatient).toBe(true);
    expect(result.widgetChatTarget).toEqual({
      kind: 'CHATBOT_SESSION',
      sessionId: `widget-chat:${result.patientId}:${result.caseId}`,
    });
  });

  it('rejects an authenticated onboarding submission that tries to fork identity onto a brand-new email', async () => {
    mockEmailState({ state: 'NONE' });

    await expect(useCase.execute({
      email: 'brand-new@test.com',
      name: 'Existing Patient',
      phone: '+1234',
      preferredLanguage: 'en',
      authenticatedPatientId: 'patient-123',
    })).rejects.toBeInstanceOf(PatientAlreadyExistsError);

    expect(mockPatientRepo.createTempPatient).not.toHaveBeenCalled();
    expect(mockCaseRepo.save).not.toHaveBeenCalled();
  });

  it('rejects an existing patient email for unauthenticated public onboarding submissions', async () => {
    mockEmailState({ state: 'PATIENT', userId: 'patient-123' });

    await expect(useCase.execute({
      email: 'existing@test.com',
      name: 'Existing Patient',
      phone: '+1234',
      preferredLanguage: 'en',
    })).rejects.toBeInstanceOf(PatientAlreadyExistsError);

    expect(mockPatientRepo.createTempPatient).not.toHaveBeenCalled();
    expect(mockCaseRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a hospital or admin email with EMAIL_ROLE_CONFLICT', async () => {
    mockEmailState({ state: 'HOSPITAL', userId: 'hospital-123' });

    await expect(useCase.execute({
      email: 'existing-hospital@test.com',
      name: 'Existing Hospital User',
      phone: '+1234',
      preferredLanguage: 'en',
    })).rejects.toBeInstanceOf(EmailRoleConflictError);

    expect(mockPatientRepo.createTempPatient).not.toHaveBeenCalled();
    expect(mockCaseRepo.save).not.toHaveBeenCalled();
  });
});
