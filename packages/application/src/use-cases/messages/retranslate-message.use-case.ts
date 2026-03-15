import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { IMessageRepository, ITranslationService } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';
import type { MessageDTO } from '../../dtos/conversation.dto.js';
import { toMessageDTO } from '../../mappers/conversation.mapper.js';

export class RetranslateMessageUseCase {
  constructor(
    private readonly messageRepo: IMessageRepository,
    private readonly translationService: ITranslationService,
  ) {}

  async execute(messageId: string, targetLang: string, actor: Actor): Promise<MessageDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only ADMIN can retranslate messages');
    }

    const message = await this.messageRepo.findById(messageId);
    if (!message) {
      throw new NotFoundError(`Message ${messageId} not found`);
    }

    const translated = await this.translationService.translate(
      message.content,
      targetLang,
    );
    message.setTranslation(translated);

    const saved = await this.messageRepo.save(message);
    return toMessageDTO(saved);
  }
}
