'use client';

export default function ConsultationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Consultations</h1>
        <p className="text-sm text-slate-500 mt-1">Manage and review patient video consultations</p>
      </div>
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-red-800">Failed to load consultations</h2>
        <p className="mt-2 text-sm text-red-600">
          {error.message || 'An unexpected error occurred while loading the consultations page.'}
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
