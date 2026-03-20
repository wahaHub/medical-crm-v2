'use client';

import { useState, useTransition, useRef } from 'react';
import { Card, CardHeader, CardTitle, StatusBadge, EmptyState, useMediaUpload } from '@medical-crm/ui';
import { LifeBuoy, ChevronDown, ChevronUp, Send, X, Check, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import { useTickets, useTicket } from '@/queries/use-tickets';
import { replyToTicket, updateTicketStatus, closeTicket, uploadTicketAttachment } from '@/actions/ticket-actions';

// ── Types ─────────────────────────────────────────────────────────────

interface TicketReply {
  id: string;
  content: string;
  authorName?: string;
  authorRole?: string;
  createdAt?: string;
}

interface TicketItem {
  id: string;
  subject?: string;
  description?: string;
  status?: string;
  priority?: string;
  assigneeName?: string;
  createdAt?: string;
  updatedAt?: string;
  replies?: TicketReply[];
}

interface CaseSupportTabProps {
  caseId: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

// ── Status Badge Colors ───────────────────────────────────────────────

const STATUS_OPTIONS = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'PENDING_INFO', 'RESOLVED', 'CLOSED'];

// ── Ticket Detail Panel ───────────────────────────────────────────────

export function CaseSupportDetailPanel({
  ticketId,
  onClose,
}: {
  ticketId: string;
  onClose: () => void;
}) {
  const { data: raw, refetch } = useTicket(ticketId);
  const ticket = raw as TicketItem | undefined;
  const replies: TicketReply[] = ticket?.replies ?? [];

  const [replyContent, setReplyContent] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [isSending, startSend] = useTransition();
  const [isUpdating, startUpdate] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { upload, isUploading, error: uploadError } = useMediaUpload({
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
    maxFileSize: 20 * 1024 * 1024,
  });
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setSelectedFiles((prev) => [...prev, ...Array.from(files)]);
    e.target.value = '';
  }

  function removeFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleReply() {
    if (!replyContent.trim() && selectedFiles.length === 0) return;
    setError(null);
    startSend(async () => {
      try {
        let attachments: Array<{ storageKey: string; fileName: string; mimeType: string; fileSize: number }> | undefined;
        if (selectedFiles.length > 0) {
          const initFn = (params: { fileName: string; fileSize: number; mimeType: string }) =>
            uploadTicketAttachment(ticketId, params);
          const assets = await upload(selectedFiles, initFn);
          if (assets.length > 0) attachments = assets;
        }
        await replyToTicket(ticketId, replyContent.trim(), attachments);
        setReplyContent('');
        setSelectedFiles([]);
        await refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send reply');
      }
    });
  }

  function handleStatusUpdate() {
    if (!newStatus) return;
    setError(null);
    startUpdate(async () => {
      try {
        await updateTicketStatus(ticketId, newStatus);
        setNewStatus('');
        await refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update status');
      }
    });
  }

  function handleClose() {
    setError(null);
    startUpdate(async () => {
      try {
        await closeTicket(ticketId);
        await refetch();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to close ticket');
      }
    });
  }

  if (!ticket) {
    return (
      <div className="flex items-center justify-center py-10">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="border-t border-slate-200 bg-slate-50/50 p-5 space-y-5">
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-semibold text-slate-900">{ticket.subject ?? 'Ticket'}</h4>
          {ticket.description && (
            <p className="text-sm text-slate-600 mt-1">{ticket.description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* Status management */}
      <div className="flex items-center gap-3">
        <select
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value)}
          disabled={isUpdating}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">Change status...</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <button
          onClick={handleStatusUpdate}
          disabled={isUpdating || !newStatus}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-200 rounded-xl hover:bg-indigo-50 disabled:opacity-50 transition-colors"
        >
          <Check size={14} /> Update
        </button>
        {ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED' && (
          <button
            onClick={handleClose}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            Close Ticket
          </button>
        )}
      </div>

      {/* Reply history */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Reply History ({replies.length})
        </p>
        {replies.length === 0 ? (
          <p className="text-sm text-slate-400 py-2">No replies yet.</p>
        ) : (
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {replies.map((reply) => (
              <div
                key={reply.id}
                className="bg-white border border-slate-100 rounded-xl p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700">
                    {reply.authorName ?? reply.authorRole ?? 'Staff'}
                  </span>
                  {reply.createdAt && (
                    <span className="text-[10px] text-slate-400">
                      {new Date(reply.createdAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600">{reply.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply input */}
      <div className="space-y-2">
        {(uploadError) && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2 text-sm text-amber-700">
            {uploadError}
          </div>
        )}

        {selectedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedFiles.map((file, idx) => (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center gap-1.5 rounded-lg bg-slate-100 border border-slate-200 px-2 py-1 text-xs text-slate-600"
              >
                {file.type.startsWith('image/') ? <ImageIcon size={12} /> : <FileText size={12} />}
                <span className="max-w-[120px] truncate">{file.name}</span>
                <button
                  onClick={() => removeFile(idx)}
                  className="p-0.5 text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-3">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept="image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending || isUploading}
            className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl border border-slate-200 transition-colors disabled:opacity-50 shrink-0"
            title="Attach files"
          >
            <Paperclip size={16} />
          </button>
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Write a reply..."
            rows={3}
            disabled={isSending || isUploading}
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
          />
          <button
            onClick={handleReply}
            disabled={isSending || isUploading || (!replyContent.trim() && selectedFiles.length === 0)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-sm disabled:opacity-50 transition-colors shrink-0"
          >
            <Send size={14} /> {isSending || isUploading ? 'Sending…' : 'Reply'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Ticket Card ───────────────────────────────────────────────────────

function TicketCard({ ticket }: { ticket: TicketItem }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-100 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between p-5 gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm font-semibold text-slate-800 truncate">
              {ticket.subject ?? 'Support Ticket'}
            </p>
            {ticket.status && <StatusBadge status={ticket.status} />}
            {ticket.priority && (
              <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                ticket.priority === 'HIGH' || ticket.priority === 'URGENT'
                  ? 'bg-red-100 text-red-600'
                  : ticket.priority === 'MEDIUM'
                  ? 'bg-amber-100 text-amber-600'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {ticket.priority}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-slate-400 flex-wrap">
            {ticket.assigneeName && (
              <span>Assigned to: {ticket.assigneeName}</span>
            )}
            {ticket.createdAt && (
              <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors shrink-0"
        >
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {isExpanded && (
        <CaseSupportDetailPanel
          ticketId={ticket.id}
          onClose={() => setIsExpanded(false)}
        />
      )}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────

export function CaseSupportTab({ caseId }: CaseSupportTabProps) {
  const { data: raw, isLoading, error } = useTickets({ caseId });

  const tickets: TicketItem[] =
    raw != null
      ? Array.isArray(raw)
        ? raw
        : ((raw as { data?: TicketItem[] }).data ?? [])
      : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Support Tickets</CardTitle>
      </CardHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="mx-6 mb-6 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {getErrorMessage(error, 'Failed to load support tickets')}
        </div>
      ) : tickets.length === 0 ? (
        <EmptyState
          icon={<LifeBuoy size={36} />}
          title="No support tickets"
          description="Support tickets for this case will appear here."
        />
      ) : (
        <div className="space-y-4 pt-2">
          {tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </div>
      )}
    </Card>
  );
}
