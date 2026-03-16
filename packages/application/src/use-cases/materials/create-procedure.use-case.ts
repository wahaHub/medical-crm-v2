import type { IMaterialsRepository, MaterialsProcedure } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export interface CreateProcedureInput {
  procedureName: string;
  description?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  priceRange?: string | null;
  isPopular?: boolean;
  sortOrder?: number;
}

export class CreateProcedureUseCase {
  constructor(private readonly materialsRepo: IMaterialsRepository) {}

  async execute(hospitalId: string, input: CreateProcedureInput, actor: Actor): Promise<MaterialsProcedure> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    return this.materialsRepo.createProcedure({
      hospitalId,
      procedureName: input.procedureName,
      description: input.description ?? null,
      priceMin: input.priceMin ?? null,
      priceMax: input.priceMax ?? null,
      priceRange: input.priceRange ?? null,
      isPopular: input.isPopular ?? false,
      sortOrder: input.sortOrder ?? 0,
    });
  }
}
