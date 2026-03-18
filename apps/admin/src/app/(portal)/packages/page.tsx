import { PageHeader } from '@medical-crm/ui';
import { PackagesList } from '@/components/packages-list';

export default function PackagesPage() {
  return (
    <>
      <PageHeader title="Packages" />
      <PackagesList />
    </>
  );
}
