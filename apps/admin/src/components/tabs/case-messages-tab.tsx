'use client';

import { useState, useTransition } from 'react';
import { ChatLayout, type ChatMessage, EmptyState } from '@medical-crm/ui';
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

interface CaseMessagesTabProps {
  caseId: string;
}

// ── Map API messages to ChatLayout format ────────────────────────────

function mapApiMessages(messages: ApiMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    id: m.id,
    content: m.content,
    translatedContent: m.translatedContent,
    senderRole: (m.senderRole?.toUpperCase() ?? 'ADMIN') as ChatMessage['senderRole'],
    senderName: m.senderName ?? m.senderRole ?? 'Unknown',
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

// ── Chat Panel ───────────────────────────────────────────────────────

function ChatPanel({ conversationId }: { conversationId: string }) {
  const { data: raw, refetch } = useMessages(conversationId);
  const apiMessages = unwrapList<ApiMessage>(raw);
  const [isSending, startSend] = useTransition();
  const [isModerating, startModerate] = useTransition();

  const chatMessages = mapApiMessages(apiMessages);

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

  return (
    <div className="flex-1 h-full overflow-hidden">
      <ChatLayout
        messages={chatMessages}
        onSend={handleSend}
        isSending={isSending}
        currentUserRole="ADMIN"
        showTranslation={true}
        className="h-full"
        inputNotice={moderationNotice}
        emptyState={
          <EmptyState
            icon={<MessageSquare size={36} />}
            title="No messages yet"
            description="Messages in this conversation will appear here."
          />
        }
      />
    </div>
  );
}

// ── Main Export ──────────────────────────────────────────────────────

export function CaseMessagesTab({ caseId }: CaseMessagesTabProps) {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);

  const { data: raw, isLoading } = useConversations({ caseId });
  const conversations = unwrapList<ApiConversation>(raw);

  return (
    <div className="flex h-[600px] rounded-xl border border-slate-200 overflow-hidden bg-white">
      {/* Left panel — conversation list */}
      <div className="w-72 border-r border-slate-200 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">Conversations</h3>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2 px-4">
              <MessageSquare size={24} className="opacity-40" />
              <p className="text-xs text-center">No conversations for this case yet.</p>
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
      {selectedConvId ? (
        <ChatPanel conversationId={selectedConvId} />
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
