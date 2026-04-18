'use client';

import { useHospitalI18n } from '@/lib/hospital-i18n';

export default function ConsultationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useHospitalI18n();
  const tx = (key: string, fallback: string) => t(key, undefined, fallback);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {tx('hospital.portal.consultations.page.title', 'Consultations')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {tx(
            'hospital.portal.consultations.page.description',
            'Manage and review patient video consultations',
          )}
        </p>
      </div>
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-red-800">
          {tx('hospital.portal.consultations.error.loadFailed', 'Failed to load consultations')}
        </h2>
        <p className="mt-2 text-sm text-red-600">
          {error.message || tx(
            'hospital.portal.consultations.error.unexpected',
            'An unexpected error occurred while loading the consultations page.',
          )}
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
        >
          {tx('hospital.portal.consultations.error.retry', 'Try again')}
        </button>
      </div>
    </div>
  );
}
