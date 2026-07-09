import type { IConsultationRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConsultationDTO } from '../../dtos/consultation.dto.js';
import { toConsultationDTO } from '../../mappers/consultation.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class GetConsultationUseCase {
  constructor(
    private readonly consultationRepo: IConsultationRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(id: string, actor: Actor): Promise<ConsultationDTO> {
    const entity = await this.consultationRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`Consultation ${id} not found`);
    }

    if (actor.role === 'HOSPITAL') {
      if (entity.hospitalId !== actor.hospitalId) {
        throw new ForbiddenError('Access denied to this consultation');
      }
    }
    if (actor.role === 'ADMIN' || actor.role === 'HOSPITAL') {
      await this.adminAccess?.assertActorCanAccessCase(actor, entity.caseId);
    }

    return toConsultationDTO(entity);
  }
}
