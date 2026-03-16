import type { ICaseRepository, IJourneyRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseJourneyDTO } from '../../dtos/journey.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseJourneyDTO } from '../../mappers/journey.mapper.js';

export class GetCaseJourneyUseCase {
  constructor(
    private readonly journeyRepo: IJourneyRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<CaseJourneyDTO | null> {
    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) throw new NotFoundError(`Case ${caseId} not found`);

    // AuthZ
    if (actor.role === 'HOSPITAL') {
      if (actor.hospitalId !== caseEntity.assignedHospitalId) {
        throw new ForbiddenError('Hospital can only access journeys for assigned cases');
      }
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
