import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SendMessageUseCase } from '../src/use-cases/messages/send-message.use-case.js';
import { Conversation, Message } from '@medical-crm/domain';
import type {
  IConversationRepository,
  IMessageRepository,
  ITranslationService,
  IMessageTaskQueue,
  IPatientRepository,
  IUserRepository,
  ICaseRepository,
} from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeConversation = (
  overrides: Partial<ConstructorParameters<typeof Conversation>[0]> = {},
) =>
  new Conversation({
    id: 'conv-1',
    caseId: 'case-1',
    category: 'ADMIN_HOSPITAL',
    title: 'Test',
    hospitalId: 'hosp-1',
    lastMessageId: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    lastSenderId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });

const adminActor: Actor = {
  userId: 'admin-1',
  email: 'admin@test.com',
  role: 'ADMIN',
  hospitalId: null,
};

const hospitalActor: Actor = {
  userId: 'hosp-user-1',
  email: 'hosp@test.com',
  role: 'HOSPITAL',
  hospitalId: 'hosp-1',
};

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('SendMessageUseCase', () => {
  let useCase: SendMessageUseCase;
  let mockConversationRepo: IConversationRepository;
  let mockMessageRepo: IMessageRepository;
  let mockTranslationService: ITranslationService;
  let mockMessageTaskQueue: IMessageTaskQueue;
  let mockPatientRepo: IPatientRepository;
  let mockUserRepo: IUserRepository;
  let mockCaseRepo: ICaseRepository;

  beforeEach(() => {
    mockConversationRepo = {
      findById: vi.fn().mockResolvedValue(makeConversation()),
      findMany: vi.fn(),
      save: vi
        .fn()
        .mockImplementation((entity: Conversation) => Promise.resolve(entity)),
    };

    mockMessageRepo = {
      findById: vi.fn(),
      findByConversationId: vi.fn(),
      findPendingReview: vi.fn(),
      save: vi
        .fn()
        .mockImplementation((entity: Message) => Promise.resolve(entity)),
      delete: vi.fn(),
    };

    mockTranslationService = {
      translate: vi.fn().mockResolvedValue('translated text'),
      summarizeMessage: vi.fn(),
    };

    mockMessageTaskQueue = {
      enqueueTranslation: vi.fn().mockResolvedValue(undefined),
      enqueueSummarization: vi.fn().mockResolvedValue(undefined),
      pullPending: vi.fn(),
      markProcessing: vi.fn(),
      markCompleted: vi.fn(),
      markFailed: vi.fn(),
    };

    mockPatientRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'patient-1',
        patientCode: 'P-001',
        preferredLanguage: 'th',
      }),
      findByEmail: vi.fn(),
      createTempPatient: vi.fn(),
      updatePasswordHash: vi.fn(),
    };

    mockUserRepo = {
      create: vi.fn(),
      findPreferredLanguage: vi.fn().mockResolvedValue('zh'),
      listAdminEmails: vi.fn(),
    };

    mockCaseRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'case-1',
        patientId: 'patient-1',
      }),
      findMany: vi.fn(),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };

    useCase = new SendMessageUseCase(
      mockConversationRepo,
      mockMessageRepo,
      mockTranslationService,
      mockMessageTaskQueue,
      mockPatientRepo,
      mockUserRepo,
      mockCaseRepo,
    );
  });

  // ─── Test 1: TEXT message from ADMIN ────────────────────────────────────────

  it('TEXT message from ADMIN: inline translation, moderationStatus = ALLOWED', async () => {
    mockConversationRepo.findById = vi
      .fn()
      .mockResolvedValue(makeConversation({ category: 'ADMIN_HOSPITAL' }));

    const result = await useCase.execute(
      'conv-1',
      { content: 'Hello hospital', messageType: 'TEXT' },
      adminActor,
    );

    expect(result.moderationStatus).toBe('ALLOWED');
    expect(result.translatedContent).toBe('translated text');
    expect(mockTranslationService.translate).toHaveBeenCalledOnce();
    expect(mockMessageTaskQueue.enqueueSummarization).not.toHaveBeenCalled();
    expect(mockMessageTaskQueue.enqueueTranslation).not.toHaveBeenCalled();
  });

  // ─── Test 2: TEXT from HOSPITAL to PATIENT → REVIEW ─────────────────────────

  it('TEXT message from HOSPITAL to PATIENT: moderationStatus = REVIEW, inline translation', async () => {
    mockConversationRepo.findById = vi
      .fn()
      .mockResolvedValue(makeConversation({ category: 'HOSPITAL_PATIENT' }));

    const result = await useCase.execute(
      'conv-1',
      { content: 'Hello patient', messageType: 'TEXT' },
      hospitalActor,
    );

    expect(result.moderationStatus).toBe('REVIEW');
    expect(result.translatedContent).toBe('translated text');
    expect(mockTranslationService.translate).toHaveBeenCalledOnce();
  });

  // ─── Test 3: TEXT from HOSPITAL to ADMIN → ALLOWED ───────────────────────────

  it('TEXT message from HOSPITAL to ADMIN: moderationStatus = ALLOWED', async () => {
    mockConversationRepo.findById = vi
      .fn()
      .mockResolvedValue(makeConversation({ category: 'ADMIN_HOSPITAL' }));

    const result = await useCase.execute(
      'conv-1',
      { content: 'Hello admin', messageType: 'TEXT' },
      hospitalActor,
    );

    expect(result.moderationStatus).toBe('ALLOWED');
    expect(result.translatedContent).toBe('translated text');
  });

  // ─── Test 4: IMAGE message: no inline translation, enqueues tasks ─────────────

  it('IMAGE message: no inline translation, enqueues SUMMARIZE + TRANSLATE tasks', async () => {
    mockConversationRepo.findById = vi
      .fn()
      .mockResolvedValue(makeConversation({ category: 'ADMIN_HOSPITAL' }));

    const result = await useCase.execute(
      'conv-1',
      {
        content: 'image caption',
        messageType: 'IMAGE',
        attachments: [
          {
            fileName: 'photo.jpg',
            fileSize: 1024,
            mimeType: 'image/jpeg',
            storageKey: 'uploads/photo.jpg',
          },
        ],
      },
      adminActor,
    );

    expect(mockTranslationService.translate).not.toHaveBeenCalled();
    expect(result.translatedContent).toBeNull();
    expect(mockMessageTaskQueue.enqueueSummarization).toHaveBeenCalledWith(
      result.id,
    );
    expect(mockMessageTaskQueue.enqueueTranslation).toHaveBeenCalledWith(
      result.id,
      expect.any(String),
    );
  });

  // ─── Test 5: FILE message: same as IMAGE ─────────────────────────────────────

  it('FILE message: no inline translation, enqueues SUMMARIZE + TRANSLATE tasks', async () => {
    mockConversationRepo.findById = vi
      .fn()
      .mockResolvedValue(makeConversation({ category: 'ADMIN_HOSPITAL' }));

    const result = await useCase.execute(
      'conv-1',
      { content: 'see attachment', messageType: 'FILE' },
      adminActor,
    );

    expect(mockTranslationService.translate).not.toHaveBeenCalled();
    expect(mockMessageTaskQueue.enqueueSummarization).toHaveBeenCalledWith(
      result.id,
    );
    expect(mockMessageTaskQueue.enqueueTranslation).toHaveBeenCalledWith(
      result.id,
      expect.any(String),
    );
  });

  // ─── Test 6: recipientLang derivation for ADMIN_HOSPITAL ─────────────────────

  it('recipientLang derivation: ADMIN_HOSPITAL — ADMIN sender resolves hospital preferred lang', async () => {
    mockConversationRepo.findById = vi.fn().mockResolvedValue(
      makeConversation({ category: 'ADMIN_HOSPITAL', hospitalId: 'hosp-1' }),
    );
    mockUserRepo.findPreferredLanguage = vi.fn().mockResolvedValue('ja');

    await useCase.execute(
      'conv-1',
      { content: 'hello', messageType: 'TEXT' },
      adminActor,
    );

    expect(mockUserRepo.findPreferredLanguage).toHaveBeenCalledWith('hosp-1');
    expect(mockTranslationService.translate).toHaveBeenCalledWith('hello', 'ja');
  });

  it('recipientLang derivation: ADMIN_HOSPITAL — HOSPITAL sender uses zh (recipient is admin)', async () => {
    mockConversationRepo.findById = vi.fn().mockResolvedValue(
      makeConversation({ category: 'ADMIN_HOSPITAL', hospitalId: 'hosp-1' }),
    );

    await useCase.execute(
      'conv-1',
      { content: 'hello admin', messageType: 'TEXT' },
      hospitalActor,
    );

    expect(mockUserRepo.findPreferredLanguage).not.toHaveBeenCalled();
    expect(mockTranslationService.translate).toHaveBeenCalledWith(
      'hello admin',
      'zh',
    );
  });

  // ─── Test 7: recipientLang derivation for HOSPITAL_PATIENT ───────────────────

  it('recipientLang derivation: HOSPITAL_PATIENT — HOSPITAL sender resolves patient lang via caseRepo', async () => {
    mockConversationRepo.findById = vi.fn().mockResolvedValue(
      makeConversation({
        category: 'HOSPITAL_PATIENT',
        caseId: 'case-1',
        hospitalId: 'hosp-1',
      }),
    );
    mockCaseRepo.findById = vi.fn().mockResolvedValue({
      id: 'case-1',
      patientId: 'patient-1',
    });
    mockPatientRepo.findById = vi.fn().mockResolvedValue({
      id: 'patient-1',
      patientCode: 'P-001',
      preferredLanguage: 'ar',
    });

    await useCase.execute(
      'conv-1',
      { content: 'hello patient', messageType: 'TEXT' },
      hospitalActor,
    );

    expect(mockCaseRepo.findById).toHaveBeenCalledWith('case-1');
    expect(mockPatientRepo.findById).toHaveBeenCalledWith('patient-1');
    expect(mockTranslationService.translate).toHaveBeenCalledWith(
      'hello patient',
      'ar',
    );
  });

  // ─── Test 8: recipientLang derivation for ADMIN_PATIENT ──────────────────────

  it('recipientLang derivation: ADMIN_PATIENT — ADMIN sender resolves patient lang', async () => {
    mockConversationRepo.findById = vi.fn().mockResolvedValue(
      makeConversation({
        category: 'ADMIN_PATIENT',
        caseId: 'case-1',
      }),
    );
    mockCaseRepo.findById = vi.fn().mockResolvedValue({
      id: 'case-1',
      patientId: 'patient-1',
    });
    mockPatientRepo.findById = vi.fn().mockResolvedValue({
      id: 'patient-1',
      patientCode: 'P-001',
      preferredLanguage: 'ko',
    });

    await useCase.execute(
      'conv-1',
      { content: 'hello patient from admin', messageType: 'TEXT' },
      adminActor,
    );

    expect(mockCaseRepo.findById).toHaveBeenCalledWith('case-1');
    expect(mockPatientRepo.findById).toHaveBeenCalledWith('patient-1');
    expect(mockTranslationService.translate).toHaveBeenCalledWith(
      'hello patient from admin',
      'ko',
    );
  });

  // ─── Test 9: Updates conversation lastMessage* fields ────────────────────────

  it('updates conversation lastMessage* fields after send', async () => {
    const conv = makeConversation({ category: 'ADMIN_HOSPITAL' });
    mockConversationRepo.findById = vi.fn().mockResolvedValue(conv);

    await useCase.execute(
      'conv-1',
      { content: 'Update test', messageType: 'TEXT' },
      adminActor,
    );

    expect(mockConversationRepo.save).toHaveBeenCalledOnce();
    const savedConv = (mockConversationRepo.save as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as Conversation;
    expect(savedConv.lastMessagePreview).toBe('Update test');
    expect(savedConv.lastSenderId).toBe(adminActor.userId);
    expect(savedConv.lastMessageId).toBeTruthy();
    expect(savedConv.lastMessageAt).toBeInstanceOf(Date);
  });

  // ─── Test 10: ForbiddenError if actor lacks access ───────────────────────────

  it('throws ForbiddenError if HOSPITAL actor hospitalId does not match conversation', async () => {
    mockConversationRepo.findById = vi.fn().mockResolvedValue(
      makeConversation({ category: 'HOSPITAL_PATIENT', hospitalId: 'other-hosp' }),
    );

    const wrongHospitalActor: Actor = {
      userId: 'hx',
      email: 'hx@test.com',
      role: 'HOSPITAL',
      hospitalId: 'hosp-wrong',
    };

    await expect(
      useCase.execute(
        'conv-1',
        { content: 'sneaky', messageType: 'TEXT' },
        wrongHospitalActor,
      ),
    ).rejects.toThrow('No access to this conversation');
  });

  it('throws ForbiddenError if HOSPITAL actor tries to access ADMIN_PATIENT conversation', async () => {
    mockConversationRepo.findById = vi.fn().mockResolvedValue(
      makeConversation({ category: 'ADMIN_PATIENT', hospitalId: 'hosp-1' }),
    );

    await expect(
      useCase.execute(
        'conv-1',
        { content: 'sneaky', messageType: 'TEXT' },
        hospitalActor,
      ),
    ).rejects.toThrow('Hospital cannot access admin-patient conversations');
  });
});
