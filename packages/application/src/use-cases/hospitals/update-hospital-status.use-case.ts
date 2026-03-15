import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { IHospitalManagementRepository, HospitalStatus } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';
import type { HospitalDTO } from '../../dtos/hospital.dto.js';
import { toHospitalDTO } from '../../mappers/hospital.mapper.js';

export interface UpdateHospitalStatusInput {
  id: string;
  status: HospitalStatus;
}

export class UpdateHospitalStatusUseCase {
  constructor(private readonly hospitalRepo: IHospitalManagementRepository) {}

  async execute(input: UpdateHospitalStatusInput, actor: Actor): Promise<HospitalDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can update hospital status');
    }

    const entity = await this.hospitalRepo.findFullById(input.id);
    if (!entity) {
      throw new NotFoundError(`Hospital ${input.id} not found`);
    }

    if (input.status === 'ACTIVE') {
      entity.activate();
    } else if (input.status === 'INACTIVE') {
      entity.deactivate();
    }

    const saved = await this.hospitalRepo.updateStatus(input.id, input.status);
    return toHospitalDTO(saved);
  }
}
