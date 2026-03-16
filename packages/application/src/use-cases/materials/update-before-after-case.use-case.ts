import type { IMaterialsRepository, MaterialsBeforeAfterCase } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export interface UpdateBeforeAfterCaseInput {
  procedureName?: string;
  surgeonName?: string | null;
  description?: string | null;
  images?: Array<{ url: string; type: 'before' | 'after' | 'combined' }>;
}

export class UpdateBeforeAfterCaseUseCase {
  constructor(private readonly materialsRepo: IMaterialsRepository) {}

  async execute(hospitalId: string, caseId: string, input: UpdateBeforeAfterCaseInput, actor: Actor): Promise<MaterialsBeforeAfterCase> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    return this.materialsRepo.updateBeforeAfterCase(caseId, input);
  }
}
