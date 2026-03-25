'use client';

import { Fragment, useState, type ReactNode } from 'react';
import {
  StatusBadge,
  SearchInput,
  EmptyState,
  LoadingSpinner,
} from '@medical-crm/ui';
import { ShoppingCart } from 'lucide-react';
import { useOrders } from '@/queries/use-orders';
import { usePackageNameMap } from '@/queries/use-package-names';
import { CaseOrderDetailRow, type CaseOrderItem } from '@/components/tabs/case-orders-tab';

// ── Types ─────────────────────────────────────────────────────────────

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface OrderRow {
  id: string;
  orderNumber?: string;
  amount: string;
  currency: string;
  status: string;
  type: string;
  caseId?: string | null;
  patientId?: string | null;
  packageId?: string | null;
  metadata?: unknown;
  paymentReference?: string | null;
  paidAt?: string | null;
  createdAt: string;
}

interface PaginatedLike<T> {
  data?: T[];
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
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
    return {
      total: p.total ?? 0,
      page: p.page ?? 1,
      limit: p.limit ?? 20,
    };
  }
  return { total: 0, page: 1, limit: 20 };
}

// ── Constants ────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'PENDING_PAYMENT', label: 'Pending Payment' },
  { value: 'PAID', label: 'Paid' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REFUNDED', label: 'Refunded' },
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

const ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: 'bg-amber-50 text-amber-700',
  PAID: 'bg-emerald-50 text-emerald-700',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
  REFUNDED: 'bg-purple-50 text-purple-700',
};

const ORDER_TYPE_COLORS: Record<string, string> = {
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

// ── Main Component ───────────────────────────────────────────────────

export function OrdersList() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filters: Record<string, string> = { page: String(page), limit: '20' };
  if (status) filters['status'] = status;
  if (type) filters['type'] = type;

  const { data: raw, isLoading } = useOrders(filters);
  const orders = unwrapList<OrderRow>(raw);
  const pagination = unwrapPagination(raw);
  const { nameMap: packageNameMap } = usePackageNameMap(orders.map((order) => order.packageId));

  // Client-side search filter (by order number or amount)
  const filtered = search
    ? orders.filter((o) => {
        const q = search.toLowerCase();
        return (
          (o.orderNumber?.toLowerCase().includes(q) ?? false) ||
          o.amount.includes(q) ||
          o.type.toLowerCase().includes(q)
        );
      })
    : orders;

  function handleRowClick(row: OrderRow) {
    setExpandedId((prev) => (prev === row.id ? null : row.id));
  }

  const columns: Column<OrderRow>[] = [
    {
      key: 'orderNumber',
      header: 'Order #',
      render: (row) => (
        <span className="font-mono text-sm font-medium text-slate-700">
          {row.orderNumber ?? row.id.slice(0, 8)}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      render: (row) => (
        <span className="font-semibold text-slate-800">
          {row.currency} {row.amount}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge status={row.status} colorMap={ORDER_STATUS_COLORS} />
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <StatusBadge status={row.type} colorMap={ORDER_TYPE_COLORS} />
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
      key: 'expand',
      header: '',
      render: (row) => (
        <span className="text-xs text-slate-400">
          {expandedId === row.id ? '▲' : '▼'}
        </span>
      ),
      className: 'w-8 text-center',
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
            placeholder="Search orders…"
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
      </div>

      {/* Table with expandable rows */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart size={36} />}
          title="No orders found"
          description="No orders match your current filters."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left font-medium text-slate-600 ${col.className ?? ''}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => handleRowClick(row)}
                    className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50"
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 ${col.className ?? ''}`}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                  {expandedId === row.id && (
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <td colSpan={6} className="px-0 py-0">
                        <CaseOrderDetailRow
                          order={{
                            ...row,
                            packageId: row.packageId ?? undefined,
                          } as CaseOrderItem}
                          packageName={row.packageId ? packageNameMap[row.packageId] : undefined}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {/* Pagination */}
          {pagination.total > pagination.limit && (
            <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
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
        </div>
      )}
    </div>
  );
}
