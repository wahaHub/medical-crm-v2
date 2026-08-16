'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Modal, Button, useDebounce } from '@medical-crm/ui';
import { GitMerge, Search, AlertTriangle } from 'lucide-react';
import { queryFetch } from '@/lib/query-fetch';
import { previewCaseMerge, mergeCase } from '@/actions/case-actions';
import type { CaseMergeResult, CaseMergeTransferCounts, CaseSummary, PaginatedResponse } from '@/lib/api-types';

const TRANSFER_LABELS: Array<[keyof Omit<CaseMergeTransferCounts, 'journeyConflict'>, string]> = [
  ['documents', 'Documents'],
  ['caseProgress', 'Progress entries'],
  ['conversations', 'Conversations (incl. messages)'],
  ['consultations', 'Consultations'],
  ['quotes', 'Quotes'],
  ['caseHospitalContacts', 'Hospital contacts'],
  ['caseEvents', 'Timeline events'],
  ['caseJourneys', 'Journeys'],
  ['journeyMilestones', 'Journey milestones'],
  ['questionCollectorResponses', 'Questionnaire responses'],
  ['orders', 'Orders'],
  ['supportTickets', 'Support tickets'],
  ['emailReplyTokens', 'Email reply tokens'],
  ['inboundEmailEvents', 'Inbound email events'],
];

interface CaseMergeModalProps {
  caseData: CaseSummary;
}

export function CaseMergeModal({ caseData }: CaseMergeModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <GitMerge size={14} className="mr-1.5" />
        Merge into…
      </Button>
      {/* Mounted lazily: the content uses useRouter/useQuery, which require the Next app router and query client */}
      {open ? <CaseMergeModalContent caseData={caseData} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function CaseMergeModalContent({ caseData, onClose }: CaseMergeModalProps & { onClose: () => void }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [target, setTarget] = useState<CaseSummary | null>(null);
  const [preview, setPreview] = useState<CaseMergeResult | null>(null);
  const [confirmDifferentPatients, setConfirmDifferentPatients] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { data: searchResults, isFetching } = useQuery({
    queryKey: ['case-merge-search', debouncedSearch],
    queryFn: () =>
      queryFetch<PaginatedResponse<CaseSummary>>(
        `/api/cases?${new URLSearchParams({ search: debouncedSearch, limit: '10' })}`,
      ),
    enabled: debouncedSearch.trim().length >= 2,
  });

  const candidates = useMemo(
    () => (searchResults?.data ?? []).filter((item) => item.id !== caseData.id),
    [searchResults, caseData.id],
  );

  function handleSelect(candidate: CaseSummary) {
    setTarget(candidate);
    setPreview(null);
    setConfirmDifferentPatients(false);
    setError(null);
    startTransition(async () => {
      try {
        const result = await previewCaseMerge(caseData.id, { primaryCaseId: candidate.id });
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
        const result = await mergeCase(caseData.id, {
          primaryCaseId: target.id,
          confirmDifferentPatients: confirmDifferentPatients || undefined,
        });
        setSuccess(`Merged into ${result.primary.caseNumber}. This case is now archived as MERGED.`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to merge cases');
      }
    });
  }

  const requiresPatientConfirm = Boolean(preview?.differentPatients);
  const canConfirm = Boolean(preview) && !isPending && (!requiresPatientConfirm || confirmDifferentPatients);

  return (
    <Modal open onClose={onClose} title={`Merge case #${caseData.caseNumber} into another case`}>
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
            All resources of this case move to the target case. This case is then marked MERGED and hidden from lists.
            This action cannot be undone.
          </p>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setTarget(null); setPreview(null); }}
              placeholder="Search target case by patient name, case number, or diagnosis…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              disabled={isPending}
            />
          </div>

          {debouncedSearch.trim().length >= 2 && !target ? (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1">
              {isFetching ? (
                <p className="px-3 py-2 text-sm text-slate-400">Searching…</p>
              ) : candidates.length === 0 ? (
                <p className="px-3 py-2 text-sm text-slate-400">No matching cases.</p>
              ) : (
                candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => handleSelect(candidate)}
                    disabled={isPending}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {candidate.patientName} · #{candidate.caseNumber}
                      </span>
                      <span className="block truncate text-xs text-slate-400">
                        {candidate.patientEmail ?? candidate.patientPhone ?? candidate.primaryDiagnosis ?? ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{candidate.assignmentStatus}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}

          {target ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm">
              <span className="font-medium text-indigo-900">Target: </span>
              <span className="text-indigo-800">{target.patientName} · #{target.caseNumber}</span>
            </div>
          ) : null}

          {preview ? (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Will be transferred to #{preview.primary.caseNumber}
              </p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                {TRANSFER_LABELS.filter(([key]) => preview.transferred[key] > 0).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="font-medium text-slate-800">{preview.transferred[key]}</dd>
                  </div>
                ))}
              </dl>
              {TRANSFER_LABELS.every(([key]) => preview.transferred[key] === 0) ? (
                <p className="text-sm text-slate-400">No child resources to transfer.</p>
              ) : null}

              {preview.warnings.map((warning) => (
                <div key={warning} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}

              {requiresPatientConfirm ? (
                <label className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  <input
                    type="checkbox"
                    checked={confirmDifferentPatients}
                    onChange={(e) => setConfirmDifferentPatients(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300"
                  />
                  <span>
                    These cases belong to different patients ({preview.secondary.patientName} → {preview.primary.patientName}).
                    I confirm the merge (merging the patient profiles first is recommended).
                  </span>
                </label>
              ) : null}
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
