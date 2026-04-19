'use client';
import { useHospitalI18n } from '@/lib/hospital-i18n';

type TranslationFn = ReturnType<typeof useHospitalI18n>['t'];

const SAFE_USER_ERROR_PATTERNS = [
  /^please\b/i,
  /^select\b/i,
  /^choose\b/i,
  /^enter\b/i,
  /^provide\b/i,
  /^upload\b/i,
  /^add\b/i,
  /^remove\b/i,
  /^set\b/i,
  /\brequired\b/i,
  /\binvalid\b/i,
  /\bmissing\b/i,
  /\bmust\b/i,
  /\bcannot\b/i,
  /\bcan't\b/i,
  /\bincorrect\b/i,
  /\bmatch\b/i,
  /\bat least\b/i,
  /\btoo\b/i,
  /\bneeds?\s+to\b/i,
  /\bis\s+required\b/i,
  /\bis\s+invalid\b/i,
  /\bis\s+missing\b/i,
];

const UNSAFE_USER_ERROR_PATTERNS = [
  /\b(database|db|sql|prisma|orm|postgres|mysql|redis|mongo|server|service|gateway|proxy|network|fetch|request|response|timeout|exception|stack|trace|traceback|econn|enotfound|econnreset|unauthorized|forbidden|internal|bucket|storage|cdn|cloudflare|token)\b/i,
  /^failed\b/i,
  /^unable\b/i,
  /\bstatus\s*\d{3}\b/i,
  /\bcode\s*\d{3}\b/i,
  /\bnot found\b/i,
];

function extractSafeUserErrorDetail(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const rawDetail = error.message.trim();
  const detail = rawDetail.replace(/\s+/g, ' ');
  if (
    !detail
    || /[\r\n]/.test(rawDetail)
    || detail === 'An unexpected error occurred.'
    || detail.length > 160
    || UNSAFE_USER_ERROR_PATTERNS.some((pattern) => pattern.test(detail))
    || !SAFE_USER_ERROR_PATTERNS.some((pattern) => pattern.test(detail))
  ) {
    return undefined;
  }

  return detail;
}

function formatUserFacingError(
  error: unknown,
  t: TranslationFn,
  summaryKey: string,
  summaryFallback: string,
): string {
  const summary = t(summaryKey, undefined, summaryFallback);
  const detail = extractSafeUserErrorDetail(error);

  if (!detail) {
    return summary;
  }

  return t(
    'hospital.common.errors.withDetail',
    { summary, detail },
    '{summary} Details: {detail}',
  );
}

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useHospitalI18n();
  const message = formatUserFacingError(
    error,
    t,
    'hospital.error.description',
    'The page could not be loaded. Please try again.',
  );

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-slate-900">
          {t('hospital.error.title', undefined, 'Something went wrong')}
        </h2>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
        <button onClick={reset} className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700">
          {t('hospital.error.tryAgain', undefined, 'Try again')}
        </button>
      </div>
    </div>
  );
}
