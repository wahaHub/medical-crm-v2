'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function updateHospitalStatus(hospitalId: string, status: string) {
  const res = await apiFetch(`/api/v2/hospitals/${hospitalId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to update hospital status');
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
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to generate registration token');
  }

  const payload = await res.json() as { token: string; expiresAt: string };
  const adminOrigin = process.env.ADMIN_ORIGIN ?? process.env.NEXT_PUBLIC_ADMIN_ORIGIN ?? 'http://localhost:3002';
  const registrationUrl = `${adminOrigin}/auth/hospital/register?token=${encodeURIComponent(payload.token)}`;
  return { ...payload, registrationUrl };
}

export async function createHospital(data: Record<string, unknown>) {
  const res = await apiFetch('/api/v2/hospitals', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to create hospital');
  }

  revalidatePath('/hospitals');
  return res.json() as Promise<{ id: string }>;
}
