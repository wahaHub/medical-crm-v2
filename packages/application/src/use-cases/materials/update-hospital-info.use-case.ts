import type { IMaterialsRepository, MaterialsHospitalInfo } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export interface UpdateHospitalInfoInput {
  heroImage?: string | null;
  photos?: string[];
  highlights?: Array<{ icon: string; text: string }>;
}

export class UpdateHospitalInfoUseCase {
  constructor(private readonly materialsRepo: IMaterialsRepository) {}

  async execute(hospitalId: string, input: UpdateHospitalInfoInput, actor: Actor): Promise<MaterialsHospitalInfo> {
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    return this.materialsRepo.updateHospitalInfo(hospitalId, input);
  }
}
