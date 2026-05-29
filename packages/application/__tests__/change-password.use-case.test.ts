import { describe, expect, it, vi } from 'vitest';
import type { IKeycloakAdminService } from '@medical-crm/domain';
import { ForbiddenError } from '@medical-crm/utils';
import { ChangePasswordUseCase } from '../src/use-cases/users/change-password.use-case.js';

function makeKeycloakAdmin(overrides: Partial<IKeycloakAdminService> = {}): IKeycloakAdminService {
  return {
    createUser: vi.fn(),
    setPassword: vi.fn().mockResolvedValue(undefined),
    assignRole: vi.fn(),
    deleteUser: vi.fn(),
    checkUsernameExists: vi.fn(),
    checkEmailExists: vi.fn(),
    updateUserEmail: vi.fn(),
    verifyPassword: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

describe('ChangePasswordUseCase', () => {
  it('sets the new password with the Keycloak user id, not the CRM user id', async () => {
    const keycloakAdmin = makeKeycloakAdmin();
    const useCase = new ChangePasswordUseCase(keycloakAdmin, 'portal-web', 'secret');

    await useCase.execute(
      { currentPassword: 'CurrentPass123', newPassword: 'NewPass123' },
      {
        userId: 'crm-user-id',
        keycloakUserId: 'keycloak-user-id',
        email: 'hospital@example.com',
        role: 'HOSPITAL',
        hospitalId: 'hospital-id',
      },
    );

    expect(keycloakAdmin.verifyPassword).toHaveBeenCalledWith(
      'hospital@example.com',
      'CurrentPass123',
      'portal-web',
      'secret',
    );
    expect(keycloakAdmin.setPassword).toHaveBeenCalledWith('keycloak-user-id', 'NewPass123');
  });

  it('rejects when the current password is wrong', async () => {
    const keycloakAdmin = makeKeycloakAdmin({
      verifyPassword: vi.fn().mockResolvedValue(false),
    });
    const useCase = new ChangePasswordUseCase(keycloakAdmin, 'portal-web');

    await expect(
      useCase.execute(
        { currentPassword: 'WrongPass123', newPassword: 'NewPass123' },
        {
          userId: 'crm-user-id',
          keycloakUserId: 'keycloak-user-id',
          email: 'hospital@example.com',
          role: 'HOSPITAL',
          hospitalId: 'hospital-id',
        },
      ),
    ).rejects.toThrow('Current password is incorrect');
    expect(keycloakAdmin.setPassword).not.toHaveBeenCalled();
  });

  it('rejects when the session is missing the Keycloak user id', async () => {
    const keycloakAdmin = makeKeycloakAdmin();
    const useCase = new ChangePasswordUseCase(keycloakAdmin, 'portal-web');

    await expect(
      useCase.execute(
        { currentPassword: 'CurrentPass123', newPassword: 'NewPass123' },
        {
          userId: 'crm-user-id',
          keycloakUserId: null,
          email: 'hospital@example.com',
          role: 'HOSPITAL',
          hospitalId: 'hospital-id',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(keycloakAdmin.verifyPassword).not.toHaveBeenCalled();
    expect(keycloakAdmin.setPassword).not.toHaveBeenCalled();
  });
});
