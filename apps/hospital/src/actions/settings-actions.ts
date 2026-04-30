'use server';
import { apiClient } from '@/lib/api-client';
import { ApiError } from '@/lib/errors';
import { revalidatePath } from 'next/cache';

function readApiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') {
    return fallback;
  }

  const record = body as Record<string, unknown>;
  const fields = ['message', 'error', 'code', 'detail'];
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  return fallback;
}

function hasApiErrorBody(error: unknown): error is { body: unknown } {
  return error instanceof ApiError
    || (
      !!error
      && typeof error === 'object'
      && 'body' in error
      && 'status' in error
    );
}

function resolveAdminOrigin(): string {
  const origin = (process.env.ADMIN_ORIGIN ?? process.env.NEXT_PUBLIC_ADMIN_ORIGIN)?.trim();
  if (origin) return origin.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ADMIN_ORIGIN is required to generate hospital registration links');
  }
  return 'http://localhost:3002';
}

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

export async function listHospitalEmails(): Promise<{ emails: string[] }> {
  return apiClient('/api/v2/hospital/settings/hospital-emails');
}

export async function inviteHospitalEmail(email: string): Promise<{
  token: string;
  expiresAt: string;
  registrationUrl: string;
}> {
  let result: { token: string; expiresAt: string };
  try {
    result = await apiClient<{ token: string; expiresAt: string }>(
      '/api/v2/hospital/settings/hospital-emails/invitations',
      {
        method: 'POST',
        body: JSON.stringify({ email }),
      },
    );
  } catch (error) {
    if (hasApiErrorBody(error)) {
      throw new Error(readApiErrorMessage(error.body, 'Failed to send registration invitation.'));
    }
    throw error;
  }

  revalidatePath('/settings');
  const registrationUrl = `${resolveAdminOrigin()}/auth/hospital/register?token=${encodeURIComponent(result.token)}`;
  return { ...result, registrationUrl };
}
