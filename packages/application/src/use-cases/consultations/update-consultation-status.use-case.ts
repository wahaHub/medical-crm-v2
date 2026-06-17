import type { IConsultationRepository, ConsultationStatus } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConsultationDTO } from '../../dtos/consultation.dto.js';
import { toConsultationDTO } from '../../mappers/consultation.mapper.js';
import type { AdminPatientSiteAccessPolicy } from '../../access/admin-patient-site-access.js';

export class UpdateConsultationStatusUseCase {
  constructor(
    private readonly consultationRepo: IConsultationRepository,
    private readonly adminAccess?: AdminPatientSiteAccessPolicy,
  ) {}

  async execute(
    id: string,
    status: ConsultationStatus,
    actor: Actor,
  ): Promise<ConsultationDTO> {
    const entity = await this.consultationRepo.findById(id);
    if (!entity) {
      throw new NotFoundError(`Consultation ${id} not found`);
    }

    if (actor.role === 'HOSPITAL' && entity.hospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this consultation');
    }
    if (actor.role === 'ADMIN') {
      await this.adminAccess?.assertActorCanAccessCase(actor, entity.caseId);
    }

    switch (status) {
      case 'IN_PROGRESS':
        entity.start();
        break;
      case 'COMPLETED':
        entity.complete();
        break;
      case 'CANCELLED':
        entity.cancel();
        break;
      case 'NO_SHOW':
        entity.noShow();
        break;
      default:
        throw new Error(`Unsupported target status: ${status}`);
    }

    const saved = await this.consultationRepo.save(entity);
    return toConsultationDTO(saved);
  }
}
