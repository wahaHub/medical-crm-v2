import type { IConsultationRepository, ConsultationStats } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class GetConsultationStatsUseCase {
  constructor(private readonly consultationRepo: IConsultationRepository) {}

  async execute(actor: Actor): Promise<ConsultationStats> {
    if (actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Only hospital users can view consultation stats');
    }

    return this.consultationRepo.countByFilters({ hospitalId: actor.hospitalId! });
  }
}
