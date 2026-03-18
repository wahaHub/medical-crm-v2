import { PageHeader } from '@medical-crm/ui';
import { SupportList } from '@/components/support-list';

export default function SupportPage() {
  return (
    <>
      <PageHeader title="Support Tickets" />
      <SupportList />
    </>
  );
}
