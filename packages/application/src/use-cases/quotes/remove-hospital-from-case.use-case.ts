import type { ICHCRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseHospitalContactDTO } from '../../dtos/case-hospital-contact.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseHospitalContactDTO } from '../../mappers/case-hospital-contact.mapper.js';

export class RemoveHospitalFromCaseUseCase {
  constructor(private readonly chcRepo: ICHCRepository) {}

  async execute(chcId: string, reason: string | undefined, actor: Actor): Promise<CaseHospitalContactDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can remove hospitals from cases');

    const entity = await this.chcRepo.findById(chcId);
    if (!entity) throw new NotFoundError(`CaseHospitalContact ${chcId} not found`);

    entity.remove(reason);
    const saved = await this.chcRepo.save(entity);
    return toCaseHospitalContactDTO(saved);
  }
}
