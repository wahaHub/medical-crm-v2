import type { IUserRepository, IKeycloakAdminService, UserProfile, NotificationPreferences } from '@medical-crm/domain';
import { NotFoundError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export interface UpdateProfileInput {
  email?: string;
  preferredLanguage?: string;
  notifications?: NotificationPreferences;
}

export class UpdateProfileUseCase {
  constructor(
    private readonly userRepo: IUserRepository,
    private readonly keycloakAdmin: IKeycloakAdminService,
  ) {}

  async execute(input: UpdateProfileInput, actor: Actor): Promise<UserProfile> {
    const existing = await this.userRepo.findById(actor.userId);
    if (!existing) {
      throw new NotFoundError(`User ${actor.userId} not found`);
    }

    // Update CRM DB
    await this.userRepo.update(actor.userId, {
      email: input.email,
      preferredLanguage: input.preferredLanguage,
      notificationSettings: input.notifications,
    });

    // If email changed, also sync to Keycloak
    if (input.email && input.email !== existing.email) {
      await this.keycloakAdmin.updateUserEmail(actor.userId, input.email);
    }

    // Return updated profile
    const updated = await this.userRepo.findById(actor.userId);
    return updated!;
  }
}
