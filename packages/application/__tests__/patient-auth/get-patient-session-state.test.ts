import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GetPatientSessionStateUseCase } from '../../src/use-cases/patient-auth/get-patient-session-state.use-case.js';

describe('GetPatientSessionStateUseCase', () => {
  let useCase: GetPatientSessionStateUseCase;
  let mockPatientRepo: any;
  let mockUserRepo: any;
  let mockCaseRepo: any;
  let mockChcRepo: any;
  let mockConversationRepo: any;
  let mockAiChatSessionRepo: any;

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
    mockAiChatSessionRepo = {
      findBySessionId: vi.fn().mockResolvedValue(null),
      findByDifyConversationId: vi.fn(),
      save: vi.fn(),
      attachPatient: vi.fn(),
      updateStatus: vi.fn(),
      patchStatus: vi.fn(),
    };

    useCase = new GetPatientSessionStateUseCase(
      mockPatientRepo,
      mockUserRepo,
      mockCaseRepo,
      mockChcRepo,
      mockConversationRepo,
      mockAiChatSessionRepo,
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
    mockConversationRepo.findByPatientId.mockResolvedValue([
      { id: 'conv-hosp-1', caseId: 'case-2', category: 'HOSPITAL_PATIENT' },
      { id: 'conv-other-case', caseId: 'case-1', category: 'HOSPITAL_PATIENT' },
    ]);
    mockAiChatSessionRepo.findBySessionId.mockResolvedValue({
      sessionId: 'widget-chat:patient-1:case-2',
      statusSnapshot: {
        conversationSummary: 'Patient prefers hospital-2 after reviewing the shortlist.',
      },
    });

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
      nextStep: 'messages-ready',
      selectedHospitalId: null,
      selectedHospitalIds: ['hospital-1', 'hospital-2'],
      customHospitalRequest: 'Ruijin Hospital',
      medicalFormStatus: 'NOT_STARTED',
      medicalFormSkippedAt: null,
      medicalFormSubmittedAt: null,
      medicalFormResponseId: null,
      profileSubmitted: true,
      chatUnlocked: true,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:case-2',
      },
      formalConversationState: {
        activeConversationId: expect.any(String),
        conversationIds: [expect.any(String), 'conv-hosp-1'],
      },
      journeySnapshot: {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'post',
      },
      chatbotOrchestrationState: {
        conversationSummary: 'Patient prefers hospital-2 after reviewing the shortlist.',
      },
    });
    expect(mockAiChatSessionRepo.findBySessionId).toHaveBeenCalledWith('widget-chat:patient-1:case-2');
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
    expect(result.selectedHospitalId).toBeNull();
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
    expect(result.widgetChatTarget).toEqual({
      kind: 'CHATBOT_SESSION',
      sessionId: 'widget-chat:patient-1:case-1',
    });
    expect(result.formalConversationState).toEqual({
      activeConversationId: 'conv-1',
      conversationIds: ['conv-1'],
    });
    expect(result.journeySnapshot).toEqual({
      currentStage: 'EXPLAIN_PROCESS',
      currentPhase: 'active',
    });
    expect(result.chatbotOrchestrationState).toEqual({
      conversationSummary: '',
    });
    expect(mockConversationRepo.save).not.toHaveBeenCalled();
  });

  it('provisions the canonical widget chatbot session on restore when it does not exist yet', async () => {
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
    mockAiChatSessionRepo.findBySessionId.mockResolvedValue(null);
    mockAiChatSessionRepo.save.mockImplementation(async (session: any) => session);

    const result = await useCase.execute({ patientId: 'patient-1' });

    expect(result.widgetChatTarget).toEqual({
      kind: 'CHATBOT_SESSION',
      sessionId: 'widget-chat:patient-1:case-1',
    });
    expect(result.chatbotOrchestrationState).toEqual({
      conversationSummary: '',
    });
    expect(mockAiChatSessionRepo.save).toHaveBeenCalledOnce();
    expect(mockAiChatSessionRepo.save.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'widget-chat:patient-1:case-1',
      patientId: 'patient-1',
      hospitalType: 'REGULAR',
      status: 'ACTIVE',
    });
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
    expect(result.selectedHospitalId).toBe('hospital-1');
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
    expect(result.selectedHospitalId).toBe('hospital-2');
    expect(result.selectedHospitalIds).toEqual(['hospital-2']);
    expect(result.caseId).toBe('case-4');
    expect(result.journeySnapshot).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'post',
    });
  });

  it('restores COLLECT_MEDICAL_INPUTS.active when chatbot truth shows intake is in progress', async () => {
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
      phone: '+1234',
      preferredLanguage: 'en',
      hospitalId: null,
      notificationSettings: null,
    });
    mockCaseRepo.findByPatientId.mockResolvedValue([
      {
        id: 'case-6',
        patientName: 'Hao Wang',
        patientCountry: 'China',
        structuredData: null,
        createdAt: new Date('2026-03-07T00:00:00Z'),
      },
    ]);
    mockChcRepo.findByCaseId.mockResolvedValue([]);
    mockConversationRepo.findByPatientId.mockResolvedValue([
      { id: 'conv-6', caseId: 'case-6', category: 'ADMIN_PATIENT' },
    ]);
    mockAiChatSessionRepo.findBySessionId.mockResolvedValue({
      sessionId: 'widget-chat:patient-1:case-6',
      statusSnapshot: {
        formStatus: 'IN_PROGRESS',
        docUploadStatus: 'REQUESTED',
        conversationSummary: 'Patient is filling out the intake.',
      },
    });

    const result = await useCase.execute({ patientId: 'patient-1' });

    expect(result.journeySnapshot).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'active',
    });
  });

  it('restores ONLINE_CONSULT.active when the consult invitation is already underway', async () => {
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
      phone: '+1234',
      preferredLanguage: 'en',
      hospitalId: null,
      notificationSettings: null,
    });
    mockCaseRepo.findByPatientId.mockResolvedValue([
      {
        id: 'case-7',
        patientName: 'Hao Wang',
        patientCountry: 'China',
        structuredData: {
          patientHospitalSelection: {
            medicalFormStatus: 'SUBMITTED',
          },
        },
        createdAt: new Date('2026-03-08T00:00:00Z'),
      },
    ]);
    mockChcRepo.findByCaseId.mockResolvedValue([
      { hospitalId: 'hospital-3', removedAt: null },
    ]);
    mockConversationRepo.findByPatientId.mockResolvedValue([
      { id: 'conv-7', caseId: 'case-7', category: 'ADMIN_PATIENT' },
    ]);
    mockAiChatSessionRepo.findBySessionId.mockResolvedValue({
      sessionId: 'widget-chat:patient-1:case-7',
      statusSnapshot: {
        recommendationStatus: 'PRELIMINARY_SHOWN',
        consultationStatus: 'READY',
        conversationSummary: 'Consult scheduling is available.',
      },
    });

    const result = await useCase.execute({ patientId: 'patient-1' });

    expect(result.journeySnapshot).toEqual({
      currentStage: 'ONLINE_CONSULT',
      currentPhase: 'active',
    });
  });

  it('restores RECOMMENDATION.active when persisted package status shows recommendation content was already shown', async () => {
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
      phone: '+1234',
      preferredLanguage: 'en',
      hospitalId: null,
      notificationSettings: null,
    });
    mockCaseRepo.findByPatientId.mockResolvedValue([
      {
        id: 'case-8',
        patientName: 'Hao Wang',
        patientCountry: 'China',
        structuredData: null,
        createdAt: new Date('2026-03-09T00:00:00Z'),
      },
    ]);
    mockChcRepo.findByCaseId.mockResolvedValue([]);
    mockConversationRepo.findByPatientId.mockResolvedValue([
      { id: 'conv-8', caseId: 'case-8', category: 'ADMIN_PATIENT' },
    ]);
    mockAiChatSessionRepo.findBySessionId.mockResolvedValue({
      sessionId: 'widget-chat:patient-1:case-8',
      statusSnapshot: {
        packageStatus: 'SHOWN',
        conversationSummary: 'Package options were already presented.',
      },
    });

    const result = await useCase.execute({ patientId: 'patient-1' });

    expect(result.journeySnapshot).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'active',
    });
  });

  it('does not let completed historical handoff override a newer consult phase on restore', async () => {
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
      phone: '+1234',
      preferredLanguage: 'en',
      hospitalId: null,
      notificationSettings: null,
    });
    mockCaseRepo.findByPatientId.mockResolvedValue([
      {
        id: 'case-9',
        patientName: 'Hao Wang',
        patientCountry: 'China',
        structuredData: {
          patientHospitalSelection: {
            medicalFormStatus: 'SUBMITTED',
          },
        },
        createdAt: new Date('2026-03-10T00:00:00Z'),
      },
    ]);
    mockChcRepo.findByCaseId.mockResolvedValue([
      { hospitalId: 'hospital-4', removedAt: null },
    ]);
    mockConversationRepo.findByPatientId.mockResolvedValue([
      { id: 'conv-9', caseId: 'case-9', category: 'ADMIN_PATIENT' },
    ]);
    mockAiChatSessionRepo.findBySessionId.mockResolvedValue({
      sessionId: 'widget-chat:patient-1:case-9',
      statusSnapshot: {
        consultationStatus: 'READY',
        handoffStatus: 'COMPLETED',
        conversationSummary: 'A prior handoff closed before consult resumed.',
      },
    });

    const result = await useCase.execute({ patientId: 'patient-1' });

    expect(result.journeySnapshot).toEqual({
      currentStage: 'ONLINE_CONSULT',
      currentPhase: 'active',
    });
  });

  it('uses only active CHC truth when multiple hospitals are selected, ignoring stale chat snapshot state', async () => {
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
        id: 'case-5',
        patientName: 'Hao Wang',
        patientCountry: 'China',
        structuredData: null,
        createdAt: new Date('2026-03-06T00:00:00Z'),
      },
    ]);
    mockChcRepo.findByCaseId.mockResolvedValue([
      { hospitalId: 'hospital-1', removedAt: null },
      { hospitalId: 'hospital-2', removedAt: null },
    ]);
    mockConversationRepo.findByPatientId.mockResolvedValue([
      { id: 'conv-5', caseId: 'case-5', category: 'ADMIN_PATIENT' },
    ]);
    mockAiChatSessionRepo.findBySessionId.mockResolvedValue({
      sessionId: 'widget-chat:patient-1:case-5',
      statusSnapshot: {
        conversationSummary: 'Previously selected a hospital that is no longer active.',
      },
    });

    const result = await useCase.execute({ patientId: 'patient-1' });

    expect(result.selectedHospitalId).toBeNull();
    expect(result.selectedHospitalIds).toEqual(['hospital-1', 'hospital-2']);
    expect(result.chatbotOrchestrationState).toEqual({
      conversationSummary: 'Previously selected a hospital that is no longer active.',
    });
  });
});
