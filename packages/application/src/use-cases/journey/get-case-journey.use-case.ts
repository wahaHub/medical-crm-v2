import type { ICaseRepository, IJourneyRepository, ICHCRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseJourneyDTO } from '../../dtos/journey.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseJourneyDTO } from '../../mappers/journey.mapper.js';
import { assertHospitalCaseAccess } from '../cases/hospital-case-access.js';

export class GetCaseJourneyUseCase {
  constructor(
    private readonly journeyRepo: IJourneyRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly chcRepo?: ICHCRepository,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<CaseJourneyDTO | null> {
    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) throw new NotFoundError(`Case ${caseId} not found`);

    // AuthZ
    if (actor.role === 'HOSPITAL') {
      await assertHospitalCaseAccess(caseEntity, actor.hospitalId, this.chcRepo, 'Hospital can only access journeys for assigned cases');
    } else if (actor.role === 'PATIENT') {
      if (actor.userId !== caseEntity.patientId) {
        throw new ForbiddenError('Patient can only access their own case journey');
      }
    }
    // ADMIN always has access

    const journey = await this.journeyRepo.findJourneyByCaseId(caseId);
    if (!journey) return null;
    return toCaseJourneyDTO(journey);
  }
}
