'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function createPackage(data: Record<string, unknown>) {
  const res = await apiFetch('/api/v2/packages', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to create package');
  }

  revalidatePath('/packages');
  return res.json();
}

export async function updatePackage(id: string, data: Record<string, unknown>) {
  const res = await apiFetch(`/api/v2/packages/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to update package');
  }

  revalidatePath('/packages');
  return res.json();
}

export async function publishPackage(id: string) {
  const res = await apiFetch(`/api/v2/packages/${id}/publish`, {
    method: 'POST',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to publish package');
  }

  revalidatePath('/packages');
  return res.json();
}

export async function unpublishPackage(id: string) {
  const res = await apiFetch(`/api/v2/packages/${id}/unpublish`, {
    method: 'POST',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to unpublish package');
  }

  revalidatePath('/packages');
  return res.json();
}
