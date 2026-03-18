'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Video,
  Calendar,
  Clock,
  Plus,
  Sparkles,
  Languages,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  FileText,
  X,
  Download,
} from 'lucide-react';
import {
  StatusBadge,
  Button,
  Modal,
  EmptyState,
} from '@medical-crm/ui';
import { useConsultations, useConsultationStats, useConsultationTranscript } from '@/queries/use-consultations';
import { createConsultation } from '@/actions/consultation-actions';
import type { PaginatedResponse, ConsultationSummary, ConsultationStats, CaseSummary } from '@/lib/api-types';

interface ConsultationsListProps {
  initialData: PaginatedResponse<ConsultationSummary>;
  initialStats: ConsultationStats;
  caseMap?: Record<string, string>; // caseId → patientName
  cases?: CaseSummary[];
}

const statusTabs = [
  { key: 'SCHEDULED', label: 'Scheduled' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'all', label: 'All' },
];

const STAT_CARDS = [
  { key: 'scheduled', label: 'Scheduled', colorClass: 'bg-blue-50 text-blue-600', icon: Calendar },
  { key: 'today', label: 'Today', colorClass: 'bg-cyan-50 text-cyan-600', icon: Clock },
  { key: 'needTranslation', label: 'Need Translation', colorClass: 'bg-purple-50 text-purple-600', icon: Languages },
  { key: 'completed', label: 'Completed', colorClass: 'bg-emerald-50 text-emerald-600', icon: CheckCircle },
];

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

export function ConsultationsList({ initialData, initialStats, caseMap = {}, cases = [] }: ConsultationsListProps) {
  const router = useRouter();
  const [status, setStatus] = useState('SCHEDULED');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);

  const params: Record<string, string> = { limit: '20' };
  if (status !== 'all') params.status = status;

  const filtersMatchSSR = status === 'SCHEDULED';
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } = useConsultations(params);
  const { data: liveStats } = useConsultationStats();

  const stats = (liveStats ?? initialStats) as ConsultationStats;
  const allPages = data?.pages ?? (filtersMatchSSR ? [initialData] : []);
  const consultations = allPages.flatMap((page) => {
    const p = page as PaginatedResponse<ConsultationSummary>;
    return p.data ?? [];
  });

  // Resolve patient name from caseMap if not available on consultation
  const resolvePatientName = (c: ConsultationSummary) =>
    c.patientName || (c.caseId ? caseMap[c.caseId] : undefined) || 'Unknown';

  const statValues = [
    stats.scheduled ?? 0,
    0, // "Today" — would need backend support
    0, // "Need Translation" — would need backend support
    stats.completed ?? 0,
  ];

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {STAT_CARDS.map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={card.key}
              className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.colorClass}`}>
                <Icon size={22} />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-900">{statValues[i]}</div>
                <div className="text-sm text-slate-500">{card.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Tabs + Create Button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex border-b border-slate-200">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatus(tab.key)}
              className={`px-6 pb-3 text-sm font-semibold transition-all border-b-2 ${
                status === tab.key
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-full shadow-md shadow-indigo-200/50 transition-colors"
        >
          <Plus size={16} /> Create Consultation
        </button>
      </div>

      {/* Consultation Cards */}
      {!filtersMatchSSR && isPending ? (
        <div className="flex items-center justify-center py-12 text-slate-400">Loading...</div>
      ) : consultations.length === 0 ? (
        <EmptyState
          icon={<Video size={48} />}
          title="No consultations found"
          description="Create a new consultation to get started."
        />
      ) : (
        <div className="space-y-4">
          {consultations.map((c) => {
            const { date, time, period } = formatTimeBox(c.scheduledAt ?? '');
            const isExpanded = expandedId === c.id;
            const patientName = resolvePatientName(c);

            return (
              <div
                key={c.id}
                className="rounded-2xl border border-slate-100 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Main row */}
                <div className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-5">
                    {/* Time box */}
                    <div className="flex h-16 w-20 flex-col items-center justify-center rounded-xl bg-slate-50">
                      <span className="text-xs font-medium text-slate-400">{date}</span>
                      <span className="text-lg font-bold text-slate-900">{time}</span>
                      <span className="text-[10px] font-medium uppercase text-slate-400">{period}</span>
                    </div>
                    {/* Info */}
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-slate-900">{patientName}</span>
                        <StatusBadge status={c.status ?? 'UNKNOWN'} />
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-sm text-slate-500">
                        {c.caseId && (
                          <span className="flex items-center gap-1">
                            <FolderOpen size={14} /> {c.caseId.slice(0, 8)}...
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock size={14} /> {c.durationMinutes ?? 30} min
                        </span>
                      </div>
                      {c.notes && (
                        <p className="mt-1 text-xs text-slate-400">{c.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.status === 'SCHEDULED' && (
                      <button
                        onClick={() => router.push(`/consultations/${c.id}/room`)}
                        className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-colors"
                      >
                        <Video size={16} /> Enter
                      </button>
                    )}
                    {c.status === 'COMPLETED' && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                        className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors"
                      >
                        View Details {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded AI Summary for completed */}
                {isExpanded && c.status === 'COMPLETED' && (
                  <div className="border-t border-slate-100 bg-indigo-50/50 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Sparkles size={18} className="text-indigo-600" />
                        <h4 className="font-semibold text-slate-900">AI Summary</h4>
                        <span className="text-xs text-slate-400 uppercase">AI Generated</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setTranscriptId(c.id)}
                          className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-200 rounded-full hover:bg-indigo-50"
                        >
                          <FileText size={14} /> Transcript
                        </button>
                        <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-200 rounded-full hover:bg-indigo-50">
                          <Video size={14} /> Video
                        </button>
                      </div>
                    </div>
                    <p className="text-sm text-slate-500 text-center py-4">AI summary will be available after consultation recording is processed.</p>
                  </div>
                )}
              </div>
            );
          })}

          {/* Load More */}
          {hasNextPage && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Create Consultation Modal */}
      <CreateConsultationModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        cases={cases}
      />

      {/* Transcript Modal */}
      <TranscriptModal
        consultationId={transcriptId}
        onClose={() => setTranscriptId(null)}
      />
    </div>
  );
}

/* ── Transcript Modal ─────────────────────────────────────────────── */

interface TranscriptEntry {
  speaker: string;
  timestamp: string;
  original: string;
  translated?: string;
}

function TranscriptModal({
  consultationId,
  onClose,
}: {
  consultationId: string | null;
  onClose: () => void;
}) {
  const [showTranslation, setShowTranslation] = useState(true);
  const { data, isPending } = useConsultationTranscript(consultationId);

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
          {isPending ? (
            <div className="flex items-center justify-center py-12 text-slate-400">Loading transcript...</div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <FileText size={40} className="mb-3 opacity-50" />
              <p className="text-sm">No transcript entries available yet.</p>
              <p className="text-xs mt-1">Transcript will be generated after the consultation recording is processed.</p>
            </div>
          ) : (
            entries.map((entry, i) => {
              const isDoctor = entry.speaker?.toLowerCase().includes('dr') || i % 2 === 0;
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
                      <div className={`mt-2 pt-2 border-t ${isDoctor ? 'border-blue-200/60' : 'border-cyan-200/60'}`}>
                        <p className="text-sm italic text-slate-500">{entry.translated}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t border-slate-100 shrink-0">
          <button className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-full shadow-md shadow-purple-200/50 transition-colors">
            <Download size={16} /> Export PDF
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Create Consultation Modal ────────────────────────────────────── */

function CreateConsultationModal({
  open,
  onClose,
  cases = [],
}: {
  open: boolean;
  onClose: () => void;
  cases?: CaseSummary[];
}) {
  const [caseId, setCaseId] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [aiTranslation, setAiTranslation] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId || !scheduledAt) return;
    setIsSubmitting(true);
    try {
      const combinedNotes = doctorName
        ? `医生: ${doctorName}${notes ? '\n' + notes : ''}`
        : notes || undefined;
      await createConsultation({
        caseId,
        scheduledAt: new Date(scheduledAt).toISOString(),
        durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
        notes: combinedNotes,
      });
      setCaseId('');
      setDoctorName('');
      setScheduledAt('');
      setDurationMinutes('30');
      setAiTranslation(true);
      setNotes('');
      onClose();
    } catch {
      // Error handled by apiClient
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100';

  return (
    <Modal open={open} onClose={onClose} title="Schedule Consultation">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Select Case */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Select Case</label>
          <select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            required
            className={`${inputClass} bg-white`}
          >
            <option value="">Choose a case...</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseNumber ? `${c.caseNumber} - ` : ''}{c.patientName ?? 'Unknown'}{c.patientCode ? ` (${c.patientCode})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Doctor Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Doctor Name</label>
          <input
            type="text"
            value={doctorName}
            onChange={(e) => setDoctorName(e.target.value)}
            className={inputClass}
            placeholder="Enter doctor name (optional)"
          />
        </div>

        {/* Scheduled Date & Time */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Scheduled Date & Time</label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
            min={new Date().toISOString().slice(0, 16)}
            className={inputClass}
          />
        </div>

        {/* Duration */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Duration</label>
          <select
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            className={`${inputClass} bg-white`}
          >
            <option value="15">15 minutes</option>
            <option value="30">30 minutes</option>
            <option value="45">45 minutes</option>
            <option value="60">60 minutes</option>
          </select>
        </div>

        {/* AI Translation */}
        <div className="flex items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-xl">
          <input
            type="checkbox"
            id="aiTranslation"
            checked={aiTranslation}
            onChange={(e) => setAiTranslation(e.target.checked)}
            className="h-4 w-4 rounded border-purple-300 text-purple-600 focus:ring-purple-500"
          />
          <label htmlFor="aiTranslation" className="text-sm text-purple-700 flex-1">
            Enable AI Translation
          </label>
        </div>

        {/* Notes */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={`${inputClass} resize-none`}
            placeholder="Optional notes..."
          />
        </div>

        {/* CRM Notification info */}
        <div className="flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-xl">
          <CheckCircle size={16} className="text-teal-600 shrink-0" />
          <p className="text-xs text-teal-700">
            A CRM notification will be sent to the patient when the consultation is scheduled.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting || !caseId || !scheduledAt}>
            {isSubmitting ? 'Creating...' : 'Schedule Consultation'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
