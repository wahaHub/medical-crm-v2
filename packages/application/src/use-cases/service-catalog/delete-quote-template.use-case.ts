import type { IServiceCatalogRepository } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';

export class DeleteQuoteTemplateUseCase {
  constructor(private readonly repo: IServiceCatalogRepository) {}

  async execute(id: string, actor: Actor): Promise<void> {
    const template = await this.repo.findTemplateById(id);
    if (!template) {
      throw new NotFoundError('Quote template not found');
    }

    if (actor.role === 'HOSPITAL' && actor.hospitalId !== template.hospitalId) {
      throw new ForbiddenError('Hospital users can only delete their own templates');
    }
    if (actor.role === 'PATIENT') {
      throw new ForbiddenError('Patients cannot delete quote templates');
    }

    template.deactivate();
    await this.repo.saveTemplate(template);
  }
}
