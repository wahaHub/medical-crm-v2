'use client';

import { useState, useTransition, useRef } from 'react';
import { Card, CardHeader, CardTitle, StatusBadge, Button, DataTable, EmptyState, type Column } from '@medical-crm/ui';
import { FileText, Upload, Trash2, Eye, Download } from 'lucide-react';
import { useCaseDocuments } from '@/queries/use-cases';
import { updateCaseStatus, updateCaseStage, uploadDocument, deleteDocument } from '@/actions/case-actions';
import type { CaseSummary } from '@/lib/api-types';

// ── Constants ────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  'ACTIVE',
  'ON_HOLD',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
];

const STAGE_OPTIONS = [
  'INQUIRY',
  'ASSESSMENT',
  'TREATMENT_PLANNING',
  'AWAITING_TRAVEL',
  'IN_TREATMENT',
  'POST_TREATMENT',
  'FOLLOW_UP',
  'CLOSED',
];

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
  const c = caseData as CaseSummary & Record<string, unknown>;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Patient Information</CardTitle>
        <StatusBadge status={caseData.status} />
      </CardHeader>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <InfoRow label="Patient Name" value={caseData.patientName} />
        <InfoRow label="Country" value={c.patientCountry as string | undefined} />
        <InfoRow label="Language" value={c.patientLanguage as string | undefined} />
        <InfoRow label="Primary Diagnosis" value={c.primaryDiagnosis as string | undefined} />
        <InfoRow label="Risk Level" value={c.riskLevel as string | undefined} />
        <InfoRow label="Assignment Status" value={caseData.assignmentStatus} />
        <InfoRow label="Treatment Stage" value={caseData.treatmentStage} />
        <InfoRow label="Case Number" value={caseData.caseNumber} />
        <InfoRow label="Created" value={caseData.createdAt ? new Date(caseData.createdAt).toLocaleDateString() : undefined} />
      </dl>
    </Card>
  );
}

// ── Status Actions Card ──────────────────────────────────────────────

function StatusActionsCard({ caseData }: { caseData: CaseSummary }) {
  const [isPending, startTransition] = useTransition();
  const [selectedStatus, setSelectedStatus] = useState(caseData.status);
  const [selectedStage, setSelectedStage] = useState(caseData.treatmentStage ?? '');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function handleStatusUpdate() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await updateCaseStatus(caseData.id, selectedStatus);
        setSuccess('Status updated successfully');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update status');
      }
    });
  }

  function handleStageAdvance() {
    setError(null);
    setSuccess(null);
    const currentIdx = STAGE_OPTIONS.indexOf(selectedStage);
    const nextStage = currentIdx >= 0 && currentIdx < STAGE_OPTIONS.length - 1
      ? STAGE_OPTIONS[currentIdx + 1]
      : null;

    if (!nextStage) {
      setError('Already at final stage');
      return;
    }

    startTransition(async () => {
      try {
        await updateCaseStage(caseData.id, nextStage);
        setSelectedStage(nextStage);
        setSuccess(`Stage advanced to ${nextStage.replace(/_/g, ' ')}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to advance stage');
      }
    });
  }

  const currentStageIdx = STAGE_OPTIONS.indexOf(selectedStage);
  const isLastStage = currentStageIdx >= STAGE_OPTIONS.length - 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Status Actions</CardTitle>
      </CardHeader>
      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}
      <div className="space-y-4">
        {/* Stage advance */}
        <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">Treatment Stage</p>
            <p className="text-sm font-semibold text-slate-800">
              {selectedStage ? selectedStage.replace(/_/g, ' ') : '—'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleStageAdvance}
            disabled={isPending || isLastStage}
          >
            {isLastStage ? 'Final Stage' : 'Advance Stage →'}
          </Button>
        </div>

        {/* Status dropdown */}
        <div className="flex items-center gap-3">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            disabled={isPending}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <Button
            variant="default"
            size="sm"
            onClick={handleStatusUpdate}
            disabled={isPending || selectedStatus === caseData.status}
          >
            {isPending ? 'Saving…' : 'Update Status'}
          </Button>
        </div>
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

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    const formData = new FormData();
    formData.append('file', file);

    startTransition(async () => {
      try {
        await uploadDocument(caseId, formData);
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
            disabled={isPending}
          >
            <Upload size={14} className="mr-1.5" />
            {isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </div>
      </CardHeader>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
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
      <StatusActionsCard caseData={caseData} />
      <DocumentsCard caseId={caseData.id} />
    </div>
  );
}
