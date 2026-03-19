'use server';
import { apiClient } from '@/lib/api-client';
import { revalidatePath } from 'next/cache';

export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}) {
  const result = await apiClient('/api/v2/users/me/change-password', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return result;
}

export async function updatePreferences(data: {
  preferredLanguage?: string;
  notifications?: {
    newCase?: boolean;
    newMessage?: boolean;
    quoteStatusChange?: boolean;
    consultationReminder?: boolean;
  };
}) {
  const result = await apiClient('/api/v2/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings');
  return result;
}
