import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListConversationsUseCase } from '../src/use-cases/conversations/list-conversations.use-case.js';
import type { IConversationRepository, ConversationListQuery } from '@medical-crm/domain';
import { Conversation } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('ListConversationsUseCase', () => {
  let useCase: ListConversationsUseCase;
  let mockConversationRepo: IConversationRepository;

  const adminActor: Actor = { userId: 'a-1', email: 'a@t.com', role: 'ADMIN', hospitalId: null };
  const beautyAdminActor: Actor = { userId: 'ba-1', email: 'contact@medorabeauty.com', role: 'ADMIN', hospitalId: null };
  const hospitalActor: Actor = { userId: 'h-1', email: 'h@t.com', role: 'HOSPITAL', hospitalId: 'hosp-1' };

  const mockConversation = new Conversation({
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
  });

  const paginatedResult = {
    data: [mockConversation],
    total: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasMore: false,
  };

  beforeEach(() => {
    mockConversationRepo = {
      findById: vi.fn(),
      findMany: vi.fn().mockResolvedValue(paginatedResult),
      save: vi.fn(),
    };
    useCase = new ListConversationsUseCase(mockConversationRepo);
  });

  it('ADMIN scopes out beauty conversations', async () => {
    const query: ConversationListQuery = { page: 1, limit: 20 };
    await useCase.execute(query, adminActor);
    expect(mockConversationRepo.findMany).toHaveBeenCalledWith({
      ...query,
      patientSiteScope: { mode: 'EXCLUDE', site: 'beauty' },
    }, undefined);
  });

  it('medora beauty ADMIN sees only beauty conversations', async () => {
    const query: ConversationListQuery = { page: 1, limit: 20 };
    await useCase.execute(query, beautyAdminActor);
    expect(mockConversationRepo.findMany).toHaveBeenCalledWith({
      ...query,
      patientSiteScope: { mode: 'ONLY', site: 'beauty' },
    }, undefined);
  });

  it('HOSPITAL passes its own hospitalId as filter', async () => {
    const query: ConversationListQuery = { page: 1, limit: 20 };
    await useCase.execute(query, hospitalActor);
    expect(mockConversationRepo.findMany).toHaveBeenCalledWith(query, 'hosp-1');
  });

  it('returns PaginatedResult<ConversationDTO> with mapped data', async () => {
    const result = await useCase.execute({ page: 1, limit: 20 }, adminActor);
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.data[0]!.id).toBe('conv-1');
    expect(result.data[0]!.category).toBe('HOSPITAL');
    expect(typeof result.data[0]!.createdAt).toBe('string');
  });
});
