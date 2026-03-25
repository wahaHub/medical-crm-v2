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
import { Package, Pencil, Globe, EyeOff, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { usePackages } from '@/queries/use-packages';
import { deletePackage, publishPackage, unpublishPackage } from '@/actions/package-actions';
import { PackageFormModal, type PackageRow } from './package-form-modal';

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

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PUBLISHED', label: 'Published' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'CONSULTATION', label: 'Consultation' },
  { value: 'HEALTH_CHECKUP', label: 'Health Checkup' },
  { value: 'SECOND_OPINION', label: 'Second Opinion' },
  { value: 'VISA_PACKAGE', label: 'Visa Package' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'ACCOMMODATION', label: 'Accommodation' },
  { value: 'TREATMENT_DEPOSIT', label: 'Treatment Deposit' },
  { value: 'TRANSLATION', label: 'Translation' },
];

const PACKAGE_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PUBLISHED: 'bg-emerald-50 text-emerald-700',
};

const PACKAGE_TYPE_COLORS: Record<string, string> = {
  CONSULTATION: 'bg-indigo-50 text-indigo-700',
  HEALTH_CHECKUP: 'bg-cyan-50 text-cyan-700',
  SECOND_OPINION: 'bg-teal-50 text-teal-700',
  VISA_PACKAGE: 'bg-orange-50 text-orange-700',
  INSURANCE: 'bg-rose-50 text-rose-700',
  ACCOMMODATION: 'bg-yellow-50 text-yellow-700',
  TREATMENT_DEPOSIT: 'bg-green-50 text-green-700',
  TRANSLATION: 'bg-fuchsia-50 text-fuchsia-700',
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
  pkg,
  onEdit,
  onRefresh,
  onDelete,
}: {
  pkg: PackageRow;
  onEdit: (pkg: PackageRow) => void;
  onRefresh: () => void;
  onDelete: (pkg: PackageRow) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const isPublished = pkg.status === 'PUBLISHED';

  function handleTogglePublish() {
    startTransition(async () => {
      try {
        if (isPublished) {
          await unpublishPackage(pkg.id);
        } else {
          await publishPackage(pkg.id);
        }
        onRefresh();
      } catch (e) {
        console.error('Failed to toggle publish status', e);
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(pkg); }}
        className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
        title="Edit"
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); handleTogglePublish(); }}
        disabled={isPending}
        className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
          isPublished
            ? 'text-amber-500 hover:text-amber-700 hover:bg-amber-50'
            : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
        }`}
        title={isPublished ? 'Unpublish' : 'Publish'}
      >
        {isPublished ? <EyeOff size={14} /> : <Globe size={14} />}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(pkg); }}
        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function PackagesList() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPkg, setEditPkg] = useState<PackageRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PackageRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  const filters: Record<string, string> = { page: String(page), limit: '20' };
  if (status) filters['status'] = status;
  if (type) filters['type'] = type;

  const { data: raw, isLoading, refetch } = usePackages(filters);
  const packages = unwrapList<PackageRow>(raw);
  const pagination = unwrapPagination(raw);

  // Client-side search
  const filtered = search
    ? packages.filter((p) => {
        const q = search.toLowerCase();
        return (
          p.nameEn.toLowerCase().includes(q) ||
          (p.nameZh?.toLowerCase().includes(q) ?? false) ||
          p.type.toLowerCase().includes(q)
        );
      })
    : packages;

  function handleEdit(pkg: PackageRow) {
    setEditPkg(pkg);
    setModalOpen(true);
  }

  function handleCreate() {
    setEditPkg(null);
    setModalOpen(true);
  }

  function handleRefresh() {
    void queryClient.invalidateQueries({ queryKey: ['packages'] });
    void refetch();
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deletePackage(deleteTarget.id);
      setDeleteTarget(null);
      handleRefresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete package');
    } finally {
      setIsDeleting(false);
    }
  }

  const columns: Column<PackageRow>[] = [
    {
      key: 'nameEn',
      header: 'Package Name',
      render: (row) => (
        <div>
          <p className="text-sm font-semibold text-slate-800">{row.nameEn}</p>
          {row.nameZh && <p className="text-xs text-slate-400">{row.nameZh}</p>}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <StatusBadge status={row.type} colorMap={PACKAGE_TYPE_COLORS} />
      ),
    },
    {
      key: 'price',
      header: 'Price',
      render: (row) => (
        <span className="font-semibold text-slate-800">
          {row.currency} {row.price}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge status={row.status} colorMap={PACKAGE_STATUS_COLORS} />
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
        <RowActions pkg={row} onEdit={handleEdit} onRefresh={handleRefresh} onDelete={setDeleteTarget} />
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
            placeholder="Search packages…"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button
          onClick={handleCreate}
          className="ml-auto rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 transition-colors"
        >
          + New Package
        </button>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={(row) => row.id}
        emptyState={
          <EmptyState
            icon={<Package size={36} />}
            title="No packages found"
            description="No packages match your current filters. Create a new package to get started."
          />
        }
        pagination={
          pagination.total > pagination.limit
            ? { page: pagination.page, pageSize: pagination.limit, total: pagination.total }
            : undefined
        }
        onPageChange={(p) => setPage(p)}
      />

      {/* Modal */}
      <PackageFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={handleRefresh}
        editPackage={editPkg}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Package"
        message={`Are you sure you want to delete "${deleteTarget?.nameEn ?? 'this package'}"?`}
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
