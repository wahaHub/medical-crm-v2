import type { IQuoteRepository, ICaseRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { QuoteDTO } from '../../dtos/quote.dto.js';
import type { Actor } from '../../types/actor.js';
import { toQuoteDTO } from '../../mappers/quote.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class GetQuoteUseCase {
  constructor(
    private readonly quoteRepo: IQuoteRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(quoteId: string, actor: Actor): Promise<QuoteDTO> {
    const entity = await this.quoteRepo.findById(quoteId);
    if (!entity) throw new NotFoundError(`Quote ${quoteId} not found`);

    if (actor.role === 'HOSPITAL' && entity.hospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this quote');
    }

    if (actor.role === 'PATIENT') {
      const caseEntity = await this.caseRepo.findById(entity.caseId);
      if (!caseEntity || caseEntity.patientId !== actor.userId) {
        throw new ForbiddenError('Access denied to this quote');
      }
    }
    if (actor.role === 'ADMIN') {
      await this.adminAccess?.assertActorCanAccessCase(actor, entity.caseId);
    }
    if (actor.role === 'HOSPITAL') {
      await this.adminAccess?.assertActorCanAccessCase(actor, entity.caseId);
    }

    return toQuoteDTO(entity);
  }
}
