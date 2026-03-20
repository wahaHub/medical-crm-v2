'use server';

import { apiFetch } from '@/lib/api-fetch';
import { revalidatePath } from 'next/cache';

export async function replyToTicket(
  ticketId: string,
  content: string,
  attachments?: Array<{ storageKey: string; fileName: string; mimeType: string; fileSize: number }>,
) {
  const res = await apiFetch(`/api/v2/tickets/${ticketId}/reply`, {
    method: 'POST',
    body: JSON.stringify({
      content,
      ...(attachments?.length ? { attachments } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to reply to ticket');
  }

  revalidatePath('/cases');
  return res.json();
}

export async function uploadTicketAttachment(
  ticketId: string,
  params: { fileName: string; fileSize: number; mimeType: string },
): Promise<{ upload: { uploadUrl: string; storageKey: string; expiresIn: number }; asset: { storageKey: string; fileName: string; mimeType: string; fileSize: number } }> {
  const res = await apiFetch(`/api/v2/tickets/${ticketId}/attachments/upload`, {
    method: 'POST',
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to initialize ticket attachment upload');
  }

  return res.json();
}

export async function assignTicket(ticketId: string, assigneeId: string) {
  const res = await apiFetch(`/api/v2/tickets/${ticketId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ assignedTo: assigneeId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to assign ticket');
  }

  revalidatePath('/cases');
  return res.json();
}

export async function updateTicketStatus(ticketId: string, status: string) {
  const res = await apiFetch(`/api/v2/tickets/${ticketId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to update ticket status');
  }

  revalidatePath('/cases');
  return res.json();
}

export async function closeTicket(ticketId: string) {
  const res = await apiFetch(`/api/v2/tickets/${ticketId}/close`, {
    method: 'POST',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(err.message ?? 'Failed to close ticket');
  }

  revalidatePath('/cases');
  return res.json();
}
