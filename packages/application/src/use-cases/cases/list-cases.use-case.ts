import type { ICaseRepository, CaseListQuery } from '@medical-crm/domain';
import type { PaginatedResult } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';

export class ListCasesUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(query: CaseListQuery, actor: Actor): Promise<PaginatedResult<CaseDTO>> {
    const hospitalId = actor.role === 'HOSPITAL' ? actor.hospitalId! : undefined;
    const result = await this.caseRepo.findMany(query, hospitalId);
    return {
      ...result,
      data: result.data.map((c) => toCaseDTO(c)),
    };
  }
}
