import type { IMaterialsRepository, MaterialsSurgeon } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export interface UpdateSurgeonInput {
  name?: string;
  title?: string | null;
  imageUrl?: string | null;
  experienceYears?: number | null;
  specialties?: string[];
  languages?: string[];
}

export class UpdateSurgeonUseCase {
  constructor(private readonly materialsRepo: IMaterialsRepository) {}

  async execute(hospitalId: string, surgeonId: string, input: UpdateSurgeonInput, actor: Actor): Promise<MaterialsSurgeon> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    return this.materialsRepo.updateSurgeon(surgeonId, input);
  }
}
