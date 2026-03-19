'use client';

import { useState } from 'react';
import { changePassword, updatePreferences } from '@/actions/settings-actions';

// ── Password Section ────────────────────────────────────────────────

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSave = async () => {
    setFeedback(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setFeedback({ type: 'error', message: 'All fields are required.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedback({ type: 'error', message: 'New password and confirmation do not match.' });
      return;
    }

    if (newPassword.length < 8) {
      setFeedback({ type: 'error', message: 'New password must be at least 8 characters.' });
      return;
    }

    setSaving(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setFeedback({ type: 'success', message: 'Password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update password.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm p-8">
      <h2 className="text-lg font-semibold text-slate-800 mb-1">Password</h2>
      <p className="text-sm text-slate-500 mb-6">Update your account password</p>

      {feedback && (
        <div
          className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-rose-50 text-rose-700 border-rose-100'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="space-y-4 max-w-sm">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="Enter current password"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm outline-none"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-md shadow-indigo-200/50 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Update Password'}
        </button>
      </div>
    </div>
  );
}

// ── Language Section ────────────────────────────────────────────────

function LanguageSection() {
  const [language, setLanguage] = useState('en');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSave = async () => {
    setFeedback(null);
    setSaving(true);
    try {
      await updatePreferences({ preferredLanguage: language });
      setFeedback({ type: 'success', message: 'Language preference saved.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save language preference.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm p-8">
      <h2 className="text-lg font-semibold text-slate-800 mb-1">Preferred Language</h2>
      <p className="text-sm text-slate-500 mb-6">Choose the language for your portal interface</p>

      {feedback && (
        <div
          className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-rose-50 text-rose-700 border-rose-100'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="space-y-4 max-w-sm">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Language</label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="en">English</option>
            <option value="zh">中文</option>
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-md shadow-indigo-200/50 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Language'}
        </button>
      </div>
    </div>
  );
}

// ── Notifications Section ───────────────────────────────────────────

type NotificationKey = 'newCase' | 'newMessage' | 'quoteStatusChange' | 'consultationReminder';

const NOTIFICATION_OPTIONS: { key: NotificationKey; label: string; description: string }[] = [
  {
    key: 'newCase',
    label: 'New Case',
    description: 'Get notified when a new patient case is assigned to your hospital',
  },
  {
    key: 'newMessage',
    label: 'New Message',
    description: 'Get notified when you receive a new message from a patient or coordinator',
  },
  {
    key: 'quoteStatusChange',
    label: 'Quote Status Change',
    description: 'Get notified when a quote status is updated',
  },
  {
    key: 'consultationReminder',
    label: 'Consultation Reminder',
    description: 'Receive reminders for upcoming consultations',
  },
];

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
        checked ? 'bg-indigo-600' : 'bg-slate-200'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function NotificationsSection() {
  const [notifications, setNotifications] = useState<Record<NotificationKey, boolean>>({
    newCase: true,
    newMessage: true,
    quoteStatusChange: true,
    consultationReminder: false,
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleToggle = (key: NotificationKey, value: boolean) => {
    setNotifications((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setFeedback(null);
    setSaving(true);
    try {
      await updatePreferences({ notifications });
      setFeedback({ type: 'success', message: 'Notification preferences saved.' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save notification preferences.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-[1.5rem] border border-slate-100 shadow-sm p-8">
      <h2 className="text-lg font-semibold text-slate-800 mb-1">Email Notifications</h2>
      <p className="text-sm text-slate-500 mb-6">Control which email notifications you receive</p>

      {feedback && (
        <div
          className={`mb-5 px-4 py-3 rounded-xl text-sm font-medium border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-rose-50 text-rose-700 border-rose-100'
          }`}
        >
          {feedback.message}
        </div>
      )}

      <div className="space-y-5 mb-6">
        {NOTIFICATION_OPTIONS.map(({ key, label, description }) => (
          <div key={key} className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{label}</p>
              <p className="text-sm text-slate-500 mt-0.5">{description}</p>
            </div>
            <ToggleSwitch
              checked={notifications[key]}
              onChange={(value) => handleToggle(key, value)}
            />
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-md shadow-indigo-200/50 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Notifications'}
      </button>
    </div>
  );
}

// ── Main Export ─────────────────────────────────────────────────────

export function SettingsView() {
  return (
    <div className="space-y-6">
      <PasswordSection />
      <LanguageSection />
      <NotificationsSection />
    </div>
  );
}
