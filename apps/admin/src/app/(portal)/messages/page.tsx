import { PageHeader } from '@medical-crm/ui';
import { MessagesCenter } from '@/components/messages-center';

export default function MessagesPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Messages" />
      <MessagesCenter />
    </div>
  );
}
