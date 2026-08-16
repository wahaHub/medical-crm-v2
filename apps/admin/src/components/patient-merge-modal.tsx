'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Modal, Button, useDebounce } from '@medical-crm/ui';
import { UserCheck, Search, AlertTriangle } from 'lucide-react';
import { queryFetch } from '@/lib/query-fetch';
import { previewPatientMerge, mergePatient } from '@/actions/patient-actions';
import type { PatientMergeResult, PatientMergeTransferCounts, PatientSearchResult } from '@/lib/api-types';

const TRANSFER_LABELS: Array<[keyof PatientMergeTransferCounts, string]> = [
  ['cases', 'Cases'],
  ['consultations', 'Consultations'],
  ['supportTickets', 'Support tickets'],
  ['orders', 'Orders'],
  ['emailReplyTokens', 'Email reply tokens'],
  ['aiChatSessions', 'AI chat sessions'],
  ['aiUserProfiles', 'AI user profiles'],
  ['aiChatTimelineEvents', 'AI timeline events'],
  ['aiFollowupTriggers', 'AI follow-up triggers'],
  ['aiHandoffs', 'AI handoffs'],
];

interface PatientMergeModalProps {
  /** The patient profile of the current case — becomes the secondary (merged away) */
  patientId: string;
  patientName: string;
}

export function PatientMergeModal({ patientId, patientName }: PatientMergeModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserCheck size={14} className="mr-1.5" />
        Merge patient…
      </Button>
      {/* Mounted lazily: the content uses useRouter/useQuery, which require the Next app router and query client */}
      {open ? (
        <PatientMergeModalContent patientId={patientId} patientName={patientName} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function PatientMergeModalContent({ patientId, patientName, onClose }: PatientMergeModalProps & { onClose: () => void }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [target, setTarget] = useState<PatientSearchResult | null>(null);
  const [preview, setPreview] = useState<PatientMergeResult | null>(null);
  const [acknowledge, setAcknowledge] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { data: searchResults, isFetching } = useQuery({
    queryKey: ['patient-merge-search', debouncedSearch],
    queryFn: () =>
      queryFetch<PatientSearchResult[]>(
        `/api/patients/search?${new URLSearchParams({ q: debouncedSearch })}`,
      ),
    enabled: debouncedSearch.trim().length >= 2,
  });

  const candidates = (searchResults ?? []).filter((item) => item.id !== patientId);

  function handleSelect(candidate: PatientSearchResult) {
    setTarget(candidate);
    setPreview(null);
    setAcknowledge(false);
    setError(null);
    startTransition(async () => {
      try {
        const result = await previewPatientMerge(patientId, { primaryPatientId: candidate.id });
        setPreview(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to preview merge');
      }
    });
  }

  function handleConfirm() {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await mergePatient(patientId, { primaryPatientId: target.id });
        setSuccess(
          `${result.secondary.name} was merged into ${result.primary.name}. `
          + `${result.movedCases.length} case(s) transferred. The secondary profile can no longer log in.`,
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to merge patients');
      }
    });
  }

  const canConfirm = Boolean(preview) && !isPending && acknowledge;

  return (
    <Modal open onClose={onClose} title={`Merge patient ${patientName} into another profile`}>
      {success ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
          <div className="flex justify-end">
            <Button type="button" variant="default" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            All cases and resources of this patient move to the target profile. This profile is then blocked from
            patient login. This action cannot be undone.
          </p>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setTarget(null); setPreview(null); }}
              placeholder="Search target patient by name, email, phone, or WhatsApp…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              disabled={isPending}
            />
          </div>

          {debouncedSearch.trim().length >= 2 && !target ? (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1">
              {isFetching ? (
                <p className="px-3 py-2 text-sm text-slate-400">Searching…</p>
              ) : candidates.length === 0 ? (
                <p className="px-3 py-2 text-sm text-slate-400">No matching patients.</p>
              ) : (
                candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => handleSelect(candidate)}
                    disabled={isPending}
                    className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="block truncate text-sm font-medium text-slate-800">
                      {candidate.name}
                      {candidate.patientCode ? <span className="text-slate-400"> · {candidate.patientCode}</span> : null}
                    </span>
                    <span className="block truncate text-xs text-slate-400">
                      {[candidate.email, candidate.phone, candidate.whatsapp].filter(Boolean).join(' · ') || 'No contact info'}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}

          {target ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm">
              <span className="font-medium text-indigo-900">Target: </span>
              <span className="text-indigo-800">{target.name}</span>
              <span className="block text-xs text-indigo-500">
                {[target.email, target.phone, target.whatsapp].filter(Boolean).join(' · ') || 'No contact info'}
              </span>
            </div>
          ) : null}

          {preview ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Will be transferred to {preview.primary.name}
              </p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                {TRANSFER_LABELS.filter(([key]) => preview.transferred[key] > 0).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="font-medium text-slate-800">{preview.transferred[key]}</dd>
                  </div>
                ))}
              </dl>

              {preview.movedCases.length > 0 ? (
                <p className="text-sm text-slate-600">
                  Cases: {preview.movedCases.map((c) => `#${c.caseNumber}`).join(', ')}
                </p>
              ) : null}

              {Object.keys(preview.contactResolution.filledOnPrimary).length > 0 ? (
                <p className="text-sm text-slate-600">
                  Copied onto the primary profile: {Object.keys(preview.contactResolution.filledOnPrimary).join(', ')}
                </p>
              ) : null}

              {preview.contactResolution.conflicts.map((conflict) => (
                <div key={conflict.field} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>
                    Different {conflict.field}: primary keeps {conflict.primaryValue}; secondary value {conflict.secondaryValue} is kept in the audit log.
                  </span>
                </div>
              ))}

              <label className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                <input
                  type="checkbox"
                  checked={acknowledge}
                  onChange={(e) => setAcknowledge(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300"
                />
                <span>
                  I understand this merge is permanent and the profile {preview.secondary.name} will no longer be able to log in.
                </span>
              </label>
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button type="button" variant="default" size="sm" onClick={handleConfirm} disabled={!canConfirm}>
              {isPending ? 'Merging…' : 'Merge permanently'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
