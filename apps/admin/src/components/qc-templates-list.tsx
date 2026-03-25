'use client';

import { useMemo, useState } from 'react';
import {
  DataTable,
  StatusBadge,
  SearchInput,
  EmptyState,
  LoadingSpinner,
  ConfirmDialog,
  type Column,
} from '@medical-crm/ui';
import { ClipboardList, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useQuestionTemplates } from '@/queries/use-question-collectors';
import { deleteTemplate } from '@/actions/qc-actions';
import { QcTemplateForm, type QcTemplateRow } from './qc-template-form';

type HospitalSection = 'REGULAR' | 'COSMETIC';

interface PaginatedLike<T> {
  data?: T[];
  total?: number;
  page?: number;
  limit?: number;
}

function unwrapList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as PaginatedLike<T>).data)) {
    return (raw as PaginatedLike<T>).data ?? [];
  }
  return [];
}

function unwrapPagination(raw: unknown): { total: number; page: number; limit: number } {
  if (raw && typeof raw === 'object') {
    const p = raw as PaginatedLike<unknown>;
    return { total: p.total ?? 0, page: p.page ?? 1, limit: p.limit ?? 20 };
  }
  return { total: 0, page: 1, limit: 20 };
}

interface TemplateMeta {
  disease: string;
  section: HospitalSection;
  isDefault: boolean;
  stepCount: number;
  questionCount: number;
}

function extractTemplateMeta(template: QcTemplateRow): TemplateMeta {
  const raw = template.questions;
  const procedureSection: HospitalSection = template.procedureTypes?.includes('COSMETIC')
    ? 'COSMETIC'
    : 'REGULAR';

  if (raw && typeof raw === 'object') {
    const editor = raw as {
      disease?: unknown;
      isDefault?: unknown;
      hospitalSection?: unknown;
      steps?: Array<{ questions?: unknown[] }>;
    };
    const isDefault = editor.isDefault === true || template.category === 'DEFAULT';
    const disease =
      isDefault
        ? 'DEFAULT'
        : (typeof editor.disease === 'string' && editor.disease.trim()) || template.category || 'UNSPECIFIED';
    const section =
      editor.hospitalSection === 'COSMETIC' || editor.hospitalSection === 'REGULAR'
        ? editor.hospitalSection
        : procedureSection;
    const stepCount = Array.isArray(editor.steps) ? editor.steps.length : 0;
    const questionCount = Array.isArray(editor.steps)
      ? editor.steps.reduce((sum, step) => sum + (Array.isArray(step.questions) ? step.questions.length : 0), 0)
      : 0;

    return { disease, section, isDefault, stepCount, questionCount };
  }

  if (Array.isArray(raw)) {
    return {
      disease: template.category === 'DEFAULT' ? 'DEFAULT' : template.category || 'UNSPECIFIED',
      section: procedureSection,
      isDefault: template.category === 'DEFAULT',
      stepCount: 1,
      questionCount: raw.length,
    };
  }

  return {
    disease: template.category === 'DEFAULT' ? 'DEFAULT' : template.category || 'UNSPECIFIED',
    section: procedureSection,
    isDefault: template.category === 'DEFAULT',
    stepCount: 0,
    questionCount: 0,
  };
}

const SECTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Sections' },
  { value: 'REGULAR', label: 'Regular' },
  { value: 'COSMETIC', label: 'Cosmetic' },
];

const ACTIVE_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'true', label: 'Active' },
  { value: 'false', label: 'Inactive' },
];

const ACTIVE_COLORS: Record<string, string> = {
  Active: 'bg-emerald-50 text-emerald-700',
  Inactive: 'bg-slate-100 text-slate-500',
};

const SCOPE_COLORS: Record<string, string> = {
  Default: 'bg-purple-50 text-purple-700',
  Disease: 'bg-cyan-50 text-cyan-700',
};

const SECTION_COLORS: Record<string, string> = {
  REGULAR: 'bg-indigo-50 text-indigo-700',
  COSMETIC: 'bg-rose-50 text-rose-700',
};

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function RowActions({
  template,
  onEdit,
  onDelete,
}: {
  template: QcTemplateRow;
  onEdit: (t: QcTemplateRow) => void;
  onDelete: (t: QcTemplateRow) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(template); }}
        className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
      >
        Edit
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(template); }}
        className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export function QcTemplatesList() {
  const [search, setSearch] = useState('');
  const [disease, setDisease] = useState('');
  const [section, setSection] = useState('');
  const [isActive, setIsActive] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<QcTemplateRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QcTemplateRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  const filters: Record<string, string> = { page: String(page), limit: '20' };
  if (disease) filters['category'] = disease;
  if (isActive) filters['isActive'] = isActive;

  const { data: raw, isLoading, refetch } = useQuestionTemplates(filters);
  const templates = unwrapList<QcTemplateRow>(raw);
  const pagination = unwrapPagination(raw);

  const diseaseOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const template of templates) {
      unique.add(extractTemplateMeta(template).disease);
    }
    return [
      { value: '', label: 'All Diseases' },
      ...Array.from(unique).sort().map((v) => ({ value: v, label: v })),
    ];
  }, [templates]);

  const filtered = search
    ? templates.filter((template) => {
        const meta = extractTemplateMeta(template);
        const q = search.toLowerCase();
        const matchSearch =
          template.templateName.toLowerCase().includes(q) ||
          meta.disease.toLowerCase().includes(q) ||
          meta.section.toLowerCase().includes(q);
        const matchSection = !section || meta.section === section;
        return matchSearch && matchSection;
      })
    : templates.filter((template) => {
        const meta = extractTemplateMeta(template);
        return !section || meta.section === section;
      });

  function handleEdit(t: QcTemplateRow) {
    setEditTemplate(t);
    setModalOpen(true);
  }

  function handleCreate() {
    setEditTemplate(null);
    setModalOpen(true);
  }

  function handleRefresh() {
    void queryClient.invalidateQueries({ queryKey: ['question-templates'] });
    void refetch();
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteTemplate(deleteTarget.id);
      setDeleteTarget(null);
      handleRefresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete template');
    } finally {
      setIsDeleting(false);
    }
  }

  const columns: Column<QcTemplateRow>[] = [
    {
      key: 'templateName',
      header: 'Template Name',
      render: (row) => (
        <span className="text-sm font-semibold text-slate-800">{row.templateName}</span>
      ),
    },
    {
      key: 'category',
      header: 'Disease',
      render: (row) => (
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
          {extractTemplateMeta(row).disease}
        </span>
      ),
    },
    {
      key: 'section',
      header: 'Section',
      render: (row) => (
        <StatusBadge
          status={extractTemplateMeta(row).section}
          colorMap={SECTION_COLORS}
        />
      ),
    },
    {
      key: 'scope',
      header: 'Scope',
      render: (row) => (
        <StatusBadge
          status={extractTemplateMeta(row).isDefault ? 'Default' : 'Disease'}
          colorMap={SCOPE_COLORS}
        />
      ),
    },
    {
      key: 'structure',
      header: 'Structure',
      render: (row) => {
        const meta = extractTemplateMeta(row);
        return (
          <span className="text-sm text-slate-500">
            {meta.stepCount} step{meta.stepCount !== 1 ? 's' : ''} / {meta.questionCount} question{meta.questionCount !== 1 ? 's' : ''}
          </span>
        );
      },
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (row) => (
        <StatusBadge
          status={row.isActive ? 'Active' : 'Inactive'}
          colorMap={ACTIVE_COLORS}
        />
      ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (row) => (
        <span className="text-sm text-slate-500">
          {formatDate(row.updatedAt ?? row.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <RowActions
          template={row}
          onEdit={handleEdit}
          onDelete={setDeleteTarget}
        />
      ),
      className: 'w-20',
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {deleteError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {deleteError}
        </div>
      )}
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search template / disease…"
          />
        </div>
        <select
          value={disease}
          onChange={(e) => { setDisease(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        >
          {diseaseOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={section}
          onChange={(e) => setSection(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        >
          {SECTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={isActive}
          onChange={(e) => { setIsActive(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        >
          {ACTIVE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          onClick={handleCreate}
          className="ml-auto rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 transition-colors"
        >
          + New Template
        </button>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={(row) => row.id}
        emptyState={
          <EmptyState
            icon={<ClipboardList size={36} />}
            title="No templates found"
            description="No question templates match your current filters. Create a new template to get started."
          />
        }
        pagination={
          pagination.total > pagination.limit
            ? { page: pagination.page, pageSize: pagination.limit, total: pagination.total }
            : undefined
        }
        onPageChange={(p) => setPage(p)}
      />

      {/* Create/Edit Modal */}
      <QcTemplateForm
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleRefresh}
        editTemplate={editTemplate}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Template"
        message={`Are you sure you want to delete "${deleteTarget?.templateName ?? 'this template'}"?`}
        confirmLabel={isDeleting ? 'Deleting…' : 'Delete'}
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          if (isDeleting) return;
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
