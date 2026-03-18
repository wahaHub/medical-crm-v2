import { PageHeader } from '@medical-crm/ui';
import { ChatbotFaqList } from '@/components/chatbot-faq-list';

export default function ChatbotPage() {
  return (
    <>
      <PageHeader title="Chatbot FAQ" />
      <ChatbotFaqList />
    </>
  );
}
