'use client';

import { useRouter } from 'next/navigation';
import { FolderOpen, Clock, Sparkles, ChevronRight } from 'lucide-react';
import { useHospitalI18n } from '@/lib/hospital-i18n';
import {
  formatDurationMinutesLabel,
  getLocalizedCountryLabel,
} from '@/lib/hospital-display';

// ── Types ──────────────────────────────────────────────────────────
interface ScheduledConsultation {
  id: string;
  patientName: string;
  caseNumber: string;
  scheduledAt: string;
  durationMinutes: number;
  aiTranslation: boolean;
  status: string;
}

interface RecentCase {
  id: string;
  caseNumber: string;
  patientName: string;
  patientCountry: string | null;
  medicalCondition: string | null;
  status: string;
  createdAt: string;
}

interface PendingMessage {
  id: string;
  patientName: string;
  category: string;
  lastMessage: string;
  unreadCount: number;
  updatedAt: string;
}

interface DashboardData {
  scheduledConsultations: ScheduledConsultation[];
  recentCases: RecentCase[];
  pendingMessages: PendingMessage[];
}

// ── Helpers ────────────────────────────────────────────────────────
function formatTimeBox(dateStr: string, locale: string) {
  if (!dateStr) return { time: '--:--', period: '' };
  const d = new Date(dateStr);
  return {
    time: new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d),
    period: '',
  };
}

function timeAgo(dateStr: string, locale: string) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (mins < 60) return formatter.format(-mins, 'minute');
  const hours = Math.floor(mins / 60);
  if (hours < 24) return formatter.format(-hours, 'hour');
  const days = Math.floor(hours / 24);
  return formatter.format(-days, 'day');
}

function formatMessageTime(dateStr: string, locale: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d);
  }
  if (diffDays === 1) {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-1, 'day');
  }
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d);
}

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-600',
  'bg-emerald-100 text-emerald-600',
  'bg-amber-100 text-amber-600',
  'bg-rose-100 text-rose-600',
  'bg-sky-100 text-sky-600',
  'bg-violet-100 text-violet-600',
  'bg-teal-100 text-teal-600',
  'bg-orange-100 text-orange-600',
];

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── Component ──────────────────────────────────────────────────────
export function DashboardWidgets({ data }: { data: DashboardData }) {
  const router = useRouter();
  const { locale, t } = useHospitalI18n();
  const unknownLabel = t('hospital.common.unknown', undefined, 'Unknown');
  const notAvailableLabel = t('hospital.common.notAvailable', undefined, 'N/A');
  const consultationsTitle = t(
    'hospital.dashboard.sections.consultations.title',
    undefined,
    "Today's Consultations",
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <h1 className="text-2xl font-bold text-slate-900">
        {t('hospital.dashboard.title', undefined, 'Dashboard')}
      </h1>

      {/* Today's Consultations */}
      <section className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)]">
        <h2 className="mb-6 text-lg font-semibold text-slate-900">{consultationsTitle}</h2>
        {data.scheduledConsultations.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            {t(
              'hospital.dashboard.sections.consultations.empty',
              undefined,
              'No consultations scheduled',
            )}
          </p>
        ) : (
          <div className="space-y-4">
            {data.scheduledConsultations.map((c) => {
              const { time, period } = formatTimeBox(c.scheduledAt, locale);
              const patientName = c.patientName || unknownLabel;
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-5 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center gap-5">
                    {/* Time box */}
                    <div className="flex h-16 w-16 flex-col items-center justify-center rounded-xl bg-slate-50">
                      <span className="text-lg font-bold text-slate-900">{time}</span>
                      {period ? (
                        <span className="text-[11px] font-medium uppercase text-slate-400">{period}</span>
                      ) : null}
                    </div>
                    {/* Info */}
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-slate-900">{patientName}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <FolderOpen size={14} />
                          {c.caseNumber || notAvailableLabel}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock size={14} />
                          {formatDurationMinutesLabel(c.durationMinutes, t)}
                        </span>
                      </div>
                      {c.aiTranslation && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
                          <Sparkles size={12} />
                          {t(
                            'hospital.dashboard.sections.consultations.aiTranslation',
                            undefined,
                            'AI Translation',
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/consultations/${c.id}/room`)}
                    className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:bg-indigo-700 hover:shadow-lg"
                  >
                    {t(
                      'hospital.dashboard.sections.consultations.enter',
                      undefined,
                      'Enter Consultation',
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Bottom row: New Cases + Pending Messages */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* New Cases */}
        <section className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)]">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('hospital.dashboard.sections.newCases.title', undefined, 'New Cases')}
            </h2>
            <button
              onClick={() => router.push('/cases')}
              className="flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              {t('hospital.common.viewAll', undefined, 'View All')} <ChevronRight size={16} />
            </button>
          </div>
          {data.recentCases.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              {t('hospital.dashboard.sections.newCases.empty', undefined, 'No cases yet')}
            </p>
          ) : (
            <div className="space-y-4">
              {data.recentCases.map((c) => {
                const patientName = c.patientName || unknownLabel;
                const countryLabel = getLocalizedCountryLabel(c.patientCountry, locale, t);
                return (
                  <div
                    key={c.id}
                    onClick={() => router.push(`/cases/${c.id}`)}
                    className="flex cursor-pointer items-center gap-4 rounded-xl p-2 transition-colors hover:bg-slate-50"
                  >
                    {/* Avatar */}
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarColor(patientName)}`}>
                      {getInitials(patientName)}
                    </div>
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900">{patientName}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{c.caseNumber || notAvailableLabel}</span>
                        {countryLabel ? <span>· {countryLabel}</span> : null}
                        {c.medicalCondition ? <span>· {c.medicalCondition}</span> : null}
                      </div>
                    </div>
                    {/* Time */}
                    <span className="shrink-0 text-xs text-slate-400">{timeAgo(c.createdAt, locale)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Pending Messages */}
        <section className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)]">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('hospital.dashboard.sections.pendingMessages.title', undefined, 'Pending Messages')}
            </h2>
            <button
              onClick={() => router.push('/messages')}
              className="flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              {t('hospital.common.viewAll', undefined, 'View All')} <ChevronRight size={16} />
            </button>
          </div>
          {data.pendingMessages.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">
              {t(
                'hospital.dashboard.sections.pendingMessages.empty',
                undefined,
                'No pending messages',
              )}
            </p>
          ) : (
            <div className="space-y-4">
              {data.pendingMessages.map((m) => {
                const patientName = m.patientName || unknownLabel;
                return (
                  <div
                    key={m.id}
                    onClick={() => router.push(`/messages?conversation=${m.id}`)}
                    className="flex cursor-pointer items-center gap-4 rounded-xl p-2 transition-colors hover:bg-slate-50"
                  >
                    {/* Avatar with unread badge */}
                    <div className="relative shrink-0">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${avatarColor(patientName)}`}>
                        {getInitials(patientName)}
                      </div>
                      {m.unreadCount > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                          {m.unreadCount}
                        </span>
                      )}
                    </div>
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-slate-900">{patientName}</div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{m.lastMessage}</p>
                    </div>
                    {/* Time */}
                    <span className="shrink-0 text-xs text-indigo-500 font-medium">
                      {formatMessageTime(m.updatedAt, locale)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
