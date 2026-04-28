import type { IUserRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class ListHospitalEmailsUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(actor: Actor): Promise<string[]> {
    if (actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Only hospital users can list hospital emails');
    }

    if (!actor.hospitalId) {
      throw new ForbiddenError('Hospital actor missing hospitalId');
    }

    return this.userRepo.listHospitalEmails(actor.hospitalId);
  }
}
