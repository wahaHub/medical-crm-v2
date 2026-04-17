'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AsyncStatusCard,
  ChatLayout,
  type ChatAttachment,
  type ChatMessage,
  EmptyState,
  MessageConversationSidebar,
  MessageCaseDetailPanel,
  Modal,
  PdfPreview,
  type MessageConversationSection,
  useMediaUpload,
} from '@medical-crm/ui';
import { MessageSquare, Check, X, Search, FolderOpen, Building2, User } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useConversations, useMessages } from '@/queries/use-conversations';
import { useHospitals, useHospitalCases } from '@/queries/use-hospitals';
import { useCase, useCaseDocuments, useCases } from '@/queries/use-cases';
import type { PaginatedResponse, HospitalSummary, CaseSummary } from '@/lib/api-types';
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
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    storageKey?: string;
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

interface TranslationOutputFile {
  fileName: string;
  path: string;
}

interface TranslationResult {
  inputFileName: string;
  outputDir: string;
  outputFiles: TranslationOutputFile[];
  stdout: string;
  stderr: string;
}

type AttachmentTranslationStatus = 'idle' | 'translating' | 'ready' | 'failed';

interface AttachmentTranslationState {
  status: AttachmentTranslationStatus;
  translatedUrl?: string;
  error?: string;
  fileName: string;
  targetLanguage: string;
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
  /** When set, only show conversations matching these categories (bypasses toAdminCategory filter) */
  includedCategories?: string[];
  /** When true, hide the message input (read-only / monitoring mode) */
  readOnly?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────

function toRoleLabel(role?: string): string {
  const upper = role?.toUpperCase() ?? 'UNKNOWN';
  if (upper === 'PATIENT') return 'Patient';
  if (upper === 'HOSPITAL') return 'Hospital';
  if (upper === 'ADMIN') return 'Admin';
  if (upper === 'AI') return 'AI';
  return upper;
}

function normalizeSenderRole(role?: string | null): ChatMessage['senderRole'] {
  const upper = role?.toUpperCase();
  if (upper === 'PATIENT' || upper === 'HOSPITAL' || upper === 'ADMIN' || upper === 'AI') {
    return upper;
  }
  return 'ADMIN';
}

function toDisplaySenderName(message: ApiMessage): string {
  const roleLabel = toRoleLabel(message.senderRole);
  const baseName = message.senderName?.trim() || 'Unknown';
  return `${roleLabel} · ${baseName}`;
}

function mapApiMessages(messages: ApiMessage[]): ChatMessage[] {
  // Backend returns messages in DESC order (newest first); reverse to chronological for chat display
  return [...messages].reverse().map((m) => ({
      id: m.id,
      content: m.content,
      translatedContent: m.translatedContent,
      senderRole: normalizeSenderRole(m.senderRole),
      senderName: toDisplaySenderName(m),
      senderId: m.senderId,
      createdAt: m.createdAt,
      isAiTranslated: m.isAiTranslated,
      messageType: m.messageType,
      aiSummary: m.aiSummary,
      attachments: m.attachments?.map((attachment) => ({
        id: attachment.id,
        name: attachment.name ?? attachment.fileName,
        type: attachment.type ?? attachment.mimeType,
        url: attachment.url ?? attachment.storageKey,
        size: attachment.size ?? attachment.fileSize,
        storageKey: attachment.storageKey,
      })),
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

function isPdfAttachment(attachment: ChatAttachment | null): boolean {
  return attachment?.type === 'application/pdf';
}

function isImageAttachment(attachment: ChatAttachment | null): boolean {
  return !!attachment?.type?.startsWith('image/');
}

function buildPdfPreviewUrl(url: string, fileName: string): string {
  return `/api/documents/preview?url=${encodeURIComponent(url)}&fileName=${encodeURIComponent(fileName)}`;
}

function mapLocaleToTargetLanguage(locale?: string): string {
  const value = (locale || 'en').toLowerCase();
  if (value.startsWith('zh')) return 'zh';
  if (value.startsWith('ja')) return 'ja';
  if (value.startsWith('ko')) return 'ko';
  if (value.startsWith('es')) return 'es';
  if (value.startsWith('fr')) return 'fr';
  if (value.startsWith('de')) return 'de';
  if (value.startsWith('ar')) return 'ar';
  if (value.startsWith('ru')) return 'ru';
  if (value.startsWith('th')) return 'th';
  return 'en';
}

async function translatePdfForPreview(sourceUrl: string, fileName: string, targetLanguage: string): Promise<TranslationResult> {
  const res = await fetch('/api/documents/translate', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceUrl,
      fileName,
      targetLanguage,
      outputMode: 'mono',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to translate PDF');
  }

  return res.json() as Promise<TranslationResult>;
}

function pickTranslatedPdf(result: TranslationResult): TranslationOutputFile | undefined {
  return result.outputFiles.find((file) => file.fileName.toLowerCase().endsWith('.pdf'));
}

function getAttachmentTranslationKey(attachment: ChatAttachment, targetLanguage: string): string {
  return `${attachment.storageKey ?? attachment.url ?? attachment.name ?? 'attachment'}::${targetLanguage}`;
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

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
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
  const { data: caseRaw } = useCase(conversation.caseId ?? '');
  const { data: documentsRaw } = useCaseDocuments(conversation.caseId ?? '');
  const caseData = caseRaw as CaseSummary | undefined;
  const documents = (documentsRaw as Array<{ id: string }> | undefined) ?? [];

  return (
    <MessageCaseDetailPanel
      caseId={conversation.caseId ?? null}
      caseNumber={caseData?.caseNumber ?? null}
      category={conversation.category ?? null}
      participantRole={conversation.participantRole ? toRoleLabel(conversation.participantRole) : null}
      participantName={caseData?.patientName ?? conversation.participantName ?? null}
      hospitalId={conversation.hospitalId ?? null}
      patientLanguage={caseData?.patientLanguage ?? null}
      caseStatus={caseData?.status ?? null}
      diagnosis={caseData?.primaryDiagnosis ?? null}
      documentCount={conversation.caseId ? documents.length : null}
      conversationTitle={conversation.title ?? null}
      caseLinkHref={conversation.caseId ? `/cases/${conversation.caseId}` : null}
    />
  );
}

// ── Chat Panel ───────────────────────────────────────────────────────

function ChatPanel({
  conversation,
  showInfoPanel,
  readOnly = false,
}: {
  conversation: ApiConversation;
  showInfoPanel: boolean;
  readOnly?: boolean;
}) {
  const { user } = useAuth();
  const conversationId = conversation.id;
  const { data: raw, refetch } = useMessages(conversationId);
  const apiMessages = unwrapList<ApiMessage>(raw);
  const [isSending, startSend] = useTransition();
  const [isModerating, startModerate] = useTransition();
  const [showInfo, setShowInfo] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachment | null>(null);
  const [translatedPreviewUrl, setTranslatedPreviewUrl] = useState<string | null>(null);
  const [isTranslatingPreview, setIsTranslatingPreview] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [portalLanguage, setPortalLanguage] = useState('en');
  const [attachmentTranslations, setAttachmentTranslations] = useState<Record<string, AttachmentTranslationState>>({});
  const previewRequestRef = useRef(0);

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

  useEffect(() => {
    if (user.preferredLanguage) {
      setPortalLanguage(mapLocaleToTargetLanguage(user.preferredLanguage));
      return;
    }
    if (typeof navigator !== 'undefined') {
      setPortalLanguage(mapLocaleToTargetLanguage(navigator.language));
    }
  }, [user.preferredLanguage]);

  const handleOpenAttachment = useCallback(async (attachment: ChatAttachment) => {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setPreviewAttachment(attachment);
    setTranslatedPreviewUrl(null);
    setTranslationError(null);

    if (!isPdfAttachment(attachment) || !attachment.url) {
      return;
    }

    const targetLanguage = mapLocaleToTargetLanguage(user.preferredLanguage || portalLanguage);
    const translationKey = getAttachmentTranslationKey(attachment, targetLanguage);
    const cached = attachmentTranslations[translationKey];

    if (cached?.status === 'ready' && cached.translatedUrl) {
      if (previewRequestRef.current === requestId) {
        setTranslatedPreviewUrl(cached.translatedUrl);
        setIsTranslatingPreview(false);
      }
      return;
    }

    if (cached?.status === 'translating') {
      if (previewRequestRef.current === requestId) {
        setIsTranslatingPreview(true);
      }
      return;
    }

    setIsTranslatingPreview(true);
    setAttachmentTranslations((current) => ({
      ...current,
      [translationKey]: {
        status: 'translating',
        fileName: attachment.name ?? 'document.pdf',
        targetLanguage,
      },
    }));

    try {
      const result = await translatePdfForPreview(
        attachment.url,
        attachment.name ?? 'document.pdf',
        targetLanguage,
      );
      const translatedPdf = pickTranslatedPdf(result);
      if (!translatedPdf) {
        throw new Error('Translated PDF output was not found');
      }
      const translatedUrl = `/api/documents/translate/file?path=${encodeURIComponent(translatedPdf.path)}`;
      if (previewRequestRef.current !== requestId) {
        return;
      }
      setTranslatedPreviewUrl(translatedUrl);
      setAttachmentTranslations((current) => ({
        ...current,
        [translationKey]: {
          status: 'ready',
          translatedUrl,
          fileName: attachment.name ?? 'document.pdf',
          targetLanguage,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to translate PDF preview';
      if (previewRequestRef.current !== requestId) {
        return;
      }
      setTranslationError(message);
      setAttachmentTranslations((current) => ({
        ...current,
        [translationKey]: {
          status: 'failed',
          error: message,
          fileName: attachment.name ?? 'document.pdf',
          targetLanguage,
        },
      }));
    } finally {
      if (previewRequestRef.current === requestId) {
        setIsTranslatingPreview(false);
      }
    }
  }, [attachmentTranslations, portalLanguage, user.preferredLanguage]);

  const handleCloseAttachmentPreview = useCallback(() => {
    previewRequestRef.current += 1;
    setPreviewAttachment(null);
    setTranslatedPreviewUrl(null);
    setTranslationError(null);
    setIsTranslatingPreview(false);
  }, []);

  return (
    <>
      <ChatLayout
        messages={chatMessages}
        onSend={handleSend}
        onUploadFiles={handleUploadFiles}
        isUploading={isUploading}
        canSend={canReply && !readOnly}
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
        onOpenAttachment={handleOpenAttachment}
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

      <Modal
        open={!!previewAttachment}
        onClose={handleCloseAttachmentPreview}
        title={previewAttachment?.name ?? 'Attachment Preview'}
        maxWidth="max-w-[92vw]"
      >
        {previewAttachment && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Original</h3>
                <span className="text-xs text-slate-500">{previewAttachment.type ?? 'file'}</span>
              </div>
              <div className="h-[70vh] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                {isImageAttachment(previewAttachment) && previewAttachment.url ? (
                  <img
                    src={previewAttachment.url}
                    alt={previewAttachment.name ?? 'Attachment preview'}
                    className="h-full w-full object-contain bg-white"
                  />
                ) : isPdfAttachment(previewAttachment) && previewAttachment.url ? (
                  <PdfPreview
                    title={`${previewAttachment.name ?? 'Attachment'} original`}
                    url={buildPdfPreviewUrl(previewAttachment.url, previewAttachment.name ?? 'document.pdf')}
                    className="bg-slate-50"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                    Preview is not available for this file type.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Translated</h3>
                <span className="text-xs text-slate-500">
                  {isPdfAttachment(previewAttachment) ? `Target: ${portalLanguage}` : 'Preview only'}
                </span>
              </div>
              <div className="h-[70vh] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                {isPdfAttachment(previewAttachment) ? (
                  isTranslatingPreview ? (
                    <AsyncStatusCard
                      title="Translating PDF preview"
                      description={`BabelDOC is preparing a ${portalLanguage.toUpperCase()} preview for ${previewAttachment.name ?? 'this document'}.`}
                    />
                  ) : translatedPreviewUrl ? (
                    <PdfPreview
                      title={`${previewAttachment.name ?? 'Attachment'} translated`}
                      url={translatedPreviewUrl}
                      className="bg-slate-50"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                      {translationError ?? 'Translation preview is not available.'}
                    </div>
                  )
                ) : isImageAttachment(previewAttachment) ? (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                    Image preview is available here. Structured image translation is not enabled yet in this BabelDOC flow.
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                    Translation preview is currently available for PDF attachments only.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
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
  includedCategories,
  readOnly = false,
}: MessagesCenterProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [pendingRevealId, setPendingRevealId] = useState<string | null>(null);
  const [flashConversationId, setFlashConversationId] = useState<string | null>(null);
  const [isCreatingConversation, startCreateConversation] = useTransition();
  const leftPanelRef = useRef<HTMLDivElement | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);

  const filters: Record<string, string> = {};
  if (caseId) filters['caseId'] = caseId;
  if (showCategoryFilter && category) filters['category'] = category;

  const { data: raw, isLoading } = useConversations(filters);
  const allConversations = unwrapList<ApiConversation>(raw);
  const conversations = allConversations
    .filter((c) => {
      if (includedCategories) {
        return includedCategories.includes(c.category?.toUpperCase() ?? '');
      }
      return toAdminCategory(c.category) !== null;
    })
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

  const revealConversation = useCallback((id: string) => {
    setSelectedConvId(id);
    setSearch('');
    setCategory('');
    setPendingRevealId(id);
  }, []);

  useEffect(() => {
    if (!pendingRevealId) return;
    const exists = conversations.some((conversation) => conversation.id === pendingRevealId);
    if (!exists) return;

    const frame = window.requestAnimationFrame(() => {
      const target = leftPanelRef.current?.querySelector<HTMLElement>(`[data-conversation-item-id="${pendingRevealId}"]`);
      if (!target) return;

      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setFlashConversationId(pendingRevealId);
      setPendingRevealId(null);

      if (flashTimeoutRef.current) {
        window.clearTimeout(flashTimeoutRef.current);
      }
      flashTimeoutRef.current = window.setTimeout(() => {
        setFlashConversationId((current) => (current === pendingRevealId ? null : current));
        flashTimeoutRef.current = null;
      }, 1400);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [conversations, pendingRevealId]);

  useEffect(() => () => {
    if (flashTimeoutRef.current) {
      window.clearTimeout(flashTimeoutRef.current);
    }
  }, []);

  function handleCreateOrNavigate(existingConvId: string | null, payload: { category: 'ADMIN_HOSPITAL' | 'ADMIN_PATIENT'; hospitalId?: string; caseId?: string }) {
    if (existingConvId) {
      revealConversation(existingConvId);
      setCreateModalOpen(false);
      return;
    }
    startCreateConversation(async () => {
      try {
        setCreateError(null);
        const created = await createConversation(payload);
        await queryClient.invalidateQueries({ queryKey: ['conversations'] });
        const createdId =
          created && typeof created === 'object' && 'id' in created
            ? String((created as { id: string }).id)
            : null;
        if (createdId) revealConversation(createdId);
        setCreateModalOpen(false);
      } catch (error) {
        setCreateError(error instanceof Error ? error.message : 'Failed to create conversation');
      }
    });
  }

  return (
    <div className={`flex min-h-0 ${containerHeightClassName} rounded-xl border border-slate-200 overflow-hidden bg-white`}>
      {/* Left panel — conversation list */}
      <div ref={leftPanelRef} className={`${leftPanelWidthClassName} min-h-0 border-r border-slate-200 flex flex-col shrink-0`}>
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
          highlightedId={flashConversationId}
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
          <ChatPanel conversation={selectedConversation} showInfoPanel={showInfoPanel} readOnly={readOnly} />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center space-y-2">
            <MessageSquare size={40} className="opacity-20 mx-auto" />
            <p className="text-sm text-slate-500">Select a conversation to view messages</p>
          </div>
        </div>
      )}

      <AdminNewConversationModal
        open={createModalOpen}
        onClose={() => {
          if (isCreatingConversation) return;
          setCreateModalOpen(false);
          setCreateError(null);
        }}
        conversations={allConversations}
        onCreateOrNavigate={handleCreateOrNavigate}
        isPending={isCreatingConversation}
        error={createError}
      />
    </div>
  );
}

/* ── Admin New Conversation Modal ───────────────────────────────── */

function AdminNewConversationModal({
  open,
  onClose,
  conversations,
  onCreateOrNavigate,
  isPending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  conversations: ApiConversation[];
  onCreateOrNavigate: (existingConvId: string | null, payload: { category: 'ADMIN_HOSPITAL' | 'ADMIN_PATIENT'; hospitalId?: string; caseId?: string }) => void;
  isPending: boolean;
  error: string | null;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const caseListParams = { page: '1', limit: '100' };

  const { data: hospitalsRaw } = useHospitals({ limit: '100' });
  const hospitals = (hospitalsRaw as PaginatedResponse<HospitalSummary> | undefined)?.data ?? [];

  // All cases (for patient section)
  const { data: allCasesRaw } = useCases(caseListParams);
  const allCases = (allCasesRaw as PaginatedResponse<CaseSummary> | undefined)?.data ?? [];

  // Cases assigned to selected hospital (for hospital section)
  const { data: hospitalCasesRaw } = useHospitalCases(selectedHospitalId ?? '', caseListParams);
  const hospitalCases = (hospitalCasesRaw as PaginatedResponse<CaseSummary> | undefined)?.data ?? [];

  // Build dedup maps
  const hospitalConvMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations) {
      if (c.category === 'ADMIN_HOSPITAL' && c.hospitalId) {
        map.set(`${c.hospitalId}::${c.caseId ?? ''}`, c.id);
      }
    }
    return map;
  }, [conversations]);

  const patientConvMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations) {
      if (c.category === 'ADMIN_PATIENT' && c.caseId) {
        map.set(c.caseId, c.id);
      }
    }
    return map;
  }, [conversations]);

  const selectedHospital = hospitals.find((h) => h.id === selectedHospitalId);

  // Filter hospital cases by search
  const filteredHospitalCases = hospitalCases.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.patientName ?? '').toLowerCase().includes(q) ||
      (c.caseNumber ?? '').toLowerCase().includes(q) ||
      (c.primaryDiagnosis ?? '').toLowerCase().includes(q)
    );
  });

  // Filter all cases by search (for patient section)
  const filteredAllCases = allCases.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.patientName ?? '').toLowerCase().includes(q) ||
      (c.caseNumber ?? '').toLowerCase().includes(q) ||
      (c.primaryDiagnosis ?? '').toLowerCase().includes(q)
    );
  });

  const filteredHospitals = hospitals.filter((h) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return h.name.toLowerCase().includes(q) || (h.nameEn ?? '').toLowerCase().includes(q);
  });

  return (
    <Modal open={open} onClose={onClose} title="New Conversation" maxWidth="max-w-2xl">
      <div className="space-y-5">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        )}

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="text" placeholder="Search hospitals, patients, case numbers..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>

        {/* Section 1: Message Hospital */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center"><Building2 size={14} className="text-purple-600" /></div>
            <h3 className="text-sm font-semibold text-slate-700">Message Hospital</h3>
          </div>

          {!selectedHospitalId ? (
            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200/60 bg-white">
              {filteredHospitals.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-400">No hospitals found</div>
              ) : (
                filteredHospitals.map((h) => {
                  const generalConvId = hospitalConvMap.get(`${h.id}::`);
                  return (
                    <button key={h.id} onClick={() => setSelectedHospitalId(h.id)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left border-b border-slate-100 last:border-b-0 hover:bg-purple-50 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-xs font-semibold text-purple-600 shrink-0">
                        {getInitials(h.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm text-slate-900 truncate block">{h.name}</span>
                        {h.nameEn && <span className="text-xs text-slate-400 truncate block">{h.nameEn}</span>}
                      </div>
                      {generalConvId && (
                        <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">Active</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-xl">
                <Building2 size={14} className="text-purple-600" />
                <span className="text-sm font-medium text-purple-700 flex-1">{selectedHospital?.name ?? selectedHospitalId}</span>
                <button onClick={() => setSelectedHospitalId(null)} className="text-purple-400 hover:text-purple-600"><X size={14} /></button>
              </div>

              {(() => {
                const existingId = hospitalConvMap.get(`${selectedHospitalId}::`) ?? null;
                return (
                  <button onClick={() => onCreateOrNavigate(existingId, { category: 'ADMIN_HOSPITAL', hospitalId: selectedHospitalId })}
                    disabled={isPending}
                    className="w-full p-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex items-center gap-3 hover:shadow-md transition-all text-left disabled:opacity-50">
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0"><MessageSquare size={14} className="text-white" /></div>
                    <div className="flex-1">
                      <div className="font-semibold text-sm">General Message</div>
                      <div className="text-xs text-indigo-100">No case attached</div>
                    </div>
                    {existingId && <span className="text-[10px] font-semibold text-white/90 bg-white/20 px-2 py-0.5 rounded-full">Go to Chat</span>}
                  </button>
                );
              })()}

              <p className="text-xs text-slate-400">Or about a specific case assigned to this hospital:</p>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200/60 bg-white">
                {filteredHospitalCases.length === 0 ? (
                  <div className="py-4 text-center text-sm text-slate-400">No cases assigned to this hospital</div>
                ) : (
                  filteredHospitalCases.map((c) => {
                    const existingId = hospitalConvMap.get(`${selectedHospitalId}::${c.id}`) ?? null;
                    return (
                      <button key={c.id}
                        onClick={() => onCreateOrNavigate(existingId, { category: 'ADMIN_HOSPITAL', hospitalId: selectedHospitalId, caseId: c.id })}
                        disabled={isPending}
                        className={`w-full px-4 py-2.5 flex items-center gap-3 text-left border-b border-slate-100 last:border-b-0 transition-colors disabled:opacity-50 ${existingId ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'hover:bg-slate-50'}`}>
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${existingId ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'}`}>
                          {getInitials(c.patientName ?? 'U')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm text-slate-900 truncate block">{c.patientName ?? 'Unknown'}</span>
                          {c.caseNumber && <span className="text-[10px] text-slate-400">{c.caseNumber}</span>}
                        </div>
                        {existingId ? (
                          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">Go to Chat</span>
                        ) : (
                          <span className="text-[10px] text-blue-500 shrink-0">+ New</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-px bg-slate-200" />

        {/* Section 2: Message Patient */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center"><User size={14} className="text-blue-600" /></div>
            <h3 className="text-sm font-semibold text-slate-700">Message Patient</h3>
            <span className="text-xs text-slate-400">(select a case)</span>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200/60 bg-white">
            {filteredAllCases.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-400">
                <FolderOpen size={20} className="mx-auto mb-1.5 opacity-50" />
                No cases found
              </div>
            ) : (
              filteredAllCases.map((c) => {
                const existingId = patientConvMap.get(c.id) ?? null;
                return (
                  <button key={c.id}
                    onClick={() => onCreateOrNavigate(existingId, { category: 'ADMIN_PATIENT', caseId: c.id })}
                    disabled={isPending}
                    className={`w-full px-4 py-3 flex items-center gap-3 text-left border-b border-slate-100 last:border-b-0 transition-colors disabled:opacity-50 ${existingId ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'hover:bg-blue-50'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${existingId ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                      {getInitials(c.patientName ?? 'U')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-slate-900 truncate">{c.patientName ?? 'Unknown'}</span>
                        {c.caseNumber && <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{c.caseNumber}</span>}
                      </div>
                      {c.primaryDiagnosis && <p className="text-xs text-slate-500 truncate mt-0.5">{c.primaryDiagnosis}</p>}
                    </div>
                    {existingId ? (
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                        <MessageSquare size={10} /> Go to Chat
                      </span>
                    ) : (
                      <span className="text-[10px] text-blue-500 shrink-0">+ New</span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">Close</button>
        </div>
      </div>
    </Modal>
  );
}
