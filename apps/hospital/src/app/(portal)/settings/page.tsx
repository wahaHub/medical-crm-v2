import { SettingsView } from '@/components/settings-view';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your account and notification preferences</p>
      </div>
      <SettingsView />
    </div>
  );
}
