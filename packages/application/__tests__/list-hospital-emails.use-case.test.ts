import { describe, expect, it, vi } from 'vitest';
import type { IUserRepository } from '@medical-crm/domain';
import { ListHospitalEmailsUseCase } from '../src/use-cases/users/list-hospital-emails.use-case.js';

describe('ListHospitalEmailsUseCase', () => {
  it('lists emails for the hospital attached to the actor', async () => {
    const userRepo = {
      listHospitalEmails: vi.fn().mockResolvedValue([
        'owner@hospital.test',
        'assistant@hospital.test',
      ]),
    } as unknown as IUserRepository;
    const useCase = new ListHospitalEmailsUseCase(userRepo);

    await expect(useCase.execute({
      userId: 'user-1',
      email: 'owner@hospital.test',
      role: 'HOSPITAL',
      hospitalId: 'hospital-1',
    })).resolves.toEqual([
      'owner@hospital.test',
      'assistant@hospital.test',
    ]);

    expect(userRepo.listHospitalEmails).toHaveBeenCalledWith('hospital-1');
  });

  it('rejects hospital actors without a hospital id', async () => {
    const useCase = new ListHospitalEmailsUseCase({} as IUserRepository);

    await expect(useCase.execute({
      userId: 'user-1',
      email: 'owner@hospital.test',
      role: 'HOSPITAL',
      hospitalId: null,
    })).rejects.toThrow('Hospital actor missing hospitalId');
  });

  it('rejects non-hospital actors', async () => {
    const useCase = new ListHospitalEmailsUseCase({} as IUserRepository);

    await expect(useCase.execute({
      userId: 'admin-1',
      email: 'admin@test.com',
      role: 'ADMIN',
      hospitalId: null,
    })).rejects.toThrow('Only hospital users can list hospital emails');
  });
});
