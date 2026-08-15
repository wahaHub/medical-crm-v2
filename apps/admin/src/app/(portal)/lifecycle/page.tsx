import { PageHeader } from '@medical-crm/ui';
import { LifecycleBoard } from '@/components/lifecycle-board';

export default function LifecyclePage() {
  return (
    <>
      <PageHeader title="Lifecycle" />
      <LifecycleBoard />
    </>
  );
}
