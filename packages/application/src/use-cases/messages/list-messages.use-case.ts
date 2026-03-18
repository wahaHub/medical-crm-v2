import type { IConversationRepository, IMessageRepository, IStorageService, MessageListQuery } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { PaginatedResult } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { MessageDTO } from '../../dtos/conversation.dto.js';
import { toMessageDTO } from '../../mappers/conversation.mapper.js';

export class ListMessagesUseCase {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly storageService: IStorageService,
  ) {}

  async execute(
    conversationId: string,
    query: MessageListQuery,
    actor: Actor,
  ): Promise<PaginatedResult<MessageDTO>> {
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation) {
      throw new NotFoundError(`Conversation ${conversationId} not found`);
    }
    if (actor.role === 'HOSPITAL') {
      if (conversation.hospitalId !== actor.hospitalId) {
        throw new ForbiddenError('Access denied to this conversation');
      }
      if (conversation.category === 'ADMIN_PATIENT') {
        throw new ForbiddenError('Access denied to this conversation');
      }
    }
    if (actor.role === 'PATIENT') {
      if (conversation.category === 'ADMIN_HOSPITAL') {
        throw new ForbiddenError('Access denied to this conversation');
      }
      const conversations = await this.conversationRepo.findByPatientId(actor.userId);
      const hasAccess = conversations.some((item) => item.id === conversationId);
      if (!hasAccess) {
        throw new ForbiddenError('Access denied to this conversation');
      }
    }

    const result = await this.messageRepo.findByConversationId(conversationId, query);
    const attachmentKeys = result.data
      .flatMap((message) => message.attachments)
      .map((attachment) => attachment.storageKey)
      .filter((storageKey) =>
        storageKey &&
        !storageKey.startsWith('http://') &&
        !storageKey.startsWith('https://') &&
        !storageKey.startsWith('data:'),
      );
    const signedUrls = attachmentKeys.length > 0
      ? await this.storageService.getSignedUrls(Array.from(new Set(attachmentKeys)))
      : {};

    return {
      data: result.data.map((message) => toMessageDTO(message, signedUrls)),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      hasMore: result.hasMore,
    };
  }
}
