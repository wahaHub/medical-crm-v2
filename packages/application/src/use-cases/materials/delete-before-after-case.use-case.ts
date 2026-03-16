import type { IMaterialsRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class DeleteBeforeAfterCaseUseCase {
  constructor(private readonly materialsRepo: IMaterialsRepository) {}

  async execute(hospitalId: string, caseId: string, actor: Actor): Promise<void> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    await this.materialsRepo.deleteBeforeAfterCase(caseId);
  }
}
