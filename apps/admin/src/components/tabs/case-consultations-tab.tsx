'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, StatusBadge, EmptyState } from '@medical-crm/ui';
import { Video, Clock, Building, ChevronDown, ChevronUp, FileText, X, Sparkles, ExternalLink } from 'lucide-react';
import { useCaseConsultations, useConsultationTranscript } from '@/queries/use-consultations';
import { useHospitalNameMap } from '@/queries/use-hospital-names';

// ── Types ─────────────────────────────────────────────────────────────

interface ConsultationSummary {
  id: string;
  hospitalId?: string;
  hospitalName?: string;
  caseId?: string;
  status?: string;
  scheduledAt?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMinutes?: number;
  actualDuration?: number | null;
  notes?: string;
  patientName?: string;
  aiSummary?: unknown;
  aiSummaryStatus?: string;
  videoStorageKey?: string | null;
  videoDuration?: number | null;
  videoThumbnail?: string | null;
  videoUploadedAt?: string | null;
}

interface TranscriptEntry {
  speaker: string;
  timestamp: string;
  original: string;
  translated?: string;
}

interface TranscriptEntryLike {
  speaker?: unknown;
  timestamp?: unknown;
  original?: unknown;
  text?: unknown;
  translated?: unknown;
  translatedText?: unknown;
}

interface CaseConsultationsTabProps {
  caseId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatTimeBox(dateStr: string) {
  if (!dateStr) return { date: '--/--', time: '--:--', period: '' };
  const d = new Date(dateStr);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const hours = d.getHours();
  const minutes = d.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return {
    date: `${month}/${day}`,
    time: `${h12}:${minutes.toString().padStart(2, '0')}`,
    period,
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatDurationSeconds(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function formatTranscriptTimestamp(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return formatDurationSeconds(value);
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime()) && value.includes('T')) {
      return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return value;
  }
  return '--:--';
}

function normalizeTranscriptEntries(raw: unknown): TranscriptEntry[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { entries?: unknown[] }).entries)
    ? ((raw as { entries?: unknown[] }).entries ?? [])
    : [];

  return list
    .filter((entry): entry is TranscriptEntryLike => Boolean(entry && typeof entry === 'object'))
    .map((entry, idx) => ({
      speaker: String(entry.speaker ?? `Speaker ${idx + 1}`),
      timestamp: formatTranscriptTimestamp(entry.timestamp),
      original: String(entry.original ?? entry.text ?? ''),
      translated: typeof entry.translated === 'string'
        ? entry.translated
        : (typeof entry.translatedText === 'string' ? entry.translatedText : undefined),
    }))
    .filter((entry) => entry.original.trim().length > 0);
}

function toLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatSummaryValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => formatSummaryValue(item)).join(', ');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function toVideoUrl(storageKey?: string | null): string | null {
  if (!storageKey) return null;
  if (/^https?:\/\//.test(storageKey)) return storageKey;
  return null;
}

// ── Transcript Modal ──────────────────────────────────────────────────

function TranscriptModal({
  consultationId,
  onClose,
}: {
  consultationId: string | null;
  onClose: () => void;
}) {
  const [showTranslation, setShowTranslation] = useState(true);
  const { data, isLoading, error } = useConsultationTranscript(consultationId);

  if (!consultationId) return null;

  const entries = normalizeTranscriptEntries(data);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm">
      <div className="w-full max-w-3xl h-[80vh] bg-white rounded-[2rem] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
              <FileText size={18} className="text-purple-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Full Transcript</h3>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showTranslation}
                onChange={(e) => setShowTranslation(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-slate-600">Show Translation</span>
            </label>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              Loading transcript...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {getErrorMessage(error, 'Failed to load transcript')}
            </div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <FileText size={40} className="mb-3 opacity-50" />
              <p className="text-sm">No transcript entries available yet.</p>
              <p className="text-xs mt-1">
                Transcript will be generated after the consultation recording is processed.
              </p>
            </div>
          ) : (
            entries.map((entry, i) => {
              const isDoctor =
                entry.speaker?.toLowerCase().includes('dr') || i % 2 === 0;
              return (
                <div
                  key={i}
                  className={`flex flex-col ${isDoctor ? 'items-start' : 'items-end'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-slate-700">{entry.speaker}</span>
                    <span className="text-[10px] font-mono text-slate-400">{entry.timestamp}</span>
                  </div>
                  <div
                    className={`max-w-[80%] p-4 border ${
                      isDoctor
                        ? 'bg-blue-50 border-blue-100 rounded-2xl rounded-tl-none'
                        : 'bg-cyan-50 border-cyan-100 rounded-2xl rounded-tr-none'
                    }`}
                  >
                    <p className="text-sm text-slate-700">{entry.original}</p>
                    {showTranslation && entry.translated && (
                      <div
                        className={`mt-2 pt-2 border-t ${
                          isDoctor ? 'border-blue-200/60' : 'border-cyan-200/60'
                        }`}
                      >
                        <p className="text-sm italic text-slate-500">{entry.translated}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ── Consultation Card ─────────────────────────────────────────────────

function ConsultationCard({
  consultation,
  onViewTranscript,
}: {
  consultation: ConsultationSummary;
  onViewTranscript: (id: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { date, time, period } = formatTimeBox(consultation.scheduledAt ?? '');
  const summaryEntries = isRecord(consultation.aiSummary) ? Object.entries(consultation.aiSummary) : [];
  const summaryText = typeof consultation.aiSummary === 'string' ? consultation.aiSummary : null;
  const videoUrl = toVideoUrl(consultation.videoStorageKey);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Main row */}
      <div className="flex items-center justify-between p-5">
        <div className="flex items-center gap-5">
          {/* Time box */}
          <div className="flex h-16 w-20 flex-col items-center justify-center rounded-xl bg-slate-50 shrink-0">
            <span className="text-xs font-medium text-slate-400">{date}</span>
            <span className="text-lg font-bold text-slate-900">{time}</span>
            <span className="text-[10px] font-medium uppercase text-slate-400">{period}</span>
          </div>

          {/* Info */}
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={consultation.status ?? 'UNKNOWN'} />
            </div>
            <div className="mt-1 flex items-center gap-4 text-sm text-slate-500 flex-wrap">
              {consultation.hospitalId && (
                <span className="flex items-center gap-1">
                  <Building size={14} className="shrink-0" />
                  <span className="text-xs">
                    {consultation.hospitalName ?? consultation.hospitalId.slice(0, 8)}
                  </span>
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock size={14} className="shrink-0" />
                {consultation.durationMinutes ?? 30} min
              </span>
            </div>
            {consultation.notes && (
              <p className="mt-1 text-xs text-slate-400 max-w-md truncate">{consultation.notes}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setIsExpanded((prev) => !prev)}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors"
          >
            Details {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-slate-100 bg-slate-50/50 p-5 space-y-3">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Consultation ID</dt>
              <dd className="font-mono text-xs text-slate-700 mt-0.5">{consultation.id}</dd>
            </div>
            {(consultation.hospitalId || consultation.hospitalName) && (
              <div>
                <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Hospital</dt>
                <dd className="text-xs text-slate-700 mt-0.5">
                  {consultation.hospitalName ?? consultation.hospitalId}
                </dd>
              </div>
            )}
            {consultation.scheduledAt && (
              <div>
                <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Scheduled At</dt>
                <dd className="text-slate-700 mt-0.5">
                  {new Date(consultation.scheduledAt).toLocaleString()}
                </dd>
              </div>
            )}
            {consultation.startedAt && (
              <div>
                <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Started At</dt>
                <dd className="text-slate-700 mt-0.5">
                  {new Date(consultation.startedAt).toLocaleString()}
                </dd>
              </div>
            )}
            {consultation.endedAt && (
              <div>
                <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Ended At</dt>
                <dd className="text-slate-700 mt-0.5">
                  {new Date(consultation.endedAt).toLocaleString()}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Duration</dt>
              <dd className="text-slate-700 mt-0.5">{consultation.durationMinutes ?? 30} minutes</dd>
            </div>
            {consultation.actualDuration != null && (
              <div>
                <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Actual Duration</dt>
                <dd className="text-slate-700 mt-0.5">{consultation.actualDuration} minutes</dd>
              </div>
            )}
          </dl>

          {consultation.status === 'COMPLETED' && (
            <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
              <div className="flex items-center gap-2 text-indigo-700">
                <Sparkles size={16} />
                <h4 className="text-sm font-semibold">Completed Consultation Assets</h4>
              </div>

              {summaryText && (
                <p className="rounded-lg border border-indigo-100 bg-white px-3 py-2 text-sm text-slate-700">
                  {summaryText}
                </p>
              )}

              {!summaryText && summaryEntries.length > 0 && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {summaryEntries.map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-indigo-100 bg-white p-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        {toLabel(key)}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">{formatSummaryValue(value)}</p>
                    </div>
                  ))}
                </div>
              )}

              {!summaryText && summaryEntries.length === 0 && (
                <p className="text-sm text-slate-500">
                  AI summary is not available yet.
                </p>
              )}

              {consultation.videoThumbnail && (
                <div className="overflow-hidden rounded-lg border border-indigo-100 bg-white">
                  <img
                    src={consultation.videoThumbnail}
                    alt="Consultation video thumbnail"
                    className="h-40 w-full object-cover"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  onClick={() => onViewTranscript(consultation.id)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-200 rounded-full hover:bg-indigo-50 transition-colors"
                >
                  <FileText size={14} /> View Transcript
                </button>
                {videoUrl && (
                  <a
                    href={videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-200 rounded-full hover:bg-indigo-50 transition-colors"
                  >
                    <Video size={14} /> View Video <ExternalLink size={13} />
                  </a>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {consultation.videoDuration != null
                  ? `Video length: ${formatDurationSeconds(consultation.videoDuration)}`
                  : 'No video duration metadata'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────

export function CaseConsultationsTab({ caseId }: CaseConsultationsTabProps) {
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const { data: raw, isLoading, error } = useCaseConsultations(caseId);

  const consultations: ConsultationSummary[] = (raw as ConsultationSummary[] | { data: ConsultationSummary[] } | undefined) != null
    ? (Array.isArray(raw) ? raw : ((raw as { data?: ConsultationSummary[] }).data ?? []))
    : [];
  const { nameMap: hospitalNameMap } = useHospitalNameMap(consultations.map((item) => item.hospitalId));
  const consultationsWithNames = consultations
    .map((consultation) => ({
      ...consultation,
      hospitalName: consultation.hospitalName
        ?? (consultation.hospitalId ? hospitalNameMap[consultation.hospitalId] : undefined),
    }))
    .sort((a, b) => new Date(b.scheduledAt ?? 0).getTime() - new Date(a.scheduledAt ?? 0).getTime());

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consultations</CardTitle>
      </CardHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="mx-6 mb-6 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {getErrorMessage(error, 'Failed to load consultations')}
        </div>
      ) : consultationsWithNames.length === 0 ? (
        <EmptyState
          icon={<Video size={36} />}
          title="No consultations yet"
          description="Consultations for this case will appear here."
        />
      ) : (
        <div className="space-y-4 pt-2">
          {consultationsWithNames.map((c) => (
            <ConsultationCard
              key={c.id}
              consultation={c}
              onViewTranscript={setTranscriptId}
            />
          ))}
        </div>
      )}

      <TranscriptModal
        consultationId={transcriptId}
        onClose={() => setTranscriptId(null)}
      />
    </Card>
  );
}
