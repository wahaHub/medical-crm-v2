import type { IQuestionCollectorRepository } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class DeleteTemplateUseCase {
  constructor(private readonly qcRepo: IQuestionCollectorRepository) {}

  async execute(id: string, actor: Actor): Promise<void> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can delete templates');
    }

    const template = await this.qcRepo.findTemplateById(id);
    if (!template) {
      throw new NotFoundError(`Template ${id} not found`);
    }

    await this.qcRepo.deleteTemplate(id);
  }
}
