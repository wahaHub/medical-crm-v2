'use client';

import { useState, useTransition } from 'react';
import { ChatLayout, type ChatMessage, EmptyState, SearchInput } from '@medical-crm/ui';
import { MessageSquare, Check, X } from 'lucide-react';
import { useConversations, useMessages } from '@/queries/use-conversations';
import { sendMessage, approveMessage, rejectMessage } from '@/actions/message-actions';

// ── Types ─────────────────────────────────────────────────────────────

interface ApiMessage {
  id: string;
  content: string;
  translatedContent?: string | null;
  senderRole: string;
  senderName?: string;
  senderId?: string;
  moderationStatus?: string;
  createdAt: string;
  isAiTranslated?: boolean;
  messageType?: string;
  aiSummary?: string | null;
  attachments?: Array<{
    id?: string;
    name?: string;
    type?: string;
    url?: string;
    size?: number;
  }>;
}

interface ApiConversation {
  id: string;
  caseId?: string;
  category?: string;
  title?: string | null;
  hospitalId?: string | null;
  participantName?: string;
  participantRole?: string;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCount?: number;
}

interface PaginatedLike<T> {
  data?: T[];
}

// ── Helpers ─────────────────────────────────────────────────────────

function toRoleLabel(role?: string): string {
  const upper = role?.toUpperCase() ?? 'UNKNOWN';
  if (upper === 'PATIENT') return 'Patient';
  if (upper === 'HOSPITAL') return 'Hospital';
  if (upper === 'ADMIN') return 'Admin';
  return upper;
}

function toDisplaySenderName(message: ApiMessage): string {
  const roleLabel = toRoleLabel(message.senderRole);
  const baseName = message.senderName?.trim() || 'Unknown';
  return `${roleLabel} · ${baseName}`;
}

function mapApiMessages(messages: ApiMessage[]): ChatMessage[] {
  return [...messages]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((m) => ({
      id: m.id,
      content: m.content,
      translatedContent: m.translatedContent,
      senderRole: (m.senderRole?.toUpperCase() ?? 'ADMIN') as ChatMessage['senderRole'],
      senderName: toDisplaySenderName(m),
      senderId: m.senderId,
      createdAt: m.createdAt,
      isAiTranslated: m.isAiTranslated,
      messageType: m.messageType,
      aiSummary: m.aiSummary,
      attachments: m.attachments,
    }));
}

function unwrapList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as PaginatedLike<T>).data)) {
    return (raw as PaginatedLike<T>).data ?? [];
  }
  return [];
}

function resolveChatPerspectiveRole(conversation: ApiConversation): ChatMessage['senderRole'] {
  const category = conversation.category?.toUpperCase() ?? '';
  if (category === 'HOSPITAL_PATIENT') return 'HOSPITAL';
  return 'ADMIN';
}

function canAdminReply(conversation: ApiConversation): boolean {
  const category = conversation.category?.toUpperCase() ?? '';
  return category.startsWith('ADMIN_');
}

function matchesSearch(conv: ApiConversation, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    (conv.participantName?.toLowerCase().includes(q) ?? false) ||
    (conv.title?.toLowerCase().includes(q) ?? false) ||
    (conv.lastMessagePreview?.toLowerCase().includes(q) ?? false)
  );
}

// ── Category filter options ──────────────────────────────────────────

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'ADMIN_HOSPITAL', label: 'Admin / Hospital' },
  { value: 'ADMIN_PATIENT', label: 'Admin / Patient' },
  { value: 'HOSPITAL_PATIENT', label: 'Hospital / Patient' },
];

// ── Conversation List Item ───────────────────────────────────────────

function ConversationItem({
  conv,
  isSelected,
  onClick,
}: {
  conv: ApiConversation;
  isSelected: boolean;
  onClick: () => void;
}) {
  const initials = (conv.participantName ?? 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex items-start gap-3 border-l-2 transition-colors ${
        isSelected
          ? 'bg-cyan-50/50 border-cyan-500'
          : 'border-transparent hover:bg-slate-50'
      }`}
    >
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center text-white text-xs font-semibold shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-sm font-semibold text-slate-800 truncate">
            {conv.participantName ?? conv.title ?? conv.hospitalId ?? 'Conversation'}
          </span>
          {(conv.unreadCount ?? 0) > 0 && (
            <span className="ml-2 px-1.5 py-0.5 bg-rose-500 text-white text-[9px] font-bold rounded-full shrink-0">
              {conv.unreadCount}
            </span>
          )}
        </div>
        {conv.lastMessagePreview && (
          <p className="text-xs text-slate-500 truncate">{conv.lastMessagePreview}</p>
        )}
        {(conv.participantRole ?? conv.category) && (
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
            {conv.participantRole ?? conv.category}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Moderation Notice ────────────────────────────────────────────────

function ModerationNotice({
  messages,
  onApprove,
  onReject,
  isPending,
}: {
  messages: ApiMessage[];
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  isPending: boolean;
}) {
  const pendingMessages = messages.filter((m) => m.moderationStatus === 'REVIEW');
  if (pendingMessages.length === 0) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex flex-col gap-2">
      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
        {pendingMessages.length} message{pendingMessages.length !== 1 ? 's' : ''} pending moderation
      </p>
      <div className="flex flex-col gap-1">
        {pendingMessages.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-2 bg-white/60 rounded-lg px-3 py-1.5 border border-amber-100"
          >
            <span className="text-xs text-slate-600 truncate flex-1">{m.content}</span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onApprove(m.id)}
                disabled={isPending}
                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors disabled:opacity-50"
                title="Approve"
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => onReject(m.id)}
                disabled={isPending}
                className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                title="Reject"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Case Info Sidebar ────────────────────────────────────────────────

function CaseInfoSidebar({ conversation }: { conversation: ApiConversation }) {
  if (!conversation.caseId) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Conversation Info</h3>
      {conversation.caseId && (
        <div className="text-xs text-slate-600">
          <span className="text-slate-400 block mb-1">Linked Case</span>
          <span className="font-mono text-indigo-600">{conversation.caseId.slice(0, 8)}…</span>
        </div>
      )}
      {conversation.category && (
        <div className="text-xs text-slate-600">
          <span className="text-slate-400 block mb-1">Category</span>
          <span>{conversation.category.replace(/_/g, ' / ')}</span>
        </div>
      )}
      {conversation.participantRole && (
        <div className="text-xs text-slate-600">
          <span className="text-slate-400 block mb-1">Participant Role</span>
          <span>{toRoleLabel(conversation.participantRole)}</span>
        </div>
      )}
    </div>
  );
}

// ── Chat Panel ───────────────────────────────────────────────────────

function ChatPanel({ conversation }: { conversation: ApiConversation }) {
  const conversationId = conversation.id;
  const { data: raw, refetch } = useMessages(conversationId);
  const apiMessages = unwrapList<ApiMessage>(raw);
  const [isSending, startSend] = useTransition();
  const [isModerating, startModerate] = useTransition();
  const [showInfo, setShowInfo] = useState(false);

  const chatMessages = mapApiMessages(apiMessages);
  const perspectiveRole = resolveChatPerspectiveRole(conversation);
  const conversationTitle =
    conversation.participantName ??
    conversation.title ??
    conversation.hospitalId ??
    'Conversation';
  const conversationCategory = conversation.category?.replace(/_/g, ' / ') ?? undefined;
  const canReply = canAdminReply(conversation);

  function handleSend(content: string) {
    startSend(async () => {
      try {
        await sendMessage(conversationId, content);
        await refetch();
      } catch (e) {
        console.error('Failed to send message', e);
      }
    });
  }

  function handleApprove(messageId: string) {
    startModerate(async () => {
      try {
        await approveMessage(messageId);
        await refetch();
      } catch (e) {
        console.error('Failed to approve message', e);
      }
    });
  }

  function handleReject(messageId: string) {
    startModerate(async () => {
      try {
        await rejectMessage(messageId);
        await refetch();
      } catch (e) {
        console.error('Failed to reject message', e);
      }
    });
  }

  const moderationNotice = (
    <ModerationNotice
      messages={apiMessages}
      onApprove={handleApprove}
      onReject={handleReject}
      isPending={isModerating}
    />
  );

  const caseInfo = <CaseInfoSidebar conversation={conversation} />;

  return (
    <ChatLayout
      messages={chatMessages}
      onSend={handleSend}
      canSend={canReply}
      isSending={isSending}
      currentUserRole={perspectiveRole}
      showTranslation={true}
      className="h-full"
      inputNotice={moderationNotice}
      readOnlyNotice="Hospital conversation is view-only for admin. Reply is disabled."
      patientInfo={showInfo ? caseInfo : undefined}
      showInfoToggle={!!conversation.caseId}
      onToggleInfo={() => setShowInfo((v) => !v)}
      infoPanelOpen={showInfo}
      header={{
        name: conversationTitle,
        subtitle: conversation.participantRole ? `${toRoleLabel(conversation.participantRole)} chat` : undefined,
        categoryBadge: conversationCategory,
        isAdminConversation: true,
      }}
      emptyState={
        <EmptyState
          icon={<MessageSquare size={36} />}
          title="No messages yet"
          description="Messages in this conversation will appear here."
        />
      }
    />
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function MessagesCenter() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);

  const filters: Record<string, string> = {};
  if (category) filters['category'] = category;

  const { data: raw, isLoading } = useConversations(filters);
  const allConversations = unwrapList<ApiConversation>(raw);
  const conversations = allConversations.filter((c) => matchesSearch(c, search));
  const selectedConversation = conversations.find((conv) => conv.id === selectedConvId) ?? null;

  return (
    <div className="flex h-[calc(100vh-140px)] rounded-xl border border-slate-200 overflow-hidden bg-white">
      {/* Left panel — conversation list */}
      <div className="w-80 border-r border-slate-200 flex flex-col shrink-0">
        {/* Search + filter */}
        <div className="px-4 py-3 border-b border-slate-100 space-y-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search conversations…"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2 px-4">
              <MessageSquare size={24} className="opacity-40" />
              <p className="text-xs text-center">No conversations found.</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conv={conv}
                isSelected={selectedConvId === conv.id}
                onClick={() => setSelectedConvId(conv.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right panel — chat */}
      {selectedConversation ? (
        <div className="flex-1 overflow-hidden">
          <ChatPanel conversation={selectedConversation} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center space-y-2">
            <MessageSquare size={40} className="opacity-20 mx-auto" />
            <p className="text-sm text-slate-500">Select a conversation to view messages</p>
          </div>
        </div>
      )}
    </div>
  );
}
