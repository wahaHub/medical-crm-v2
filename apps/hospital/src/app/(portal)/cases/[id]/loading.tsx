'use client';

import { LoadingSpinner } from '@medical-crm/ui';
import { useHospitalI18n } from '@/lib/hospital-i18n';

export default function CaseDetailLoading() {
  const { t } = useHospitalI18n();

  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner size="lg" />
      <p className="text-sm font-medium text-slate-500">{t('hospital.loading.caseDetail')}</p>
    </div>
  );
}
