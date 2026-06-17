'use client';

import { useMemo } from 'react';
import { Image as ImageIcon, Loader2 } from 'lucide-react';
import { useConversations, useMessages } from '@/queries/use-conversations';

const BEAUTY_UPLOAD_MARKER = '[Beauty Consultation Upload]';

interface CaseBeautyTabProps {
  caseId: string;
}

interface ApiConversation {
  id: string;
  caseId?: string | null;
  category?: string | null;
}

interface ApiMessage {
  id: string;
  content: string;
  createdAt?: string;
  attachments?: Array<{
    fileName?: string;
    name?: string;
    mimeType?: string;
    type?: string;
    url?: string;
    storageKey?: string;
  }> | null;
}

function unwrapList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown[] }).data)) {
    return ((raw as { data?: T[] }).data ?? []);
  }
  return [];
}

function parseBeautyUpload(content: string): Record<string, string> | null {
  if (!content.includes(BEAUTY_UPLOAD_MARKER)) return null;

  const fields: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    const key = match?.[1]?.trim();
    if (key) {
      fields[key] = (match?.[2] ?? '').trim();
    }
  }
  return fields;
}

function findBeautyUpload(messages: ApiMessage[]) {
  return [...messages]
    .filter((message) => parseBeautyUpload(message.content))
    .sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightTime - leftTime;
    })[0] ?? null;
}

function chooseConversation(conversations: ApiConversation[]) {
  return conversations.find((conversation) => conversation.category === 'ADMIN_PATIENT')
    ?? conversations.find((conversation) => conversation.category === 'HOSPITAL_PATIENT')
    ?? conversations[0]
    ?? null;
}

export function CaseBeautyTab({ caseId }: CaseBeautyTabProps) {
  const { data: rawConversations, isLoading: isLoadingConversations } = useConversations({ caseId });
  const conversations = useMemo(
    () => unwrapList<ApiConversation>(rawConversations),
    [rawConversations],
  );
  const conversation = chooseConversation(conversations);
  const { data: rawMessages, isLoading: isLoadingMessages } = useMessages(conversation?.id ?? '');
  const messages = useMemo(() => unwrapList<ApiMessage>(rawMessages), [rawMessages]);
  const uploadMessage = findBeautyUpload(messages);
  const fields = uploadMessage ? parseBeautyUpload(uploadMessage.content) : null;
  const attachments = uploadMessage?.attachments ?? [];
  const viewLabels = fields?.['Five views']?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];
  const isLoading = isLoadingConversations || (Boolean(conversation?.id) && isLoadingMessages);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!uploadMessage || !fields) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <ImageIcon size={22} />
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-900">No beauty consultation upload yet</h3>
        <p className="mt-2 text-sm text-slate-500">
          The patient has not submitted the Medora Beauty five-view photo set for this case.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Medora Beauty</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-950">Beauty consultation details</h3>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          {['Patient name', 'Contact', 'Channel', 'Area', 'Age range', 'Country / region', 'Preferred hospital / doctor', 'Goals / history'].map((label) => (
            <div key={label} className={label === 'Goals / history' ? 'sm:col-span-2' : ''}>
              <dt className="text-slate-500">{label}</dt>
              <dd className="mt-1 font-medium text-slate-900">{fields[label] || 'Not provided'}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Five-view photos</h3>
            <p className="text-sm text-slate-500">Uploaded from medorabeauty.com/consultation-upload</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {attachments.length} files
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {attachments.map((attachment, index) => {
            const href = attachment.url ?? attachment.storageKey ?? '';
            return (
              <a
                key={`${attachment.storageKey ?? attachment.fileName ?? index}`}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
              >
                {href ? (
                  <img
                    src={href}
                    alt={viewLabels[index] ?? attachment.fileName ?? `Beauty view ${index + 1}`}
                    className="aspect-square w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-slate-300">
                    <ImageIcon size={28} />
                  </div>
                )}
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-semibold text-slate-800">{viewLabels[index] ?? `View ${index + 1}`}</p>
                  <p className="truncate text-xs text-slate-500">{attachment.fileName ?? attachment.name ?? 'Photo attachment'}</p>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
