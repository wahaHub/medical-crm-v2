import type { IChatbotFaqRepository } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';

export class DeleteFaqItemUseCase {
  constructor(private readonly faqRepo: IChatbotFaqRepository) {}

  async execute(id: string, actor: Actor): Promise<void> {
    if (actor.role !== 'ADMIN') {
      throw new Error('Forbidden: only ADMIN can delete FAQ items');
    }

    const entity = await this.faqRepo.findById(id);
    if (!entity) {
      throw new Error(`ChatbotFaqItem not found: ${id}`);
    }

    await this.faqRepo.delete(id);
  }
}
