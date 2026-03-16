import { apiClient } from '@/lib/api-client';
import { MessagesView } from '@/components/messages-view';

export default async function MessagesPage() {
  const conversations = await apiClient<any>('/api/v2/conversations');
  return <MessagesView initialConversations={conversations} />;
}
