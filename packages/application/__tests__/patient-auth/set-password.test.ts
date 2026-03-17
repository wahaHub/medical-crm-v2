import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SetPasswordUseCase } from '../../src/use-cases/patient-auth/set-password.use-case.js';

describe('SetPasswordUseCase', () => {
  let useCase: SetPasswordUseCase;
  let mockPatientRepo: any;

  beforeEach(() => {
    mockPatientRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      createTempPatient: vi.fn(),
      updatePasswordHash: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new SetPasswordUseCase(mockPatientRepo);
  });

  it('hashes the password and updates the patient record', async () => {
    await useCase.execute({ userId: 'patient-1', password: 'SecurePass123' });

    expect(mockPatientRepo.updatePasswordHash).toHaveBeenCalledOnce();
    const [userId, hash] = mockPatientRepo.updatePasswordHash.mock.calls[0];
    expect(userId).toBe('patient-1');
    // Verify it's a bcrypt hash (starts with $2a$ or $2b$)
    expect(hash).toMatch(/^\$2[ab]\$/);
  });
});
