import { PageHeader } from '@medical-crm/ui';
import { SettingsPage } from '@/components/settings-page';

export default function SettingsRoutePage() {
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsPage />
    </>
  );
}
