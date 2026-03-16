'use client';

import { useState, useCallback } from 'react';
import { MessageSquare, Plus, Search } from 'lucide-react';
import {
  ChatLayout,
  type ChatMessage,
  Button,
  EmptyState,
  Modal,
} from '@medical-crm/ui';
import { useConversations } from '@/queries/use-conversations';
import { useMessages } from '@/queries/use-messages';
import { sendMessage, createConversation } from '@/actions/message-actions';
import type { PaginatedResponse, ConversationSummary } from '@/lib/api-types';

interface MessagesViewProps {
  initialConversations: PaginatedResponse<ConversationSummary>;
}

const CATEGORY_LABELS: Record<string, string> = {
  ADMIN_HOSPITAL: 'Admin',
  HOSPITAL_PATIENT: 'Patient',
};

export function MessagesView({ initialConversations }: MessagesViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);

  const { data: liveConversations } = useConversations();
  const liveResponse = liveConversations as PaginatedResponse<ConversationSummary> | undefined;
  const conversations: ConversationSummary[] = liveResponse?.data ?? initialConversations?.data ?? [];

  const { data: messagesData } = useMessages(selectedId ?? '');
  const messagesResponse = messagesData as PaginatedResponse<ChatMessage> | undefined;
  const messages: ChatMessage[] = messagesResponse?.data ?? [];

  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.title ?? '').toLowerCase().includes(q) ||
      (c.patientName ?? '').toLowerCase().includes(q) ||
      (c.lastMessage ?? '').toLowerCase().includes(q)
    );
  });

  // Group conversations by category
  const grouped = filteredConversations.reduce(
    (acc: Record<string, ConversationSummary[]>, c) => {
      const cat = c.category ?? 'OTHER';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(c);
      return acc;
    },
    {} as Record<string, ConversationSummary[]>,
  );

  const handleSend = useCallback(
    async (content: string) => {
      if (!selectedId) return;
      setIsSending(true);
      try {
        await sendMessage(selectedId, content);
      } catch {
        // Error handled by apiClient
      } finally {
        setIsSending(false);
      }
    },
    [selectedId],
  );

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-2xl bg-white shadow-sm">
      {/* Left panel: conversation list */}
      <div className="flex w-80 flex-col border-r border-slate-200">
        {/* Header */}
        <div className="border-b border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Messages</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowNewModal(true)}
              title="New conversation"
            >
              <Plus size={16} />
            </Button>
          </div>
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {Object.entries(grouped).length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-400">
              No conversations found
            </div>
          ) : (
            Object.entries(grouped).map(([category, convos]) => (
              <div key={category}>
                <div className="px-4 py-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                  {CATEGORY_LABELS[category] ?? category}
                </div>
                {convos.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                      selectedId === c.id ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-900 text-sm truncate">
                        {c.title ?? c.patientName ?? 'Conversation'}
                      </span>
                      {(c.unreadCount ?? 0) > 0 && (
                        <span className="ml-2 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-indigo-500 px-1.5 text-xs font-medium text-white">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                    {c.lastMessage && (
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {c.lastMessage}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel: chat area */}
      <div className="flex flex-1 flex-col">
        {selectedId ? (
          <ChatLayout
            messages={messages}
            onSend={handleSend}
            isSending={isSending}
            showRetranslate={false}
            currentUserRole="HOSPITAL"
            emptyState={
              <EmptyState
                icon={<MessageSquare size={48} />}
                title="No messages yet"
                description="Start the conversation by sending a message."
              />
            }
            className="h-full"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<MessageSquare size={48} />}
              title="Select a conversation"
              description="Choose a conversation from the list to start messaging."
            />
          </div>
        )}
      </div>

      {/* New Conversation Modal */}
      <NewConversationModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
      />
    </div>
  );
}

function NewConversationModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [caseId, setCaseId] = useState('');
  const [category, setCategory] = useState('HOSPITAL_PATIENT');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!caseId) return;
    setIsSubmitting(true);
    try {
      await createConversation({ caseId, category });
      setCaseId('');
      setCategory('HOSPITAL_PATIENT');
      onClose();
    } catch {
      // Error handled by apiClient
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Conversation">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Case ID
          </label>
          <input
            type="text"
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            placeholder="Enter case ID"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="HOSPITAL_PATIENT">Hospital - Patient</option>
            <option value="ADMIN_HOSPITAL">Admin - Hospital</option>
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || !caseId}>
            {isSubmitting ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
