import type { IChatbotFaqRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { AiSyncTaskService } from '../../services/ai-sync-task.service.js';

export class DeleteFaqItemUseCase {
  constructor(
    private readonly faqRepo: IChatbotFaqRepository,
    private readonly aiSyncTaskService: AiSyncTaskService,
  ) {}

  async execute(id: string, actor: Actor): Promise<void> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }

    const entity = await this.faqRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`ChatbotFaqItem not found: ${id}`);
    }

    // HOSPITAL actors can only delete FAQs belonging to their hospital
    if (actor.role === 'HOSPITAL' && entity.hospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Forbidden');
    }

    await this.faqRepo.delete(id);
    await this.aiSyncTaskService.enqueueFaqDelete({
      faqId: entity.id,
      hospitalType: entity.hospitalType,
      hospitalId: entity.hospitalId,
    });
  }
}
