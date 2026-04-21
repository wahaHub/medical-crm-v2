import type { ICaseEventRepository, ICaseRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseEventDTO } from '../../dtos/case-event.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseEventDTO } from '../../mappers/case-event.mapper.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';

export class ListCaseEventsUseCase {
  constructor(
    private readonly eventRepo: ICaseEventRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo?: ICHCRepository,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<CaseEventDTO[]> {
    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(caseEntity, actor.hospitalId, this.chcRepo);
    }
    if (actor.role === 'PATIENT' && caseEntity.patientId !== actor.userId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const events = await this.eventRepo.findByCaseId(caseId);
    return events.map(toCaseEventDTO);
  }
}
