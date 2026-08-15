'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, StatusBadge, Button, DataTable, EmptyState, useMediaUpload, type Column } from '@medical-crm/ui';
import { FileText, Upload, Trash2, Eye, Download, Paperclip, X, Building2, Send } from 'lucide-react';
import { useCaseDocuments, useCaseHospitalContacts, useCaseProgress } from '@/queries/use-cases';
import { addCaseNote, initCaseDocumentUpload, deleteDocument } from '@/actions/case-actions';
import { addHospitalToCase, removeHospitalContact, requestQuotesForHospitalContacts, resetCaseAssignment } from '@/actions/quote-actions';
import { useHospitals } from '@/queries/use-hospitals';
import { useHospitalNameMap } from '@/queries/use-hospital-names';
import { CaseStageStepper } from '@/components/case-stage-stepper';
import { deriveSelectedHospitals, type HospitalContactLike } from '@/lib/case-selected-hospitals';
import { formatDateTime } from '@/lib/date-format';
import {
  deriveHospitalAssignmentRows,
  diffHospitalSelections,
  filterHospitalAssignmentRows,
  persistHospitalAssignmentSelectionChanges,
  type HospitalAssignmentFilter,
} from '@/lib/case-hospital-assignment';
import type { CaseProgressItem, CaseSummary, HospitalSummary } from '@/lib/api-types';

// ── Types ────────────────────────────────────────────────────────────

interface DocumentItem {
  id: string;
  fileName: string;
  documentType?: string;
  type?: string;
  fileSize?: number;
  language?: string;
  createdAt?: string;
  downloadUrl?: string;
  stageTag?: string | null;
}

const DOCUMENT_STAGE_TAGS = [
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'IN_TREATMENT', label: 'In Treatment' },
  { value: 'POST_TREATMENT', label: 'Post Treatment' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FOLLOW_UP', label: 'Follow Up' },
] as const;

function formatStageTag(tag?: string | null): string {
  if (!tag) return '—';
  const known = DOCUMENT_STAGE_TAGS.find((stage) => stage.value === tag);
  return known ? known.label : tag.replace(/_/g, ' ');
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getDocumentPreviewHref(caseId: string, doc: DocumentItem): string | undefined {
  if (doc.id.startsWith('message-attachment:')) {
    return doc.downloadUrl;
  }

  return `/api/cases/${caseId}/documents/${doc.id}/preview`;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{value || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

function resolveCaseHospitalType(caseData: CaseSummary): 'COSMETIC' | 'REGULAR' | null {
  if (caseData.hospitalType === 'COSMETIC' || caseData.hospitalType === 'REGULAR') {
    return caseData.hospitalType;
  }
  if (caseData.patientSite === 'beauty') return 'COSMETIC';
  if (caseData.patientSite === 'china') return 'REGULAR';
  return null;
}

// ── Patient Info Card ────────────────────────────────────────────────

function PatientInfoCard({ caseData }: { caseData: CaseSummary }) {
  const caseHospitalType = resolveCaseHospitalType(caseData);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patient Information</CardTitle>
        <StatusBadge status={caseData.status} />
      </CardHeader>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <InfoRow label="Patient Name" value={caseData.patientName} />
        <InfoRow label="Email" value={caseData.patientEmail} />
        <InfoRow label="Phone" value={caseData.patientPhone} />
        <InfoRow label="Gender" value={caseData.gender} />
        <InfoRow label="Country" value={caseData.country} />
        <InfoRow label="Destination" value={caseData.destination} />
        <InfoRow label="Department" value={caseData.department} />
        <InfoRow label="Disease" value={caseData.disease} />
        <InfoRow label="Treatment Timing" value={caseData.treatmentTime} />
        <InfoRow label="Language" value={caseData.patientLanguage} />
        <InfoRow label="Patient Site" value={caseData.patientSite ?? undefined} />
        <InfoRow label="Hospital Type" value={caseHospitalType ?? undefined} />
        <InfoRow label="Primary Diagnosis" value={caseData.primaryDiagnosis} />
        <InfoRow label="Risk Level" value={caseData.riskLevel} />
        <InfoRow label="Case Number" value={caseData.caseNumber} />
        <InfoRow label="Created" value={caseData.createdAt ? formatDateTime(caseData.createdAt) : undefined} />
      </dl>
    </Card>
  );
}

function AssignedHospitalCard({ caseData }: { caseData: CaseSummary }) {
  const queryClient = useQueryClient();
  const caseHospitalType = resolveCaseHospitalType(caseData);
  const canFilterNewHospitalsByType = Boolean(caseHospitalType);
  const { data: rawContacts, refetch: refetchContacts } = useCaseHospitalContacts(caseData.id);
  const existingContacts = toHospitalContacts(rawContacts);
  const { data: hospitalsResponse, isPending: isLoadingHospitals } = useHospitals({
    page: '1',
    limit: '100',
    status: 'ACTIVE',
    ...(caseHospitalType ? { type: caseHospitalType } : {}),
  });
  const hospitalRows = useMemo(
    () => deriveHospitalAssignmentRows({
      assignedHospitalId: caseData.assignedHospitalId,
      assignedHospitalName: caseData.hospitalName,
      hospitals: canFilterNewHospitalsByType
        ? ((hospitalsResponse?.data ?? []) as HospitalSummary[]).filter((hospital) => hospital.type === caseHospitalType)
        : [],
      contacts: existingContacts,
    }),
    [canFilterNewHospitalsByType, caseData.assignedHospitalId, caseData.hospitalName, caseHospitalType, existingContacts, hospitalsResponse?.data],
  );
  const initialSelectedHospitalIds = useMemo(
    () => hospitalRows.filter((row) => row.checked).map((row) => row.hospitalId),
    [hospitalRows],
  );
  const [selectedHospitalIds, setSelectedHospitalIds] = useState<string[]>(initialSelectedHospitalIds);
  const [assignmentFilter, setAssignmentFilter] = useState<HospitalAssignmentFilter>('ALL');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isSubmitting, startTransition] = useTransition();
  const selectedHospitalIdSet = useMemo(
    () => new Set(selectedHospitalIds),
    [selectedHospitalIds],
  );
  const selectionDiff = useMemo(
    () => diffHospitalSelections({
      initialSelectedHospitalIds,
      nextSelectedHospitalIds: selectedHospitalIds,
    }),
    [initialSelectedHospitalIds, selectedHospitalIds],
  );
  const filteredHospitalRows = useMemo(
    () => filterHospitalAssignmentRows(hospitalRows, assignmentFilter),
    [assignmentFilter, hospitalRows],
  );
  const hasSelectionChanges = selectionDiff.hospitalIdsToAdd.length > 0 || selectionDiff.hospitalIdsToRemove.length > 0;
  const canCleanupExistingAssignments = hospitalRows.some((row) => row.checked);
  const hasUnsupportedAdditionsWithoutType = !caseHospitalType && selectionDiff.hospitalIdsToAdd.length > 0;
  const canSubmitSelectionChanges = (
    (canFilterNewHospitalsByType || canCleanupExistingAssignments)
    && !hasUnsupportedAdditionsWithoutType
  );

  useEffect(() => {
    setSelectedHospitalIds(initialSelectedHospitalIds);
  }, [initialSelectedHospitalIds]);

  function toggleHospitalSelection(hospitalId: string) {
    setSelectedHospitalIds((current) => (
      current.includes(hospitalId)
        ? current.filter((id) => id !== hospitalId)
        : [...current, hospitalId]
    ));
  }

  function handleSubmit() {
    if (!canSubmitSelectionChanges) {
      setSubmitError(
        caseHospitalType
          ? 'Hospital assignment changes are unavailable right now.'
          : 'Patient site is missing, so you can only unassign hospitals already on this case.',
      );
      setSubmitSuccess(null);
      return;
    }

    if (!hasSelectionChanges) {
      setSubmitError('No hospital assignment changes to save');
      setSubmitSuccess(null);
      return;
    }

    setSubmitError(null);
    setSubmitSuccess(null);
    startTransition(async () => {
      try {
        const {
          addedCount,
          removedCount,
          assignmentReset,
          failures,
        } = await persistHospitalAssignmentSelectionChanges({
          caseId: caseData.id,
          assignedHospitalId: caseData.assignedHospitalId,
          assignmentStatus: caseData.assignmentStatus,
          hospitalRows,
          selectionDiff,
          addHospitalToCase,
          removeHospitalContact,
          resetCaseAssignment,
        });

        const successMessages = [
          addedCount > 0 ? `Assigned ${addedCount} hospital${addedCount === 1 ? '' : 's'}` : null,
          removedCount > 0 ? `Unassigned ${removedCount} hospital${removedCount === 1 ? '' : 's'}` : null,
          assignmentReset ? 'reset the primary assignment' : null,
        ].filter(Boolean);

        setSubmitSuccess(successMessages.length > 0 ? `${successMessages.join(', ')}.` : null);
        setSubmitError(failures.length > 0 ? failures.join(' ') : null);
      } finally {
        await refetchContacts();
        await queryClient.invalidateQueries({ queryKey: ['cases', caseData.id, 'hospital-contacts'] });
        await queryClient.invalidateQueries({ queryKey: ['cases', caseData.id] });
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assigned Hospital</CardTitle>
        <StatusBadge status={caseData.assignedHospitalId ? 'ASSIGNED' : 'UNASSIGNED'} />
      </CardHeader>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
        <InfoRow label="Hospital Name" value={caseData.hospitalName} />
        <InfoRow label="Hospital ID" value={caseData.assignedHospitalId} />
        <InfoRow label="Assignment Status" value={caseData.assignmentStatus} />
        <InfoRow label="Treatment Stage" value={caseData.treatmentStage} />
      </dl>
      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-700">
          Manage {caseHospitalType ?? 'matching'} hospitals for this case
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Check hospitals to keep them on this case. Uncheck hospitals to unassign them, then save all changes at once.
        </p>
        {!caseHospitalType ? (
          <p className="mt-2 text-xs text-amber-700">
            Patient site is missing on this case, so only cleanup unassignments are available until hospital type can be determined.
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(['ALL', 'DISTRIBUTED', 'AVAILABLE'] as const).map((filter) => {
            const isActive = assignmentFilter === filter;
            const count = filterHospitalAssignmentRows(hospitalRows, filter).length;
            const label = filter === 'ALL' ? 'All' : filter === 'DISTRIBUTED' ? 'Distributed' : 'Available';
            return (
              <button
                key={filter}
                type="button"
                onClick={() => setAssignmentFilter(filter)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
                }`}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>
        <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
          {filteredHospitalRows.map((row) => (
            <label
              key={row.hospitalId}
              className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedHospitalIdSet.has(row.hospitalId)}
                  onChange={() => toggleHospitalSelection(row.hospitalId)}
                  disabled={(!caseHospitalType && !selectedHospitalIdSet.has(row.hospitalId)) || isSubmitting || isLoadingHospitals}
                  className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">{row.hospitalName}</div>
                  <div className="truncate text-xs text-slate-500">{row.hospitalId}</div>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {row.statusLabel}
              </span>
            </label>
          ))}
        </div>
        {filteredHospitalRows.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">
            {canFilterNewHospitalsByType
              ? assignmentFilter === 'ALL'
                ? 'No matching hospitals are currently available.'
                : `No ${assignmentFilter === 'DISTRIBUTED' ? 'distributed' : 'available'} hospitals match this filter.`
              : 'No hospital options are available until hospital type is known.'}
          </p>
        ) : null}
        {submitError ? <p className="mt-3 text-sm text-rose-600">{submitError}</p> : null}
        {submitSuccess ? <p className="mt-3 text-sm text-emerald-700">{submitSuccess}</p> : null}
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmitSelectionChanges || isSubmitting || isLoadingHospitals || !hasSelectionChanges}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

interface PaginatedLike<T> {
  data?: T[];
}

function toHospitalContacts(raw: unknown): HospitalContactLike[] {
  if (Array.isArray(raw)) return raw as HospitalContactLike[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as PaginatedLike<HospitalContactLike>).data)) {
    return (raw as PaginatedLike<HospitalContactLike>).data ?? [];
  }
  return [];
}

export function SelectedHospitalsCard({ caseData }: { caseData: CaseSummary }) {
  const queryClient = useQueryClient();
  const { data: raw, isLoading, error: queryError, refetch } = useCaseHospitalContacts(caseData.id);
  const contacts = toHospitalContacts(raw);
  const { nameMap: hospitalNameMap } = useHospitalNameMap(contacts.map((contact) => contact.hospitalId));
  const selectedHospitals = useMemo(
    () => deriveSelectedHospitals(contacts, hospitalNameMap),
    [contacts, hospitalNameMap],
  );
  const freshQuoteTargetIds = useMemo(
    () => selectedHospitals
      .filter((hospital) => !hospital.hasFollowUpSent && hospital.statusLabel === 'Selected')
      .map((hospital) => hospital.contactId),
    [selectedHospitals],
  );
  const followUpTargetIds = useMemo(
    () => selectedHospitals
      .filter((hospital) => hospital.hasFollowUpSent && hospital.statusLabel === 'Quote Prompt Sent')
      .map((hospital) => hospital.contactId),
    [selectedHospitals],
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const bulkAction = useMemo(() => {
    if (freshQuoteTargetIds.length > 0 && followUpTargetIds.length > 0) {
      return {
        label: 'Send Requests & Follow-ups',
        mode: 'mixed' as const,
        contactIds: [...freshQuoteTargetIds, ...followUpTargetIds],
      };
    }
    if (freshQuoteTargetIds.length > 0) {
      return {
        label: 'Send Quote Request',
        mode: 'request' as const,
        contactIds: freshQuoteTargetIds,
      };
    }
    if (followUpTargetIds.length > 0) {
      return {
        label: 'Send Quote Follow-up',
        mode: 'follow-up' as const,
        contactIds: followUpTargetIds,
      };
    }
    return {
      label: 'Send Quote Request',
      mode: 'request' as const,
      contactIds: [] as string[],
    };
  }, [followUpTargetIds, freshQuoteTargetIds]);

  function handleSendQuoteRequest(contactIds: string[], mode: 'request' | 'follow-up' | 'mixed') {
    if (contactIds.length === 0) return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const result = await requestQuotesForHospitalContacts(caseData.id, contactIds);
        if (result.requestedCount > 0) {
          setSuccess(
            mode === 'request'
              ? `Quote prompt sent to ${result.requestedCount} hospital${result.requestedCount === 1 ? '' : 's'}.`
              : mode === 'follow-up'
                ? `Quote follow-up sent to ${result.requestedCount} hospital${result.requestedCount === 1 ? '' : 's'}.`
                : `Quote requests and follow-ups sent to ${result.requestedCount} hospital${result.requestedCount === 1 ? '' : 's'}.`,
          );
        }
        if (result.failures.length > 0) {
          const failedHospitals = result.failures.map((failure) => (
            selectedHospitals.find((hospital) => hospital.contactId === failure.contactId)?.hospitalName ?? failure.contactId
          ));
          setError(
            result.requestedCount > 0
              ? `Completed ${result.requestedCount} request(s), but failed for: ${failedHospitals.join(', ')}.`
              : result.failures[0]?.message ?? 'Failed to send quote follow-up',
          );
        }
        await refetch();
        await queryClient.invalidateQueries({ queryKey: ['cases', caseData.id, 'hospital-contacts'] });
        await queryClient.invalidateQueries({ queryKey: ['cases', caseData.id, 'quotes', 'compare'] });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send quote request');
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex w-full items-start justify-between gap-4">
          <div className="min-w-0">
            <CardTitle>Hospitals Selected By Patient</CardTitle>
            <p className="mt-1 text-sm text-slate-500">
              Keep patient-selected hospitals visible here, then prompt those hospitals to prepare quotes once the case is ready.
            </p>
          </div>
          <Button
            variant="default"
            size="sm"
            className="sm:ml-auto"
            onClick={() => handleSendQuoteRequest(
              bulkAction.contactIds,
              bulkAction.mode,
            )}
            disabled={isPending || bulkAction.contactIds.length === 0}
          >
            <Send size={14} className="mr-1.5" />
            {isPending ? 'Sending...' : bulkAction.label}
          </Button>
        </div>
      </CardHeader>

      {error && (
        <div className="mx-6 mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mx-6 mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {success}
        </div>
      )}
      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : queryError ? (
        <div className="px-6 pb-6">
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
            {queryError instanceof Error ? queryError.message : 'Failed to load selected hospitals'}
          </div>
        </div>
      ) : selectedHospitals.length === 0 ? (
        <div className="px-6 pb-6">
          <EmptyState
            icon={<Building2 size={36} />}
            title="No patient-selected hospitals yet"
            description="Once the patient chooses hospitals in the widget, they will appear here."
          />
          {caseData.customHospitalRequest ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="font-semibold">Custom hospital requested:</span> {caseData.customHospitalRequest}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 px-6 pb-6">
          {selectedHospitals.map((hospital) => (
            <div
              key={hospital.contactId}
              className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-800">{hospital.hospitalName}</div>
                <div className="text-xs text-slate-500">{hospital.hospitalId}</div>
              </div>
              <div className="flex items-center gap-2">
                {(hospital.statusLabel === 'Selected' || hospital.statusLabel === 'Quote Prompt Sent') ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSendQuoteRequest([hospital.contactId], hospital.hasFollowUpSent ? 'follow-up' : 'request')}
                    disabled={isPending}
                  >
                    {hospital.hasFollowUpSent ? 'Follow Up' : 'Request Quote'}
                  </Button>
                ) : null}
                <StatusBadge status={hospital.statusLabel.toUpperCase().replace(/\s+/g, '_')} />
              </div>
            </div>
          ))}
          {caseData.customHospitalRequest ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span className="font-semibold">Custom hospital requested:</span> {caseData.customHospitalRequest}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function isAdminNote(progress: CaseProgressItem): boolean {
  const kind = progress.metadata && typeof progress.metadata === 'object'
    ? (progress.metadata['kind'] as string | undefined)
    : undefined;
  return progress.progressType === 'MESSAGE' && kind === 'admin_note';
}

function getNoteAttachmentNames(progress: CaseProgressItem): string[] {
  const value = progress.metadata && typeof progress.metadata === 'object'
    ? progress.metadata['attachmentNames']
    : null;
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

// ── Notes Card ───────────────────────────────────────────────────────

function AdminNotesCard({ caseData }: { caseData: CaseSummary }) {
  const queryClient = useQueryClient();
  const { data: progressRaw, isLoading, refetch } = useCaseProgress(caseData.id);
  const [isPending, startTransition] = useTransition();
  const [draftNote, setDraftNote] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    upload,
    isUploading,
    error: uploadError,
    clearError: clearUploadError,
  } = useMediaUpload({
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/dicom',
    ],
    maxFileSize: 25 * 1024 * 1024,
  });

  const notes = useMemo(
    () => ((progressRaw as CaseProgressItem[] | undefined) ?? []).filter(isAdminNote),
    [progressRaw],
  );
  const displayError = error ?? uploadError;

  function handleAddNote() {
    const note = draftNote.trim();
    if (!note && selectedFiles.length === 0) {
      setError('Add note text or attach at least one file');
      setSuccess(null);
      return;
    }

    setError(null);
    setSuccess(null);
    clearUploadError();

    startTransition(async () => {
      try {
        let attachmentNames: string[] = [];
        if (selectedFiles.length > 0) {
          const assets = await upload(selectedFiles, (params) => initCaseDocumentUpload(caseData.id, params));
          if (assets.length !== selectedFiles.length) {
            return;
          }
          attachmentNames = assets.map((asset) => asset.fileName);
        }

        await addCaseNote(caseData.id, {
          note: note || undefined,
          attachmentNames,
        });
        setDraftNote('');
        setSelectedFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setSuccess(attachmentNames.length > 0 ? 'Note and attachment saved' : 'Note added');
        await refetch();
        await queryClient.invalidateQueries({ queryKey: ['cases', caseData.id, 'progress'] });
        await queryClient.invalidateQueries({ queryKey: ['cases', caseData.id, 'documents'] });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add note');
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Admin Notes</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            Append-only internal notes for this case. New entries are added to the timeline and do not overwrite older notes.
          </p>
        </div>
      </CardHeader>
      {displayError && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {displayError}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <textarea
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            placeholder="Add a new case note. This will append to the existing note history."
            className="min-h-28 w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            disabled={isPending || isUploading}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              clearUploadError();
              setSelectedFiles(Array.from(e.target.files ?? []));
            }}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isPending || isUploading}>
              <Paperclip size={14} className="mr-1.5" />
              Attach File
            </Button>
            {selectedFiles.length > 0 && (
              <span className="text-xs text-slate-500">
                {selectedFiles.length} file{selectedFiles.length === 1 ? '' : 's'} selected
              </span>
            )}
          </div>
          {selectedFiles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedFiles.map((file) => (
                <span key={`${file.name}-${file.size}-${file.lastModified}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600">
                  {file.name}
                  <button
                    type="button"
                    onClick={() => setSelectedFiles((current) => current.filter((item) => item !== file))}
                    className="text-slate-400 transition-colors hover:text-rose-500"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Best for admin observations, follow-up reminders, internal coordination notes, and note attachments.
            </p>
            <Button variant="default" size="sm" onClick={handleAddNote} disabled={isPending || isUploading || (!draftNote.trim() && selectedFiles.length === 0)}>
              {isUploading ? 'Uploading files…' : isPending ? 'Saving…' : selectedFiles.length > 0 ? 'Save Note & Files' : 'Append Note'}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          </div>
        ) : notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-400">
            No notes yet.
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">{note.title || 'Admin note'}</p>
                  <span className="text-xs text-slate-400">
                    {new Date(note.recordedAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {note.description ?? '—'}
                </p>
                {getNoteAttachmentNames(note).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getNoteAttachmentNames(note).map((fileName) => (
                      <span key={`${note.id}-${fileName}`} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                        <Paperclip size={11} />
                        {fileName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Documents Card ───────────────────────────────────────────────────

function DocumentsCard({ caseId }: { caseId: string }) {
  const { data: rawDocs, isLoading, refetch } = useCaseDocuments(caseId);
  const docs = (rawDocs as DocumentItem[] | undefined) ?? [];
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [uploadStageTag, setUploadStageTag] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    upload,
    isUploading,
    error: uploadError,
    clearError: clearUploadError,
  } = useMediaUpload({
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/dicom',
    ],
    maxFileSize: 25 * 1024 * 1024,
  });
  const displayError = error ?? uploadError;

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    clearUploadError();

    startTransition(async () => {
      try {
        const assets = await upload(
          [file],
          (params) => initCaseDocumentUpload(caseId, { ...params, ...(uploadStageTag ? { stageTag: uploadStageTag } : {}) }),
        );
        if (assets.length !== 1) {
          return;
        }
        await refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload document');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  }

  function handleDelete(docId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await deleteDocument(caseId, docId);
        await refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete document');
      }
    });
  }

  const columns: Column<DocumentItem>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-indigo-400 shrink-0" />
          <span className="text-sm font-medium text-slate-800 truncate max-w-[200px]">
            {row.fileName || 'Unnamed'}
          </span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <span className="text-xs text-slate-500">
          {(row.documentType ?? row.type ?? 'OTHER').replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      render: (row) => (
        <span className="text-xs text-slate-500">{formatStageTag(row.stageTag)}</span>
      ),
    },
    {
      key: 'size',
      header: 'Size',
      render: (row) => <span className="text-xs text-slate-400">{formatFileSize(row.fileSize)}</span>,
    },
    {
      key: 'date',
      header: 'Uploaded',
      render: (row) => (
        <span className="text-xs text-slate-400">
          {row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => {
        const previewHref = getDocumentPreviewHref(caseId, row);

        return (
          <div className="flex items-center gap-1">
            {previewHref && (
              <a
                href={previewHref}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <Eye size={14} />
              </a>
            )}
            {row.downloadUrl && (
              <a
                href={row.downloadUrl}
                download={row.fileName}
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <Download size={14} />
              </a>
            )}
            <button
              onClick={() => handleDelete(row.id)}
              disabled={isPending}
              className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      },
    },
  ];

  const filteredDocs = stageFilter
    ? docs.filter((doc) => (stageFilter === '__UNTAGGED__' ? !doc.stageTag : doc.stageTag === stageFilter))
    : docs;

  const stageFilterOptions = [
    { value: '', label: 'All' },
    { value: '__UNTAGGED__', label: 'Untagged' },
    ...DOCUMENT_STAGE_TAGS.map((stage) => ({ value: stage.value as string, label: stage.label })),
  ];
  const uploadTagOptions = [
    { value: '', label: 'No tag' },
    ...DOCUMENT_STAGE_TAGS.map((stage) => ({ value: stage.value as string, label: stage.label })),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending || isUploading}
          >
            <Upload size={14} className="mr-1.5" />
            {isUploading ? 'Uploading…' : isPending ? 'Saving…' : 'Upload'}
          </Button>
        </div>
      </CardHeader>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">Filter:</span>
        {stageFilterOptions.map((option) => {
          const isActive = stageFilter === option.value;
          return (
            <button
              key={`filter-${option.value || 'all'}`}
              type="button"
              onClick={() => setStageFilter(option.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">Tag next upload:</span>
        {uploadTagOptions.map((option) => {
          const isActive = uploadStageTag === option.value;
          return (
            <button
              key={`tag-${option.value || 'none'}`}
              type="button"
              onClick={() => setUploadStageTag(option.value)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {displayError && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {displayError}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={filteredDocs}
          keyExtractor={(row) => row.id}
          emptyState={
            <EmptyState
              icon={<FileText size={36} />}
              title="No documents yet"
              description="Upload medical records, reports, or other files."
            />
          }
        />
      )}
    </Card>
  );
}

// ── Main Export ──────────────────────────────────────────────────────

interface CaseOverviewTabProps {
  caseData: CaseSummary;
}

export function CaseOverviewTab({ caseData }: CaseOverviewTabProps) {
  return (
    <div className="space-y-6">
      <CaseStageStepper caseData={caseData} />
      <PatientInfoCard caseData={caseData} />
      <SelectedHospitalsCard caseData={caseData} />
      <AssignedHospitalCard caseData={caseData} />
      <AdminNotesCard caseData={caseData} />
      <DocumentsCard caseId={caseData.id} />
    </div>
  );
}
