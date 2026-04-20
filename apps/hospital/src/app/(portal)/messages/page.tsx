import { redirect } from 'next/navigation';
import { apiClient, isUnauthorizedApiError } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-fetch';
import type { PaginatedResponse, ConversationSummary } from '@/lib/api-types';
import { MessagesView } from '@/components/messages-view';
import { loadMessages, normalizeLocale, translateMessage } from '@medical-crm/i18n';

interface UserProfileResponse {
  preferredLanguage?: string;
}

function isRedirectFailure(error: unknown): boolean {
  return (
    error instanceof Error
    && (
      error.message.startsWith('REDIRECT:')
      || ('digest' in error
        && typeof (error as { digest?: unknown }).digest === 'string'
        && (error as { digest: string }).digest.startsWith('NEXT_REDIRECT'))
    )
  );
}

const EMPTY_CONVERSATIONS: PaginatedResponse<ConversationSummary> = { data: [] };
const SERVER_PAGE_API_OPTIONS = { onUnauthorized: 'throw' as const };
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const conversationId = typeof params.conversation === 'string' ? params.conversation : null;
  const profile = await apiFetch('/api/v2/users/me')
    .then(async (profileRes) => {
      if (profileRes.status === 401) {
        redirect('/auth/login');
      }

      return profileRes.ok
        ? await profileRes.json() as UserProfileResponse
        : null;
    })
    .catch((error) => {
      if (isRedirectFailure(error)) {
        throw error;
      }
      console.error('[MessagesPage] Failed to load user profile:', error);
      return null;
    });
  const locale = normalizeLocale(profile?.preferredLanguage);
  const messagesBundle = await loadMessages(locale);
  const conversationsResult = await Promise.allSettled([
    apiClient<PaginatedResponse<ConversationSummary>>('/api/v2/conversations', undefined, {
      ...SERVER_PAGE_API_OPTIONS,
      debugLabel: 'MessagesPage.conversations',
    }),
  ]);
  const conversations = conversationsResult[0]?.status === 'fulfilled'
    ? conversationsResult[0].value
    : EMPTY_CONVERSATIONS;

  if (
    conversationsResult[0]?.status === 'rejected'
    && isUnauthorizedApiError(conversationsResult[0].reason)
  ) {
    redirect('/auth/login');
  }

  if (conversationsResult[0]?.status === 'rejected') {
    console.error('[MessagesPage] Failed to load conversations:', conversationsResult[0].reason);
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-900">
          {translateMessage(messagesBundle, 'hospital.portal.messages.page.title', undefined, 'Messages')}
        </h1>
        <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200/50 rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5">
          {translateMessage(
            messagesBundle,
            'hospital.portal.messages.page.forwardingMode',
            undefined,
            'CRM Forwarding Mode',
          )}
        </span>
      </div>
      <MessagesView initialConversations={conversations} initialConversationId={conversationId} />
    </div>
  );
}
