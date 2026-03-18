import { apiClient } from '@/lib/api-client';
import type { PaginatedResponse, ConversationSummary } from '@/lib/api-types';
import { MessagesView } from '@/components/messages-view';

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const conversationId = typeof params.conversation === 'string' ? params.conversation : null;
  const conversations = await apiClient<PaginatedResponse<ConversationSummary>>('/api/v2/conversations');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
        <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200/50 rounded-lg text-xs font-semibold shadow-sm flex items-center gap-1.5">
          CRM Forwarding Mode
        </span>
      </div>
      <MessagesView initialConversations={conversations} initialConversationId={conversationId} />
    </div>
  );
}
