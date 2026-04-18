import { useHospitalI18n } from '@/lib/hospital-i18n';
import { MaterialsTabs } from '@/components/materials-tabs';

export default function MaterialsPage() {
  const { t } = useHospitalI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t('hospital.materials.page.title', undefined, 'Marketing Materials')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t(
            'hospital.materials.page.description',
            undefined,
            'Manage your hospital&apos;s public profile, procedures, team, and case studies.',
          )}
        </p>
      </div>
      <MaterialsTabs />
    </div>
  );
}
