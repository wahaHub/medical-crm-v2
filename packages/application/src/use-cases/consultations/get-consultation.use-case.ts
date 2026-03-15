import type { IConsultationRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { ConsultationDTO } from '../../dtos/consultation.dto.js';
import { toConsultationDTO } from '../../mappers/consultation.mapper.js';

export class GetConsultationUseCase {
  constructor(private readonly consultationRepo: IConsultationRepository) {}

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

    return toConsultationDTO(entity);
  }
}
