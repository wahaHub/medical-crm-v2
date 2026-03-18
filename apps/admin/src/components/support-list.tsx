'use client';

import { useState, useTransition, type ReactNode } from 'react';
import {
  StatusBadge,
  SearchInput,
  EmptyState,
  LoadingSpinner,
} from '@medical-crm/ui';
import { HelpCircle, Send } from 'lucide-react';
import { useTickets } from '@/queries/use-tickets';
import { replyToTicket, updateTicketStatus, closeTicket } from '@/actions/ticket-actions';

// ── Types ─────────────────────────────────────────────────────────────

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface TicketReply {
  id: string;
  content: string;
  createdAt: string;
  authorRole?: string;
  authorName?: string;
  isInternalNote?: boolean;
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
  replies?: TicketReply[];
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

const ACTIONABLE_STATUSES = ['IN_PROGRESS', 'PENDING_INFO', 'RESOLVED'];

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ── Expanded Detail Row ───────────────────────────────────────────────

function TicketDetailRow({
  ticket,
  onRefresh,
}: {
  ticket: TicketRow;
  onRefresh: () => void;
}) {
  const [replyText, setReplyText] = useState('');
  const [newStatus, setNewStatus] = useState(ticket.status);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const replies = ticket.replies ?? [];

  function handleReply() {
    if (!replyText.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await replyToTicket(ticket.id, replyText.trim());
        setReplyText('');
        onRefresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to send reply');
      }
    });
  }

  function handleStatusChange(s: string) {
    setNewStatus(s);
    if (s === 'CLOSED') {
      startTransition(async () => {
        try {
          await closeTicket(ticket.id);
          onRefresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to close ticket');
        }
      });
    } else {
      startTransition(async () => {
        try {
          await updateTicketStatus(ticket.id, s);
          onRefresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to update status');
        }
      });
    }
  }

  return (
    <tr className="bg-slate-50 border-b border-slate-200">
      <td colSpan={8} className="px-6 py-4">
        <div className="space-y-4 max-w-3xl">
          {/* Description */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Description</p>
            <p className="text-sm text-slate-700 bg-white rounded-lg border border-slate-200 p-3">
              {ticket.description}
            </p>
          </div>

          {/* Metadata */}
          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            {ticket.caseId && (
              <span>
                <span className="text-slate-400">Case:</span>{' '}
                <span className="font-mono text-indigo-600">{ticket.caseId.slice(0, 8)}…</span>
              </span>
            )}
            {ticket.sourcePage && (
              <span>
                <span className="text-slate-400">Source Page:</span> {ticket.sourcePage}
              </span>
            )}
          </div>

          {/* Reply history */}
          {replies.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
                Reply History
              </p>
              <div className="space-y-2">
                {replies.map((reply) => (
                  <div
                    key={reply.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      reply.isInternalNote
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-500">
                        {reply.authorName ?? 'Staff'}
                        {reply.isInternalNote && (
                          <span className="ml-2 text-amber-600">(Internal Note)</span>
                        )}
                      </span>
                      <span className="text-[10px] text-slate-400">{formatDate(reply.createdAt)}</span>
                    </div>
                    <p className="text-slate-700">{reply.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Reply input + status management */}
          <div className="flex flex-col gap-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-600 mb-1">Reply</label>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={3}
                  disabled={isPending || ticket.status === 'CLOSED'}
                  placeholder={
                    ticket.status === 'CLOSED'
                      ? 'Ticket is closed.'
                      : 'Type your reply…'
                  }
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 disabled:opacity-50"
                />
              </div>
              <button
                onClick={handleReply}
                disabled={isPending || !replyText.trim() || ticket.status === 'CLOSED'}
                className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 transition-colors disabled:opacity-50 mb-0.5"
              >
                <Send size={14} />
                Send
              </button>
            </div>

            {/* Status update */}
            {ticket.status !== 'CLOSED' && (
              <div className="flex items-center gap-3">
                <label className="text-xs font-medium text-slate-600">Update Status:</label>
                <div className="flex flex-wrap gap-2">
                  {ACTIONABLE_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleStatusChange(s)}
                      disabled={isPending || newStatus === s}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                        newStatus === s
                          ? 'bg-cyan-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-600 hover:border-cyan-300 hover:text-cyan-700'
                      }`}
                    >
                      {s.replace(/_/g, ' ')}
                    </button>
                  ))}
                  <button
                    onClick={() => handleStatusChange('CLOSED')}
                    disabled={isPending}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                  >
                    Close Ticket
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
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

  const { data: raw, isLoading, refetch } = useTickets(filters);
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

  function handleRefresh() {
    void refetch();
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
                <>
                  <tr
                    key={row.id}
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
                    <TicketDetailRow key={`${row.id}-detail`} ticket={row} onRefresh={handleRefresh} />
                  )}
                </>
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
