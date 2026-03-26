'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, StatusBadge, Button, DataTable, EmptyState, useMediaUpload, type Column } from '@medical-crm/ui';
import { FileText, Upload, Trash2, Eye, Download, Paperclip, X } from 'lucide-react';
import { useCaseDocuments, useCaseProgress } from '@/queries/use-cases';
import { addCaseNote, initCaseDocumentUpload, deleteDocument } from '@/actions/case-actions';
import type { CaseProgressItem, CaseSummary } from '@/lib/api-types';

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
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</dt>
      <dd className="text-sm font-medium text-slate-800">{value || <span className="text-slate-400">—</span>}</dd>
    </div>
  );
}

// ── Patient Info Card ────────────────────────────────────────────────

function PatientInfoCard({ caseData }: { caseData: CaseSummary }) {
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
        <InfoRow label="Country" value={caseData.patientCountry} />
        <InfoRow label="Language" value={caseData.patientLanguage} />
        <InfoRow label="Primary Diagnosis" value={caseData.primaryDiagnosis} />
        <InfoRow label="Risk Level" value={caseData.riskLevel} />
        <InfoRow label="Case Number" value={caseData.caseNumber} />
        <InfoRow label="Created" value={caseData.createdAt ? new Date(caseData.createdAt).toLocaleDateString() : undefined} />
      </dl>
    </Card>
  );
}

function AssignedHospitalCard({ caseData }: { caseData: CaseSummary }) {
  if (!caseData.assignedHospitalId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assigned Hospital</CardTitle>
          <StatusBadge status="UNASSIGNED" />
        </CardHeader>
        <p className="text-sm text-slate-400">No hospital assigned to this case yet.</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Assigned Hospital</CardTitle>
        <StatusBadge status="ASSIGNED" />
      </CardHeader>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
        <InfoRow label="Hospital Name" value={caseData.hospitalName} />
        <InfoRow label="Hospital ID" value={caseData.assignedHospitalId} />
        <InfoRow label="Assignment Status" value={caseData.assignmentStatus} />
        <InfoRow label="Treatment Stage" value={caseData.treatmentStage} />
      </dl>
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
        const assets = await upload([file], (params) => initCaseDocumentUpload(caseId, params));
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
      render: (row) => (
        <div className="flex items-center gap-1">
          {row.downloadUrl && (
            <>
              <a
                href={row.downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <Eye size={14} />
              </a>
              <a
                href={row.downloadUrl}
                download={row.fileName}
                className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors"
              >
                <Download size={14} />
              </a>
            </>
          )}
          <button
            onClick={() => handleDelete(row.id)}
            disabled={isPending}
            className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
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
          data={docs}
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
      <PatientInfoCard caseData={caseData} />
      <AssignedHospitalCard caseData={caseData} />
      <AdminNotesCard caseData={caseData} />
      <DocumentsCard caseId={caseData.id} />
    </div>
  );
}
