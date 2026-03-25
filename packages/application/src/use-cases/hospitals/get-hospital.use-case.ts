import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { IHospitalManagementRepository, IUserRepository } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';
import type { HospitalDTO } from '../../dtos/hospital.dto.js';
import { toHospitalDTO } from '../../mappers/hospital.mapper.js';

export class GetHospitalUseCase {
  constructor(
    private readonly hospitalManagementRepo: IHospitalManagementRepository,
    private readonly userRepo: IUserRepository,
  ) {}

  async execute(id: string, actor: Actor): Promise<HospitalDTO> {
    const hospital = await this.hospitalManagementRepo.findFullById(id);

    if (!hospital) {
      throw new NotFoundError(`Hospital ${id} not found`);
    }

    if (actor.role === 'HOSPITAL' && actor.hospitalId !== id) {
      throw new ForbiddenError('Access denied to this hospital');
    }

    const preferredLanguage = await this.userRepo.findPreferredLanguage(id);
    return {
      ...toHospitalDTO(hospital),
      hasRegisteredUser: preferredLanguage !== null,
    };
  }
}
