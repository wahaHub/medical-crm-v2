import type { IConsultationRepository, ICaseRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConsultationDTO } from '../../dtos/consultation.dto.js';
import { toConsultationDTO } from '../../mappers/consultation.mapper.js';

export class ListCaseConsultationsUseCase {
  constructor(
    private readonly consultationRepo: IConsultationRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<ConsultationDTO[]> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admin users can list case consultations');
    }

    const caseEntity = await this.caseRepo.findById(caseId);
    if (!caseEntity) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }

    const consultations = await this.consultationRepo.findByCaseId(caseId);
    return consultations.map(toConsultationDTO);
  }
}
