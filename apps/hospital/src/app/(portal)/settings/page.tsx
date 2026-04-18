'use client';

import { SettingsView } from '@/components/settings-view';
import { useHospitalI18n } from '@/lib/hospital-i18n';

export default function SettingsPage() {
  const { t } = useHospitalI18n();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">
          {t('hospital.settings.page.title', undefined, 'Settings')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t(
            'hospital.settings.page.description',
            undefined,
            'Manage your account and notification preferences',
          )}
        </p>
      </div>
      <SettingsView />
    </div>
  );
}
