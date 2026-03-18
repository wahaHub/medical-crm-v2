'use client';

import { useRouter } from 'next/navigation';
import { FolderOpen, Clock, Sparkles, ChevronRight } from 'lucide-react';

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
function formatTimeBox(dateStr: string) {
  if (!dateStr) return { time: '--:--', period: '' };
  const d = new Date(dateStr);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return {
    time: `${h12}:${minutes.toString().padStart(2, '0')}`,
    period,
  };
}

function timeAgo(dateStr: string) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

function formatMessageTime(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  if (diffDays === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

const CONDITION_COLORS: Record<string, string> = {
  Rhinoplasty: 'bg-rose-50 text-rose-600',
  Facelift: 'bg-purple-50 text-purple-600',
  'Breast augmentation': 'bg-pink-50 text-pink-600',
  Liposuction: 'bg-orange-50 text-orange-600',
  Blepharoplasty: 'bg-sky-50 text-sky-600',
  Cardiac: 'bg-red-50 text-red-600',
  Orthopedic: 'bg-blue-50 text-blue-600',
  Dental: 'bg-teal-50 text-teal-600',
  Screening: 'bg-emerald-50 text-emerald-600',
  default: 'bg-slate-50 text-slate-600',
};

function conditionBadgeColor(condition: string | null) {
  if (!condition) return CONDITION_COLORS.default;
  for (const [key, color] of Object.entries(CONDITION_COLORS)) {
    if (condition.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return CONDITION_COLORS.default;
}

function conditionLabel(condition: string | null) {
  if (!condition) return 'General';
  // Take first meaningful word (skip articles)
  const words = condition.split(/[\s-]+/).filter((w) => w.length > 3);
  return words[0] ?? condition.split(' ')[0] ?? 'General';
}

// ── Component ──────────────────────────────────────────────────────
export function DashboardWidgets({ data }: { data: DashboardData }) {
  const router = useRouter();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>

      {/* Today's Consultations */}
      <section className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)]">
        <h2 className="mb-6 text-lg font-semibold text-slate-900">Today&apos;s Consultations</h2>
        {data.scheduledConsultations.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No consultations scheduled</p>
        ) : (
          <div className="space-y-4">
            {data.scheduledConsultations.map((c) => {
              const { time, period } = formatTimeBox(c.scheduledAt);
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-100 bg-white p-5 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-center gap-5">
                    {/* Time box */}
                    <div className="flex h-16 w-16 flex-col items-center justify-center rounded-xl bg-slate-50">
                      <span className="text-lg font-bold text-slate-900">{time}</span>
                      <span className="text-[11px] font-medium uppercase text-slate-400">{period}</span>
                    </div>
                    {/* Info */}
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-slate-900">{c.patientName}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <FolderOpen size={14} />
                          {c.caseNumber || 'N/A'}
                        </span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock size={14} />
                          {c.durationMinutes} min
                        </span>
                      </div>
                      {c.aiTranslation && (
                        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600">
                          <Sparkles size={12} />
                          AI Translation
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => router.push(`/consultations/${c.id}/room`)}
                    className="rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:bg-indigo-700 hover:shadow-lg"
                  >
                    Enter Consultation
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
            <h2 className="text-lg font-semibold text-slate-900">New Cases</h2>
            <button
              onClick={() => router.push('/cases')}
              className="flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              View All <ChevronRight size={16} />
            </button>
          </div>
          {data.recentCases.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No cases yet</p>
          ) : (
            <div className="space-y-4">
              {data.recentCases.map((c) => (
                <div
                  key={c.id}
                  onClick={() => router.push(`/cases/${c.id}`)}
                  className="flex cursor-pointer items-center gap-4 rounded-xl p-2 transition-colors hover:bg-slate-50"
                >
                  {/* Avatar */}
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarColor(c.patientName)}`}>
                    {getInitials(c.patientName)}
                  </div>
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{c.patientName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${conditionBadgeColor(c.medicalCondition)}`}>
                        {conditionLabel(c.medicalCondition)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {c.caseNumber}
                    </div>
                  </div>
                  {/* Time */}
                  <span className="shrink-0 text-xs text-slate-400">{timeAgo(c.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Pending Messages */}
        <section className="rounded-[2rem] border border-slate-100 bg-white p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.02)]">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Pending Messages</h2>
            <button
              onClick={() => router.push('/messages')}
              className="flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              View All <ChevronRight size={16} />
            </button>
          </div>
          {data.pendingMessages.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No pending messages</p>
          ) : (
            <div className="space-y-4">
              {data.pendingMessages.map((m) => (
                <div
                  key={m.id}
                  onClick={() => router.push(`/messages?conversation=${m.id}`)}
                  className="flex cursor-pointer items-center gap-4 rounded-xl p-2 transition-colors hover:bg-slate-50"
                >
                  {/* Avatar with unread badge */}
                  <div className="relative shrink-0">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${avatarColor(m.patientName)}`}>
                      {getInitials(m.patientName)}
                    </div>
                    {m.unreadCount > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                        {m.unreadCount}
                      </span>
                    )}
                  </div>
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{m.patientName}</div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{m.lastMessage}</p>
                  </div>
                  {/* Time */}
                  <span className="shrink-0 text-xs text-indigo-500 font-medium">{formatMessageTime(m.updatedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
