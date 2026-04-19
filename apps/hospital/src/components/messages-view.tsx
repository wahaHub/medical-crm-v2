'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  Mail,
  MessageCircle,
  Sparkles,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  Building2,
  Users,
  User,
  MessageSquarePlus,
  ShieldAlert,
  FolderOpen,
  Info,
} from 'lucide-react';
import {
  AsyncStatusCard,
  ChatLayout,
  type ChatAttachment,
  type ChatMessage,
  Button,
  EmptyState,
  MessageCaseDetailPanel,
  Modal,
  PdfPreview,
} from '@medical-crm/ui';
import { useAuth } from '@/lib/auth-context';
import { useConversations } from '@/queries/use-conversations';
import { useMessages } from '@/queries/use-messages';
import { useCases, useCase } from '@/queries/use-cases';
import { sendMessage, sendMessageWithAttachments, createConversation, uploadFile } from '@/actions/message-actions';
import type { PaginatedResponse, ConversationSummary, CaseSummary, HospitalCaseDetail } from '@/lib/api-types';
import { useHospitalI18n } from '@/lib/hospital-i18n';
import {
  getHospitalGenderShortLabel,
  getHospitalStatusLabel,
  getLocalizedLanguageLabel,
} from '@/lib/hospital-display';

/** Raw message shape from the backend API */
interface ApiMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole?: string | null;
  senderName?: string | null;
  content: string;
  originalLanguage?: string | null;
  translatedContent?: string | null;
  messageType?: string;
  moderationStatus?: string;
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
  aiSummary?: string | null;
  createdAt: string;
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

/** Map raw API messages to the ChatMessage shape expected by the UI */
function mapApiMessages(
  raw: ApiMessage[],
  options: {
    conversationCategory?: string;
    otherPartyName?: string;
    currentUserId?: string;
    adminName: string;
    patientName: string;
    hospitalName: string;
  },
): ChatMessage[] {
  const otherPartyRole: ChatMessage['senderRole'] = options.conversationCategory === 'ADMIN_HOSPITAL' ? 'ADMIN' : 'PATIENT';
  const otherPartyName = options.otherPartyName
    ?? (options.conversationCategory === 'ADMIN_HOSPITAL' ? options.adminName : options.patientName);

  return raw.map((m) => ({
    id: m.id,
    content: m.content,
    translatedContent: m.translatedContent ?? null,
    senderRole: (
      m.senderRole === 'ADMIN' || m.senderRole === 'HOSPITAL' || m.senderRole === 'PATIENT'
        ? m.senderRole
        : (m.senderId === options.currentUserId ? 'HOSPITAL' : otherPartyRole)
    ),
    senderName: m.senderName ?? (m.senderId === options.currentUserId ? options.hospitalName : otherPartyName),
    senderId: m.senderId,
    createdAt: m.createdAt,
    isAiTranslated: !!m.translatedContent,
    messageType: m.messageType,
    attachments: m.attachments?.map((attachment) => ({
      id: attachment.id,
      name: attachment.name ?? attachment.fileName,
      type: attachment.type ?? attachment.mimeType,
      url: attachment.url ?? attachment.storageKey,
      size: attachment.size ?? attachment.fileSize,
      storageKey: attachment.storageKey,
    })),
    aiSummary: m.aiSummary ?? null,
  }));
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

async function translatePdfForPreview(
  sourceUrl: string,
  fileName: string,
  targetLanguage: string,
  loadErrorFallback: string,
): Promise<TranslationResult> {
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
    throw new Error(text || loadErrorFallback);
  }

  return res.json() as Promise<TranslationResult>;
}

function pickTranslatedPdf(result: TranslationResult): TranslationOutputFile | undefined {
  return result.outputFiles.find((file) => file.fileName.toLowerCase().endsWith('.pdf'));
}

function getAttachmentTranslationKey(attachment: ChatAttachment, targetLanguage: string): string {
  return `${attachment.storageKey ?? attachment.url ?? attachment.name ?? 'attachment'}::${targetLanguage}`;
}

interface MessagesViewProps {
  initialConversations: PaginatedResponse<ConversationSummary>;
  initialConversationId?: string | null;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatMessageTime(
  dateStr: string,
  locale: string,
  translate: (key: string, fallback: string, values?: Record<string, string | number>) => string,
) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) {
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  }
  if (diffDays === 1) return translate('hospital.messages.conversationList.time.yesterday', 'Yesterday');
  if (diffDays < 7) {
    return translate('hospital.portal.messages.conversationList.time.daysAgoCompact', '{days}d ago', {
      days: diffDays,
    });
  }
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d);
}

export function MessagesView({ initialConversations, initialConversationId }: MessagesViewProps) {
  const { user } = useAuth();
  const { locale, t } = useHospitalI18n();
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t(key, values, fallback);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachment | null>(null);
  const [translatedPreviewUrl, setTranslatedPreviewUrl] = useState<string | null>(null);
  const [isTranslatingPreview, setIsTranslatingPreview] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [portalLanguage, setPortalLanguage] = useState('en');
  const [attachmentTranslations, setAttachmentTranslations] = useState<Record<string, AttachmentTranslationState>>({});
  const [activeTranslationKey, setActiveTranslationKey] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState({ admin: true, patient: true });
  const [showTranslation, setShowTranslation] = useState(true);
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [pendingRevealId, setPendingRevealId] = useState<string | null>(null);
  const [flashConversationId, setFlashConversationId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);
  const previewRequestRef = useRef(0);
  const fallbackPreviewFileName = tx('hospital.portal.messages.preview.fallbackFileName', 'document.pdf');
  const fallbackAttachmentLabel = tx('hospital.portal.messages.preview.attachmentAlt', 'Attachment');
  const localizedPortalLanguage = getLocalizedLanguageLabel(portalLanguage, locale) || portalLanguage.toUpperCase();

  const { data: liveConversations } = useConversations();
  const liveResponse = liveConversations as PaginatedResponse<ConversationSummary> | undefined;
  const conversations: ConversationSummary[] = liveResponse?.data ?? initialConversations?.data ?? [];
  const selectedConvo = conversations.find((c) => c.id === selectedId);

  const {
    data: messagesData,
    isLoading: isMessagesLoading,
    isError: isMessagesError,
    error: messagesError,
  } = useMessages(selectedId ?? '');
  const messagesResponse = messagesData as PaginatedResponse<ApiMessage> | undefined;
  const messages: ChatMessage[] = useMemo(
    () => mapApiMessages([...(messagesResponse?.data ?? [])].reverse(), {
      conversationCategory: selectedConvo?.category,
      otherPartyName: selectedConvo?.patientName ?? selectedConvo?.title ?? undefined,
      currentUserId: user.id,
      adminName: tx('hospital.messages.chat.admin', 'Admin'),
      patientName: tx('hospital.portal.messages.chat.patient', 'Patient'),
      hospitalName: tx('hospital.messages.chat.hospital', 'Hospital'),
    }),
    [messagesResponse?.data, selectedConvo?.category, selectedConvo?.patientName, selectedConvo?.title, user.id, locale],
  );

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.title ?? '').toLowerCase().includes(q) ||
      (c.patientName ?? '').toLowerCase().includes(q) ||
      (c.lastMessagePreview ?? '').toLowerCase().includes(q)
    );
  });

  const adminConvos = filteredConversations.filter((c) => c.category === 'ADMIN_HOSPITAL');
  const patientConvos = filteredConversations.filter((c) => c.category !== 'ADMIN_HOSPITAL');

  // Fetch linked case details for the right panel (Issues 2 & 3)
  const selectedCaseId = selectedConvo?.caseId ?? '';
  const { data: caseDetailData } = useCase(selectedCaseId);
  const caseDetail = caseDetailData as HospitalCaseDetail | undefined;

  const toggleSection = (section: 'admin' | 'patient') => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSend = useCallback(
    async (content: string) => {
      if (!selectedId) return;
      setIsSending(true);
      try {
        await sendMessage(selectedId, content);
        await queryClient.invalidateQueries({ queryKey: ['conversations', selectedId, 'messages'] });
        await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      } catch {
        // Error handled by apiClient
      } finally {
        setIsSending(false);
      }
    },
    [selectedId, queryClient],
  );

  const handleUploadFiles = useCallback(
    async (files: File[]) => {
      if (!selectedId || files.length === 0) return;
      setIsUploading(true);
      try {
        for (const file of files) {
          const attachment = await uploadFile(selectedId, file);
          const messageType = file.type.startsWith('image/') ? 'IMAGE' : 'FILE';
          await sendMessageWithAttachments(selectedId, '', messageType, [attachment]);
        }
        await queryClient.invalidateQueries({ queryKey: ['conversations', selectedId, 'messages'] });
        await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      } catch (err) {
        console.error('File upload failed:', err);
      } finally {
        setIsUploading(false);
      }
    },
    [selectedId, queryClient],
  );

  const adminUnread = adminConvos.reduce((acc, c) => acc + (c.unreadCount ?? 0), 0);
  const patientUnread = patientConvos.reduce((acc, c) => acc + (c.unreadCount ?? 0), 0);

  const revealConversation = useCallback((id: string, category: 'ADMIN_HOSPITAL' | 'HOSPITAL_PATIENT') => {
    setSelectedId(id);
    setSearchQuery('');
    setExpandedSections((prev) => ({
      ...prev,
      admin: category === 'ADMIN_HOSPITAL' ? true : prev.admin,
      patient: category !== 'ADMIN_HOSPITAL' ? true : prev.patient,
    }));
    setPendingRevealId(id);
  }, []);

  useEffect(() => {
    if (!pendingRevealId) return;
    const exists = conversations.some((conversation) => conversation.id === pendingRevealId);
    if (!exists) return;

    const frame = window.requestAnimationFrame(() => {
      const target = sidebarRef.current?.querySelector<HTMLElement>(`[data-conversation-item-id="${pendingRevealId}"]`);
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

  useEffect(() => {
    if (user.preferredLanguage) {
      setPortalLanguage(mapLocaleToTargetLanguage(user.preferredLanguage));
      return;
    }
    if (typeof navigator !== 'undefined') {
      setPortalLanguage(mapLocaleToTargetLanguage(navigator.language));
    }
  }, [user.preferredLanguage]);

  const formatChatMessageTime = useCallback((dateStr: string) => {
    if (!dateStr) return '';
    const value = new Date(dateStr);
    if (Number.isNaN(value.getTime())) return '';
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: '2-digit',
    }).format(value);
  }, [locale]);

  const formatChatDateDivider = useCallback((dateStr: string) => {
    const value = new Date(dateStr);
    if (Number.isNaN(value.getTime())) return '';
    const now = new Date();
    const diff = Math.floor((now.getTime() - value.getTime()) / 86400000);
    if (diff === 0) {
      return tx('hospital.common.today', 'Today');
    }
    if (diff === 1) {
      return tx('hospital.messages.conversationList.time.yesterday', 'Yesterday');
    }
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(value);
  }, [locale, tx]);

  const formatPreviewLanguageLabel = useCallback((language: string) => {
    return getLocalizedLanguageLabel(language, locale) || language.toUpperCase();
  }, [locale]);

  const previewPdfLabels = useMemo(() => ({
    unavailableTitle: tx('hospital.portal.messages.preview.pdfUnavailable', 'PDF preview is unavailable'),
    loadingTitle: tx('hospital.portal.messages.preview.loadingTitle', 'Loading PDF preview'),
    loadingDescription: tx(
      'hospital.portal.messages.preview.loadingDescription',
      'Rendering document pages for a cleaner side-by-side reading view.',
    ),
    progressLabel: tx('hospital.portal.messages.preview.processing', 'Live processing in progress'),
    loadErrorFallback: tx('hospital.portal.messages.preview.loadErrorFallback', 'Failed to load PDF preview'),
    renderErrorFallback: tx('hospital.portal.messages.preview.renderErrorFallback', 'Failed to render PDF page'),
    canvasUnavailable: tx('hospital.portal.messages.preview.canvasUnavailable', 'Canvas context is unavailable'),
    pageAriaLabel: (pageNumber: number, documentTitle: string) =>
      tx('hospital.portal.messages.preview.pageAriaLabel', '{title} page {page}', {
        title: documentTitle,
        page: pageNumber,
      }),
  }), [tx]);

  const chatLayoutLabels = useMemo(() => ({
    online: tx('hospital.messages.chat.online', 'Online'),
    offline: tx('hospital.messages.chat.offline', 'Offline'),
    showTranslation: tx('hospital.messages.chat.showTranslation', 'Show Translation'),
    aiSummaryPrefix: tx('hospital.messages.chat.aiSummary', 'AI Summary'),
    imageAlt: tx('hospital.messages.chat.image', 'Image'),
    fileFallbackName: tx('hospital.messages.chat.file', 'File'),
    fileTypeFallback: tx('hospital.messages.chat.fileType', 'FILE'),
    aiTranslated: tx('hospital.messages.chat.aiTranslated', 'AI Translated'),
    retranslate: tx('hospital.messages.chat.retranslate', 'Retranslate'),
    attachFiles: tx('hospital.messages.chat.attachFiles', 'Attach files'),
    typeMessagePlaceholder: tx('hospital.messages.chat.typeMessage', 'Type a message...'),
    readOnlyConversation: tx('hospital.messages.chat.readOnlyConversation', 'Read-only conversation'),
    removeSelectedFile: tx('hospital.messages.chat.removeFile', 'Remove file'),
    today: tx('hospital.common.today', 'Today'),
    yesterday: tx('hospital.messages.conversationList.time.yesterday', 'Yesterday'),
  }), [tx]);

  const formatChatAttachmentImageAlt = useCallback((attachment: ChatAttachment) => {
    return attachment.name ?? fallbackAttachmentLabel;
  }, [fallbackAttachmentLabel]);

  const formatChatAttachmentTypeLabel = useCallback((attachment: ChatAttachment) => {
    return attachment.type?.split('/')[1]?.toUpperCase()
      ?? tx('hospital.messages.chat.fileType', 'FILE');
  }, [tx]);

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
    setActiveTranslationKey(translationKey);

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
        fileName: attachment.name ?? fallbackPreviewFileName,
        targetLanguage,
      },
    }));
    console.debug('[messages.preview] translation start', {
      fileName: attachment.name,
      targetLanguage,
      url: attachment.url,
    });
    try {
      const result = await translatePdfForPreview(
        attachment.url,
        attachment.name ?? fallbackPreviewFileName,
        targetLanguage,
        tx('hospital.portal.messages.preview.translateRequestFailed', 'Failed to translate PDF'),
      );
      const translatedPdf = pickTranslatedPdf(result);
      if (!translatedPdf) {
        throw new Error(tx(
          'hospital.portal.messages.preview.translatedOutputMissing',
          'Translated PDF output was not found',
        ));
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
          fileName: attachment.name ?? fallbackPreviewFileName,
          targetLanguage,
        },
      }));
      console.debug('[messages.preview] translation ready', {
        fileName: attachment.name,
        targetLanguage,
        translatedPath: translatedPdf.path,
      });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : tx('hospital.portal.messages.preview.translationFailed', 'Failed to translate PDF preview');
      if (previewRequestRef.current !== requestId) {
        return;
      }
      setTranslationError(message);
      setAttachmentTranslations((current) => ({
        ...current,
        [translationKey]: {
          status: 'failed',
          error: message,
          fileName: attachment.name ?? fallbackPreviewFileName,
          targetLanguage,
        },
      }));
      console.error('[messages.preview] translation failed', {
        fileName: attachment.name,
        targetLanguage,
        error: message,
      });
    } finally {
      if (previewRequestRef.current === requestId) {
        setIsTranslatingPreview(false);
      }
    }
  }, [attachmentTranslations, fallbackPreviewFileName, portalLanguage, tx, user.preferredLanguage]);

  const handleCloseAttachmentPreview = useCallback(() => {
    previewRequestRef.current += 1;
    setPreviewAttachment(null);
    setTranslatedPreviewUrl(null);
    setTranslationError(null);
    setIsTranslatingPreview(false);
    setActiveTranslationKey(null);
  }, []);

  const activeTranslationState = activeTranslationKey ? attachmentTranslations[activeTranslationKey] : null;
  const messageCasePanelLabels = {
    unknownParticipant: tx('hospital.messages.chat.unknown', 'Unknown'),
    conversation: tx('hospital.messages.chat.caseInfo', 'Case Info'),
    patientCode: tx('hospital.messages.chat.patientCodeLabel', 'Patient Code'),
    primaryDiagnosis: tx('hospital.messages.chat.primaryDiagnosis', 'Primary Diagnosis'),
    language: tx('hospital.messages.chat.language', 'Language'),
    profile: tx('hospital.common.profile', 'Profile'),
    caseStatus: tx('hospital.common.caseStatus', 'Case Status'),
    stats: tx('hospital.common.stats', 'Stats'),
    documents: tx('hospital.common.documents', 'Documents'),
    messages: tx('hospital.common.messages', 'Messages'),
    role: tx('hospital.common.role', 'Role'),
    case: tx('hospital.common.case', 'Case'),
    hospital: tx('hospital.messages.chat.hospital', 'Hospital'),
  };
  const formatConversationCategoryLabel = (category: string) =>
    category === 'ADMIN_HOSPITAL'
      ? tx('hospital.messages.chat.admin', 'Admin')
      : category === 'ADMIN_PATIENT' || category === 'HOSPITAL_PATIENT'
        ? tx('hospital.portal.messages.chat.patient', 'Patient')
        : category.replace(/_/g, ' / ');
  const formatParticipantRoleLabel = (role: string) =>
    role === 'ADMIN_HOSPITAL'
      ? tx('hospital.messages.chat.admin', 'Admin')
      : role === 'ADMIN_PATIENT' || role === 'HOSPITAL_PATIENT' || role === 'PATIENT'
        ? tx('hospital.portal.messages.chat.patient', 'Patient')
        : role === 'HOSPITAL'
          ? tx('hospital.messages.chat.hospital', 'Hospital')
        : role;

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* CRM Forwarding Info Banner */}
      <div className="bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-3 flex items-center justify-between rounded-t-2xl shadow-sm">
        <div className="flex items-center gap-3 text-white">
          <MessageSquare size={18} className="opacity-90" />
          <span className="text-sm font-medium">
            {tx(
              'hospital.portal.messages.banner.description',
              'All patient communications are automatically forwarded and synced to this CRM.',
            )}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 bg-blue-500/20 text-blue-50 border border-blue-400/30 rounded-md text-xs font-semibold flex items-center gap-1.5 backdrop-blur-sm">
            <Mail size={12} /> {tx('hospital.messages.forwardingInfo.emailSupport', 'Email')}
          </span>
          <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-50 border border-emerald-400/30 rounded-md text-xs font-semibold flex items-center gap-1.5 backdrop-blur-sm">
            <MessageCircle size={12} /> {tx('hospital.messages.forwardingInfo.whatsappSupport', 'WhatsApp')}
          </span>
          <span className="px-2.5 py-1 bg-amber-500/20 text-amber-50 border border-amber-400/30 rounded-md text-xs font-semibold flex items-center gap-1.5 backdrop-blur-sm">
            <Sparkles size={12} /> {tx('hospital.messages.forwardingInfo.autoClassification', 'Auto-Classification')}
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden rounded-b-2xl bg-white shadow-sm">
        {/* Left Sidebar: Conversation List */}
        <div ref={sidebarRef} className="w-[340px] border-r border-slate-200/50 flex flex-col shrink-0 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.05)]">
          <div className="p-4 border-b border-slate-100 space-y-4">
            <button
              onClick={() => setShowNewModal(true)}
              className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 shadow-sm shadow-cyan-500/20 transition-all"
            >
              <Plus size={16} /> {tx('hospital.messages.conversationList.newMessage', 'New Conversation')}
            </button>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={tx('hospital.messages.conversationList.searchPlaceholder', 'Search conversations...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200/60 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Admin Conversations Section */}
            <div className="py-2">
              <button
                onClick={() => toggleSection('admin')}
                className="w-full px-4 py-2 flex items-center justify-between text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expandedSections.admin ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <Building2 size={16} className="text-blue-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    {tx('hospital.messages.conversationList.sections.admin', 'Admin')}
                  </span>
                  <span className="text-[10px] font-medium bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                    {adminConvos.length}
                  </span>
                </div>
                {adminUnread > 0 && (
                  <span className="text-[10px] font-bold bg-rose-500 text-white px-1.5 py-0.5 rounded-full">
                    {adminUnread}
                  </span>
                )}
              </button>
              {expandedSections.admin && (
                <div>
                  {adminConvos.length > 0 ? (
                    adminConvos.map((c) => (
                      <ChatItem
                        key={c.id}
                        conversation={c}
                        isSelected={selectedId === c.id}
                        isFlashing={flashConversationId === c.id}
                        onClick={() => setSelectedId(c.id)}
                        isAdmin
                      />
                    ))
                  ) : (
                    <div className="px-4 py-6 flex flex-col items-center justify-center text-slate-400 gap-2">
                      <User size={24} className="opacity-50" />
                      <span className="text-xs font-medium">
                        {tx('hospital.messages.conversationList.empty.noConversations', 'No conversations')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Patient Conversations Section */}
            <div className="py-2">
              <button
                onClick={() => toggleSection('patient')}
                className="w-full px-4 py-2 flex items-center justify-between text-slate-500 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expandedSections.patient ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <Users size={16} className="text-cyan-500" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    {tx('hospital.messages.conversationList.sections.patients', 'Patients')}
                  </span>
                  <span className="text-[10px] font-medium bg-slate-100 px-1.5 py-0.5 rounded text-slate-500">
                    {patientConvos.length}
                  </span>
                </div>
                {patientUnread > 0 && (
                  <span className="text-[10px] font-bold bg-rose-500 text-white px-1.5 py-0.5 rounded-full">
                    {patientUnread}
                  </span>
                )}
              </button>
              {expandedSections.patient && (
                <div>
                  {patientConvos.length > 0 ? (
                    patientConvos.map((c) => (
                      <ChatItem
                        key={c.id}
                        conversation={c}
                        isSelected={selectedId === c.id}
                        isFlashing={flashConversationId === c.id}
                        onClick={() => setSelectedId(c.id)}
                        isAdmin={false}
                      />
                    ))
                  ) : (
                    <div className="px-4 py-6 flex flex-col items-center justify-center text-slate-400 gap-2">
                      <User size={24} className="opacity-50" />
                      <span className="text-xs font-medium">
                        {tx('hospital.messages.conversationList.empty.noConversations', 'No conversations')}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center: Chat Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedId && selectedConvo ? (
            <>
              {/* Privacy Notice */}
              <div className="bg-orange-50 border-b border-orange-100 px-6 py-2.5 flex items-center justify-center gap-2 text-orange-600 shrink-0">
                <ShieldAlert size={14} />
                <span className="text-xs font-medium">
                  {tx(
                    'hospital.portal.messages.chat.privacyNotice',
                    'Privacy Notice: Patient contact information is hidden for privacy.',
                  )}
                </span>
              </div>
              {isMessagesLoading ? (
                <div className="flex flex-1 items-center justify-center bg-slate-50/40">
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
                    {tx('hospital.portal.messages.chat.loadingConversation', 'Loading conversation...')}
                  </div>
                </div>
              ) : isMessagesError ? (
                <div className="flex flex-1 items-center justify-center px-6">
                  <EmptyState
                    icon={<MessageSquare size={48} />}
                    title={tx('hospital.portal.messages.chat.loadFailed', 'Conversation failed to load')}
                    description={messagesError instanceof Error
                      ? messagesError.message
                      : tx(
                        'hospital.portal.messages.chat.loadFailedDescription',
                        'Unable to load conversation messages.',
                      )}
                  />
                </div>
	              ) : (
	                <>
	                  {activeTranslationState && (
	                    <div className="mx-6 mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
	                      <div className="flex items-center justify-between gap-3">
	                        <div className="min-w-0">
	                          <div className="font-medium text-slate-900 truncate">
	                            {activeTranslationState.fileName}
	                          </div>
	                          <div className="mt-1 text-xs text-slate-500">
	                            {activeTranslationState.status === 'translating'
	                              ? tx(
                                  'hospital.portal.messages.preview.translatingTo',
                                  'Translating to {language}...',
                                  { language: formatPreviewLanguageLabel(activeTranslationState.targetLanguage) },
                                )
	                              : activeTranslationState.status === 'ready'
	                                ? tx(
                                    'hospital.portal.messages.preview.translationReady',
                                    'Translation ready in {language}. Reopening this PDF will reuse the cached result.',
                                    { language: formatPreviewLanguageLabel(activeTranslationState.targetLanguage) },
                                  )
	                                : activeTranslationState.status === 'failed'
	                                  ? tx(
                                      'hospital.portal.messages.preview.translationFailedWithError',
                                      'Translation failed: {message}',
                                      { message: activeTranslationState.error ?? '' },
                                    )
	                                  : tx('hospital.portal.messages.preview.translationIdle', 'Translation idle')}
	                          </div>
	                        </div>
	                        <span
	                          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
	                            activeTranslationState.status === 'translating'
	                              ? 'bg-amber-100 text-amber-700'
	                              : activeTranslationState.status === 'ready'
	                                ? 'bg-emerald-100 text-emerald-700'
	                                : activeTranslationState.status === 'failed'
	                                  ? 'bg-rose-100 text-rose-700'
	                                  : 'bg-slate-100 text-slate-600'
	                          }`}
	                        >
	                          {activeTranslationState.status === 'translating'
                              ? tx('hospital.portal.messages.preview.status.translating', 'Translating')
                              : activeTranslationState.status === 'ready'
                                ? tx('hospital.portal.messages.preview.status.ready', 'Ready')
                                : activeTranslationState.status === 'failed'
                                  ? tx('hospital.portal.messages.preview.status.failed', 'Failed')
                                  : tx('hospital.portal.messages.preview.status.idle', 'Idle')}
	                        </span>
	                      </div>
	                    </div>
	                  )}
	                  <ChatLayout
	                    messages={messages}
	                    onSend={handleSend}
	                    isSending={isSending}
	                    showTranslation={showTranslation}
	                    onToggleTranslation={setShowTranslation}
	                    showRetranslate={false}
	                    currentUserRole="HOSPITAL"
	                    onUploadFiles={handleUploadFiles}
	                    isUploading={isUploading}
	                    onOpenAttachment={handleOpenAttachment}
                      labels={chatLayoutLabels}
                      formatMessageTime={formatChatMessageTime}
                      formatDateDivider={formatChatDateDivider}
                      formatAttachmentImageAlt={formatChatAttachmentImageAlt}
                      formatAttachmentTypeLabel={formatChatAttachmentTypeLabel}
	                    header={{
	                      name: caseDetail?.patient?.name
                          ?? selectedConvo.patientName
                          ?? selectedConvo.title
                          ?? tx('hospital.messages.chat.unknown', 'Unknown'),
	                      subtitle: caseDetail?.caseNumber ?? undefined,
	                      isOnline: undefined,
	                      categoryBadge: selectedConvo.category === 'ADMIN_HOSPITAL'
                          ? tx('hospital.messages.chat.admin', 'Admin')
                          : undefined,
	                      isAdminConversation: selectedConvo.category === 'ADMIN_HOSPITAL',
	                    }}
	                    showInfoToggle={!!selectedConvo.caseId}
	                    onToggleInfo={() => setShowInfoPanel((prev) => !prev)}
	                    infoPanelOpen={showInfoPanel}
	                    inputNotice={
	                      selectedConvo.category !== 'ADMIN_HOSPITAL' ? (
	                        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
	                          <Info size={14} className="text-amber-600 shrink-0" />
	                          <p className="text-xs text-amber-700">
	                            {tx(
                                'hospital.portal.messages.chat.forwardingNotice',
                                'Messages are automatically forwarded to the patient via their preferred communication channel (Email/WhatsApp).',
                              )}
	                          </p>
	                        </div>
	                      ) : undefined
	                    }
	                    emptyState={
	                      <EmptyState
	                        icon={<MessageSquare size={48} />}
	                        title={tx('hospital.messages.chat.noMessages', 'No messages yet')}
	                        description={tx(
                            'hospital.portal.messages.chat.emptyDescription',
                            'Start the conversation by sending a message.',
                          )}
	                      />
	                    }
	                    className="flex-1"
	                  />
	                </>
	              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <MessageSquare size={48} className="mx-auto mb-4 text-slate-200" />
                <p className="text-lg font-medium text-slate-500">
                  {tx('hospital.portal.messages.chat.selectConversationTitle', 'Select a conversation')}
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  {tx(
                    'hospital.portal.messages.chat.selectConversationDescription',
                    'Choose a conversation from the list to start chatting.',
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Case / Patient Info */}
        {selectedId && selectedConvo && showInfoPanel && (
          <div className="w-[280px] border-l border-slate-200/50 shrink-0 overflow-y-auto bg-white p-4">
            <MessageCaseDetailPanel
              caseId={selectedConvo.caseId ?? null}
              caseNumber={caseDetail?.caseNumber ?? null}
              category={selectedConvo.category ?? null}
              participantRole={selectedConvo.category === 'ADMIN_HOSPITAL'
                ? tx('hospital.messages.chat.admin', 'Admin')
                : tx('hospital.portal.messages.chat.patient', 'Patient')}
              participantName={caseDetail?.patient?.name ?? selectedConvo.patientName ?? selectedConvo.title ?? null}
              patientCode={caseDetail?.patient?.code ?? null}
              patientAge={caseDetail?.patient?.age ?? null}
              patientGender={
                caseDetail?.patient?.gender === 'MALE'
                  ? 'M'
                  : caseDetail?.patient?.gender === 'FEMALE'
                    ? 'F'
                    : caseDetail?.patient?.gender ?? null
              }
              patientLanguage={caseDetail?.patient?.language ?? null}
              caseStatus={caseDetail?.displayStatus ?? null}
              diagnosis={caseDetail?.medicalCondition?.primaryDiagnosis ?? null}
              documentCount={caseDetail?.documents?.length ?? null}
              messageCount={caseDetail?.totalMessages ?? messages.length}
              conversationTitle={selectedConvo.title ?? tx('hospital.portal.messages.chat.generalConversation', 'General')}
              caseLinkHref={selectedConvo.caseId ? `/cases/${selectedConvo.caseId}` : null}
              caseLinkLabel={tx('hospital.messages.chat.viewFullCaseDetails', 'View Full Case Details')}
              labels={messageCasePanelLabels}
              formatCategoryLabel={formatConversationCategoryLabel}
              formatLanguageLabel={(language) => getLocalizedLanguageLabel(language, locale)}
              formatStatusLabel={(status) => getHospitalStatusLabel(status, t)}
              formatGenderLabel={(gender) => getHospitalGenderShortLabel(gender, t)}
              formatAgeLabel={(age) => tx('hospital.common.ageYears', '{age} y/o', { age })}
              formatParticipantRoleLabel={formatParticipantRoleLabel}
            />
          </div>
        )}
      </div>

      {/* New Conversation Modal */}
      <NewConversationModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        conversations={conversations}
        onSelectConversation={(id, category) => {
          revealConversation(id, category);
          setShowNewModal(false);
        }}
      />

      <Modal
        open={!!previewAttachment}
        onClose={handleCloseAttachmentPreview}
        title={previewAttachment?.name ?? tx('hospital.portal.messages.preview.modalTitle', 'Attachment Preview')}
        maxWidth="max-w-7xl"
      >
        {previewAttachment && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  {tx('hospital.portal.messages.preview.original', 'Original')}
                </h3>
                <span className="text-xs text-slate-500">
                  {previewAttachment.type ?? tx('hospital.portal.messages.preview.attachmentType', 'attachment')}
                </span>
              </div>
              <div className="h-[70vh] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                {isImageAttachment(previewAttachment) && previewAttachment.url ? (
                  <img
                    src={previewAttachment.url}
                    alt={previewAttachment.name ?? tx('hospital.portal.messages.preview.attachmentAlt', 'Attachment')}
                    className="h-full w-full object-contain bg-slate-950/5"
                  />
                ) : isPdfAttachment(previewAttachment) && previewAttachment.url ? (
                  <PdfPreview
                    title={`${previewAttachment.name ?? fallbackAttachmentLabel} ${tx('hospital.portal.messages.preview.originalLower', 'original')}`}
                    url={buildPdfPreviewUrl(previewAttachment.url, previewAttachment.name ?? fallbackPreviewFileName)}
                    className="bg-slate-50"
                    labels={previewPdfLabels}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                    {tx('hospital.portal.messages.preview.unavailableForType', 'Preview is not available for this file type.')}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  {tx('hospital.portal.messages.preview.translated', 'Translated')}
                </h3>
                <span className="text-xs text-slate-500">
                  {isPdfAttachment(previewAttachment)
                    ? tx('hospital.portal.messages.preview.targetLanguage', 'Target: {language}', {
                      language: localizedPortalLanguage,
                    })
                    : tx('hospital.portal.messages.preview.previewOnly', 'Preview only')}
                </span>
              </div>
              <div className="h-[70vh] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                {isPdfAttachment(previewAttachment) ? (
                  isTranslatingPreview ? (
                    <AsyncStatusCard
                      title={tx('hospital.portal.messages.preview.translatingTitle', 'Translating PDF preview')}
                      description={tx(
                        'hospital.portal.messages.preview.translatingDescription',
                        'BabelDOC is preparing a {language} preview for {fileName}.',
                        {
                          language: localizedPortalLanguage,
                          fileName: activeTranslationState?.fileName
                            ?? previewAttachment.name
                            ?? tx('hospital.portal.messages.preview.thisDocument', 'this document'),
                        },
                      )}
                      progressLabel={tx('hospital.portal.messages.preview.processing', 'Live processing in progress')}
                    />
                  ) : translatedPreviewUrl ? (
                    <PdfPreview
                      title={`${previewAttachment.name ?? fallbackAttachmentLabel} ${tx('hospital.portal.messages.preview.translatedLower', 'translated')}`}
                      url={translatedPreviewUrl}
                      className="bg-slate-50"
                      labels={previewPdfLabels}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                      {translationError ?? tx('hospital.portal.messages.preview.notAvailable', 'Translation preview is not available.')}
                    </div>
                  )
                ) : isImageAttachment(previewAttachment) ? (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                    {tx(
                      'hospital.portal.messages.preview.imageOnlyNote',
                      'Image preview is supported here. Structured image or scanned-document translation is not enabled yet in this BabelDOC flow.',
                    )}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-500">
                    {tx(
                      'hospital.portal.messages.preview.pdfOnlyNote',
                      'Translation preview is currently available for PDF attachments only.',
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ── Chat Item ─────────────────────────────────────────────────────── */

function ChatItem({
  conversation,
  isSelected,
  isFlashing,
  onClick,
  isAdmin,
}: {
  conversation: ConversationSummary;
  isSelected: boolean;
  isFlashing: boolean;
  onClick: () => void;
  isAdmin: boolean;
}) {
  const { locale, t } = useHospitalI18n();
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t(key, values, fallback);
  const name = conversation.patientName ?? conversation.title ?? tx('hospital.portal.messages.chat.conversation', 'Conversation');
  const initials = getInitials(name);
  const unread = conversation.unreadCount ?? 0;

  return (
    <div
      onClick={onClick}
      data-conversation-item-id={conversation.id}
      className={`relative p-3 flex items-start gap-3 cursor-pointer transition-all border-l-2 ${
        isSelected ? 'bg-cyan-50/50 border-cyan-500' : 'border-transparent hover:bg-slate-50'
      } ${isFlashing ? 'animate-pulse bg-amber-50 ring-1 ring-inset ring-amber-300' : ''}`}
    >
      <div className="relative shrink-0">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-sm ${
            isAdmin
              ? 'bg-gradient-to-tr from-blue-500 to-purple-500'
              : 'bg-gradient-to-tr from-cyan-500 to-emerald-500'
          }`}
        >
          {initials}
        </div>
        {unread > 0 && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-white">
            {unread > 9 ? '9+' : unread}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span
            className={`font-semibold text-sm truncate ${isSelected ? 'text-cyan-700' : 'text-slate-900'}`}
          >
            {name}
          </span>
          <span className="text-[10px] text-slate-400 shrink-0 ml-2">
            {formatMessageTime(conversation.updatedAt ?? '', locale, tx)}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate">{conversation.lastMessagePreview ?? ''}</p>
      </div>
    </div>
  );
}

/* ── New Conversation Modal ────────────────────────────────────────── */

function NewConversationModal({
  open,
  onClose,
  conversations,
  onSelectConversation,
}: {
  open: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
  onSelectConversation: (id: string, category: 'ADMIN_HOSPITAL' | 'HOSPITAL_PATIENT') => void;
}) {
  const { t } = useHospitalI18n();
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t(key, values, fallback);
  const [caseSearch, setCaseSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const { data: casesData, isPending: casesLoading } = useCases({ limit: '100' });
  const casesResponse = casesData as PaginatedResponse<CaseSummary> | undefined;
  const allCases = casesResponse?.data ?? [];

  // Build maps: caseId → conversationId for each category
  const patientConvMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations) {
      if (c.caseId && c.category === 'HOSPITAL_PATIENT') {
        map.set(c.caseId, c.id);
      }
    }
    return map;
  }, [conversations]);

  const adminConvMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations) {
      if (c.caseId && c.category === 'ADMIN_HOSPITAL') {
        map.set(c.caseId, c.id);
      }
    }
    return map;
  }, [conversations]);

  // Check if a general admin conversation (no case) exists
  const generalAdminConvId = useMemo(() => {
    const conv = conversations.find((c) => c.category === 'ADMIN_HOSPITAL' && !c.caseId);
    return conv?.id ?? null;
  }, [conversations]);

  const filteredCases = allCases.filter((c) => {
    if (!caseSearch) return true;
    const q = caseSearch.toLowerCase();
    return (
      (c.patientName ?? '').toLowerCase().includes(q) ||
      (c.caseNumber ?? '').toLowerCase().includes(q) ||
      (c.medicalCondition ?? '').toLowerCase().includes(q)
    );
  });

  const handleCreate = async (caseId: string | undefined, category: string) => {
    setIsSubmitting(true);
    try {
      const payload = caseId ? { caseId, category } : { category };
      const result = await createConversation(payload) as { id?: string };
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (result?.id) {
        onSelectConversation(result.id, category as 'ADMIN_HOSPITAL' | 'HOSPITAL_PATIENT');
      }
      onClose();
    } catch {
      // Error handled by apiClient
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCaseList = (convMap: Map<string, string>, category: string) => (
    <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200/60 bg-white">
      {casesLoading ? (
        <div className="py-6 text-center text-sm text-slate-400">
          {tx('hospital.portal.messages.newConversation.loadingCases', 'Loading cases...')}
        </div>
      ) : filteredCases.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400">
          <FolderOpen size={20} className="mx-auto mb-1.5 opacity-50" />
          {tx('hospital.portal.messages.newConversation.noCasesFound', 'No cases found')}
        </div>
      ) : (
        filteredCases.map((c) => {
          const existingConvId = convMap.get(c.id);
          return (
            <button
              key={c.id}
              onClick={() => {
                if (existingConvId) {
                  onSelectConversation(existingConvId, category as 'ADMIN_HOSPITAL' | 'HOSPITAL_PATIENT');
                } else {
                  handleCreate(c.id, category);
                }
              }}
              disabled={isSubmitting}
              className={`w-full px-4 py-3 flex items-center gap-3 text-left border-b border-slate-100 last:border-b-0 transition-colors disabled:opacity-50 ${
                existingConvId
                  ? 'bg-emerald-50/50 hover:bg-emerald-50'
                  : 'hover:bg-blue-50'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                  existingConvId ? 'bg-emerald-100 text-emerald-600' : 'bg-indigo-100 text-indigo-600'
                }`}
              >
                {getInitials(c.patientName ?? tx('hospital.portal.messages.newConversation.unknownInitial', 'U'))}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-slate-900 truncate">
                    {c.patientName ?? tx('hospital.messages.conversationList.newConversationDialog.unknownPatient', 'Unknown')}
                  </span>
                  {c.caseNumber && (
                    <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">{c.caseNumber}</span>
                  )}
                </div>
                {c.medicalCondition && <p className="text-xs text-slate-500 truncate mt-0.5">{c.medicalCondition}</p>}
              </div>
              {existingConvId ? (
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                  <MessageSquare size={10} /> {tx('hospital.portal.messages.newConversation.goToChat', 'Go to Chat')}
                </span>
              ) : (
                <span className="text-[10px] font-medium text-blue-500 opacity-0 group-hover:opacity-100 shrink-0">
                  {tx('hospital.portal.messages.newConversation.newBadge', '+ New')}
                </span>
              )}
            </button>
          );
        })
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tx('hospital.portal.messages.newConversation.title', 'New Conversation')}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-6">
        {/* Search (shared for both sections) */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={tx(
              'hospital.portal.messages.newConversation.searchPlaceholder',
              'Search cases by patient, case number...',
            )}
            value={caseSearch}
            onChange={(e) => setCaseSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        {/* Section 1: Message Admin */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-lg bg-purple-100 flex items-center justify-center">
              <MessageSquarePlus size={14} className="text-purple-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700">
              {tx('hospital.portal.messages.newConversation.messageAdmin', 'Message Admin')}
            </h3>
          </div>

          {/* General admin message (no case) */}
          <button
            onClick={() => {
              if (generalAdminConvId) {
                onSelectConversation(generalAdminConvId, 'ADMIN_HOSPITAL');
              } else {
                handleCreate(undefined, 'ADMIN_HOSPITAL');
              }
            }}
            disabled={isSubmitting}
            className="w-full mb-3 p-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex items-center gap-3 hover:shadow-md hover:shadow-indigo-500/20 transition-all text-left disabled:opacity-50"
          >
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <MessageSquarePlus size={16} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-sm">
                {tx('hospital.messages.conversationList.newConversationDialog.generalMessage.title', 'General Message')}
              </div>
              <div className="text-xs text-indigo-100">
                {tx('hospital.portal.messages.newConversation.noCaseAttached', 'No case attached')}
              </div>
            </div>
            {generalAdminConvId && (
              <span className="text-[10px] font-semibold text-white/90 bg-white/20 px-2 py-0.5 rounded-full">
                {tx('hospital.portal.messages.newConversation.goToChat', 'Go to Chat')}
              </span>
            )}
          </button>

          {/* Case-specific admin messages */}
          <p className="text-xs text-slate-400 mb-2">
            {tx(
              'hospital.portal.messages.newConversation.messageAdminCaseHint',
              'Or message admin about a specific case:',
            )}
          </p>
          {renderCaseList(adminConvMap, 'ADMIN_HOSPITAL')}
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-200" />

        {/* Section 2: Message Patient */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-lg bg-blue-100 flex items-center justify-center">
              <MessageSquare size={14} className="text-blue-600" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700">
              {tx('hospital.portal.messages.newConversation.messagePatient', 'Message Patient')}
            </h3>
            <span className="text-xs text-slate-400">
              {tx('hospital.portal.messages.newConversation.selectCaseHint', '(select a case)')}
            </span>
          </div>
          {renderCaseList(patientConvMap, 'HOSPITAL_PATIENT')}
        </div>

        <div className="flex justify-end pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {tx('hospital.portal.messages.newConversation.close', 'Close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
