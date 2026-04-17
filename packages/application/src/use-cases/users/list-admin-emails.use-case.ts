import type { IUserRepository } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class ListAdminEmailsUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(actor: Actor): Promise<string[]> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can list admin emails');
    }

    return this.userRepo.listAdminEmails();
  }
}
