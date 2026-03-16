import { LoadingSpinner } from '@medical-crm/ui';
export default function GlobalLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}
