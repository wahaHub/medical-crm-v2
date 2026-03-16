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
  return <MessagesView initialConversations={conversations} initialConversationId={conversationId} />;
}
