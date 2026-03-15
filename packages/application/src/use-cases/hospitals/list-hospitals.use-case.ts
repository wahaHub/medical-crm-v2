import { ForbiddenError } from '@medical-crm/utils';
import type { PaginatedResult } from '@medical-crm/utils';
import type { IHospitalManagementRepository, HospitalListQuery } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';
import type { HospitalDTO } from '../../dtos/hospital.dto.js';
import { toHospitalDTO } from '../../mappers/hospital.mapper.js';

export class ListHospitalsUseCase {
  constructor(private readonly hospitalManagementRepo: IHospitalManagementRepository) {}

  async execute(query: HospitalListQuery, actor: Actor): Promise<PaginatedResult<HospitalDTO>> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can list hospitals');
    }

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
