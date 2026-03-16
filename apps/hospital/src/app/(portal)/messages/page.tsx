import { apiClient } from '@/lib/api-client';
import type { PaginatedResponse, ConversationSummary } from '@/lib/api-types';
import { MessagesView } from '@/components/messages-view';

export default async function MessagesPage() {
  const conversations = await apiClient<PaginatedResponse<ConversationSummary>>('/api/v2/conversations');
  return <MessagesView initialConversations={conversations} />;
}
