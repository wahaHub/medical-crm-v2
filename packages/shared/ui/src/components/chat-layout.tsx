'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface ChatMessage {
  id: string;
  content: string;
  translatedContent?: string | null;
  senderRole: 'ADMIN' | 'HOSPITAL' | 'PATIENT';
  senderName: string;
  createdAt: string;
  isAiTranslated?: boolean;
}

export interface ChatLayoutProps {
  messages: ChatMessage[];
  onSend: (content: string) => void;
  isSending?: boolean;
  patientInfo?: ReactNode;
  showTranslation?: boolean;
  showRetranslate?: boolean;
  onRetranslate?: (messageId: string) => void;
  currentUserRole?: string;
  emptyState?: ReactNode;
  className?: string;
}

export function ChatLayout({
  messages,
  onSend,
  isSending = false,
  patientInfo,
  showTranslation = true,
  showRetranslate = false,
  onRetranslate,
  currentUserRole = 'HOSPITAL',
  emptyState,
  className,
}: ChatLayoutProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = () => {
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

  const isOwnMessage = (msg: ChatMessage) => msg.senderRole === currentUserRole;

  return (
    <div className={cn('flex h-full', className)}>
      {/* Messages area */}
      <div className="flex flex-1 flex-col">
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 && emptyState}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn('mb-4 flex', isOwnMessage(msg) ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[70%] rounded-2xl px-4 py-3',
                  isOwnMessage(msg)
                    ? 'bg-cyan-50 text-slate-800'
                    : 'bg-slate-50 text-slate-800',
                )}
              >
                <div className="mb-1 text-xs font-medium text-slate-500">{msg.senderName}</div>
                <p className="text-sm">{msg.content}</p>
                {showTranslation && msg.translatedContent && (
                  <div className="mt-2 border-t border-slate-200 pt-2">
                    <p className="text-sm italic text-slate-500">{msg.translatedContent}</p>
                    {msg.isAiTranslated && (
                      <span className="mt-1 inline-block text-xs text-indigo-500">AI translated</span>
                    )}
                  </div>
                )}
                {showRetranslate && onRetranslate && (
                  <button
                    onClick={() => onRetranslate(msg.id)}
                    className="mt-1 text-xs text-indigo-500 hover:text-indigo-700"
                  >
                    Retranslate
                  </button>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-slate-200 p-4">
          <div className="relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={2}
              className="w-full resize-none rounded-xl border border-slate-200 p-3 pr-20 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className="absolute bottom-3 right-3 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {/* Patient info sidebar */}
      {patientInfo && (
        <div className="w-80 border-l border-slate-200 overflow-y-auto p-4">
          {patientInfo}
        </div>
      )}
    </div>
  );
}
