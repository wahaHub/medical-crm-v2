'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  DataTable,
  StatusBadge,
  SearchInput,
  EmptyState,
  LoadingSpinner,
  ConfirmDialog,
  Modal,
  Button,
  type Column,
} from '@medical-crm/ui';
import { Bot, Pencil, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useChatbotFaqs, useFaqCategories } from '@/queries/use-chatbot-faq';
import { createFaqCategory, deleteFaq, deleteFaqCategory } from '@/actions/chatbot-faq-actions';
import { ChatbotFaqFormModal, type FaqRow } from './chatbot-faq-form-modal';

// ── Types ─────────────────────────────────────────────────────────────

interface PaginatedLike<T> {
  data?: T[];
  total?: number;
  page?: number;
  limit?: number;
}

interface FaqCategoryRow {
  id: string;
  name: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  sortOrder: number;
  isActive: boolean;
  questionCount: number;
}

interface FaqCategoryGroup {
  key: string;
  id: string | null;
  name: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  sortOrder: number;
  isActive: boolean;
  questionCount: number;
  rows: FaqRow[];
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

const CATEGORY_OPTIONS_BASE = [{ value: '', label: 'All Categories' }];

const HOSPITAL_TYPE_OPTIONS = [
  { value: '', label: 'All Hospital Types' },
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

const HOSPITAL_TYPE_COLORS: Record<string, string> = {
  REGULAR: 'bg-cyan-50 text-cyan-700',
  COSMETIC: 'bg-fuchsia-50 text-fuchsia-700',
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
  const [hospitalType, setHospitalType] = useState('');
  const [isActive, setIsActive] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editFaq, setEditFaq] = useState<FaqRow | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryHospitalType, setCategoryHospitalType] = useState<'REGULAR' | 'COSMETIC'>('REGULAR');
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FaqRow | null>(null);
  const [deleteCategoryTarget, setDeleteCategoryTarget] = useState<FaqCategoryGroup | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isCreatingCategory, startCreateCategory] = useTransition();
  const [isDeletingCategory, startDeleteCategory] = useTransition();
  const queryClient = useQueryClient();

  const filters: Record<string, string> = { page: String(page), limit: '20' };
  if (category) filters['category'] = category;
  if (hospitalType) filters['hospitalType'] = hospitalType;
  if (isActive) filters['isActive'] = isActive;
  if (search) filters['search'] = search;

  const { data: raw, isLoading, refetch } = useChatbotFaqs(filters);
  const { data: categoryRaw } = useFaqCategories({});
  const faqs = unwrapList<FaqRow>(raw);
  const categories = unwrapList<FaqCategoryRow>(categoryRaw);
  const pagination = unwrapPagination(raw);

  const categoryUniverse = useMemo(
    () =>
      Array.from(new Set(categories.map((c) => c.name.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [categories],
  );
  const categoryOptions = useMemo(
    () => [...CATEGORY_OPTIONS_BASE, ...categoryUniverse.map((value) => ({ value, label: value }))],
    [categoryUniverse],
  );

  const visibleCategories = useMemo(() => {
    return categories
      .filter((item) => item.isActive)
      .filter((item) => (hospitalType ? item.hospitalType === hospitalType : true))
      .filter((item) => (category ? item.name === category : true))
      .sort((a, b) => {
        if (a.hospitalType !== b.hospitalType) {
          return a.hospitalType.localeCompare(b.hospitalType);
        }
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.name.localeCompare(b.name);
      });
  }, [categories, hospitalType, category]);

  const groupedFaqs = useMemo(() => {
    const groups = new Map<string, FaqCategoryGroup>();
    for (const item of visibleCategories) {
      const key = `${item.name.trim()}::${item.hospitalType}`;
      groups.set(key, {
        key,
        id: item.id,
        name: item.name.trim(),
        hospitalType: item.hospitalType,
        sortOrder: item.sortOrder,
        isActive: item.isActive,
        questionCount: item.questionCount,
        rows: [],
      });
    }
    for (const faq of faqs) {
      const name = faq.category?.trim() || 'Uncategorized';
      const key = `${name}::${faq.hospitalType}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          id: null,
          name,
          hospitalType: faq.hospitalType,
          sortOrder: Number.MAX_SAFE_INTEGER,
          isActive: faq.isActive,
          questionCount: 0,
          rows: [],
        });
      }
      groups.get(key)!.rows.push(faq);
    }
    for (const group of groups.values()) {
      group.rows.sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.hospitalType !== b.hospitalType) return a.hospitalType.localeCompare(b.hospitalType);
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });
  }, [faqs, visibleCategories]);

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
    void queryClient.invalidateQueries({ queryKey: ['faq-categories'] });
    void refetch();
  }

  function handleCreateCategory() {
    setCategoryError(null);
    if (!categoryName.trim()) {
      setCategoryError('Category name is required.');
      return;
    }
    startCreateCategory(async () => {
      try {
        await createFaqCategory({
          name: categoryName.trim(),
          hospitalType: categoryHospitalType,
        });
        setCategoryModalOpen(false);
        setCategoryName('');
        setCategoryHospitalType('REGULAR');
        handleRefresh();
      } catch (error) {
        setCategoryError(error instanceof Error ? error.message : 'Failed to create category');
      }
    });
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

  function handleDeleteCategoryConfirm() {
    if (!deleteCategoryTarget?.id) return;
    const categoryId = deleteCategoryTarget.id;
    startDeleteCategory(async () => {
      try {
        await deleteFaqCategory(categoryId);
        setDeleteCategoryTarget(null);
        handleRefresh();
      } catch (error) {
        setCategoryError(error instanceof Error ? error.message : 'Failed to delete category');
      }
    });
  }

  const columns: Column<FaqRow>[] = [
    {
      key: 'question',
      header: 'Question',
      render: (row) => (
        <div className="max-w-[520px]">
          <p className="text-sm font-medium text-slate-800 line-clamp-2">{row.question}</p>
        </div>
      ),
    },
    {
      key: 'hospitalType',
      header: 'Hospital Type',
      render: (row) => (
        <StatusBadge status={row.hospitalType} colorMap={HOSPITAL_TYPE_COLORS} />
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
          {categoryOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={hospitalType}
          onChange={(e) => { setHospitalType(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        >
          {HOSPITAL_TYPE_OPTIONS.map((opt) => (
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
          onClick={() => {
            setCategoryModalOpen(true);
            setCategoryName('');
            setCategoryHospitalType(hospitalType === 'COSMETIC' ? 'COSMETIC' : 'REGULAR');
            setCategoryError(null);
          }}
          className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-medium text-cyan-700 hover:bg-cyan-100 transition-colors"
        >
          + New Category
        </button>
        <button
          onClick={handleCreate}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 transition-colors"
        >
          + New FAQ
        </button>
      </div>

      {/* Category-grouped list */}
      {groupedFaqs.length === 0 ? (
        <EmptyState
          icon={<Bot size={36} />}
          title="No FAQs found"
          description="No chatbot FAQs match your current filters. Create a new FAQ to get started."
        />
      ) : (
        <div className="space-y-5">
          {groupedFaqs.map((group) => (
            <div key={group.key} className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">{group.name}</h3>
                  <StatusBadge status={group.hospitalType} colorMap={HOSPITAL_TYPE_COLORS} />
                  <span className="text-xs text-slate-400">
                    {group.questionCount} question{group.questionCount === 1 ? '' : 's'}
                  </span>
                </div>
                {group.id && (
                  <button
                    onClick={() => {
                      setCategoryError(null);
                      setDeleteCategoryTarget(group);
                    }}
                    disabled={group.questionCount > 0}
                    title={
                      group.questionCount > 0
                        ? 'Delete all questions in this category first'
                        : 'Delete category'
                    }
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              {group.rows.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  No FAQs in this category yet.
                </div>
              ) : (
                <DataTable
                  columns={columns}
                  data={group.rows}
                  keyExtractor={(row) => row.id}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
          <span className="text-sm text-slate-500">
            Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)} ({pagination.total} items)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pagination.page <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <ChatbotFaqFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleRefresh}
        editFaq={editFaq}
        existingCategories={categories.map((categoryItem) => ({
          name: categoryItem.name,
          hospitalType: categoryItem.hospitalType,
        }))}
      />

      <Modal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        title="Create Category"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          {categoryError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {categoryError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Category Name *</label>
            <input
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="e.g. payment, visa, recovery"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Hospital Type *</label>
            <select
              value={categoryHospitalType}
              onChange={(e) => setCategoryHospitalType(e.target.value as 'REGULAR' | 'COSMETIC')}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            >
              <option value="REGULAR">Regular</option>
              <option value="COSMETIC">Cosmetic</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button variant="ghost" onClick={() => setCategoryModalOpen(false)} disabled={isCreatingCategory}>
            Cancel
          </Button>
          <Button onClick={handleCreateCategory} disabled={isCreatingCategory}>
            {isCreatingCategory ? 'Creating...' : 'Create Category'}
          </Button>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete FAQ"
        message={`Are you sure you want to delete "${deleteTarget?.question ?? 'this FAQ'}"? This action cannot be undone.`}
        confirmLabel={isPending ? 'Deleting…' : 'Delete'}
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteCategoryTarget}
        title="Delete Category"
        message={`Delete "${deleteCategoryTarget?.name ?? 'this category'}"? Categories can only be deleted when they have no questions.`}
        confirmLabel={isDeletingCategory ? 'Deleting…' : 'Delete'}
        variant="danger"
        onConfirm={handleDeleteCategoryConfirm}
        onCancel={() => {
          if (isDeletingCategory) return;
          setDeleteCategoryTarget(null);
        }}
      />
    </div>
  );
}
