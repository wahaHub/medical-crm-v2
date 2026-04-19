'use client';

import { useEffect, useState } from 'react';
import { changePassword, updatePreferences } from '@/actions/settings-actions';
import { useAuth } from '@/lib/auth-context';
import { useHospitalI18n } from '@/lib/hospital-i18n';
import { HOSPITAL_LANGUAGE_OPTIONS } from '@/lib/hospital-language-options';

type FeedbackState = { type: 'success' | 'error'; message: string } | null;
type NotificationKey = 'newCase' | 'newMessage' | 'quoteStatusChange' | 'consultationReminder';
type TranslateFn = ReturnType<typeof useHospitalI18n>['t'];

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

function getErrorDetail(err: unknown): string | null {
  if (!(err instanceof Error)) return null;

  const rawDetail = err.message.trim();
  const detail = rawDetail.replace(/\s+/g, ' ');
  if (
    !detail
    || /[\r\n]/.test(rawDetail)
    || detail.length > 160
    || UNSAFE_USER_ERROR_PATTERNS.some((pattern) => pattern.test(detail))
    || !SAFE_USER_ERROR_PATTERNS.some((pattern) => pattern.test(detail))
  ) {
    return null;
  }

  return detail;
}

function formatUserFacingError(err: unknown, t: TranslateFn, fallback: string): string {
  const detail = getErrorDetail(err);

  if (!detail) return fallback;
  return t('hospital.common.errors.withDetail', { summary: fallback, detail }, '{summary} Details: {detail}');
}

function FeedbackBanner({ feedback }: { feedback: FeedbackState }) {
  if (!feedback) return null;

  return (
    <div
      className={`mb-5 rounded-xl border px-4 py-3 text-sm font-medium ${
        feedback.type === 'success'
          ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
          : 'border-rose-100 bg-rose-50 text-rose-700'
      }`}
    >
      {feedback.message}
    </div>
  );
}

function PasswordSection() {
  const { t } = useHospitalI18n();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const handleSave = async () => {
    setFeedback(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setFeedback({
        type: 'error',
        message: t(
          'hospital.settings.password.feedback.allFieldsRequired',
          undefined,
          'All fields are required.',
        ),
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setFeedback({
        type: 'error',
        message: t(
          'hospital.settings.password.feedback.mismatch',
          undefined,
          'New password and confirmation do not match.',
        ),
      });
      return;
    }

    if (newPassword.length < 8) {
      setFeedback({
        type: 'error',
        message: t(
          'hospital.settings.password.feedback.minimumLength',
          undefined,
          'New password must be at least 8 characters.',
        ),
      });
      return;
    }

    setSaving(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setFeedback({
        type: 'success',
        message: t(
          'hospital.settings.password.feedback.saved',
          undefined,
          'Password updated successfully.',
        ),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      const fallback = t(
        'hospital.settings.password.feedback.saveFailed',
        undefined,
        'Failed to update password.',
      );
      setFeedback({
        type: 'error',
        message: formatUserFacingError(err, t, fallback),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-8 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-slate-800">
        {t('hospital.settings.password.title', undefined, 'Password')}
      </h2>
      <p className="mb-6 text-sm text-slate-500">
        {t('hospital.settings.password.description', undefined, 'Update your account password')}
      </p>

      <FeedbackBanner feedback={feedback} />

      <div className="max-w-sm space-y-4">
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            {t('hospital.settings.password.currentLabel', undefined, 'Current Password')}
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder={t(
              'hospital.settings.password.currentPlaceholder',
              undefined,
              'Enter current password',
            )}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            {t('hospital.settings.password.newLabel', undefined, 'New Password')}
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t(
              'hospital.settings.password.newPlaceholder',
              undefined,
              'Enter new password',
            )}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            {t(
              'hospital.settings.password.confirmLabel',
              undefined,
              'Confirm New Password',
            )}
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder={t(
              'hospital.settings.password.confirmPlaceholder',
              undefined,
              'Confirm new password',
            )}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200/50 transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving
            ? t('hospital.common.actions.saving', undefined, 'Saving...')
            : t('hospital.settings.password.submit', undefined, 'Update Password')}
        </button>
      </div>
    </div>
  );
}

function LanguageSection() {
  const { locale, isSwitchingLocale, setLocale, t } = useHospitalI18n();
  const { updatePreferredLanguage } = useAuth();
  const [language, setLanguage] = useState<string>(locale);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  useEffect(() => {
    setLanguage(locale);
  }, [locale]);

  const handleSave = async () => {
    setFeedback(null);
    setSaving(true);

    try {
      await updatePreferences({ preferredLanguage: language });
      await setLocale(language);
      updatePreferredLanguage(language);
      setFeedback({
        type: 'success',
        message: t(
          'hospital.settings.language.feedback.saved',
          undefined,
          'Language preference saved.',
        ),
      });
    } catch (err) {
      const fallback = t(
        'hospital.settings.language.feedback.saveFailed',
        undefined,
        'Failed to save language preference.',
      );
      setFeedback({
        type: 'error',
        message: formatUserFacingError(err, t, fallback),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-8 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-slate-800">
        {t('hospital.settings.language.title', undefined, 'Preferred Language')}
      </h2>
      <p className="mb-6 text-sm text-slate-500">
        {t(
          'hospital.settings.language.description',
          undefined,
          'Choose the language for your portal interface',
        )}
      </p>

      <FeedbackBanner feedback={feedback} />

      <div className="max-w-sm space-y-4">
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            {t('hospital.settings.language.label', undefined, 'Language')}
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          >
            {HOSPITAL_LANGUAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.flag} {t(option.key, undefined, option.fallback)}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || isSwitchingLocale}
          className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200/50 transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving || isSwitchingLocale
            ? t('hospital.common.actions.saving', undefined, 'Saving...')
            : t('hospital.settings.language.submit', undefined, 'Save Language')}
        </button>
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
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
  const { t } = useHospitalI18n();
  const [notifications, setNotifications] = useState<Record<NotificationKey, boolean>>({
    newCase: true,
    newMessage: true,
    quoteStatusChange: true,
    consultationReminder: false,
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState>(null);

  const notificationOptions: {
    key: NotificationKey;
    label: string;
    description: string;
  }[] = [
    {
      key: 'newCase',
      label: t('hospital.settings.notifications.options.newCase.label', undefined, 'New Case'),
      description: t(
        'hospital.settings.notifications.options.newCase.description',
        undefined,
        'Get notified when a new patient case is assigned to your hospital',
      ),
    },
    {
      key: 'newMessage',
      label: t(
        'hospital.settings.notifications.options.newMessage.label',
        undefined,
        'New Message',
      ),
      description: t(
        'hospital.settings.notifications.options.newMessage.description',
        undefined,
        'Get notified when you receive a new message from a patient or coordinator',
      ),
    },
    {
      key: 'quoteStatusChange',
      label: t(
        'hospital.settings.notifications.options.quoteStatusChange.label',
        undefined,
        'Quote Status Change',
      ),
      description: t(
        'hospital.settings.notifications.options.quoteStatusChange.description',
        undefined,
        'Get notified when a quote status is updated',
      ),
    },
    {
      key: 'consultationReminder',
      label: t(
        'hospital.settings.notifications.options.consultationReminder.label',
        undefined,
        'Consultation Reminder',
      ),
      description: t(
        'hospital.settings.notifications.options.consultationReminder.description',
        undefined,
        'Receive reminders for upcoming consultations',
      ),
    },
  ];

  const handleToggle = (key: NotificationKey, value: boolean) => {
    setNotifications((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setFeedback(null);
    setSaving(true);

    try {
      await updatePreferences({ notifications });
      setFeedback({
        type: 'success',
        message: t(
          'hospital.settings.notifications.feedback.saved',
          undefined,
          'Notification preferences saved.',
        ),
      });
    } catch (err) {
      const fallback = t(
        'hospital.settings.notifications.feedback.saveFailed',
        undefined,
        'Failed to save notification preferences.',
      );
      setFeedback({
        type: 'error',
        message: formatUserFacingError(err, t, fallback),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[1.5rem] border border-slate-100 bg-white p-8 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-slate-800">
        {t('hospital.settings.notifications.title', undefined, 'Email Notifications')}
      </h2>
      <p className="mb-6 text-sm text-slate-500">
        {t(
          'hospital.settings.notifications.description',
          undefined,
          'Control which email notifications you receive',
        )}
      </p>

      <FeedbackBanner feedback={feedback} />

      <div className="mb-6 space-y-5">
        {notificationOptions.map(({ key, label, description }) => (
          <div key={key} className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">{label}</p>
              <p className="mt-0.5 text-sm text-slate-500">{description}</p>
            </div>
            <ToggleSwitch
              checked={notifications[key]}
              onChange={(value) => handleToggle(key, value)}
              label={label}
            />
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200/50 transition-colors hover:bg-indigo-700 disabled:opacity-50"
      >
        {saving
          ? t('hospital.common.actions.saving', undefined, 'Saving...')
          : t('hospital.settings.notifications.submit', undefined, 'Save Notifications')}
      </button>
    </div>
  );
}

export function SettingsView() {
  return (
    <div className="space-y-6">
      <PasswordSection />
      <LanguageSection />
      <NotificationsSection />
    </div>
  );
}
