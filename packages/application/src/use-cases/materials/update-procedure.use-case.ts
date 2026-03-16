import type { IMaterialsRepository, MaterialsProcedure } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export interface UpdateProcedureInput {
  procedureName?: string;
  description?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  priceRange?: string | null;
  isPopular?: boolean;
  sortOrder?: number;
}

export class UpdateProcedureUseCase {
  constructor(private readonly materialsRepo: IMaterialsRepository) {}

  async execute(hospitalId: string, procedureId: string, input: UpdateProcedureInput, actor: Actor): Promise<MaterialsProcedure> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    return this.materialsRepo.updateProcedure(procedureId, input);
  }
}
