import type { IEmailTemplateRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class DeleteEmailTemplateUseCase {
  constructor(private readonly repo: IEmailTemplateRepository) {}

  async execute(id: string, actor: Actor): Promise<void> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }

    const entity = await this.repo.findById(id);
    if (!entity) {
      throw new Error(`EmailTemplate not found: ${id}`);
    }

    if (actor.role === 'HOSPITAL' && actor.hospitalId !== entity.hospitalId) {
      throw new ForbiddenError('Hospital users can only manage their own templates');
    }

    await this.repo.softDelete(id);
  }
}
