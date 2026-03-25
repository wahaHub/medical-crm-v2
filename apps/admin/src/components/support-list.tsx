'use client';

import { Fragment, useState, type ReactNode } from 'react';
import {
  StatusBadge,
  SearchInput,
  EmptyState,
  LoadingSpinner,
} from '@medical-crm/ui';
import { HelpCircle } from 'lucide-react';
import { useTickets } from '@/queries/use-tickets';
import { CaseSupportDetailPanel } from '@/components/tabs/case-support-tab';

// ── Types ─────────────────────────────────────────────────────────────

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface TicketRow {
  id: string;
  ticketNumber?: string;
  subject?: string | null;
  description: string;
  type: string;
  priority: string;
  status: string;
  assignedTo?: string | null;
  caseId?: string | null;
  sourcePage?: string | null;
  createdAt: string;
  updatedAt?: string;
}

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
  { value: 'OPEN', label: 'Open' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'PENDING_INFO', label: 'Pending Info' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'ACCOUNT_ISSUES', label: 'Account Issues' },
  { value: 'PAYMENT_PROBLEMS', label: 'Payment Problems' },
  { value: 'HOSPITAL_COMMUNICATION', label: 'Hospital Communication' },
  { value: 'DOCUMENT_HELP', label: 'Document Help' },
  { value: 'VISA_TRAVEL', label: 'Visa / Travel' },
  { value: 'GENERAL_QUESTIONS', label: 'General Questions' },
  { value: 'FEEDBACK', label: 'Feedback' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

const TICKET_STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-50 text-blue-700',
  ASSIGNED: 'bg-indigo-50 text-indigo-700',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  PENDING_INFO: 'bg-orange-50 text-orange-700',
  RESOLVED: 'bg-emerald-50 text-emerald-700',
  CLOSED: 'bg-slate-100 text-slate-500',
};

const TICKET_PRIORITY_COLORS: Record<string, string> = {
  HIGH: 'bg-rose-50 text-rose-700',
  MEDIUM: 'bg-amber-50 text-amber-700',
  LOW: 'bg-slate-100 text-slate-500',
};

const TICKET_TYPE_COLORS: Record<string, string> = {
  ACCOUNT_ISSUES: 'bg-purple-50 text-purple-700',
  PAYMENT_PROBLEMS: 'bg-rose-50 text-rose-700',
  HOSPITAL_COMMUNICATION: 'bg-cyan-50 text-cyan-700',
  DOCUMENT_HELP: 'bg-indigo-50 text-indigo-700',
  VISA_TRAVEL: 'bg-orange-50 text-orange-700',
  GENERAL_QUESTIONS: 'bg-slate-100 text-slate-700',
  FEEDBACK: 'bg-teal-50 text-teal-700',
};

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Expanded Detail Row (reused from Case Support tab) ────────────────

function TicketDetailRow({
  ticketId,
  onClose,
}: {
  ticketId: string;
  onClose: () => void;
}) {
  return (
    <tr className="bg-slate-50 border-b border-slate-200">
      <td colSpan={8} className="px-0 py-0">
        <CaseSupportDetailPanel ticketId={ticketId} onClose={onClose} />
      </td>
    </tr>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function SupportList() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filters: Record<string, string> = { page: String(page), limit: '20' };
  if (status) filters['status'] = status;
  if (type) filters['type'] = type;
  if (priority) filters['priority'] = priority;

  const { data: raw, isLoading } = useTickets(filters);
  const tickets = unwrapList<TicketRow>(raw);
  const pagination = unwrapPagination(raw);

  // Client-side search
  const filtered = search
    ? tickets.filter((t) => {
        const q = search.toLowerCase();
        return (
          (t.ticketNumber?.toLowerCase().includes(q) ?? false) ||
          (t.subject?.toLowerCase().includes(q) ?? false) ||
          t.description.toLowerCase().includes(q) ||
          (t.assignedTo?.toLowerCase().includes(q) ?? false)
        );
      })
    : tickets;

  function handleRowClick(row: TicketRow) {
    setExpandedId((prev) => (prev === row.id ? null : row.id));
  }

  const columns: Column<TicketRow>[] = [
    {
      key: 'ticketNumber',
      header: 'Ticket #',
      render: (row) => (
        <span className="font-mono text-sm font-medium text-slate-700">
          {row.ticketNumber ?? row.id.slice(0, 8)}
        </span>
      ),
    },
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <span className="text-sm font-medium text-slate-800 line-clamp-1">
          {row.subject ?? row.description.slice(0, 60)}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <StatusBadge status={row.type} colorMap={TICKET_TYPE_COLORS} />
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (row) => (
        <StatusBadge status={row.priority} colorMap={TICKET_PRIORITY_COLORS} />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <StatusBadge status={row.status} colorMap={TICKET_STATUS_COLORS} />
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
      key: 'assignedTo',
      header: 'Assigned To',
      render: (row) => (
        <span className="text-sm text-slate-500">
          {row.assignedTo ? row.assignedTo.slice(0, 8) + '…' : '—'}
        </span>
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
            placeholder="Search tickets…"
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
        <select
          value={priority}
          onChange={(e) => { setPriority(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
        >
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Table with expandable rows */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<HelpCircle size={36} />}
          title="No tickets found"
          description="No support tickets match your current filters."
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
                    <TicketDetailRow
                      ticketId={row.id}
                      onClose={() => setExpandedId(null)}
                    />
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
