import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateConversationUseCase } from '../src/use-cases/conversations/create-conversation.use-case.js';
import type { IConversationRepository } from '@medical-crm/domain';
import { Conversation } from '@medical-crm/domain';
import { ValidationError } from '@medical-crm/utils';
import type { Actor } from '../src/types/actor.js';
import type { AdminPatientSiteAccessPolicy } from '../src/access/admin-patient-site-access.js';

describe('CreateConversationUseCase', () => {
  let useCase: CreateConversationUseCase;
  let mockConversationRepo: IConversationRepository;

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
    hospitalId: 'h-1',
  };

  function makeAdminAccess(overrides: Partial<AdminPatientSiteAccessPolicy> = {}): AdminPatientSiteAccessPolicy {
    return {
      assertActorCanAccessCase: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    } as unknown as AdminPatientSiteAccessPolicy;
  }

  beforeEach(() => {
    mockConversationRepo = {
      findById: vi.fn(),
      findByPatientId: vi.fn(),
      save: vi.fn().mockImplementation((entity: Conversation) => Promise.resolve(entity)),
      findOrCreateAdminPatientConversation: vi.fn().mockImplementation((entity: Conversation) => Promise.resolve(entity)),
      findOrCreateHospitalPatientConversation: vi.fn().mockImplementation((entity: Conversation) => Promise.resolve(entity)),
    };
    useCase = new CreateConversationUseCase(mockConversationRepo);
  });

  it('throws ForbiddenError for PATIENT actor', async () => {
    const patientActor: Actor = { userId: 'p-1', email: 'p@test.com', role: 'PATIENT', hospitalId: null };
    await expect(
      useCase.execute(
        { category: 'HOSPITAL' },
        patientActor,
      ),
    ).rejects.toThrow('Only admins and hospital staff can create conversations');
  });

  it('allows HOSPITAL actor to create conversation', async () => {
    const result = await useCase.execute(
      { category: 'HOSPITAL_PATIENT', caseId: 'case-1' },
      hospitalActor,
    );

    expect(result.category).toBe('HOSPITAL_PATIENT');
    expect(result.hospitalId).toBe('h-1'); // auto-filled from actor
    expect(mockConversationRepo.findOrCreateHospitalPatientConversation).toHaveBeenCalledOnce();
    expect(mockConversationRepo.save).not.toHaveBeenCalled();
  });

  it('blocks HOSPITAL actor from creating conversations for excluded patient email cases', async () => {
    const adminAccess = makeAdminAccess({
      assertActorCanAccessCase: vi.fn().mockRejectedValue(new Error('Case case-1 not found')),
    });
    useCase = new CreateConversationUseCase(
      mockConversationRepo,
      undefined,
      undefined,
      adminAccess,
    );

    await expect(
      useCase.execute(
        { category: 'HOSPITAL_PATIENT', caseId: 'case-1' },
        hospitalActor,
      ),
    ).rejects.toThrow('Case case-1 not found');

    expect(mockConversationRepo.findOrCreateHospitalPatientConversation).not.toHaveBeenCalled();
    expect(mockConversationRepo.save).not.toHaveBeenCalled();
  });

  it('reuses an existing hospital-patient conversation for the same case and hospital', async () => {
    const existingConversation = new Conversation({
      id: 'conv-existing',
      category: 'HOSPITAL_PATIENT',
      caseId: 'case-1',
      hospitalId: 'h-1',
      title: null,
      lastMessageId: null,
      lastMessageAt: null,
      lastMessagePreview: null,
      lastSenderId: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    vi.mocked(mockConversationRepo.findOrCreateHospitalPatientConversation).mockResolvedValueOnce(existingConversation);

    const result = await useCase.execute(
      { category: 'HOSPITAL_PATIENT', caseId: 'case-1' },
      hospitalActor,
    );

    expect(result.id).toBe('conv-existing');
    expect(mockConversationRepo.save).not.toHaveBeenCalled();
  });

  it('rejects hospital-patient creation when hospitalId cannot be resolved', async () => {
    const adminWithoutHospitalActor: Actor = {
      userId: 'admin-2',
      email: 'admin2@test.com',
      role: 'ADMIN',
      hospitalId: null,
    };

    await expect(
      useCase.execute(
        { category: 'HOSPITAL_PATIENT', caseId: 'case-1' },
        adminWithoutHospitalActor,
      ),
    ).rejects.toMatchObject({
      message: 'HOSPITAL_PATIENT conversations require both caseId and hospitalId',
    });
    await expect(
      useCase.execute(
        { category: 'HOSPITAL_PATIENT', caseId: 'case-1' },
        adminWithoutHospitalActor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mockConversationRepo.findOrCreateHospitalPatientConversation).not.toHaveBeenCalled();
    expect(mockConversationRepo.save).not.toHaveBeenCalled();
  });

  it('creates a conversation with the provided category', async () => {
    const result = await useCase.execute(
      { category: 'ADMIN_HOSPITAL' },
      adminActor,
    );

    expect(result.category).toBe('ADMIN_HOSPITAL');
    expect(mockConversationRepo.save).toHaveBeenCalledOnce();
  });

  it('uses the admin-patient get-or-create path so concurrent creation converges on one stored conversation', async () => {
    const result = await useCase.execute(
      { category: 'ADMIN_PATIENT', caseId: 'case-123' },
      adminActor,
    );

    expect(result.category).toBe('ADMIN_PATIENT');
    expect(mockConversationRepo.findOrCreateAdminPatientConversation).toHaveBeenCalledOnce();
    expect(mockConversationRepo.save).not.toHaveBeenCalled();
  });

  it('sets caseId, hospitalId, and title from input', async () => {
    const result = await useCase.execute(
      {
        category: 'HOSPITAL',
        caseId: 'case-123',
        hospitalId: 'hospital-456',
        title: 'Test Conversation',
      },
      adminActor,
    );

    expect(result.caseId).toBe('case-123');
    expect(result.hospitalId).toBe('hospital-456');
    expect(result.title).toBe('Test Conversation');
  });

  it('sets null for optional fields when not provided', async () => {
    const result = await useCase.execute(
      { category: 'PATIENT' },
      adminActor,
    );

    expect(result.caseId).toBeNull();
    expect(result.hospitalId).toBeNull();
    expect(result.title).toBeNull();
  });

  it('sets all lastMessage fields to null on creation', async () => {
    const result = await useCase.execute(
      { category: 'HOSPITAL' },
      adminActor,
    );

    expect(result.lastMessageAt).toBeNull();
    expect(result.lastMessagePreview).toBeNull();
    expect(result.lastSenderId).toBeNull();
  });

  it('returns ConversationDTO with string dates', async () => {
    const result = await useCase.execute(
      { category: 'HOSPITAL' },
      adminActor,
    );

    expect(typeof result.createdAt).toBe('string');
    expect(typeof result.updatedAt).toBe('string');
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
  });
});
