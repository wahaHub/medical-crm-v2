'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { cn } from '../lib/cn';

export interface MessageConversationSidebarItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  unreadCount?: number;
}

export interface MessageConversationSection {
  key: string;
  label: string;
  items: MessageConversationSidebarItem[];
}

export interface MessageConversationSidebarProps {
  sections: MessageConversationSection[];
  selectedId: string | null;
  highlightedId?: string | null;
  onSelect: (id: string) => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
  showSearch?: boolean;
  onClickNewConversation?: () => void;
  isLoading?: boolean;
  title?: string;
  emptyMessage?: string;
}

export function MessageConversationSidebar({
  sections,
  selectedId,
  highlightedId = null,
  onSelect,
  searchValue,
  onSearchChange,
  showSearch = true,
  onClickNewConversation,
  isLoading = false,
  title,
  emptyMessage = 'No conversations found.',
}: MessageConversationSidebarProps) {
  const hasItems = sections.some((section) => section.items.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col border-r border-slate-200 bg-white">
      <div className="space-y-2 border-b border-slate-100 px-4 py-3">
        {title && <h3 className="text-sm font-semibold text-slate-700">{title}</h3>}
        <div className="flex items-center gap-2">
          {showSearch && (
            <input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search conversations..."
              className="h-9 flex-1 rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none transition-colors focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
            />
          )}
          {onClickNewConversation && (
            <button
              type="button"
              onClick={onClickNewConversation}
              className="h-9 rounded-lg bg-cyan-600 px-3 text-sm font-medium text-white transition-colors hover:bg-cyan-700"
            >
              New
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
          </div>
        ) : !hasItems ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-slate-400">
            <p className="text-xs text-center">{emptyMessage}</p>
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.key} className="border-b border-slate-100 last:border-b-0">
              <div className="bg-slate-50/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {section.label}
              </div>
              {section.items.map((item) => {
                const selected = selectedId === item.id;
                const highlighted = highlightedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelect(item.id)}
                    data-conversation-item-id={item.id}
                    className={cn(
                      'w-full border-l-2 px-4 py-3 text-left transition-all',
                      selected
                        ? 'border-cyan-500 bg-cyan-50/50'
                        : 'border-transparent hover:bg-slate-50',
                      highlighted && 'animate-pulse bg-amber-50 ring-1 ring-inset ring-amber-300',
                    )}
                  >
                    <div className="mb-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800">{item.title}</span>
                      {(item.unreadCount ?? 0) > 0 && (
                        <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {item.unreadCount}
                        </span>
                      )}
                    </div>
                    {item.subtitle && (
                      <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                    )}
                    {item.meta && (
                      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        {item.meta}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export interface MessageNewConversationPayload {
  category: string;
  title?: string;
  hospitalId?: string;
  caseId?: string;
}

export interface MessageNewConversationModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: MessageNewConversationPayload) => void;
  categoryOptions: Array<{ value: string; label: string }>;
  isPending?: boolean;
  error?: string | null;
}

export function MessageNewConversationModal({
  open,
  onClose,
  onSubmit,
  categoryOptions,
  isPending = false,
  error = null,
}: MessageNewConversationModalProps) {
  const [category, setCategory] = useState(categoryOptions[0]?.value ?? '');
  const [title, setTitle] = useState('');
  const [hospitalId, setHospitalId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCategory(categoryOptions[0]?.value ?? '');
    setTitle('');
    setHospitalId('');
    setCaseId('');
    setLocalError(null);
  }, [open, categoryOptions]);

  const needsHospitalId = useMemo(() => category.toUpperCase() === 'ADMIN_HOSPITAL', [category]);

  if (!open) return null;

  function handleSubmit() {
    setLocalError(null);
    if (!category) {
      setLocalError('Category is required.');
      return;
    }
    if (needsHospitalId && !hospitalId.trim()) {
      setLocalError('Hospital ID is required for Admin / Hospital conversation.');
      return;
    }

    onSubmit({
      category,
      title: title.trim() || undefined,
      hospitalId: hospitalId.trim() || undefined,
      caseId: caseId.trim() || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-800">New Conversation</h3>
        </div>

        <div className="space-y-4 px-5 py-4">
          {(localError || error) && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {localError ?? error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Category *</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
            >
              {categoryOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Optional conversation title"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm text-slate-700 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Hospital ID {needsHospitalId ? '*' : '(optional)'}
            </label>
            <input
              value={hospitalId}
              onChange={(e) => setHospitalId(e.target.value)}
              placeholder="UUID"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-700 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Case ID (optional)</label>
            <input
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              placeholder="UUID"
              className="h-10 w-full rounded-lg border border-slate-200 px-3 font-mono text-sm text-slate-700 outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {isPending ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface MessageCaseDetailPanelProps {
  caseId?: string | null;
  caseNumber?: string | null;
  category?: string | null;
  participantRole?: string | null;
  participantName?: string | null;
  hospitalId?: string | null;
  patientCode?: string | null;
  patientAge?: number | null;
  patientGender?: string | null;
  patientLanguage?: string | null;
  caseStatus?: string | null;
  diagnosis?: string | null;
  documentCount?: number | null;
  messageCount?: number | null;
  conversationTitle?: string | null;
  caseLinkHref?: string | null;
  caseLinkLabel?: string;
  labels?: Partial<MessageCaseDetailPanelLabels>;
  formatCategoryLabel?: (category: string) => string;
  formatLanguageLabel?: (language: string) => string;
  formatStatusLabel?: (status: string) => string;
  formatGenderLabel?: (gender: string) => string;
  formatAgeLabel?: (age: number) => string;
  formatParticipantRoleLabel?: (role: string) => string;
}

export interface MessageCaseDetailPanelLabels {
  unknownParticipant: string;
  conversation: string;
  patientCode: string;
  primaryDiagnosis: string;
  language: string;
  profile: string;
  caseStatus: string;
  stats: string;
  documents: string;
  messages: string;
  role: string;
  case: string;
  hospital: string;
}

const DEFAULT_MESSAGE_CASE_DETAIL_LABELS: MessageCaseDetailPanelLabels = {
  unknownParticipant: 'Unknown Participant',
  conversation: 'Conversation',
  patientCode: 'Patient Code',
  primaryDiagnosis: 'Primary Diagnosis',
  language: 'Language',
  profile: 'Profile',
  caseStatus: 'Case Status',
  stats: 'Stats',
  documents: 'Documents',
  messages: 'Messages',
  role: 'Role',
  case: 'Case',
  hospital: 'Hospital',
};

function humanizeEnumValue(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function defaultFormatCategoryLabel(category: string): string {
  const normalizedCategory = category.trim().toUpperCase();
  if (normalizedCategory === 'ADMIN_HOSPITAL') return 'Admin';
  if (normalizedCategory === 'ADMIN_PATIENT') return 'Patient';
  return humanizeEnumValue(category).replace(/\s+/g, ' / ');
}

function defaultFormatLanguageValue(language: string): string {
  const value = language.trim().toLowerCase();
  if (value === 'zh') return 'Chinese';
  if (value === 'en') return 'English';
  if (value === 'es') return 'Spanish';
  if (value === 'ja') return 'Japanese';
  if (value === 'ko') return 'Korean';
  if (value === 'fr') return 'French';
  if (value === 'de') return 'German';
  return language;
}

function defaultFormatStatusLabel(status: string): string {
  return humanizeEnumValue(status);
}

function defaultFormatGenderLabel(gender: string): string {
  const value = gender.trim().toLowerCase();
  if (value === 'm') return 'Male';
  if (value === 'f') return 'Female';
  return humanizeEnumValue(gender);
}

function defaultFormatAgeLabel(age: number): string {
  return `${age}y`;
}

function getInitials(value: string): string {
  return value
    .split(' ')
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'NA';
}

export function MessageCaseDetailPanel({
  caseId,
  caseNumber,
  category,
  participantRole,
  participantName,
  hospitalId,
  patientCode,
  patientAge,
  patientGender,
  patientLanguage,
  caseStatus,
  diagnosis,
  documentCount,
  messageCount,
  conversationTitle,
  caseLinkHref,
  caseLinkLabel = 'View Full Case Details',
  labels,
  formatCategoryLabel = defaultFormatCategoryLabel,
  formatLanguageLabel = defaultFormatLanguageValue,
  formatStatusLabel = defaultFormatStatusLabel,
  formatGenderLabel = defaultFormatGenderLabel,
  formatAgeLabel = defaultFormatAgeLabel,
  formatParticipantRoleLabel = humanizeEnumValue,
}: MessageCaseDetailPanelProps) {
  const hasPatientAge = patientAge !== null && patientAge !== undefined;
  const hasDocumentCount = documentCount !== null && documentCount !== undefined;
  const hasMessageCount = messageCount !== null && messageCount !== undefined;
  const resolvedLabels = { ...DEFAULT_MESSAGE_CASE_DETAIL_LABELS, ...labels };
  const displayName = participantName?.trim() || resolvedLabels.unknownParticipant;
  const formattedProfile = [
    patientGender ? formatGenderLabel(patientGender) : null,
    hasPatientAge ? formatAgeLabel(patientAge) : null,
  ].filter(Boolean).join(' / ');
  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-slate-100 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-6 py-6 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-400 to-blue-500 text-xl font-bold text-white shadow-lg shadow-cyan-200/50">
          {getInitials(displayName)}
        </div>
        <h3 className="text-lg font-semibold text-slate-900">{displayName}</h3>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {caseNumber && (
            <span className="rounded bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200">
              {caseNumber}
            </span>
          )}
          {category && (
            <span className="rounded border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
              {formatCategoryLabel(category)}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-5 px-6 py-5">
        {conversationTitle && (
          <DetailBlock label={resolvedLabels.conversation}>
            <p className="text-sm text-slate-700">{conversationTitle}</p>
          </DetailBlock>
        )}

        {patientCode && (
          <DetailBlock label={resolvedLabels.patientCode}>
            <ValueCard value={patientCode} />
          </DetailBlock>
        )}

        {diagnosis && (
          <DetailBlock label={resolvedLabels.primaryDiagnosis}>
            <ValueCard value={diagnosis} />
          </DetailBlock>
        )}

        {patientLanguage && (
          <DetailBlock label={resolvedLabels.language}>
            <p className="text-sm font-medium text-slate-700">{formatLanguageLabel(patientLanguage)}</p>
          </DetailBlock>
        )}

        {formattedProfile && (
          <DetailBlock label={resolvedLabels.profile}>
            <p className="text-sm font-medium text-slate-700">{formattedProfile}</p>
          </DetailBlock>
        )}

        {caseStatus && (
          <DetailBlock label={resolvedLabels.caseStatus}>
            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {formatStatusLabel(caseStatus)}
            </span>
          </DetailBlock>
        )}

        {(hasDocumentCount || hasMessageCount) && (
          <DetailBlock label={resolvedLabels.stats}>
            <div className="space-y-1.5">
              {hasDocumentCount && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{resolvedLabels.documents}</span>
                  <span className="font-semibold text-blue-600">{documentCount}</span>
                </div>
              )}
              {hasMessageCount && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{resolvedLabels.messages}</span>
                  <span className="font-semibold text-blue-600">{messageCount}</span>
                </div>
              )}
            </div>
          </DetailBlock>
        )}

        {(caseId || participantRole || hospitalId) && (
          <div className="space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
            {participantRole && <p>{resolvedLabels.role}: {formatParticipantRoleLabel(participantRole)}</p>}
            {caseId && <p className="font-mono">{resolvedLabels.case}: {caseId}</p>}
            {hospitalId && <p className="font-mono">{resolvedLabels.hospital}: {hospitalId}</p>}
          </div>
        )}

        {caseLinkHref && (
          <a
            href={caseLinkHref}
            className="flex items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50"
          >
            {caseLinkLabel}
          </a>
        )}
      </div>
    </div>
  );
}

function DetailBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      {children}
    </div>
  );
}

function ValueCard({ value }: { value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-sm font-medium text-slate-700">{value}</p>
    </div>
  );
}
