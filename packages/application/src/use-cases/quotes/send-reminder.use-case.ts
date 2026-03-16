import type { ICHCRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseHospitalContactDTO } from '../../dtos/case-hospital-contact.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseHospitalContactDTO } from '../../mappers/case-hospital-contact.mapper.js';

export class SendReminderUseCase {
  constructor(private readonly chcRepo: ICHCRepository) {}

  async execute(chcId: string, actor: Actor): Promise<CaseHospitalContactDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can send reminders');

    const entity = await this.chcRepo.findById(chcId);
    if (!entity) throw new NotFoundError(`CaseHospitalContact ${chcId} not found`);

    entity.reminderSentAt = new Date();
    entity.updatedAt = new Date();
    const saved = await this.chcRepo.save(entity);
    return toCaseHospitalContactDTO(saved);
  }
}
