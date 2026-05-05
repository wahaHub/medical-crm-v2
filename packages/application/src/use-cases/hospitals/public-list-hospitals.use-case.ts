import type { PaginatedResult } from '@medical-crm/utils';
import type { IHospitalManagementRepository, HospitalListQuery } from '@medical-crm/domain';
import type { HospitalDTO } from '../../dtos/hospital.dto.js';
import { toHospitalDTO } from '../../mappers/hospital.mapper.js';

export class PublicListHospitalsUseCase {
  constructor(private readonly hospitalManagementRepo: IHospitalManagementRepository) {}

  async execute(query: HospitalListQuery): Promise<PaginatedResult<HospitalDTO>> {
    const result = await this.hospitalManagementRepo.findMany(query);

    return {
      data: result.data.map(toHospitalDTO),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      hasMore: result.hasMore,
    };
  }
}
