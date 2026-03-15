import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetConversationUseCase } from '../src/use-cases/conversations/get-conversation.use-case.js';
import { UpdateConversationUseCase } from '../src/use-cases/conversations/update-conversation.use-case.js';
import type { IConversationRepository } from '@medical-crm/domain';
import { Conversation } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

const makeConversation = (overrides: Partial<ConstructorParameters<typeof Conversation>[0]> = {}) =>
  new Conversation({
    id: 'conv-1',
    caseId: 'case-1',
    category: 'HOSPITAL',
    title: 'Test Conversation',
    hospitalId: 'hosp-1',
    lastMessageId: null,
    lastMessageAt: null,
    lastMessagePreview: null,
    lastSenderId: null,
    createdAt: new Date('2026-01-10T08:00:00Z'),
    updatedAt: new Date('2026-01-10T08:00:00Z'),
    ...overrides,
  });

const adminActor: Actor = { userId: 'admin-1', email: 'admin@t.com', role: 'ADMIN', hospitalId: null };
const hospitalActor: Actor = { userId: 'h-1', email: 'h@t.com', role: 'HOSPITAL', hospitalId: 'hosp-1' };
const otherHospitalActor: Actor = { userId: 'h-2', email: 'h2@t.com', role: 'HOSPITAL', hospitalId: 'hosp-2' };

describe('GetConversationUseCase', () => {
  let useCase: GetConversationUseCase;
  let mockConversationRepo: IConversationRepository;

  beforeEach(() => {
    mockConversationRepo = {
      findById: vi.fn().mockResolvedValue(makeConversation()),
      findMany: vi.fn(),
      save: vi.fn(),
    };
    useCase = new GetConversationUseCase(mockConversationRepo);
  });

  it('ADMIN can view any conversation', async () => {
    const result = await useCase.execute('conv-1', adminActor);
    expect(result.id).toBe('conv-1');
    expect(mockConversationRepo.findById).toHaveBeenCalledWith('conv-1');
  });

  it('HOSPITAL can view a conversation when hospitalId matches', async () => {
    const result = await useCase.execute('conv-1', hospitalActor);
    expect(result.id).toBe('conv-1');
    expect(result.hospitalId).toBe('hosp-1');
  });

  it('throws ForbiddenError if HOSPITAL hospitalId does not match', async () => {
    await expect(
      useCase.execute('conv-1', otherHospitalActor),
    ).rejects.toThrow('Access denied to this conversation');
  });

  it('throws ForbiddenError if HOSPITAL tries to access ADMIN_PATIENT category', async () => {
    mockConversationRepo.findById = vi.fn().mockResolvedValue(
      makeConversation({ category: 'ADMIN_PATIENT', hospitalId: 'hosp-1' }),
    );
    await expect(
      useCase.execute('conv-1', hospitalActor),
    ).rejects.toThrow('Access denied to this conversation');
  });

  it('throws NotFoundError if conversation does not exist', async () => {
    mockConversationRepo.findById = vi.fn().mockResolvedValue(null);
    await expect(
      useCase.execute('missing-id', adminActor),
    ).rejects.toThrow('Conversation missing-id not found');
  });

  it('returns ConversationDTO with ISO string dates', async () => {
    const result = await useCase.execute('conv-1', adminActor);
    expect(typeof result.createdAt).toBe('string');
    expect(result.createdAt).toBe('2026-01-10T08:00:00.000Z');
  });
});

describe('UpdateConversationUseCase', () => {
  let useCase: UpdateConversationUseCase;
  let mockConversationRepo: IConversationRepository;

  beforeEach(() => {
    mockConversationRepo = {
      findById: vi.fn().mockResolvedValue(makeConversation()),
      findMany: vi.fn(),
      save: vi.fn().mockImplementation((entity: Conversation) => Promise.resolve(entity)),
    };
    useCase = new UpdateConversationUseCase(mockConversationRepo);
  });

  it('updates title and calls save, returns updated ConversationDTO', async () => {
    const result = await useCase.execute('conv-1', { title: 'New Title' }, adminActor);
    expect(result.title).toBe('New Title');
    expect(mockConversationRepo.save).toHaveBeenCalledOnce();
  });

  it('does not modify title when not provided', async () => {
    const result = await useCase.execute('conv-1', {}, adminActor);
    expect(result.title).toBe('Test Conversation');
  });

  it('throws NotFoundError if conversation does not exist', async () => {
    mockConversationRepo.findById = vi.fn().mockResolvedValue(null);
    await expect(
      useCase.execute('missing-id', { title: 'X' }, adminActor),
    ).rejects.toThrow('Conversation missing-id not found');
  });

  it('throws ForbiddenError if HOSPITAL hospitalId does not match', async () => {
    await expect(
      useCase.execute('conv-1', { title: 'X' }, otherHospitalActor),
    ).rejects.toThrow('Access denied to this conversation');
  });

  it('throws ForbiddenError if HOSPITAL tries to update ADMIN_PATIENT category', async () => {
    mockConversationRepo.findById = vi.fn().mockResolvedValue(
      makeConversation({ category: 'ADMIN_PATIENT', hospitalId: 'hosp-1' }),
    );
    await expect(
      useCase.execute('conv-1', { title: 'X' }, hospitalActor),
    ).rejects.toThrow('Access denied to this conversation');
  });

  it('HOSPITAL can update own conversation', async () => {
    const result = await useCase.execute('conv-1', { title: 'Hospital Update' }, hospitalActor);
    expect(result.title).toBe('Hospital Update');
  });
});
