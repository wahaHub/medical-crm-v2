import type { ICaseRepository, ICaseEventRepository } from '@medical-crm/domain';
import { CaseEvent } from '@medical-crm/domain';
import { generateId, NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseEventDTO } from '../../dtos/case-event.dto.js';
import { toCaseEventDTO } from '../../mappers/case-event.mapper.js';
import type { Actor } from '../../types/actor.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

/**
 * Case Lifecycle Phase 1: record an admin note / offline communication summary
 * (phone call, WeChat digest, etc.) as an ADMIN_NOTE case event on the timeline.
 */
export class AddCaseNoteUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly eventRepo: ICaseEventRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(caseId: string, note: string, actor: Actor): Promise<CaseEventDTO> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can add case notes');
    }

    const entity = await this.caseRepo.findById(caseId);
    if (!entity) throw new NotFoundError(`Case ${caseId} not found`);
    await this.adminAccess?.assertActorCanAccessCaseEntity(actor, entity);

    const saved = await this.eventRepo.save(new CaseEvent({
      id: generateId(),
      caseId,
      eventType: 'ADMIN_NOTE',
      actorType: 'ADMIN',
      actorId: actor.userId,
      eventData: { note },
      isVisibleToPatient: false,
      createdAt: new Date(),
    }));

    return toCaseEventDTO(saved);
  }
}
