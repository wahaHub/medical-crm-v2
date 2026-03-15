import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { IMessageRepository, ITranslationService } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';
import type { MessageDTO } from '../../dtos/conversation.dto.js';
import { toMessageDTO } from '../../mappers/conversation.mapper.js';

export class RegenerateSummaryUseCase {
  constructor(
    private readonly messageRepo: IMessageRepository,
    private readonly translationService: ITranslationService,
  ) {}

  async execute(messageId: string, actor: Actor): Promise<MessageDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only ADMIN can regenerate message summaries');
    }

    const message = await this.messageRepo.findById(messageId);
    if (!message) {
      throw new NotFoundError(`Message ${messageId} not found`);
    }

    const summary = await this.translationService.summarizeMessage(
      message.content,
      message.messageType,
      message.originalLanguage ?? 'en',
    );
    message.setAiSummary(summary);

    const saved = await this.messageRepo.save(message);
    return toMessageDTO(saved);
  }
}
