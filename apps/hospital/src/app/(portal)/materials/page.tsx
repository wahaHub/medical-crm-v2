import { MaterialsTabs } from '@/components/materials-tabs';

export default function MaterialsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Marketing Materials</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your hospital&apos;s public profile, procedures, team, and case studies.</p>
      </div>
      <MaterialsTabs />
    </div>
  );
}
