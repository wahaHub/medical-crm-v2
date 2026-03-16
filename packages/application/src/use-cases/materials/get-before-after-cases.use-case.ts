import type { IMaterialsRepository, MaterialsBeforeAfterCase } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class GetBeforeAfterCasesUseCase {
  constructor(private readonly materialsRepo: IMaterialsRepository) {}

  async execute(hospitalId: string, actor: Actor): Promise<MaterialsBeforeAfterCase[]> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    return this.materialsRepo.listBeforeAfterCases(hospitalId);
  }
}
