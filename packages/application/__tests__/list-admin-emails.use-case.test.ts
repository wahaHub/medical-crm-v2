import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IUserRepository } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';
import { ListAdminEmailsUseCase } from '../src/use-cases/users/list-admin-emails.use-case.js';

describe('ListAdminEmailsUseCase', () => {
  let useCase: ListAdminEmailsUseCase;
  let mockUserRepo: IUserRepository;

  const adminActor: Actor = {
    userId: 'admin-1',
    email: 'admin@test.com',
    role: 'ADMIN',
    hospitalId: null,
  };

  const hospitalActor: Actor = {
    userId: 'hospital-1',
    email: 'hospital@test.com',
    role: 'HOSPITAL',
    hospitalId: 'hospital-1',
  };

  beforeEach(() => {
    mockUserRepo = {
      create: vi.fn(),
      findPreferredLanguage: vi.fn(),
      findById: vi.fn(),
      findByEmail: vi.fn(),
      update: vi.fn(),
      listAdminEmails: vi.fn().mockResolvedValue([
        'alpha@medicaltourismchina.health',
        'zeta@medicaltourismchina.health',
      ]),
      listHospitalEmails: vi.fn(),
    } as IUserRepository;

    useCase = new ListAdminEmailsUseCase(mockUserRepo);
  });

  it('returns all admin emails for ADMIN actor', async () => {
    await expect(useCase.execute(adminActor)).resolves.toEqual([
      'alpha@medicaltourismchina.health',
      'zeta@medicaltourismchina.health',
    ]);
  });

  it('delegates to the user repository', async () => {
    await useCase.execute(adminActor);

    expect(mockUserRepo.listAdminEmails).toHaveBeenCalledOnce();
  });

  it('throws for non-admin actors', async () => {
    await expect(useCase.execute(hospitalActor)).rejects.toThrow('Only admins can list admin emails');
  });
});
