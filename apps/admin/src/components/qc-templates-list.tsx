'use client';

import { useState } from 'react';
import {
  DataTable,
  StatusBadge,
  SearchInput,
  EmptyState,
  LoadingSpinner,
  type Column,
} from '@medical-crm/ui';
import { ClipboardList } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useQuestionTemplates, useQuestionnaireResponses } from '@/queries/use-question-collectors';
import { QcTemplateForm, type QcTemplateRow } from './qc-template-form';

// ── Types ─────────────────────────────────────────────────────────────

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

// ── Constants ────────────────────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'COSMETIC', label: 'Cosmetic' },
  { value: 'DENTAL', label: 'Dental' },
  { value: 'ORTHOPEDIC', label: 'Orthopedic' },
  { value: 'CARDIOLOGY', label: 'Cardiology' },
  { value: 'ONCOLOGY', label: 'Oncology' },
  { value: 'GENERAL', label: 'General' },
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

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Responses Drawer ───────────────────────────────────────────────────

function ResponsesDrawer({
  templateId,
  onClose,
}: {
  templateId: string;
  onClose: () => void;
}) {
  const { data: raw, isLoading } = useQuestionnaireResponses({ templateId, limit: '20', page: '1' });
  const responses = unwrapList<{ id: string; completionStatus: string; createdAt: string; caseId?: string }>(raw);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-white shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-800">Questionnaire Responses</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : responses.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">No responses found for this template.</p>
          ) : (
            <div className="space-y-3">
              {responses.map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-200 px-4 py-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs text-slate-500">{r.id.slice(0, 8)}…</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.completionStatus === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : r.completionStatus === 'IN_PROGRESS'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {r.completionStatus}
                    </span>
                  </div>
                  {r.caseId && (
                    <p className="text-xs text-slate-400">Case: {r.caseId.slice(0, 8)}…</p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">{formatDate(r.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Row Actions ───────────────────────────────────────────────────────

function RowActions({
  template,
  onEdit,
  onViewResponses,
}: {
  template: QcTemplateRow;
  onEdit: (t: QcTemplateRow) => void;
  onViewResponses: (id: string) => void;
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
        onClick={(e) => { e.stopPropagation(); onViewResponses(template.id); }}
        className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
      >
        Responses
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function QcTemplatesList() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [isActive, setIsActive] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<QcTemplateRow | null>(null);
  const [responsesTemplateId, setResponsesTemplateId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const filters: Record<string, string> = { page: String(page), limit: '20' };
  if (category) filters['category'] = category;
  if (isActive) filters['isActive'] = isActive;

  const { data: raw, isLoading, refetch } = useQuestionTemplates(filters);
  const templates = unwrapList<QcTemplateRow>(raw);
  const pagination = unwrapPagination(raw);

  const filtered = search
    ? templates.filter((t) => {
        const q = search.toLowerCase();
        return (
          t.templateName.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
        );
      })
    : templates;

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
      header: 'Category',
      render: (row) => (
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
          {row.category}
        </span>
      ),
    },
    {
      key: 'version',
      header: 'Version',
      render: (row) => (
        <span className="text-sm text-slate-500">v{row.version ?? 1}</span>
      ),
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
      key: 'createdAt',
      header: 'Created',
      render: (row) => (
        <span className="text-sm text-slate-500">{formatDate(row.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row) => (
        <RowActions
          template={row}
          onEdit={handleEdit}
          onViewResponses={(id) => setResponsesTemplateId(id)}
        />
      ),
      className: 'w-32',
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
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search templates…"
          />
        </div>
        <select
          value={category}
          onChange={(e) => { setCategory(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        >
          {CATEGORY_OPTIONS.map((opt) => (
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

      {/* Responses Drawer */}
      {responsesTemplateId && (
        <ResponsesDrawer
          templateId={responsesTemplateId}
          onClose={() => setResponsesTemplateId(null)}
        />
      )}
    </div>
  );
}
