import type { IMaterialsRepository, MaterialsSurgeon } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export interface CreateSurgeonInput {
  name: string;
  title?: string | null;
  imageUrl?: string | null;
  experienceYears?: number | null;
  specialties?: string[];
  languages?: string[];
}

export class CreateSurgeonUseCase {
  constructor(private readonly materialsRepo: IMaterialsRepository) {}

  async execute(hospitalId: string, input: CreateSurgeonInput, actor: Actor): Promise<MaterialsSurgeon> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    return this.materialsRepo.createSurgeon({
      hospitalId,
      name: input.name,
      title: input.title ?? null,
      imageUrl: input.imageUrl ?? null,
      experienceYears: input.experienceYears ?? null,
      specialties: input.specialties ?? [],
      languages: input.languages ?? [],
    });
  }
}
