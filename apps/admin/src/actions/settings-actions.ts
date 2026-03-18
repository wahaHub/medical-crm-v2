'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function updateProfile(data: { email?: string; preferredLanguage?: string }) {
  const res = await apiFetch('/api/v2/users/me', { method: 'PATCH', body: JSON.stringify(data) });
  if (!res.ok) { const err = await res.json().catch(() => ({})) as { message?: string }; throw new Error(err.message || 'Failed'); }
  revalidatePath('/settings');
  return res.json();
}

export async function changePassword(data: { currentPassword: string; newPassword: string }) {
  const res = await apiFetch('/api/v2/users/me/change-password', { method: 'POST', body: JSON.stringify(data) });
  if (!res.ok) { const err = await res.json().catch(() => ({})) as { message?: string }; throw new Error(err.message || 'Failed'); }
  return res.json();
}
