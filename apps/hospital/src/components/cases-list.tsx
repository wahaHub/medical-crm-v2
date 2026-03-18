'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  FolderOpen,
  FileText,
  MessageSquare,
  Globe,
  ArrowUpRight,
  Filter,
  Search,
} from 'lucide-react';
import { StatusBadge, useDebounce } from '@medical-crm/ui';
import { useCases } from '@/queries/use-cases';
import type { PaginatedResponse, CaseSummary, CaseStats } from '@/lib/api-types';

interface CasesListProps {
  initialCases: PaginatedResponse<CaseSummary>;
  initialStats: CaseStats;
}

const statusTabs = [
  { key: 'all', label: 'All' },
  { key: 'assignmentStatus:UNASSIGNED', label: 'New' },
  { key: 'status:ACTIVE|assignmentStatus:ASSIGNED', label: 'In Progress' },
  { key: 'status:COMPLETED', label: 'Completed' },
];

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
  Rhinoplasty: 'bg-rose-50 text-rose-600 border-rose-100',
  Facelift: 'bg-purple-50 text-purple-600 border-purple-100',
  'Breast augmentation': 'bg-pink-50 text-pink-600 border-pink-100',
  Liposuction: 'bg-orange-50 text-orange-600 border-orange-100',
  Blepharoplasty: 'bg-sky-50 text-sky-600 border-sky-100',
  Cardiac: 'bg-red-50 text-red-600 border-red-100',
  Coronary: 'bg-red-50 text-red-600 border-red-100',
  Orthopedic: 'bg-blue-50 text-blue-600 border-blue-100',
  Dental: 'bg-teal-50 text-teal-600 border-teal-100',
  Migraine: 'bg-violet-50 text-violet-600 border-violet-100',
  Neurology: 'bg-violet-50 text-violet-600 border-violet-100',
  default: 'bg-slate-50 text-slate-600 border-slate-100',
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
  const words = condition.split(/[\s-]+/).filter((w) => w.length > 3);
  return words[0] ?? condition.split(' ')[0] ?? 'General';
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Country flag emoji helper (ISO 3166-1 alpha-2)
const COUNTRY_FLAGS: Record<string, string> = {
  US: '🇺🇸', USA: '🇺🇸', 'United States': '🇺🇸',
  UK: '🇬🇧', GB: '🇬🇧', 'United Kingdom': '🇬🇧',
  CN: '🇨🇳', China: '🇨🇳',
  AU: '🇦🇺', Australia: '🇦🇺',
  CA: '🇨🇦', Canada: '🇨🇦',
  JP: '🇯🇵', Japan: '🇯🇵',
  KR: '🇰🇷', 'South Korea': '🇰🇷',
  DE: '🇩🇪', Germany: '🇩🇪',
  FR: '🇫🇷', France: '🇫🇷',
  BR: '🇧🇷', Brazil: '🇧🇷',
  IN: '🇮🇳', India: '🇮🇳',
  SG: '🇸🇬', Singapore: '🇸🇬',
  TH: '🇹🇭', Thailand: '🇹🇭',
  AE: '🇦🇪', UAE: '🇦🇪',
};

function getCountryFlag(country: string | null | undefined) {
  if (!country) return '';
  return COUNTRY_FLAGS[country] ?? '';
}

const STAT_ICONS = [
  { icon: FolderOpen, colorClass: 'bg-blue-50 text-blue-600' },
  { icon: ArrowUpRight, colorClass: 'bg-amber-50 text-amber-600' },
  { icon: ArrowUpRight, colorClass: 'bg-cyan-50 text-cyan-600' },
  { icon: MessageSquare, colorClass: 'bg-purple-50 text-purple-600' },
];

export function CasesList({ initialCases, initialStats }: CasesListProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const filters: Record<string, string> = { page: String(page), limit: '20' };
  if (status !== 'all') {
    // Tab keys use format "field:value" or "field:value|field:value" for compound filters
    for (const part of status.split('|')) {
      const [field, value] = part.split(':');
      if (field && value) filters[field] = value;
    }
  }
  if (debouncedSearch) filters.search = debouncedSearch;

  const hasActiveFilters = status !== 'all' || !!debouncedSearch || page !== 1;
  const { data, isPending } = useCases(filters);
  const cases = (data ?? (hasActiveFilters ? { data: [], total: 0 } : initialCases)) as PaginatedResponse<CaseSummary>;
  const stats = initialStats;

  const statValues = [
    { value: stats.total ?? 0, label: 'All Cases' },
    { value: stats.unassigned ?? 0, label: 'New' },
    { value: stats.inTreatment ?? 0, label: 'In Progress' },
    { value: stats.completed ?? 0, label: 'Completed' },
  ];

  return (
    <div className="space-y-6">
      {/* Search + Filter Bar */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search caseNumber, patient.name, patient.code..."
            className="w-full rounded-full border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <button className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50">
          <Filter size={16} />
          Filter
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statValues.map((stat, i) => {
          const meta = STAT_ICONS[i] ?? STAT_ICONS[0]!;
          if (!meta) return null;
          const Icon = meta.icon;
          return (
            <div
              key={i}
              className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${meta.colorClass}`}>
                <Icon size={22} />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                <div className="text-sm text-slate-500">{stat.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-2">
        {statusTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setStatus(tab.key); setPage(1); }}
            className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
              status === tab.key
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Case Cards Grid */}
      {hasActiveFilters && isPending ? (
        <div className="flex items-center justify-center py-12 text-slate-400">Loading...</div>
      ) : (cases.data ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <FolderOpen size={48} className="text-slate-300 mb-3" />
          <p className="text-slate-500 text-sm">No cases found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {(cases.data ?? []).map((c) => {
            const raw = c as CaseSummary & { primaryDiagnosis?: string | null };
            const condition = raw.primaryDiagnosis ?? c.medicalCondition ?? null;
            const flag = getCountryFlag(c.patientCountry);

            return (
              <div
                key={c.id}
                onClick={() => router.push(`/cases/${c.id}`)}
                className="cursor-pointer rounded-[1.5rem] border border-slate-100 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-indigo-100"
              >
                {/* Top row: case number + date + status */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold text-indigo-600">{c.caseNumber}</span>
                    <span className="text-xs text-slate-400">{formatDate(c.createdAt ?? '')}</span>
                  </div>
                  <StatusBadge status={c.status ?? 'UNKNOWN'} />
                </div>

                {/* Patient row */}
                <div className="flex items-center gap-4 mb-4">
                  <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-base font-semibold ${avatarColor(c.patientName ?? 'U')}`}>
                    {getInitials(c.patientName ?? 'U')}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{c.patientName ?? 'Unknown'}</span>
                      {c.patientCode && (
                        <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                          #{c.patientCode}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      {c.patientAge != null && (
                        <span>{c.patientAge} y/o</span>
                      )}
                      {c.patientGender && (
                        <span>• {c.patientGender === 'MALE' ? 'M' : c.patientGender === 'FEMALE' ? 'F' : c.patientGender}</span>
                      )}
                      {c.patientCountry && (
                        <>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Globe size={12} />
                            {flag} {c.patientCountry}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Condition + stats */}
                <div className="flex items-center justify-between">
                  <div>
                    {condition && (
                      <>
                        <div className="text-sm font-semibold text-slate-800 mb-1">{condition}</div>
                        <span className={`inline-block rounded-md border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${conditionBadgeColor(condition)}`}>
                          {conditionLabel(condition)}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-slate-400">
                    {c.totalDocuments != null && c.totalDocuments > 0 && (
                      <span className="flex items-center gap-1 text-xs">
                        <FileText size={14} /> {c.totalDocuments}
                      </span>
                    )}
                    {c.totalMessages != null && c.totalMessages > 0 && (
                      <span className="flex items-center gap-1 text-xs">
                        <MessageSquare size={14} /> {c.totalMessages}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
