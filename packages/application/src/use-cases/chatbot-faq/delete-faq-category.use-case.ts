import type { IChatbotFaqRepository } from '@medical-crm/domain';
import { ConflictError, ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class DeleteFaqCategoryUseCase {
  constructor(private readonly faqRepo: IChatbotFaqRepository) {}

  async execute(id: string, actor: Actor): Promise<void> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }

    const category = await this.faqRepo.findCategoryById(id);
    if (!category) {
      throw new NotFoundError(`FAQ category not found: ${id}`);
    }

    // Hospital actors can only delete their own categories
    if (actor.role === 'HOSPITAL' && category.hospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Hospital users can only delete their own categories');
    }

    const questionCount = await this.faqRepo.countItemsForCategory(
      category.name,
      category.hospitalType,
      category.hospitalId,
    );
    if (questionCount > 0) {
      throw new ConflictError('Category cannot be deleted while it still has questions');
    }

    await this.faqRepo.deleteCategory(id);
  }
}
