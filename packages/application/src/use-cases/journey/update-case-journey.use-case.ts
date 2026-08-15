import type { ICaseRepository, IJourneyRepository } from '@medical-crm/domain';
import { CaseJourney } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseJourneyDTO } from '../../dtos/journey.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseJourneyDTO } from '../../mappers/journey.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export interface UpdateJourneyInput {
  visa?: unknown;
  insurance?: unknown;
  accommodation?: unknown;
  transportation?: unknown;
  postCare?: unknown;
}

export class UpdateCaseJourneyUseCase {
  constructor(
    private readonly journeyRepo: IJourneyRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(caseId: string, input: UpdateJourneyInput, actor: Actor): Promise<CaseJourneyDTO> {
    // Admin only
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can update case journeys');
    }

    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) throw new NotFoundError(`Case ${caseId} not found`);
    await this.adminAccess?.assertStaffCaseNotExcludedByPatientEmail(actor, caseEntity);
    await this.adminAccess?.assertActorCanAccessCaseEntity(actor, caseEntity);

    let journey = await this.journeyRepo.findJourneyByCaseId(caseId);

    if (!journey) {
      // Create new journey (upsert)
      journey = new CaseJourney({
        id: crypto.randomUUID(),
        caseId,
        visa: input.visa ?? null,
        insurance: input.insurance ?? null,
        accommodation: input.accommodation ?? null,
        transportation: input.transportation ?? null,
        postCare: input.postCare ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } else {
      journey.update({
        visa: input.visa,
        insurance: input.insurance,
        accommodation: input.accommodation,
        transportation: input.transportation,
        postCare: input.postCare,
      });
    }

    const saved = await this.journeyRepo.saveJourney(journey);
    return toCaseJourneyDTO(saved);
  }
}
