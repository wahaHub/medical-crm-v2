import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateConversationUseCase } from '../src/use-cases/conversations/create-conversation.use-case.js';
import type { IConversationRepository } from '@medical-crm/domain';
import { Conversation } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

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

  beforeEach(() => {
    mockConversationRepo = {
      findById: vi.fn(),
      findMany: vi.fn(),
      save: vi.fn().mockImplementation((entity: Conversation) => Promise.resolve(entity)),
    };
    useCase = new CreateConversationUseCase(mockConversationRepo);
  });

  it('throws ForbiddenError for non-ADMIN actor', async () => {
    await expect(
      useCase.execute(
        { category: 'HOSPITAL' },
        hospitalActor,
      ),
    ).rejects.toThrow('Only admins can create conversations');
  });

  it('creates a conversation with the provided category', async () => {
    const result = await useCase.execute(
      { category: 'ADMIN_HOSPITAL' },
      adminActor,
    );

    expect(result.category).toBe('ADMIN_HOSPITAL');
    expect(mockConversationRepo.save).toHaveBeenCalledOnce();
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
