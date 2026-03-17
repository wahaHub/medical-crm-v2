import { PageHeader } from '@medical-crm/ui';
import { DashboardWidgets } from '@/components/dashboard-widgets';

export default function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <DashboardWidgets />
    </>
  );
}
