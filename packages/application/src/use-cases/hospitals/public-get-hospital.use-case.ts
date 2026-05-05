import { NotFoundError } from '@medical-crm/utils';
import type { IHospitalManagementRepository, HospitalSite } from '@medical-crm/domain';
import type { HospitalDTO } from '../../dtos/hospital.dto.js';
import { toHospitalDTO } from '../../mappers/hospital.mapper.js';

export class PublicGetHospitalUseCase {
  constructor(private readonly hospitalManagementRepo: IHospitalManagementRepository) {}

  async execute(id: string, site: HospitalSite): Promise<HospitalDTO> {
    const hospital = await this.hospitalManagementRepo.findFullById(id);

    if (
      !hospital
      || hospital.site !== site
      || hospital.status !== 'ACTIVE'
      || hospital.type !== 'REGULAR'
    ) {
      throw new NotFoundError(`Hospital ${id} not found`);
    }

    return toHospitalDTO(hospital);
  }
}
