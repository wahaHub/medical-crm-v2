'use client';

import { useState, useTransition } from 'react';
import { Card, CardHeader, CardTitle, LoadingSpinner } from '@medical-crm/ui';
import { useAdminEmails, useProfile } from '@/queries/use-settings';
import { updateProfile, changePassword } from '@/actions/settings-actions';

// ── Types ─────────────────────────────────────────────────────────────

interface ProfileData {
  email?: string;
  preferredLanguage?: string;
  [key: string]: unknown;
}

interface AdminEmailsData {
  emails?: string[];
}

function AdminEmailsCard({
  emails,
  isLoading,
  error,
}: {
  emails: string[];
  isLoading: boolean;
  error: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Admin Emails</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          This list is pulled automatically from all CRM users with the admin role.
        </p>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <LoadingSpinner />
            <span>Loading admin emails…</span>
          </div>
        ) : null}
        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {!isLoading && !error ? (
          <>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {emails.length} admin email{emails.length === 1 ? '' : 's'} found
            </div>
            {emails.length > 0 ? (
              <div className="space-y-2">
                {emails.map((adminEmail) => (
                  <div
                    key={adminEmail}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
                  >
                    {adminEmail}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
                No admin emails found.
              </div>
            )}
          </>
        ) : null}
      </div>
    </Card>
  );
}

// ── Email Card ────────────────────────────────────────────────────────

function EmailCard({ email }: { email: string }) {
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState(email);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        await updateProfile({ email: newEmail.trim() });
        setSuccess(true);
        setEditing(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update email');
      }
    });
  }

  const inputClass =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Address</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        {success && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
            Email updated successfully.
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        {!editing ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-700">{email || '—'}</p>
            <button
              onClick={() => { setEditing(true); setNewEmail(email); setSuccess(false); setError(null); }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:border-cyan-300 hover:text-cyan-700 transition-colors"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">New Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
                disabled={isPending}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 transition-colors disabled:opacity-50"
              >
                {isPending ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setError(null); }}
                disabled={isPending}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Password Card ─────────────────────────────────────────────────────

function PasswordCard() {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSuccess(false);
    if (!currentPassword) { setError('Current password is required.'); return; }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

    startTransition(async () => {
      try {
        await changePassword({ currentPassword, newPassword });
        setSuccess(true);
        setOpen(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to change password');
      }
    });
  }

  const inputClass =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        {success && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
            Password changed successfully.
          </div>
        )}
        {!open ? (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">••••••••••••</p>
            <button
              onClick={() => { setOpen(true); setError(null); setSuccess(false); }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:border-cyan-300 hover:text-cyan-700 transition-colors"
            >
              Change Password
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-sm">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputClass}
                disabled={isPending}
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">New Password (min 8 chars)</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
                disabled={isPending}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
                disabled={isPending}
                autoComplete="new-password"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 transition-colors disabled:opacity-50"
              >
                {isPending ? 'Saving…' : 'Save Password'}
              </button>
              <button
                onClick={() => { setOpen(false); setError(null); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                disabled={isPending}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Language Card ─────────────────────────────────────────────────────

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文 (Chinese)' },
];

function LanguageCard({ preferredLanguage }: { preferredLanguage: string }) {
  const [lang, setLang] = useState(preferredLanguage || 'en');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        await updateProfile({ preferredLanguage: lang });
        setSuccess(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update language');
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Language Preference</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        {success && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">
            Language preference saved.
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex items-center gap-3">
          <select
            value={lang}
            onChange={(e) => { setLang(e.target.value); setSuccess(false); }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            disabled={isPending}
          >
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function SettingsPage() {
  const { data: raw, isLoading } = useProfile();
  const {
    data: adminEmailDataRaw,
    isLoading: isAdminEmailsLoading,
    error: adminEmailsError,
  } = useAdminEmails();
  const profile = raw as ProfileData | undefined;
  const adminEmailData = adminEmailDataRaw as AdminEmailsData | undefined;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  const email = (profile?.email as string | undefined) ?? '';
  const preferredLanguage = (profile?.preferredLanguage as string | undefined) ?? 'en';
  const adminEmails = Array.isArray(adminEmailData?.emails) ? adminEmailData.emails : [];

  return (
    <div className="max-w-2xl space-y-6">
      <AdminEmailsCard
        emails={adminEmails}
        isLoading={isAdminEmailsLoading}
        error={adminEmailsError instanceof Error ? adminEmailsError.message : null}
      />
      <EmailCard email={email} />
      <PasswordCard />
      <LanguageCard preferredLanguage={preferredLanguage} />
    </div>
  );
}
