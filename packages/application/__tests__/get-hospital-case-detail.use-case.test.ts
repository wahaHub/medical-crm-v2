import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetHospitalCaseDetailUseCase } from '../src/use-cases/cases/get-hospital-case-detail.use-case.js';
import type {
  ICaseRepository,
  ICaseProgressRepository,
  IDocumentRepository,
  IStorageService,
  IPatientRepository,
  IConversationRepository,
  IMessageRepository,
  ICHCRepository,
} from '@medical-crm/domain';
import { Case, CaseNumber, CaseProgress, Conversation, Document, Message } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('GetHospitalCaseDetailUseCase', () => {
  let useCase: GetHospitalCaseDetailUseCase;
  let mockCaseRepo: ICaseRepository;
  let mockProgressRepo: ICaseProgressRepository;
  let mockDocumentRepo: IDocumentRepository;
  let mockStorageService: IStorageService;
  let mockPatientRepo: IPatientRepository;
  let mockConversationRepo: IConversationRepository;
  let mockMessageRepo: IMessageRepository;
  let mockChcRepo: ICHCRepository;

  const adminActor: Actor = {
    userId: 'admin-1',
    email: 'admin@test.com',
    role: 'ADMIN',
    hospitalId: null,
  };

  const hospitalActor: Actor = {
    userId: 'hospital-1',
    email: 'hospital@test.com',
    role: 'HOSPITAL',
    hospitalId: 'hosp-1',
  };

  const otherHospitalActor: Actor = {
    userId: 'hospital-2',
    email: 'other@test.com',
    role: 'HOSPITAL',
    hospitalId: 'hosp-2',
  };

  const mockCase = new Case({
    id: 'case-id-1',
    caseNumber: new CaseNumber('CASE-2026-0042'),
    patientId: 'patient-1',
    patientName: 'Jane Doe',
    patientCountry: 'CN',
    patientLanguage: 'zh',
    assignedHospitalId: 'hosp-1',
    primaryDiagnosis: 'Double eyelid surgery',
    diagnosisCode: 'H02.3',
    symptoms: ['drooping eyelids'],
    medicalHistory: 'No known allergies',
    aiSummary: null,
    aiSummaryLanguage: null,
    riskLevel: null,
    status: 'ACTIVE',
    stage: 'TRANSFERRED_TO_HOSPITAL',
    assignedAt: new Date('2026-01-15T10:00:00Z'),
    createdAt: new Date('2026-01-10T08:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
  });

  const mockProgressDiagnosis = new CaseProgress({
    id: 'prog-1',
    caseId: 'case-id-1',
    title: 'Diagnosis: Ptosis',
    description: 'Initial diagnosis',
    progressType: 'STATUS_CHANGE',
    metadata: { kind: 'diagnosis', icdCode: 'H02.3', severity: 'moderate' },
    recordedAt: new Date('2026-01-16T09:00:00Z'),
    recordedById: 'doctor-1',
  });

  const mockProgressPhoneCall = new CaseProgress({
    id: 'prog-2',
    caseId: 'case-id-1',
    title: 'Follow-up call',
    description: null,
    progressType: 'STATUS_CHANGE',
    metadata: { kind: 'phone_call', callResult: 'scheduled', summary: 'Patient agreed to surgery' },
    recordedAt: new Date('2026-01-17T11:00:00Z'),
    recordedById: 'staff-1',
  });

  const mockProgressConsultation = new CaseProgress({
    id: 'prog-3',
    caseId: 'case-id-1',
    title: 'Video consultation',
    description: 'Pre-surgical video call',
    progressType: 'VIDEO_CONSULTATION',
    metadata: null,
    recordedAt: new Date('2026-01-18T14:00:00Z'),
    recordedById: 'doctor-1',
  });

  const mockDocument = new Document({
    id: 'doc-1',
    caseId: 'case-id-1',
    uploadedById: 'patient-1',
    fileName: 'xray.jpg',
    fileSize: 204800,
    mimeType: 'image/jpeg',
    storageKey: 'cases/case-id-1/xray.jpg',
    documentType: 'IMAGING',
    sensitivity: 'PHI_HIGH',
    language: 'zh',
    isTranslated: false,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-11T10:00:00Z'),
    updatedAt: new Date('2026-01-11T10:00:00Z'),
  });

  const hospitalConversation = new Conversation({
    id: 'conv-hospital',
    caseId: 'case-id-1',
    category: 'HOSPITAL_PATIENT',
    title: 'Hospital thread',
    hospitalId: 'hosp-1',
    lastMessageId: 'msg-hospital-1',
    lastMessageAt: new Date('2026-01-18T10:00:00Z'),
    lastMessagePreview: 'We can schedule your consultation',
    lastSenderId: 'hospital-1',
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-18T10:00:00Z'),
  });

  const adminPatientConversation = new Conversation({
    id: 'conv-admin',
    caseId: 'case-id-1',
    category: 'ADMIN_PATIENT',
    title: 'Admin thread',
    hospitalId: null,
    lastMessageId: 'msg-admin-1',
    lastMessageAt: new Date('2026-01-17T08:00:00Z'),
    lastMessagePreview: 'Please upload your CT report',
    lastSenderId: 'admin-1',
    createdAt: new Date('2026-01-12T08:00:00Z'),
    updatedAt: new Date('2026-01-17T08:00:00Z'),
  });

  const hospitalMessage = new Message({
    id: 'msg-hospital-1',
    conversationId: 'conv-hospital',
    senderId: 'hospital-1',
    senderRole: 'HOSPITAL',
    senderName: 'Hospital Team',
    content: 'We can schedule your consultation next week.',
    originalLanguage: 'en',
    translatedContent: '我们可以安排下周会诊。',
    messageType: 'TEXT',
    moderationStatus: 'ALLOWED',
    attachments: [
      {
        fileName: 'hospital-plan.pdf',
        fileSize: 10240,
        mimeType: 'application/pdf',
        storageKey: 'messages/case-id-1/hospital-plan.pdf',
      },
    ],
    aiSummary: null,
    createdAt: new Date('2026-01-18T10:00:00Z'),
  });

  const adminMessage = new Message({
    id: 'msg-admin-1',
    conversationId: 'conv-admin',
    senderId: 'admin-1',
    senderRole: 'ADMIN',
    senderName: 'Medora AI',
    content: 'Please upload your latest CT report.',
    originalLanguage: 'en',
    translatedContent: '请上传你最新的 CT 报告。',
    messageType: 'FILE',
    moderationStatus: 'ALLOWED',
    attachments: [
      {
        fileName: 'ct-report.pdf',
        fileSize: 20480,
        mimeType: 'application/pdf',
        storageKey: 'messages/case-id-1/ct-report.pdf',
      },
    ],
    aiSummary: null,
    createdAt: new Date('2026-01-17T08:00:00Z'),
  });

  beforeEach(() => {
    mockCaseRepo = {
      findById: vi.fn().mockResolvedValue(mockCase),
      findMany: vi.fn(),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };

    mockProgressRepo = {
      findByCaseId: vi.fn().mockResolvedValue([
        mockProgressDiagnosis,
        mockProgressPhoneCall,
        mockProgressConsultation,
      ]),
      save: vi.fn(),
    };

    mockDocumentRepo = {
      findById: vi.fn(),
      findByCaseId: vi.fn().mockResolvedValue([mockDocument]),
      save: vi.fn(),
      softDelete: vi.fn(),
    };

    mockStorageService = {
      createPresignedUpload: vi.fn(),
      getSignedUrl: vi.fn(),
      getSignedUrls: vi.fn().mockResolvedValue({
        'cases/case-id-1/xray.jpg': 'https://storage.example.com/signed/xray.jpg',
        'messages/case-id-1/hospital-plan.pdf': 'https://storage.example.com/signed/hospital-plan.pdf',
        'messages/case-id-1/ct-report.pdf': 'https://storage.example.com/signed/ct-report.pdf',
      }),
    };

    mockPatientRepo = {
      findById: vi.fn().mockResolvedValue({ id: 'patient-1', patientCode: 'PAT-0042' }),
      findByEmail: vi.fn(),
      createTempPatient: vi.fn(),
      updatePasswordHash: vi.fn(),
    };

    mockConversationRepo = {
      findById: vi.fn(),
      findMany: vi.fn().mockResolvedValue({
        data: [hospitalConversation],
        total: 1,
        page: 1,
        limit: 100,
        totalPages: 1,
        hasMore: false,
      }),
      findAdminPatientByCaseId: vi.fn().mockResolvedValue(adminPatientConversation),
      save: vi.fn(),
    };

    mockMessageRepo = {
      findById: vi.fn(),
      findByConversationId: vi.fn().mockImplementation((conversationId: string) => {
        if (conversationId === 'conv-hospital') {
          return Promise.resolve({
            data: [hospitalMessage],
            total: 1,
            page: 1,
            limit: 100,
            totalPages: 1,
            hasMore: false,
          });
        }

        if (conversationId === 'conv-admin') {
          return Promise.resolve({
            data: [adminMessage],
            total: 1,
            page: 1,
            limit: 100,
            totalPages: 1,
            hasMore: false,
          });
        }

        return Promise.resolve({
          data: [],
          total: 0,
          page: 1,
          limit: 100,
          totalPages: 0,
          hasMore: false,
        });
      }),
      findPendingReview: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    };
    mockChcRepo = {
      findById: vi.fn(),
      findByCaseAndHospital: vi.fn().mockResolvedValue(null),
      findByCaseId: vi.fn(),
      findByHospitalId: vi.fn(),
      save: vi.fn(),
      rejectOthersByCaseExcept: vi.fn(),
    };

    useCase = new GetHospitalCaseDetailUseCase(
      mockCaseRepo,
      mockProgressRepo,
      mockDocumentRepo,
      mockStorageService,
      mockPatientRepo,
      mockConversationRepo,
      mockMessageRepo,
      mockChcRepo,
    );
  });

  it('returns aggregated HospitalCaseDetailDTO for ADMIN actor', async () => {
    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.id).toBe('case-id-1');
    expect(result.caseNumber).toBe('CASE-2026-0042');
    expect(result.patient.id).toBe('patient-1');
    expect(result.patient.name).toBe('Jane Doe');
    expect(result.patient.code).toBe('PAT-0042');
    expect(result.patient.country).toBe('CN');
    expect(result.patient.language).toBe('zh');
  });

  it('returns medical condition fields', async () => {
    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.medicalCondition.primaryDiagnosis).toBe('Double eyelid surgery');
    expect(result.medicalCondition.diagnosisCode).toBe('H02.3');
    expect(result.medicalCondition.symptoms).toEqual(['drooping eyelids']);
    expect(result.medicalCondition.medicalHistory).toBe('No known allergies');
  });

  it('splits progress into diagnoses, phoneCalls, and consultationHistory', async () => {
    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.diagnoses).toHaveLength(1);
    expect(result.diagnoses[0]!.id).toBe('prog-1');
    expect(result.diagnoses[0]!.icdCode).toBe('H02.3');
    expect(result.diagnoses[0]!.severity).toBe('moderate');

    expect(result.phoneCalls).toHaveLength(1);
    expect(result.phoneCalls[0]!.id).toBe('prog-2');
    expect(result.phoneCalls[0]!.callResult).toBe('scheduled');

    expect(result.consultationHistory).toHaveLength(1);
    expect(result.consultationHistory[0]!.id).toBe('prog-3');
    expect(result.consultationHistory[0]!.description).toBe('Pre-surgical video call');
  });

  it('includes documents with signed URLs', async () => {
    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.documents).toHaveLength(3);
    expect(result.documents[0]!.id).toBe('doc-1');
    expect(result.documents[0]!.fileName).toBe('xray.jpg');
    expect(result.documents[0]!.downloadUrl).toBe('https://storage.example.com/signed/xray.jpg');
    expect(result.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fileName: 'hospital-plan.pdf',
        documentType: 'MESSAGE_ATTACHMENT',
        downloadUrl: 'https://storage.example.com/signed/hospital-plan.pdf',
      }),
      expect.objectContaining({
        fileName: 'ct-report.pdf',
        documentType: 'MESSAGE_ATTACHMENT',
        downloadUrl: 'https://storage.example.com/signed/ct-report.pdf',
      }),
    ]));
    expect(mockStorageService.getSignedUrls).toHaveBeenCalledWith([
      'cases/case-id-1/xray.jpg',
      'messages/case-id-1/ct-report.pdf',
      'messages/case-id-1/hospital-plan.pdf',
    ]);
  });

  it('returns chat attachment documents even when the case has no standalone case documents', async () => {
    mockDocumentRepo.findByCaseId = vi.fn().mockResolvedValue([]);

    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.documents).toHaveLength(2);
    expect(result.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ fileName: 'ct-report.pdf' }),
      expect.objectContaining({ fileName: 'hospital-plan.pdf' }),
    ]));
    expect(mockStorageService.getSignedUrls).toHaveBeenCalledWith([
      'messages/case-id-1/ct-report.pdf',
      'messages/case-id-1/hospital-plan.pdf',
    ]);
  });

  it('fetches all data in parallel (caseRepo, progressRepo, documentRepo, patientRepo)', async () => {
    await useCase.execute('case-id-1', adminActor);

    expect(mockProgressRepo.findByCaseId).toHaveBeenCalledWith('case-id-1');
    expect(mockDocumentRepo.findByCaseId).toHaveBeenCalledWith('case-id-1');
    expect(mockPatientRepo.findById).toHaveBeenCalledWith('patient-1');
  });

  it('includes separate message sections for admin/patient and hospital/patient conversations', async () => {
    const result = await useCase.execute('case-id-1', hospitalActor);

    expect(result.messageSections).toEqual([
      expect.objectContaining({
        id: 'admin-patient',
        conversationCategory: 'ADMIN_PATIENT',
        totalMessages: 1,
        messages: [
          expect.objectContaining({
            id: 'msg-admin-1',
            senderRole: 'ADMIN',
            attachments: [
              expect.objectContaining({
                fileName: 'ct-report.pdf',
                url: 'https://storage.example.com/signed/ct-report.pdf',
              }),
            ],
          }),
        ],
      }),
      expect.objectContaining({
        id: 'hospital-patient',
        conversationCategory: 'HOSPITAL_PATIENT',
        totalMessages: 1,
        messages: [
          expect.objectContaining({
            id: 'msg-hospital-1',
            senderRole: 'HOSPITAL',
            attachments: [
              expect.objectContaining({
                fileName: 'hospital-plan.pdf',
                url: 'https://storage.example.com/signed/hospital-plan.pdf',
              }),
            ],
          }),
        ],
      }),
    ]);
    expect(result.totalMessages).toBe(2);
  });

  it('returns patient code as empty string when patientInfo is null', async () => {
    mockPatientRepo.findById = vi.fn().mockResolvedValue(null);

    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.patient.code).toBe('');
  });

  it('returns patient code as empty string when patientCode is null', async () => {
    mockPatientRepo.findById = vi.fn().mockResolvedValue({ id: 'patient-1', patientCode: null });

    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.patient.code).toBe('');
  });

  it('allows HOSPITAL actor to access their own case', async () => {
    const result = await useCase.execute('case-id-1', hospitalActor);

    expect(result.id).toBe('case-id-1');
  });

  it('throws ForbiddenError when HOSPITAL actor accesses a case belonging to a different hospital', async () => {
    await expect(
      useCase.execute('case-id-1', otherHospitalActor),
    ).rejects.toThrow('Access denied to this case');
  });

  it('allows a hospital actor with an active hospital contact to access the case detail', async () => {
    (mockChcRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'chc-1',
      caseId: 'case-id-1',
      hospitalId: 'hosp-2',
      subStatus: 'QUOTED',
      removedAt: null,
    });

    const result = await useCase.execute('case-id-1', otherHospitalActor);

    expect(result.id).toBe('case-id-1');
    expect(mockChcRepo.findByCaseAndHospital).toHaveBeenCalledWith('case-id-1', 'hosp-2');
  });

  it('blocks a hospital contact that has already been rejected from viewing case detail', async () => {
    (mockChcRepo.findByCaseAndHospital as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'chc-1',
      caseId: 'case-id-1',
      hospitalId: 'hosp-2',
      subStatus: 'REJECTED',
      removedAt: null,
    });

    await expect(
      useCase.execute('case-id-1', otherHospitalActor),
    ).rejects.toThrow('Access denied to this case');
  });

  it('throws NotFoundError when case does not exist', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('nonexistent-id', adminActor),
    ).rejects.toThrow('Case nonexistent-id not found');
  });

  it('throws NotFoundError for HOSPITAL actor on missing case', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(null);

    await expect(
      useCase.execute('missing-case', hospitalActor),
    ).rejects.toThrow('Case missing-case not found');
  });

  it('maps displayStatus based on stage', async () => {
    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.displayStatus).toBe('transferred');
  });

  it('does not expose the legacy medicalIntake structure on hospital case detail responses', async () => {
    mockCaseRepo.findById = vi.fn().mockResolvedValue(new Case({
      ...mockCase,
      structuredData: {
        step2_symptom_location: {
          primary_location: 'Face',
          symptom_nature: ['Pain', 'Swelling'],
        },
        patientHospitalSelection: {
          medicalFormStatus: 'SUBMITTED',
          medicalFormResponseId: 'qcr-1',
        },
      },
    }));

    const result = await useCase.execute('case-id-1', adminActor);

    expect('medicalIntake' in result).toBe(false);
  });

  it('keeps legacy diagnosis progress rows visible when metadata.kind is missing', async () => {
    mockProgressRepo.findByCaseId = vi.fn().mockResolvedValue([
      new CaseProgress({
        id: 'legacy-diagnosis',
        caseId: 'case-id-1',
        title: 'Orbital fracture',
        description: 'Confirmed by CT',
        progressType: 'STATUS_CHANGE',
        metadata: {
          type: 'confirmed',
          icdCode: 'S02.8',
          severity: 'severe',
          treatmentRecommendation: 'Surgical fixation',
          suggestedTests: 'Repeat CT',
        },
        recordedAt: new Date('2026-01-19T10:00:00Z'),
        recordedById: 'doctor-2',
      }),
    ]);

    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.diagnoses).toHaveLength(1);
    expect(result.diagnoses[0]).toEqual(expect.objectContaining({
      id: 'legacy-diagnosis',
      title: 'Orbital fracture',
      icdCode: 'S02.8',
      severity: 'severe',
      treatmentRecommendation: 'Surgical fixation',
      suggestedTests: 'Repeat CT',
    }));
  });

  it('loads every paginated message page for each exposed case conversation', async () => {
    mockMessageRepo.findByConversationId = vi.fn().mockImplementation((conversationId: string, query: { page: number }) => {
      if (conversationId === 'conv-hospital' && query.page === 1) {
        return Promise.resolve({
          data: [hospitalMessage],
          total: 2,
          page: 1,
          limit: 100,
          totalPages: 2,
          hasMore: true,
        });
      }

      if (conversationId === 'conv-hospital' && query.page === 2) {
        return Promise.resolve({
          data: [
            new Message({
              ...hospitalMessage,
              id: 'msg-hospital-2',
              content: 'Second page reply',
              attachments: [],
              createdAt: new Date('2026-01-18T11:00:00Z'),
            }),
          ],
          total: 2,
          page: 2,
          limit: 100,
          totalPages: 2,
          hasMore: false,
        });
      }

      if (conversationId === 'conv-admin') {
        return Promise.resolve({
          data: [adminMessage],
          total: 1,
          page: 1,
          limit: 100,
          totalPages: 1,
          hasMore: false,
        });
      }

      return Promise.resolve({
        data: [],
        total: 0,
        page: query.page,
        limit: 100,
        totalPages: 0,
        hasMore: false,
      });
    });

    const result = await useCase.execute('case-id-1', hospitalActor);

    expect(result.totalMessages).toBe(3);
    expect(mockMessageRepo.findByConversationId).toHaveBeenCalledWith('conv-hospital', { page: 1, limit: 100 });
    expect(mockMessageRepo.findByConversationId).toHaveBeenCalledWith('conv-hospital', { page: 2, limit: 100 });
    expect(mockMessageRepo.findByConversationId).toHaveBeenCalledWith('conv-admin', { page: 1, limit: 100 });
  });

  it('degrades gracefully when document URL signing fails', async () => {
    mockStorageService.getSignedUrls = vi.fn().mockRejectedValue(new Error('fetch failed'));

    const result = await useCase.execute('case-id-1', adminActor);

    expect(result.documents).toHaveLength(3);
    expect(result.documents.every((document) => document.downloadUrl === '')).toBe(true);
  });
});
