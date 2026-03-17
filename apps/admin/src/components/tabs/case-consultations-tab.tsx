'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, StatusBadge, EmptyState } from '@medical-crm/ui';
import { Video, Clock, Building, ChevronDown, ChevronUp, FileText, X } from 'lucide-react';
import { useCaseConsultations, useConsultationTranscript } from '@/queries/use-consultations';

// ── Types ─────────────────────────────────────────────────────────────

interface ConsultationSummary {
  id: string;
  hospitalId?: string;
  caseId?: string;
  status?: string;
  scheduledAt?: string;
  durationMinutes?: number;
  notes?: string;
  patientName?: string;
}

interface TranscriptEntry {
  speaker: string;
  timestamp: string;
  original: string;
  translated?: string;
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

// ── Transcript Modal ──────────────────────────────────────────────────

function TranscriptModal({
  consultationId,
  onClose,
}: {
  consultationId: string | null;
  onClose: () => void;
}) {
  const [showTranslation, setShowTranslation] = useState(true);
  const { data, isLoading } = useConsultationTranscript(consultationId);

  if (!consultationId) return null;

  const transcript = data as { entries?: TranscriptEntry[] } | null;
  const entries = transcript?.entries ?? [];

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
                  <span className="font-mono text-xs">{consultation.hospitalId.slice(0, 8)}...</span>
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
            {consultation.hospitalId && (
              <div>
                <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Hospital ID</dt>
                <dd className="font-mono text-xs text-slate-700 mt-0.5">{consultation.hospitalId}</dd>
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
            <div>
              <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">Duration</dt>
              <dd className="text-slate-700 mt-0.5">{consultation.durationMinutes ?? 30} minutes</dd>
            </div>
          </dl>

          {consultation.status === 'COMPLETED' && (
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => onViewTranscript(consultation.id)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-200 rounded-full hover:bg-indigo-50 transition-colors"
              >
                <FileText size={14} /> View Transcript
              </button>
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
  const { data: raw, isLoading } = useCaseConsultations(caseId);

  const consultations: ConsultationSummary[] = (raw as ConsultationSummary[] | { data: ConsultationSummary[] } | undefined) != null
    ? (Array.isArray(raw) ? raw : ((raw as { data?: ConsultationSummary[] }).data ?? []))
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consultations</CardTitle>
      </CardHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : consultations.length === 0 ? (
        <EmptyState
          icon={<Video size={36} />}
          title="No consultations yet"
          description="Consultations for this case will appear here."
        />
      ) : (
        <div className="space-y-4 pt-2">
          {consultations.map((c) => (
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
