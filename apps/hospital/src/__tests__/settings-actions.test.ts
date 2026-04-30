import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/errors';

const mockApiClient = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

describe('settings actions', () => {
  const originalEnv = {
    ADMIN_ORIGIN: process.env.ADMIN_ORIGIN,
    NEXT_PUBLIC_ADMIN_ORIGIN: process.env.NEXT_PUBLIC_ADMIN_ORIGIN,
    NODE_ENV: process.env.NODE_ENV,
  };

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    mockApiClient.mockReset();
    mockRevalidatePath.mockClear();
    if (originalEnv.ADMIN_ORIGIN === undefined) {
      delete process.env.ADMIN_ORIGIN;
    } else {
      process.env.ADMIN_ORIGIN = originalEnv.ADMIN_ORIGIN;
    }
    if (originalEnv.NEXT_PUBLIC_ADMIN_ORIGIN === undefined) {
      delete process.env.NEXT_PUBLIC_ADMIN_ORIGIN;
    } else {
      process.env.NEXT_PUBLIC_ADMIN_ORIGIN = originalEnv.NEXT_PUBLIC_ADMIN_ORIGIN;
    }
    if (originalEnv.NODE_ENV) {
      vi.stubEnv('NODE_ENV', originalEnv.NODE_ENV);
    }
  });

  it('surfaces the API conflict reason when inviting a registered hospital email', async () => {
    mockApiClient.mockRejectedValueOnce(new ApiError(409, {
      error: 'This email is already registered for another hospital.',
      code: 'CONFLICT',
    }));

    const { inviteHospitalEmail } = await import('@/actions/settings-actions');

    await expect(inviteHospitalEmail('rosielinkedin@gmail.com')).rejects.toThrow(
      'This email is already registered for another hospital.',
    );
  });

  it('builds the fallback registration URL from the configured admin origin', async () => {
    process.env.ADMIN_ORIGIN = 'https://admin.medicaltourismchina.health/';
    mockApiClient.mockResolvedValueOnce({
      token: 'registration-token',
      expiresAt: '2026-05-02T00:00:00.000Z',
    });

    const { inviteHospitalEmail } = await import('@/actions/settings-actions');

    await expect(inviteHospitalEmail('new@hospital.com')).resolves.toEqual({
      token: 'registration-token',
      expiresAt: '2026-05-02T00:00:00.000Z',
      registrationUrl: 'https://admin.medicaltourismchina.health/auth/hospital/register?token=registration-token',
    });
  });

  it('does not build a localhost registration URL in production when admin origin is missing', async () => {
    delete process.env.ADMIN_ORIGIN;
    delete process.env.NEXT_PUBLIC_ADMIN_ORIGIN;
    vi.stubEnv('NODE_ENV', 'production');
    mockApiClient.mockResolvedValueOnce({
      token: 'registration-token',
      expiresAt: '2026-05-02T00:00:00.000Z',
    });

    const { inviteHospitalEmail } = await import('@/actions/settings-actions');

    await expect(inviteHospitalEmail('new@hospital.com')).rejects.toThrow(
      'ADMIN_ORIGIN is required to generate hospital registration links',
    );
  });
});
