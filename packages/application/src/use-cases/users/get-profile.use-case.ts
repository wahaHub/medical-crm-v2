import type { IUserRepository, UserProfile } from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export class GetProfileUseCase {
  constructor(private readonly userRepo: IUserRepository) {}

  async execute(actor: Actor): Promise<UserProfile> {
    const profile = await this.userRepo.findById(actor.userId);
    if (!profile) {
      throw new NotFoundError(`User ${actor.userId} not found`);
    }
    return profile;
  }
}
