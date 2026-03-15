import type { IConsultationRepository, ConsultationStatus } from '@medical-crm/domain';
import { ForbiddenError, NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConsultationDTO } from '../../dtos/consultation.dto.js';
import { toConsultationDTO } from '../../mappers/consultation.mapper.js';

export class UpdateConsultationStatusUseCase {
  constructor(private readonly consultationRepo: IConsultationRepository) {}

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
