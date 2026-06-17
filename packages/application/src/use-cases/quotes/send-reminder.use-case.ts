import type { ICHCRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseHospitalContactDTO } from '../../dtos/case-hospital-contact.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseHospitalContactDTO } from '../../mappers/case-hospital-contact.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class SendReminderUseCase {
  constructor(
    private readonly chcRepo: ICHCRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(chcId: string, actor: Actor): Promise<CaseHospitalContactDTO> {
    if (actor.role !== 'ADMIN') throw new ForbiddenError('Only admins can send reminders');

    const entity = await this.chcRepo.findById(chcId);
    if (!entity) throw new NotFoundError(`CaseHospitalContact ${chcId} not found`);
    await this.adminAccess?.assertActorCanAccessCase(actor, entity.caseId);

    entity.reminderSentAt = new Date();
    entity.updatedAt = new Date();
    const saved = await this.chcRepo.save(entity);
    return toCaseHospitalContactDTO(saved);
  }
}
