import { PageHeader } from '@medical-crm/ui';
import { MaterialsTabs } from '@/components/materials-tabs';

export default function MaterialsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Marketing Materials" subtitle="Manage your hospital's public profile" />
      <MaterialsTabs />
    </div>
  );
}
