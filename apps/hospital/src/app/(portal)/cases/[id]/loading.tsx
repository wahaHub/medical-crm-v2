import { LoadingSpinner } from '@medical-crm/ui';

export default function CaseDetailLoading() {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3"
      role="status"
      aria-live="polite"
    >
      <LoadingSpinner size="lg" />
      <p className="text-sm font-medium text-slate-500">Loading case details</p>
    </div>
  );
}
