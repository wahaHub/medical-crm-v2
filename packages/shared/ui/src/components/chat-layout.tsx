'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { cn } from '../lib/cn';

/** Attachment metadata for file/image messages */
export interface ChatAttachment {
  id?: string;
  name?: string;
  type?: string;
  url?: string;
  size?: number;
  storageKey?: string;
}

export interface ChatMessage {
  id: string;
  content: string;
  translatedContent?: string | null;
  senderRole: 'ADMIN' | 'HOSPITAL' | 'PATIENT';
  senderName: string;
  senderId?: string;
  createdAt: string;
  isAiTranslated?: boolean;
  /** Message type: TEXT, IMAGE, FILE */
  messageType?: string;
  /** File attachments */
  attachments?: ChatAttachment[];
  /** AI-generated summary (for file/image messages) */
  aiSummary?: string | null;
}

/** Header configuration for the chat area */
export interface ChatHeaderConfig {
  /** Conversation display name (patient name, admin, etc.) */
  name: string;
  /** Short subtitle (e.g. online status, case number) */
  subtitle?: string;
  /** Whether the user is online */
  isOnline?: boolean;
  /** Category badge text (e.g. "Admin", "Patient") */
  categoryBadge?: string;
  /** If true, use admin/blue color scheme for the avatar */
  isAdminConversation?: boolean;
}

export interface ChatLayoutProps {
  messages: ChatMessage[];
  onSend: (content: string) => void;
  /** Whether current viewer can send messages in this conversation */
  canSend?: boolean;
  isSending?: boolean;
  patientInfo?: ReactNode;
  showTranslation?: boolean;
  /** Callback when the user toggles the Show Translation checkbox */
  onToggleTranslation?: (value: boolean) => void;
  showRetranslate?: boolean;
  onRetranslate?: (messageId: string) => void;
  currentUserRole?: string;
  /** Current user's ID -- used to identify own messages by senderId (takes priority over senderRole matching) */
  currentUserId?: string;
  emptyState?: ReactNode;
  className?: string;
  /** Header configuration -- if provided, renders a header bar */
  header?: ChatHeaderConfig;
  /** Whether to show the right-panel toggle button (three-dot menu) */
  showInfoToggle?: boolean;
  /** Callback when the info panel toggle is clicked */
  onToggleInfo?: () => void;
  /** Whether the info panel is currently open (affects toggle button styling) */
  infoPanelOpen?: boolean;
  /** Optional notice banner rendered above the input area */
  inputNotice?: ReactNode;
  /** Optional message shown when chat is read-only */
  readOnlyNotice?: ReactNode;
  /** Callback for file upload. If provided, shows a paperclip button in the input area. */
  onUploadFiles?: (files: File[]) => void;
  /** Whether a file upload is in progress */
  isUploading?: boolean;
  /** Optional callback to open a larger attachment preview */
  onOpenAttachment?: (attachment: ChatAttachment) => void;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

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
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDateDivider(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function shouldShowDateDivider(messages: ChatMessage[], index: number): boolean {
  if (index === 0) return true;
  const prev = new Date(messages[index - 1]!.createdAt).toDateString();
  const curr = new Date(messages[index]!.createdAt).toDateString();
  return prev !== curr;
}

/* ── Inline SVG icons (no lucide dependency in shared/ui) ──────── */

function LanguagesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" /><path d="M14 18h6" />
    </svg>
  );
}

function MoreHorizontalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </svg>
  );
}

function PaperclipIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function FileTextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

/* ── Component ──────────────────────────────────────────────────── */

export function ChatLayout({
  messages,
  onSend,
  canSend = true,
  isSending = false,
  patientInfo,
  showTranslation = true,
  onToggleTranslation,
  showRetranslate = false,
  onRetranslate,
  currentUserRole = 'HOSPITAL',
  currentUserId,
  emptyState,
  className,
  header,
  showInfoToggle = false,
  onToggleInfo,
  infoPanelOpen = false,
  inputNotice,
  readOnlyNotice,
  onUploadFiles,
  isUploading = false,
  onOpenAttachment,
}: ChatLayoutProps) {
  const [input, setInput] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
    if (!canSend) return;
    // If there are selected files, upload them first
    if (selectedFiles.length > 0 && onUploadFiles) {
      onUploadFiles(selectedFiles);
      setSelectedFiles([]);
      // Also send text if there is any
      const trimmed = input.trim();
      if (trimmed) {
        onSend(trimmed);
        setInput('');
      }
      return;
    }
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    onSend(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setSelectedFiles((prev) => [...prev, ...Array.from(files)]);
    e.target.value = '';
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // Use senderId matching if currentUserId is provided, otherwise fall back to senderRole matching
  const isOwnMessage = (msg: ChatMessage) => {
    if (msg.senderRole) {
      return msg.senderRole.toUpperCase() === currentUserRole.toUpperCase();
    }
    if (currentUserId && msg.senderId) {
      return msg.senderId === currentUserId;
    }
    return msg.senderRole === currentUserRole;
  };

  // Check if any non-own message has a translation (to decide whether to show the toggle)
  const hasAnyTranslation = messages.some(
    (m) => !isOwnMessage(m) && m.translatedContent,
  );

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* ── Header bar ─────────────────────────────────────────── */}
      {header && (
        <div className="h-16 px-6 border-b border-slate-200 flex items-center justify-between shrink-0 bg-white">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-sm',
                header.isAdminConversation
                  ? 'bg-gradient-to-br from-blue-500 to-indigo-500'
                  : 'bg-gradient-to-br from-cyan-500 to-emerald-500',
              )}
            >
              {getInitials(header.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-800">{header.name}</h2>
                {header.categoryBadge && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-600">
                    {header.categoryBadge}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {header.isOnline != null && (
                  header.isOnline ? (
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-green-500 rounded-full" />
                      <span className="text-xs text-slate-500">Online</span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Offline</span>
                  )
                )}
                {header.subtitle && (
                  <span className="text-xs text-slate-400">{header.subtitle}</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Show Translation toggle */}
            {hasAnyTranslation && onToggleTranslation && (
              <label className="flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-lg hover:bg-purple-50 transition-colors">
                <input
                  type="checkbox"
                  checked={showTranslation}
                  onChange={(e) => onToggleTranslation(e.target.checked)}
                  className="w-4 h-4 text-purple-600 border-purple-300 rounded focus:ring-purple-500 accent-purple-600"
                />
                <span className="text-sm text-slate-600 flex items-center gap-1">
                  <LanguagesIcon className="w-4 h-4 text-purple-500" />
                  Show Translation
                </span>
              </label>
            )}

            {/* Three-dot menu to toggle info panel */}
            {showInfoToggle && onToggleInfo && (
              <button
                onClick={onToggleInfo}
                className={cn(
                  'p-2 rounded-lg text-slate-400 hover:text-cyan-600 transition-colors',
                  infoPanelOpen && 'bg-cyan-50 text-cyan-600',
                )}
              >
                <MoreHorizontalIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Messages area ──────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
            {messages.length === 0 && emptyState}
            {messages.map((msg, i) => {
              const own = isOwnMessage(msg);
              const showDate = shouldShowDateDivider(messages, i);
              return (
                <div key={msg.id}>
                  {/* Date divider */}
                  {showDate && (
                    <div className="flex justify-center mb-6">
                      <span className="px-3 py-1 bg-slate-100 text-slate-400 text-xs font-medium rounded-full">
                        {formatDateDivider(msg.createdAt)}
                      </span>
                    </div>
                  )}

                  {/* Message row with avatar */}
                  <div className={cn('flex gap-3', own ? 'flex-row-reverse' : 'flex-row')}>
                    {/* Sender avatar */}
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-[10px] shrink-0 mt-1 shadow-sm',
                        own
                          ? 'bg-gradient-to-br from-cyan-500 to-emerald-500'
                          : msg.senderRole === 'ADMIN'
                            ? 'bg-gradient-to-br from-blue-500 to-indigo-500'
                            : 'bg-gradient-to-br from-cyan-500 to-emerald-500',
                      )}
                      title={msg.senderName}
                    >
                      {getInitials(msg.senderName || '?')}
                    </div>

                    {/* Bubble + metadata */}
                    <div className={cn('max-w-[70%] flex flex-col space-y-1', own ? 'items-end' : 'items-start')}>
                      {/* Sender name (for non-own messages) */}
                      {!own && (
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                          {msg.senderName}
                        </span>
                      )}

                      {/* Message bubble */}
                      {(msg.content || msg.aiSummary || (showTranslation && msg.translatedContent)) && (
                        <div
                          className={cn(
                            'p-3 rounded-2xl shadow-sm text-sm leading-relaxed',
                            own
                              ? 'bg-cyan-600 rounded-tr-none text-white'
                              : 'bg-white rounded-tl-none border border-slate-100 text-slate-700',
                          )}
                        >
                          {msg.content && <p>{msg.content}</p>}

                          {/* AI Summary for file messages */}
                          {msg.aiSummary && (
                            <div className={cn('mt-2 pt-2 border-t', own ? 'border-white/30' : 'border-slate-200/40')}>
                              <p className={cn('text-xs flex items-start gap-1', own ? 'text-cyan-100' : 'text-amber-600')}>
                                <span className="italic">AI Summary: {msg.aiSummary}</span>
                              </p>
                            </div>
                          )}

                          {/* Translation inside the bubble */}
                          {showTranslation && !own && msg.translatedContent && (
                            <div className="mt-2 pt-2 border-t border-slate-200/40">
                              <p className="text-xs text-purple-600 flex items-start gap-1">
                                <LanguagesIcon className="w-3 h-3 shrink-0 mt-0.5" />
                                <span className="italic">{msg.translatedContent}</span>
                              </p>
                            </div>
                          )}

                          {/* Translation for own messages (if enabled) */}
                          {showTranslation && own && msg.translatedContent && (
                            <div className="mt-2 pt-2 border-t border-white/30">
                              <p className="text-xs text-cyan-100 flex items-start gap-1 italic">
                                <LanguagesIcon className="w-3 h-3 shrink-0 mt-0.5" />
                                <span>{msg.translatedContent}</span>
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Attachments */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className={cn('flex flex-wrap gap-2', own ? 'justify-end' : 'justify-start')}>
                          {msg.attachments.map((att, idx) => {
                            const isImage = att.type?.startsWith('image/');
                            return (
                              <div
                                key={att.id ?? idx}
                                className={cn(
                                  'rounded-xl overflow-hidden border-2 transition-all',
                                  own ? 'border-cyan-400' : 'border-slate-200',
                                )}
                              >
                                <button
                                  type="button"
                                  onClick={() => onOpenAttachment?.(att)}
                                  className={cn(
                                    'block text-left',
                                    onOpenAttachment && 'cursor-zoom-in hover:opacity-90',
                                  )}
                                  disabled={!onOpenAttachment}
                                >
                                  {isImage && att.url ? (
                                    <div className="w-40 h-40 bg-slate-100">
                                      <img
                                        src={att.url}
                                        alt={att.name || 'Image'}
                                        className="w-full h-full object-cover"
                                      />
                                    </div>
                                  ) : (
                                    <div className={cn('w-48 p-3 flex items-center gap-3', own ? 'bg-cyan-50' : 'bg-slate-50')}>
                                      <div className={cn('shrink-0 p-2 rounded-lg', own ? 'bg-cyan-100 text-cyan-600' : 'bg-slate-200 text-slate-600')}>
                                        <FileTextIcon className="w-5 h-5" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-medium text-slate-700 truncate">{att.name || 'File'}</p>
                                        <p className="text-[10px] text-slate-400">{att.type?.split('/')[1]?.toUpperCase() || 'FILE'}</p>
                                      </div>
                                    </div>
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Metadata row below bubble */}
                      <div
                        className={cn(
                          'flex items-center gap-2 px-1',
                          own ? 'justify-end' : 'justify-start',
                        )}
                      >
                        <span className="text-[10px] font-medium text-slate-400">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                        {msg.isAiTranslated && (
                          <span className="text-[10px] text-purple-500 font-medium flex items-center gap-1">
                            <LanguagesIcon className="w-3 h-3" />
                            AI Translated
                          </span>
                        )}
                        {showRetranslate && onRetranslate && !own && (
                          <button
                            onClick={() => onRetranslate(msg.id)}
                            className="p-0.5 text-slate-400 hover:text-cyan-600 transition-colors"
                            title="Retranslate"
                          >
                            <RefreshIcon className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="p-4 border-t border-slate-100 bg-white shrink-0">
            {/* Optional notice above input (e.g. CRM forwarding) */}
            {inputNotice}

            {canSend ? (
              <>
                {/* File upload button row */}
                {onUploadFiles && (
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors"
                      title="Attach files"
                    >
                      <PaperclipIcon className="w-5 h-5" />
                    </button>
                  </div>
                )}

                {/* Selected files preview */}
                {selectedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 px-2 py-1 bg-white rounded border border-slate-200 text-xs"
                      >
                        {file.type.startsWith('image/') ? (
                          <ImageIcon className="w-4 h-4 text-cyan-500" />
                        ) : (
                          <FileTextIcon className="w-4 h-4 text-blue-500" />
                        )}
                        <span className="max-w-[120px] truncate text-slate-600">{file.name}</span>
                        <button
                          onClick={() => removeSelectedFile(index)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <XIcon className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    rows={1}
                    className="w-full resize-none pl-4 pr-12 py-3 bg-slate-50 border border-slate-200/80 rounded-xl text-sm h-12 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
                  />
                  <button
                    onClick={handleSend}
                    disabled={(!input.trim() && selectedFiles.length === 0) || isSending || isUploading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-cyan-600 hover:bg-cyan-700 p-2 text-white transition-colors disabled:opacity-50"
                  >
                    {isSending || isUploading ? (
                      <LoaderIcon className="w-4 h-4" />
                    ) : (
                      <SendIcon className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {readOnlyNotice ?? 'Read-only conversation'}
              </div>
            )}
          </div>
        </div>

        {/* Patient info sidebar */}
        {patientInfo && (
          <div className="w-80 border-l border-slate-200 overflow-y-auto p-4 bg-white">
            {patientInfo}
          </div>
        )}
      </div>
    </div>
  );
}
