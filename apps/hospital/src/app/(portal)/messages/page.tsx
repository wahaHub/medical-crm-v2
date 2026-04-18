import { apiClient } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-fetch';
import type { PaginatedResponse, ConversationSummary } from '@/lib/api-types';
import { MessagesView } from '@/components/messages-view';
import { loadMessages, normalizeLocale, translateMessage } from '@medical-crm/i18n';

interface UserProfileResponse {
  preferredLanguage?: string;
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const conversationId = typeof params.conversation === 'string' ? params.conversation : null;
  const profileRes = await apiFetch('/api/v2/users/me');
  const profile = profileRes.ok
    ? await profileRes.json() as UserProfileResponse
    : null;
  const locale = normalizeLocale(profile?.preferredLanguage);
  const messagesBundle = await loadMessages(locale);
  const conversations = await apiClient<PaginatedResponse<ConversationSummary>>('/api/v2/conversations');
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
