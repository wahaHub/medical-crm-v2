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
  beforeEach(() => {
    vi.resetModules();
    mockApiClient.mockReset();
    mockRevalidatePath.mockClear();
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
});
