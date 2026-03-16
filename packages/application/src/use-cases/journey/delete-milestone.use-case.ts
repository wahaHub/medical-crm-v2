import type { IJourneyRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class DeleteMilestoneUseCase {
  constructor(
    private readonly journeyRepo: IJourneyRepository,
  ) {}

  async execute(milestoneId: string, actor: Actor): Promise<void> {
    // Admin only
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can delete milestones');
    }

    const milestone = await this.journeyRepo.findMilestoneById(milestoneId);
    if (!milestone) throw new NotFoundError(`Milestone ${milestoneId} not found`);

    await this.journeyRepo.deleteMilestone(milestoneId);
  }
}
