import type { IChatbotFaqRepository, ChatbotFaqListQuery, IStorageService } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { ChatbotFaqItemDTO } from '../../dtos/chatbot-faq.dto.js';
import type { Actor } from '../../types/actor.js';
import { toChatbotFaqItemDTO } from '../../mappers/chatbot-faq.mapper.js';

export class ListFaqItemsUseCase {
  constructor(
    private readonly faqRepo: IChatbotFaqRepository,
    private readonly storageService?: IStorageService,
  ) {}

  async execute(
    query: ChatbotFaqListQuery,
    actor: Actor,
  ): Promise<{ data: ChatbotFaqItemDTO[]; total: number; page: number; limit: number }> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }

    // Each role only sees their own FAQs
    const scopedQuery: ChatbotFaqListQuery = { ...query };
    if (actor.role === 'HOSPITAL') {
      scopedQuery.hospitalId = actor.hospitalId;
    } else if (actor.role === 'ADMIN') {
      // Admin only sees global FAQs (hospitalId=NULL)
      scopedQuery.hospitalId = null;
    }

    const result = await this.faqRepo.findAll(scopedQuery);

    let signedUrls: Record<string, string> = {};
    if (this.storageService && result.data.length > 0) {
      const keys = result.data
        .flatMap((e) => e.attachments.map((a) => a.storageKey))
        .filter(
          (k) =>
            k &&
            !k.startsWith('http://') &&
            !k.startsWith('https://') &&
            !k.startsWith('data:'),
        );
      if (keys.length > 0) {
        signedUrls = await this.storageService.getSignedUrls(Array.from(new Set(keys)));
      }
    }

    return {
      data: result.data.map((e) => toChatbotFaqItemDTO(e, signedUrls)),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}
