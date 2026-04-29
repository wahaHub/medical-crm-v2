'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

async function readErrorMessage(
  res: Response,
  fallback: string,
): Promise<string> {
  const payload = await res.json().catch(() => ({})) as {
    message?: string;
    error?: string;
    code?: string;
  };
  return payload.message ?? payload.error ?? payload.code ?? fallback;
}

function resolveAdminOrigin(): string {
  const origin = (process.env.ADMIN_ORIGIN ?? process.env.NEXT_PUBLIC_ADMIN_ORIGIN)?.trim();
  if (origin) return origin.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_ORIGIN is required to generate hospital registration links');
  }
  return 'http://localhost:3002';
}

export async function updateHospitalStatus(hospitalId: string, status: string) {
  const res = await apiFetch(`/api/v2/hospitals/${hospitalId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to update hospital status'));
  }

  revalidatePath(`/hospitals/${hospitalId}`);
  revalidatePath('/hospitals');
  return res.json();
}

export async function generateRegistrationToken(hospitalId: string, email: string) {
  const res = await apiFetch(`/api/v2/hospitals/${hospitalId}/registration-token`, {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to generate registration token'));
  }

  const payload = await res.json() as { token: string; expiresAt: string };
  const registrationUrl = `${resolveAdminOrigin()}/auth/hospital/register?token=${encodeURIComponent(payload.token)}`;
  return { ...payload, registrationUrl };
}

export async function createHospital(data: Record<string, unknown>) {
  const res = await apiFetch('/api/v2/hospitals', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Failed to create hospital'));
  }

  revalidatePath('/hospitals');
  return res.json() as Promise<{ id: string }>;
}
