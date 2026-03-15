import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { IHospitalManagementRepository, CaseListQuery } from '@medical-crm/domain';
import type { PaginatedResult } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import type { ListCasesUseCase } from '../cases/list-cases.use-case.js';

export class GetHospitalCasesUseCase {
  constructor(
    private readonly hospitalManagementRepo: IHospitalManagementRepository,
    private readonly listCases: ListCasesUseCase,
  ) {}

  async execute(
    id: string,
    query: CaseListQuery,
    actor: Actor,
  ): Promise<PaginatedResult<CaseDTO>> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can list hospital cases');
    }

    const hospital = await this.hospitalManagementRepo.findFullById(id);
    if (!hospital) {
      throw new NotFoundError(`Hospital ${id} not found`);
    }

    return this.listCases.execute({ ...query, hospitalId: id }, actor);
  }
}
