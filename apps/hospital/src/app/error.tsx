'use client';
import { useHospitalI18n } from '@/lib/hospital-i18n';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useHospitalI18n();

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('hospital.error.title', undefined, 'Something went wrong')}
        </h2>
        <p className="mt-2 text-sm text-slate-500">{error.message}</p>
        <button onClick={reset} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
          {t('hospital.error.tryAgain', undefined, 'Try again')}
        </button>
      </div>
    </div>
  );
}
