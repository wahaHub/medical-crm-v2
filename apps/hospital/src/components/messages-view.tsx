'use client';

import { useState, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
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
  ExternalLink,
  Globe,
  Info,
} from 'lucide-react';
import {
  ChatLayout,
  type ChatMessage,
  Button,
  EmptyState,
  Modal,
} from '@medical-crm/ui';
import { useAuth } from '@/lib/auth-context';
import { useConversations } from '@/queries/use-conversations';
import { useMessages } from '@/queries/use-messages';
import { useCases, useCase } from '@/queries/use-cases';
import { sendMessage, sendMessageWithAttachments, createConversation, uploadFile } from '@/actions/message-actions';
import type { PaginatedResponse, ConversationSummary, CaseSummary, HospitalCaseDetail } from '@/lib/api-types';

/** Raw message shape from the backend API */
interface ApiMessage {
  id: string;
  conversationId: string;
  senderId: string;
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

/** Map raw API messages to the ChatMessage shape expected by the UI */
function mapApiMessages(
  raw: ApiMessage[],
  options: {
    conversationCategory?: string;
    otherPartyName?: string;
    currentUserId?: string;
  },
): ChatMessage[] {
  const otherPartyRole = options.conversationCategory === 'ADMIN_HOSPITAL' ? 'ADMIN' : 'PATIENT';
  const otherPartyName = options.otherPartyName
    ?? (options.conversationCategory === 'ADMIN_HOSPITAL' ? 'Admin' : 'Patient');

  return raw.map((m) => ({
    id: m.id,
    content: m.content,
    translatedContent: m.translatedContent ?? null,
    senderRole: m.senderId === options.currentUserId ? 'HOSPITAL' : otherPartyRole,
    senderName: m.senderId === options.currentUserId ? 'Hospital' : otherPartyName,
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
    })),
    aiSummary: m.aiSummary ?? null,
  }));
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

function formatMessageTime(dateStr: string) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function MessagesView({ initialConversations, initialConversationId }: MessagesViewProps) {
  const { user } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(initialConversationId ?? null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [expandedSections, setExpandedSections] = useState({ admin: true, patient: true });
  const [showTranslation, setShowTranslation] = useState(true);
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const queryClient = useQueryClient();

  const { data: liveConversations } = useConversations();
  const liveResponse = liveConversations as PaginatedResponse<ConversationSummary> | undefined;
  const conversations: ConversationSummary[] = liveResponse?.data ?? initialConversations?.data ?? [];
  const selectedConvo = conversations.find((c) => c.id === selectedId);

  const { data: messagesData } = useMessages(selectedId ?? '');
  const messagesResponse = messagesData as PaginatedResponse<ApiMessage> | undefined;
  const messages: ChatMessage[] = useMemo(
    () => mapApiMessages(messagesResponse?.data ?? [], {
      conversationCategory: selectedConvo?.category,
      otherPartyName: selectedConvo?.patientName ?? selectedConvo?.title ?? undefined,
      currentUserId: user.id,
    }),
    [messagesResponse?.data, selectedConvo?.category, selectedConvo?.patientName, selectedConvo?.title, user.id],
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

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)]">
      {/* CRM Forwarding Info Banner */}
      <div className="bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-3 flex items-center justify-between rounded-t-2xl shadow-sm">
        <div className="flex items-center gap-3 text-white">
          <MessageSquare size={18} className="opacity-90" />
          <span className="text-sm font-medium">
            All patient communications are automatically forwarded and synced to this CRM.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-1 bg-blue-500/20 text-blue-50 border border-blue-400/30 rounded-md text-xs font-semibold flex items-center gap-1.5 backdrop-blur-sm">
            <Mail size={12} /> Email
          </span>
          <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-50 border border-emerald-400/30 rounded-md text-xs font-semibold flex items-center gap-1.5 backdrop-blur-sm">
            <MessageCircle size={12} /> WhatsApp
          </span>
          <span className="px-2.5 py-1 bg-amber-500/20 text-amber-50 border border-amber-400/30 rounded-md text-xs font-semibold flex items-center gap-1.5 backdrop-blur-sm">
            <Sparkles size={12} /> Auto-Classification
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden rounded-b-2xl bg-white shadow-sm">
        {/* Left Sidebar: Conversation List */}
        <div className="w-[340px] border-r border-slate-200/50 flex flex-col shrink-0 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.05)]">
          <div className="p-4 border-b border-slate-100 space-y-4">
            <button
              onClick={() => setShowNewModal(true)}
              className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 shadow-sm shadow-cyan-500/20 transition-all"
            >
              <Plus size={16} /> New Conversation
            </button>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search conversations..."
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
                  <span className="text-xs font-semibold uppercase tracking-wider">Admin</span>
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
                        onClick={() => setSelectedId(c.id)}
                        isAdmin
                      />
                    ))
                  ) : (
                    <div className="px-4 py-6 flex flex-col items-center justify-center text-slate-400 gap-2">
                      <User size={24} className="opacity-50" />
                      <span className="text-xs font-medium">No conversations</span>
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
                  <span className="text-xs font-semibold uppercase tracking-wider">Patients</span>
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
                        onClick={() => setSelectedId(c.id)}
                        isAdmin={false}
                      />
                    ))
                  ) : (
                    <div className="px-4 py-6 flex flex-col items-center justify-center text-slate-400 gap-2">
                      <User size={24} className="opacity-50" />
                      <span className="text-xs font-medium">No conversations</span>
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
                  Privacy Notice: Patient contact information is hidden for privacy.
                </span>
              </div>
              <ChatLayout
                messages={messages}
                onSend={handleSend}
                isSending={isSending}
                showTranslation={showTranslation}
                onToggleTranslation={setShowTranslation}
                showRetranslate={false}
                currentUserRole="HOSPITAL"
                currentUserId={user.id}
                onUploadFiles={handleUploadFiles}
                isUploading={isUploading}
                header={{
                  name: caseDetail?.patient?.name ?? selectedConvo.patientName ?? selectedConvo.title ?? 'Unknown',
                  subtitle: caseDetail?.caseNumber ?? undefined,
                  isOnline: undefined,
                  categoryBadge: selectedConvo.category === 'ADMIN_HOSPITAL' ? 'Admin' : undefined,
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
                        Messages are automatically forwarded to the patient via their preferred communication channel (Email/WhatsApp).
                      </p>
                    </div>
                  ) : undefined
                }
                emptyState={
                  <EmptyState
                    icon={<MessageSquare size={48} />}
                    title="No messages yet"
                    description="Start the conversation by sending a message."
                  />
                }
                className="flex-1"
              />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <MessageSquare size={48} className="mx-auto mb-4 text-slate-200" />
                <p className="text-lg font-medium text-slate-500">Select a conversation</p>
                <p className="text-sm text-slate-400 mt-1">
                  Choose a conversation from the list to start chatting.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Case / Patient Info */}
        {selectedId && selectedConvo && showInfoPanel && (
          <div className="w-[280px] border-l border-slate-200/50 flex flex-col shrink-0 overflow-y-auto bg-white">
            {/* Header with avatar */}
            <div className="p-6 flex flex-col items-center text-center border-b border-slate-100">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-500 flex items-center justify-center text-white text-2xl font-bold mb-3 shadow-lg shadow-cyan-200/50">
                {getInitials(caseDetail?.patient?.name ?? selectedConvo.patientName ?? 'U')}
              </div>
              <h3 className="font-semibold text-slate-900 text-lg">
                {caseDetail?.patient?.name ?? selectedConvo.patientName ?? selectedConvo.title ?? 'Unknown'}
              </h3>
              {selectedConvo.caseId && caseDetail?.caseNumber && (
                <span className="mt-1 text-[10px] font-medium px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-500">
                  {caseDetail.caseNumber}
                </span>
              )}
              {selectedConvo.category && (
                <span className="mt-1.5 text-xs font-medium px-2 py-0.5 rounded border border-slate-200 text-slate-500">
                  {selectedConvo.category === 'ADMIN_HOSPITAL' ? 'Admin' : 'Patient'}
                </span>
              )}
            </div>

            {/* Details */}
            <div className="flex-1 p-6 space-y-5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Conversation
                </div>
                <div className="text-sm text-slate-700">{selectedConvo.title ?? 'General'}</div>
              </div>

              {selectedConvo.category !== 'ADMIN_HOSPITAL' && (
                <>
                  {/* Patient Name */}
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Patient Name
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <p className="text-sm text-slate-700 font-medium">
                        {caseDetail?.patient?.name ?? selectedConvo.patientName ?? '\u2014'}
                      </p>
                    </div>
                  </div>

                  {/* Patient Code */}
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Patient Code
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <p className="text-sm text-slate-700 font-medium">
                        {caseDetail?.patient?.code ?? '\u2014'}
                      </p>
                    </div>
                  </div>

                  {/* Primary Diagnosis */}
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Primary Diagnosis
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <p className="text-sm text-slate-700 font-medium">
                        {caseDetail?.medicalCondition?.primaryDiagnosis ?? '\u2014'}
                      </p>
                    </div>
                  </div>

                  {/* Language */}
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Language
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe size={14} className="text-blue-500" />
                      <span className="text-sm text-slate-700 font-medium">
                        {caseDetail?.patient?.language
                          ? caseDetail.patient.language === 'zh'
                            ? 'Chinese'
                            : caseDetail.patient.language === 'en'
                              ? 'English'
                              : caseDetail.patient.language === 'es'
                                ? 'Spanish'
                                : caseDetail.patient.language
                          : '\u2014'}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* View Full Case Details link (Issue 3) */}
            {selectedConvo.caseId && (
              <div className="p-4 border-t border-slate-100 bg-slate-50/50">
                <Link
                  href={`/cases/${selectedConvo.caseId}`}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 rounded-lg shadow-sm text-sm font-medium transition-colors"
                >
                  <ExternalLink size={14} />
                  View Full Case Details
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* New Conversation Modal */}
      <NewConversationModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        conversations={conversations}
      />
    </div>
  );
}

/* ── Chat Item ─────────────────────────────────────────────────────── */

function ChatItem({
  conversation,
  isSelected,
  onClick,
  isAdmin,
}: {
  conversation: ConversationSummary;
  isSelected: boolean;
  onClick: () => void;
  isAdmin: boolean;
}) {
  const name = conversation.patientName ?? conversation.title ?? 'Conversation';
  const initials = getInitials(name);
  const unread = conversation.unreadCount ?? 0;

  return (
    <div
      onClick={onClick}
      className={`relative p-3 flex items-start gap-3 cursor-pointer transition-colors border-l-2 ${
        isSelected ? 'bg-cyan-50/50 border-cyan-500' : 'border-transparent hover:bg-slate-50'
      }`}
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
            {formatMessageTime(conversation.updatedAt ?? '')}
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
}: {
  open: boolean;
  onClose: () => void;
  conversations: ConversationSummary[];
}) {
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [caseSearch, setCaseSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const queryClient = useQueryClient();
  const { data: casesData, isPending: casesLoading } = useCases({ limit: '100' });
  const casesResponse = casesData as PaginatedResponse<CaseSummary> | undefined;
  const allCases = casesResponse?.data ?? [];

  // Build case-to-conversation mapping (Issue 1)
  const caseConversationMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations) {
      if (c.caseId) {
        map.set(c.caseId, c.id);
      }
    }
    return map;
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

  const handleCreateForCase = async () => {
    if (!selectedCaseId) return;
    setIsSubmitting(true);
    try {
      await createConversation({ caseId: selectedCaseId, category: 'HOSPITAL_PATIENT' });
      setSelectedCaseId(null);
      setCaseSearch('');
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
    } catch {
      // Error handled by apiClient
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdminMessage = async () => {
    setIsSubmitting(true);
    try {
      await createConversation({ caseId: '', category: 'ADMIN_HOSPITAL' });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onClose();
    } catch {
      // Error handled by apiClient
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Conversation">
      <div className="space-y-6">
        {/* Header description */}
        <p className="text-sm text-slate-500">
          Start a new conversation with an admin or a patient case.
        </p>

        {/* General Admin Message Button */}
        <button
          onClick={handleAdminMessage}
          disabled={isSubmitting}
          className="w-full p-4 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white flex items-center gap-4 hover:shadow-md hover:shadow-indigo-500/20 transition-all text-left disabled:opacity-50"
        >
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <MessageSquarePlus size={20} className="text-white" />
          </div>
          <div>
            <div className="font-semibold">General Message</div>
            <div className="text-sm text-indigo-100">Create a general admin conversation</div>
          </div>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-slate-200" />
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Or select a Case
          </div>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        {/* Case Search & List */}
        <div className="space-y-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search cases by patient, case number..."
              value={caseSearch}
              onChange={(e) => setCaseSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>

          <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200/60 bg-white">
            {casesLoading ? (
              <div className="py-8 text-center text-sm text-slate-400">Loading cases...</div>
            ) : filteredCases.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-400">
                <FolderOpen size={24} className="mx-auto mb-2 opacity-50" />
                No cases found
              </div>
            ) : (
              filteredCases.map((c) => {
                const hasConversation = caseConversationMap.has(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCaseId(c.id)}
                    className={`w-full px-4 py-3 flex items-center gap-3 text-left border-b border-slate-100 last:border-b-0 transition-colors ${
                      hasConversation
                        ? selectedCaseId === c.id
                          ? 'bg-emerald-50 border-l-2 border-l-emerald-500'
                          : 'bg-emerald-50/50 hover:bg-emerald-50 border-l-2 border-l-emerald-300'
                        : selectedCaseId === c.id
                          ? 'bg-blue-50 border-l-2 border-l-blue-500'
                          : 'hover:bg-slate-50 border-l-2 border-l-transparent'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                        hasConversation
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-indigo-100 text-indigo-600'
                      }`}
                    >
                      {getInitials(c.patientName ?? 'U')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-slate-900 truncate">
                          {c.patientName ?? 'Unknown'}
                        </span>
                        {c.caseNumber && (
                          <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                            {c.caseNumber}
                          </span>
                        )}
                      </div>
                      {c.medicalCondition && (
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {c.medicalCondition}
                        </p>
                      )}
                    </div>
                    {hasConversation && (
                      <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1">
                        <MessageSquare size={10} />
                        Has Conversation
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreateForCase} disabled={isSubmitting || !selectedCaseId}>
            {isSubmitting ? 'Creating...' : 'Create Conversation'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
