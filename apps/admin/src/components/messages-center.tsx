'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ChatLayout,
  type ChatMessage,
  EmptyState,
  MessageConversationSidebar,
  MessageNewConversationModal,
  MessageCaseDetailPanel,
  type MessageConversationSection,
  type MessageNewConversationPayload,
  useMediaUpload,
} from '@medical-crm/ui';
import { MessageSquare, Check, X } from 'lucide-react';
import { useConversations, useMessages } from '@/queries/use-conversations';
import {
  sendMessage,
  approveMessage,
  rejectMessage,
  createConversation,
  uploadMessageFile,
  sendMessageWithAttachments,
} from '@/actions/message-actions';

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

type AdminVisibleConversationCategory = 'ADMIN_HOSPITAL' | 'ADMIN_PATIENT';

interface PaginatedLike<T> {
  data?: T[];
}

interface MessagesCenterProps {
  caseId?: string;
  showSearch?: boolean;
  showCategoryFilter?: boolean;
  showInfoPanel?: boolean;
  groupByCategorySections?: boolean;
  allowCreateConversation?: boolean;
  containerHeightClassName?: string;
  leftPanelWidthClassName?: string;
  listTitle?: string;
  emptyListMessage?: string;
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
  return messages.map((m) => ({
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

function toAdminCategory(category?: string): AdminVisibleConversationCategory | null {
  const upper = category?.toUpperCase();
  if (upper === 'ADMIN_HOSPITAL') return 'ADMIN_HOSPITAL';
  if (upper === 'ADMIN_PATIENT') return 'ADMIN_PATIENT';
  return null;
}

function resolveChatPerspectiveRole(conversation: ApiConversation): ChatMessage['senderRole'] {
  const category = toAdminCategory(conversation.category);
  if (category === 'ADMIN_HOSPITAL') return 'ADMIN';
  if (category === 'ADMIN_PATIENT') return 'ADMIN';
  return 'ADMIN';
}

function canAdminReply(conversation: ApiConversation): boolean {
  return toAdminCategory(conversation.category) !== null;
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
];

const CATEGORY_SECTION_ORDER: Array<{ key: AdminVisibleConversationCategory; label: string }> = [
  { key: 'ADMIN_HOSPITAL', label: 'Admin / Hospital' },
  { key: 'ADMIN_PATIENT', label: 'Admin / Patient' },
];

const NEW_CONVERSATION_CATEGORY_OPTIONS: Array<{ value: 'ADMIN_HOSPITAL' | 'ADMIN_PATIENT'; label: string }> = [
  { value: 'ADMIN_HOSPITAL', label: 'Admin / Hospital' },
  { value: 'ADMIN_PATIENT', label: 'Admin / Patient' },
];

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
  return (
    <MessageCaseDetailPanel
      caseId={conversation.caseId ?? null}
      category={conversation.category ?? null}
      participantRole={conversation.participantRole ? toRoleLabel(conversation.participantRole) : null}
      participantName={conversation.participantName ?? null}
      hospitalId={conversation.hospitalId ?? null}
    />
  );
}

// ── Chat Panel ───────────────────────────────────────────────────────

function ChatPanel({
  conversation,
  showInfoPanel,
}: {
  conversation: ApiConversation;
  showInfoPanel: boolean;
}) {
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

  const { upload, isUploading } = useMediaUpload();

  async function handleUploadFiles(files: File[]) {
    if (!conversationId) return;
    try {
      const initFn = (params: { fileName: string; fileSize: number; mimeType: string }) =>
        uploadMessageFile(conversationId, params);
      const assets = await upload(files, initFn);
      if (assets.length === 0) return;

      const messageType = assets.every((a) => a.mimeType.startsWith('image/')) ? 'IMAGE' : 'FILE';
      await sendMessageWithAttachments(conversationId, '', messageType, assets);
      await refetch();
    } catch (e) {
      console.error('Failed to upload files', e);
    }
  }

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
      onUploadFiles={handleUploadFiles}
      isUploading={isUploading}
      canSend={canReply}
      isSending={isSending}
      currentUserRole={perspectiveRole}
      showTranslation={true}
      className="h-full"
      inputNotice={moderationNotice}
      readOnlyNotice="Hospital conversation is view-only for admin. Reply is disabled."
      patientInfo={showInfoPanel && showInfo ? caseInfo : undefined}
      showInfoToggle={showInfoPanel && !!conversation.caseId}
      onToggleInfo={() => setShowInfo((v) => !v)}
      infoPanelOpen={showInfoPanel && showInfo}
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

export function MessagesCenter({
  caseId,
  showSearch = true,
  showCategoryFilter = true,
  showInfoPanel = true,
  groupByCategorySections = true,
  allowCreateConversation = true,
  containerHeightClassName = 'h-[calc(100dvh-220px)] min-h-[560px]',
  leftPanelWidthClassName = 'w-80',
  listTitle,
  emptyListMessage = 'No conversations found.',
}: MessagesCenterProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreatingConversation, startCreateConversation] = useTransition();

  const filters: Record<string, string> = {};
  if (caseId) filters['caseId'] = caseId;
  if (showCategoryFilter && category) filters['category'] = category;

  const { data: raw, isLoading } = useConversations(filters);
  const allConversations = unwrapList<ApiConversation>(raw);
  const conversations = allConversations
    .filter((c) => toAdminCategory(c.category) !== null)
    .filter((c) => matchesSearch(c, search));
  const selectedConversation = conversations.find((conv) => conv.id === selectedConvId) ?? null;

  const groupedConversations = useMemo(
    () =>
      CATEGORY_SECTION_ORDER.map((section) => ({
        ...section,
        conversations: conversations.filter((c) => toAdminCategory(c.category) === section.key),
      })).filter((section) => section.conversations.length > 0),
    [conversations],
  );

  const sidebarSections: MessageConversationSection[] = useMemo(
    () =>
      groupedConversations.map((group) => ({
        key: group.key,
        label: group.label,
        items: group.conversations.map((conv) => ({
          id: conv.id,
          title: conv.participantName ?? conv.title ?? conv.hospitalId ?? 'Conversation',
          subtitle: conv.lastMessagePreview ?? undefined,
          meta: conv.participantRole ?? conv.category ?? undefined,
          unreadCount: conv.unreadCount ?? 0,
        })),
      })),
    [groupedConversations],
  );

  useEffect(() => {
    if (!selectedConvId && conversations.length > 0) {
      setSelectedConvId(conversations[0]!.id);
      return;
    }
    if (selectedConvId && !conversations.some((conv) => conv.id === selectedConvId)) {
      setSelectedConvId(conversations[0]?.id ?? null);
    }
  }, [conversations, selectedConvId]);

  function handleCreateConversation(payload: MessageNewConversationPayload) {
    startCreateConversation(async () => {
      try {
        setCreateError(null);
        const created = await createConversation({
          category: payload.category as 'ADMIN_HOSPITAL' | 'ADMIN_PATIENT',
          title: payload.title,
          hospitalId: payload.hospitalId,
          caseId: payload.caseId,
        });
        await queryClient.invalidateQueries({ queryKey: ['conversations'] });
        const createdId =
          created && typeof created === 'object' && 'id' in created
            ? String((created as { id: string }).id)
            : null;
        if (createdId) setSelectedConvId(createdId);
        setCreateModalOpen(false);
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : 'Failed to create conversation');
      }
    });
  }

  return (
    <div className={`flex min-h-0 ${containerHeightClassName} rounded-xl border border-slate-200 overflow-hidden bg-white`}>
      {/* Left panel — conversation list */}
      <div className={`${leftPanelWidthClassName} min-h-0 border-r border-slate-200 flex flex-col shrink-0`}>
        {showCategoryFilter && (
          <div className="border-b border-slate-100 px-4 py-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
        <MessageConversationSidebar
          sections={
            groupByCategorySections
              ? sidebarSections
              : [
                  {
                    key: 'all',
                    label: 'Conversations',
                    items: sidebarSections.flatMap((section) => section.items),
                  },
                ]
          }
          selectedId={selectedConvId}
          onSelect={setSelectedConvId}
          searchValue={showSearch ? search : ''}
          onSearchChange={setSearch}
          showSearch={showSearch}
          onClickNewConversation={allowCreateConversation ? () => setCreateModalOpen(true) : undefined}
          isLoading={isLoading}
          title={listTitle}
          emptyMessage={emptyListMessage}
        />
      </div>

      {/* Right panel — chat */}
      {selectedConversation ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <ChatPanel conversation={selectedConversation} showInfoPanel={showInfoPanel} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center space-y-2">
            <MessageSquare size={40} className="opacity-20 mx-auto" />
            <p className="text-sm text-slate-500">Select a conversation to view messages</p>
          </div>
        </div>
      )}

      <MessageNewConversationModal
        open={createModalOpen}
        onClose={() => {
          if (isCreatingConversation) return;
          setCreateModalOpen(false);
          setCreateError(null);
        }}
        onSubmit={handleCreateConversation}
        categoryOptions={NEW_CONVERSATION_CATEGORY_OPTIONS}
        isPending={isCreatingConversation}
        error={createError}
      />
    </div>
  );
}
