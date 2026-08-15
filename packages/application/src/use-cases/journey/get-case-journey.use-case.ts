import type { ICaseRepository, IJourneyRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseJourneyDTO } from '../../dtos/journey.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseJourneyDTO } from '../../mappers/journey.mapper.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class GetCaseJourneyUseCase {
  constructor(
    private readonly journeyRepo: IJourneyRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo?: ICHCRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<CaseJourneyDTO | null> {
    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) throw new NotFoundError(`Case ${caseId} not found`);
    await this.adminAccess?.assertStaffCaseNotExcludedByPatientEmail(actor, caseEntity);

    // AuthZ
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(caseEntity, actor.hospitalId, this.chcRepo, 'Hospital can only access journeys for assigned cases');
    } else if (actor.role === 'PATIENT') {
      if (actor.userId !== caseEntity.patientId) {
        throw new ForbiddenError('Patient can only access their own case journey');
      }
    } else {
      await this.adminAccess?.assertActorCanAccessCaseEntity(actor, caseEntity);
    }
    // ADMIN always has access

    const journey = await this.journeyRepo.findJourneyByCaseId(caseId);
    if (!journey) return null;
    return toCaseJourneyDTO(journey);
  }
}
