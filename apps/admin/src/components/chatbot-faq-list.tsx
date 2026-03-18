'use client';

import { useState, useTransition } from 'react';
import {
  DataTable,
  StatusBadge,
  SearchInput,
  EmptyState,
  LoadingSpinner,
  ConfirmDialog,
  type Column,
} from '@medical-crm/ui';
import { Bot, Pencil, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useChatbotFaqs } from '@/queries/use-chatbot-faq';
import { deleteFaq } from '@/actions/chatbot-faq-actions';
import { ChatbotFaqFormModal, type FaqRow } from './chatbot-faq-form-modal';

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
  { value: 'PRICING', label: 'Pricing' },
  { value: 'VISA', label: 'Visa' },
  { value: 'TREATMENT', label: 'Treatment' },
  { value: 'HOSPITAL', label: 'Hospital' },
  { value: 'LOGISTICS', label: 'Logistics' },
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

// ── Row Actions ───────────────────────────────────────────────────────

function RowActions({
  faq,
  onEdit,
  onDelete,
}: {
  faq: FaqRow;
  onEdit: (f: FaqRow) => void;
  onDelete: (f: FaqRow) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(faq); }}
        className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
        title="Edit"
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(faq); }}
        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function ChatbotFaqList() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [isActive, setIsActive] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editFaq, setEditFaq] = useState<FaqRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FaqRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();

  const filters: Record<string, string> = { page: String(page), limit: '20' };
  if (category) filters['category'] = category;
  if (isActive) filters['isActive'] = isActive;
  if (search) filters['search'] = search;

  const { data: raw, isLoading, refetch } = useChatbotFaqs(filters);
  const faqs = unwrapList<FaqRow>(raw);
  const pagination = unwrapPagination(raw);

  function handleEdit(faq: FaqRow) {
    setEditFaq(faq);
    setModalOpen(true);
  }

  function handleCreate() {
    setEditFaq(null);
    setModalOpen(true);
  }

  function handleRefresh() {
    void queryClient.invalidateQueries({ queryKey: ['chatbot-faqs'] });
    void refetch();
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteFaq(deleteTarget.id);
        setDeleteTarget(null);
        handleRefresh();
      } catch (e) {
        console.error('Failed to delete FAQ', e);
        setDeleteTarget(null);
      }
    });
  }

  const columns: Column<FaqRow>[] = [
    {
      key: 'question',
      header: 'Question',
      render: (row) => (
        <div className="max-w-sm">
          <p className="text-sm font-medium text-slate-800 line-clamp-1">{row.questionEn}</p>
          <p className="text-xs text-slate-400 line-clamp-1">{row.questionZh}</p>
        </div>
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
      key: 'keywords',
      header: 'Keywords',
      render: (row) => (
        <div className="flex flex-wrap gap-1 max-w-[180px]">
          {(row.keywords ?? []).slice(0, 3).map((kw, i) => (
            <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
              {kw}
            </span>
          ))}
          {(row.keywords ?? []).length > 3 && (
            <span className="text-[10px] text-slate-400">+{(row.keywords ?? []).length - 3}</span>
          )}
        </div>
      ),
    },
    {
      key: 'sortOrder',
      header: 'Order',
      render: (row) => (
        <span className="text-sm text-slate-500">{row.sortOrder}</span>
      ),
      className: 'w-16 text-center',
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
        <RowActions faq={row} onEdit={handleEdit} onDelete={(f) => setDeleteTarget(f)} />
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
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] max-w-sm">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="Search FAQs…"
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
          + New FAQ
        </button>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={faqs}
        keyExtractor={(row) => row.id}
        emptyState={
          <EmptyState
            icon={<Bot size={36} />}
            title="No FAQs found"
            description="No chatbot FAQs match your current filters. Create a new FAQ to get started."
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
      <ChatbotFaqFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleRefresh}
        editFaq={editFaq}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete FAQ"
        message={`Are you sure you want to delete "${deleteTarget?.questionEn ?? 'this FAQ'}"? This action cannot be undone.`}
        confirmLabel={isPending ? 'Deleting…' : 'Delete'}
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
