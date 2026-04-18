'use client';

import { LoadingSpinner } from '@medical-crm/ui';
import { useHospitalI18n } from '@/lib/hospital-i18n';

export default function GlobalLoading() {
  const { t } = useHospitalI18n();

  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <LoadingSpinner size="lg" />
      <span className="sr-only">{t('hospital.loading.label', undefined, 'Loading')}</span>
    </div>
  );
}
