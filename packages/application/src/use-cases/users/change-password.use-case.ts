import type { IKeycloakAdminService } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export class ChangePasswordUseCase {
  constructor(
    private readonly keycloakAdmin: IKeycloakAdminService,
    private readonly keycloakClientId: string,
    private readonly keycloakClientSecret?: string,
  ) {}

  async execute(input: ChangePasswordInput, actor: Actor): Promise<void> {
    // Verify current password via direct grant
    const valid = await this.keycloakAdmin.verifyPassword(
      actor.email,
      input.currentPassword,
      this.keycloakClientId,
      this.keycloakClientSecret,
    );

    if (!valid) {
      throw new ForbiddenError('Current password is incorrect');
    }

    // Set new password via admin API
    await this.keycloakAdmin.setPassword(actor.userId, input.newPassword);
  }
}
