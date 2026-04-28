'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  FileText,
  MessageSquare,
  Globe,
  Eye,
  Download,
  Plus,
  Stethoscope,
  Megaphone,
  Send,
  Sparkles,
  PhoneCall,
  CheckCircle,
  FileSignature,
  Video,
  Upload,
  X,
  AlertCircle,
  Receipt,
  Loader2,
  ChevronDown,
  ChevronUp,
  Clock,
  Paperclip,
} from 'lucide-react';
import { StatusBadge, MessageCaseDetailPanel, QuestionnaireReadonlyView, LoadingSpinner } from '@medical-crm/ui';
import { CaseAiSummaryTab } from './tabs/case-ai-summary-tab';
import { CaseQuoteTab } from './tabs/case-quote-tab';
import {
  useCaseConsultations,
  useCaseQuestionnaire,
  useQuestionTemplate,
} from '@/queries/use-cases';
import { useConsultationTranscript } from '@/queries/use-consultations';
import { useEmailTemplates } from '@/queries/use-email-templates';
import { addDiagnosis, sendCaseMarketingEmail } from '@/actions/case-actions';
import { deleteCaseDocument, uploadCaseDocument } from '@/actions/document-actions';
import { createConversation, sendMessage, sendMessageWithAttachments, uploadFile } from '@/actions/message-actions';
import { CreateConsultationModal } from '@/components/create-consultation-modal';
import { useAuth } from '@/lib/auth-context';
import {
  formatDurationMinutesLabel,
  getHospitalGenderShortLabel,
  getHospitalStatusLabel,
  getLocalizedCountryLabel,
  getLocalizedLanguageLabel,
} from '@/lib/hospital-display';
import { formatDateTime } from '@/lib/date-format';
import { useHospitalI18n } from '@/lib/hospital-i18n';
import type {
  HospitalCaseDetail,
  CaseSummary,
  ConsultationSummary,
  EmailTemplateItem,
} from '@/lib/api-types';

// ── Shared Helpers ──────────────────────────────────────────────────

type TranslationFn = ReturnType<typeof useHospitalI18n>['t'];

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-600',
  'bg-emerald-100 text-emerald-600',
  'bg-amber-100 text-amber-600',
  'bg-rose-100 text-rose-600',
  'bg-sky-100 text-sky-600',
];

const DIAGNOSIS_COST_OPTIONS = [
  {
    value: '< $5k',
    key: 'hospital.caseDetail.diagnosisDialog.costOptions.5k',
    fallback: 'Under 5K USD',
  },
  {
    value: '$5k - $10k',
    key: 'hospital.caseDetail.diagnosisDialog.costOptions.5-10k',
    fallback: '5-10K USD',
  },
  {
    value: '$10k - $20k',
    key: 'hospital.caseDetail.diagnosisDialog.costOptions.10-20k',
    fallback: '10-20K USD',
  },
  {
    value: '$20k - $50k',
    key: 'hospital.caseDetail.diagnosisDialog.costOptions.20-50k',
    fallback: '20-50K USD',
  },
  {
    value: '> $50k',
    key: 'hospital.caseDetail.diagnosisDialog.costOptions.50k+',
    fallback: 'Over 50K USD',
  },
] as const;

const DIAGNOSIS_DURATION_OPTIONS = [
  {
    value: '< 1 Week',
    key: 'hospital.caseDetail.diagnosisDialog.durationOptions.1week',
    fallback: 'Within 1 week',
  },
  {
    value: '1 - 2 Weeks',
    key: 'hospital.caseDetail.diagnosisDialog.durationOptions.2weeks',
    fallback: '1-2 weeks',
  },
  {
    value: '2 Weeks - 1 Month',
    key: 'hospital.caseDetail.diagnosisDialog.durationOptions.1month',
    fallback: '2 weeks - 1 month',
  },
  {
    value: '1 - 3 Months',
    key: 'hospital.caseDetail.diagnosisDialog.durationOptions.3months',
    fallback: '1-3 months',
  },
  {
    value: '> 3 Months',
    key: 'hospital.caseDetail.diagnosisDialog.durationOptions.6months',
    fallback: 'Over 3 months',
  },
] as const;

const SAFE_CASE_DETAIL_ERROR_PATTERNS = [
  /\brequired\b/i,
  /\binvalid\b/i,
  /\bunsupported\b/i,
  /\bselect\b/i,
  /\bchoose\b/i,
  /\bprovide\b/i,
  /\bmust\b/i,
  /\bmissing\b/i,
];

const UNSAFE_CASE_DETAIL_ERROR_PATTERNS = [
  /\b(database|db|sql|prisma|orm|postgres|mysql|redis|mongo|server|service|gateway|proxy|network|fetch|request|response|timeout|exception|stack|trace|traceback|econn|enotfound|econnreset|unauthorized|forbidden|internal|bucket|storage|cdn|cloudflare|token)\b/i,
  /^failed\b/i,
  /^unable\b/i,
  /\bstatus\s*\d{3}\b/i,
  /\bcode\s*\d{3}\b/i,
];

const MAX_DIAGNOSIS_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_INVITATION_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

function formatConsultationDateTime(
  value: string | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions,
  fallback: string,
) {
  if (!value) return fallback;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, options).format(date);
}

function formatTranscriptTimestamp(timestamp: string | null | undefined, locale: string) {
  if (!timestamp) return '';

  const parsed = new Date(timestamp);

  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function getDiagnosisOptionLabel(
  value: string | null | undefined,
  options: ReadonlyArray<{ value: string; key: string; fallback: string }>,
  translate: (key: string, values?: Record<string, string | number>, fallback?: string) => string,
) {
  if (!value) return '';

  const normalizedValue = value.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const matchedOption = options.find((option) => option.value === normalizedValue);
  if (!matchedOption) return translate('common.labels.other', undefined, 'Other');

  return translate(matchedOption.key, undefined, matchedOption.fallback);
}

export function extractSafeCaseDetailErrorDetail(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const rawDetail = error.message.trim();
  const detail = rawDetail.replace(/\s+/g, ' ');
  if (
    !detail
    || /[\r\n]/.test(rawDetail)
    || detail.length > 160
    || UNSAFE_CASE_DETAIL_ERROR_PATTERNS.some((pattern) => pattern.test(detail))
    || !SAFE_CASE_DETAIL_ERROR_PATTERNS.some((pattern) => pattern.test(detail))
  ) {
    return undefined;
  }

  return detail;
}

function extractCaseDetailDebugDetails(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error && 'body' in error) {
    try {
      return JSON.stringify((error as { body?: unknown }).body, null, 2);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function formatCaseDetailUserFacingError(
  error: unknown,
  t: TranslationFn,
  summaryKey: string,
  summaryFallback: string,
): string {
  const summary = t(summaryKey, undefined, summaryFallback);
  const detail = extractSafeCaseDetailErrorDetail(error);

  if (!detail) {
    return summary;
  }

  return t(
    'hospital.common.errors.withDetail',
    { summary, detail },
    '{summary} Details: {detail}',
  );
}

function getTemplateTypeLabel(
  value: string,
  translate: (key: string, values?: Record<string, string | number>, fallback?: string) => string,
) {
  const normalizedValue = value.trim().toLowerCase();
  const optionMap: Record<string, { key: string; fallback: string }> = {
    intro: { key: 'hospital.emailTemplates.types.intro', fallback: 'Intro' },
    quote: { key: 'hospital.emailTemplates.types.quote', fallback: 'Quote' },
    marketing: { key: 'hospital.emailTemplates.types.marketing', fallback: 'Marketing' },
    followup: { key: 'hospital.emailTemplates.types.followup', fallback: 'Follow-up' },
    follow_up: { key: 'hospital.emailTemplates.types.followup', fallback: 'Follow-up' },
    post_ops: { key: 'hospital.emailTemplates.types.postOps', fallback: 'Post-Ops' },
    custom: { key: 'hospital.emailTemplates.types.custom', fallback: 'Custom' },
  };

  const matchedOption = optionMap[normalizedValue];
  return matchedOption
    ? translate(matchedOption.key, undefined, matchedOption.fallback)
    : translate('common.labels.other', undefined, 'Other');
}

function normalizeStableFieldKey(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function humanizeStableFieldKey(value: string) {
  const normalized = normalizeStableFieldKey(value);
  if (!normalized) return value;

  return normalized
    .split('_')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function getDiagnosisCostEstimateLabel(value: string, t: TranslationFn) {
  return getDiagnosisOptionLabel(value, DIAGNOSIS_COST_OPTIONS, t);
}

export function getDiagnosisTreatmentDurationLabel(value: string, t: TranslationFn) {
  return getDiagnosisOptionLabel(value, DIAGNOSIS_DURATION_OPTIONS, t);
}

export function getMarketingTemplateTypeLabel(type: string, t: TranslationFn) {
  return getTemplateTypeLabel(type, t);
}

export function getDiagnosisSeverityLabel(value: string | null | undefined, t: TranslationFn): string {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'mild' || normalized === 'moderate' || normalized === 'severe') {
    return t(`hospital.cases.detail.diagnosis.severity.${normalized}`, undefined, normalized);
  }

  if (!normalized) {
    return '';
  }

  return t('hospital.common.unknown', undefined, 'Unknown');
}

type CaseDetailProgressStatus = 'pending' | 'uploading' | 'saving' | 'done' | 'failed';

type CaseDetailProgressItem = {
  id: string;
  label: string;
  status: CaseDetailProgressStatus;
  error?: string;
};

type CaseDetailProgressState = {
  open: boolean;
  title: string;
  items: CaseDetailProgressItem[];
  canDismiss: boolean;
  debugDetails?: string;
};

function CaseDetailProgressModal({
  state,
  onDismiss,
}: {
  state: CaseDetailProgressState;
  onDismiss: () => void;
}) {
  const { t } = useHospitalI18n();

  if (!state.open) return null;

  const completedCount = state.items.filter((item) => item.status === 'done').length;
  const progress = state.items.length > 0 ? Math.round((completedCount / state.items.length) * 100) : 0;
  const hasFailure = state.items.some((item) => item.status === 'failed');

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-xl rounded-[1.5rem] bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-6 py-5">
          <h3 className="text-lg font-semibold text-slate-900">{state.title}</h3>
        </div>
        <div className="space-y-5 px-6 py-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>
                {hasFailure
                  ? t('hospital.common.progress.finishedWithErrors', undefined, 'Finished with errors')
                  : t('hospital.common.progress.uploadingAndSaving', undefined, 'Uploading and saving')}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full transition-all duration-300 ${
                  hasFailure
                    ? 'bg-gradient-to-r from-amber-400 to-rose-500'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {state.items.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${
                  item.status === 'failed'
                    ? 'border-rose-200 bg-rose-50'
                    : item.status === 'done'
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-200 bg-white'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {item.status === 'done' && <CheckCircle size={16} className="text-emerald-600" />}
                  {item.status === 'failed' && <X size={16} className="text-rose-600" />}
                  {(item.status === 'uploading' || item.status === 'saving') && <LoadingSpinner size="sm" />}
                  {item.status === 'pending' && <div className="h-4 w-4 rounded-full bg-slate-200" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-800">{item.label}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {item.status === 'pending' && t('hospital.common.progress.waiting', undefined, 'Waiting')}
                    {item.status === 'uploading' && t('hospital.common.progress.uploading', undefined, 'Uploading...')}
                    {item.status === 'saving' && t('hospital.common.actions.saving', undefined, 'Saving...')}
                    {item.status === 'done' && t('hospital.common.progress.done', undefined, 'Done')}
                    {item.status === 'failed' && (item.error || t('hospital.common.progress.failed', undefined, 'Failed'))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {state.debugDetails ? (
            <div className="rounded-xl border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100">
              <div className="mb-2 font-semibold text-slate-200">
                {t('hospital.common.debugLogs', undefined, 'Debug logs')}
              </div>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words">{state.debugDetails}</pre>
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onDismiss}
              disabled={!state.canDismiss}
              className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('hospital.common.actions.close', undefined, 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function formatCaseConversationCategoryForDisplay(category: string, t: TranslationFn): string {
  if (category === 'ADMIN_HOSPITAL') {
    return t('hospital.messages.chat.admin', undefined, 'Admin');
  }

  if (category === 'ADMIN_PATIENT' || category === 'HOSPITAL_PATIENT') {
    return t('hospital.common.patient', undefined, 'Patient');
  }

  return t('common.labels.other', undefined, 'Other');
}

export function formatMessageSectionTitle(
  sectionId: 'admin-patient' | 'hospital-patient',
  t: TranslationFn,
): string {
  if (sectionId === 'admin-patient') {
    return t('hospital.cases.detail.messages.sections.adminPatient');
  }

  return t('hospital.cases.detail.messages.sections.hospitalPatient');
}

export function formatCaseParticipantRoleForDisplay(role: string, t: TranslationFn): string {
  if (role === 'ADMIN_HOSPITAL' || role === 'ADMIN') {
    return t('hospital.messages.chat.admin', undefined, 'Admin');
  }

  if (role === 'ADMIN_PATIENT' || role === 'HOSPITAL_PATIENT' || role === 'PATIENT') {
    return t('hospital.common.patient', undefined, 'Patient');
  }

  if (role === 'HOSPITAL') {
    return t('hospital.messages.chat.hospital', undefined, 'Hospital');
  }

  return t('common.labels.other', undefined, 'Other');
}

export function formatQuestionnaireFallbackFieldLabel(key: string, t: TranslationFn) {
  const normalizedKey = normalizeStableFieldKey(key);
  const fallbackLabel = humanizeStableFieldKey(key);

  if (!normalizedKey) {
    return fallbackLabel;
  }

  return t(
    `hospital.cases.detail.intake.fields.${normalizedKey}`,
    undefined,
    fallbackLabel,
  );
}

// ── Tab Definitions ─────────────────────────────────────────────────

const tabDefinitions = [
  { id: 'ai-summary', labelKey: 'hospital.cases.detail.tabs.aiSummary', fallback: 'AI Summary', icon: Sparkles },
  { id: 'intake', labelKey: 'hospital.cases.detail.tabs.intake', fallback: 'Intake', icon: FileText },
  { id: 'documents', labelKey: 'hospital.cases.detail.tabs.documents', fallback: 'Documents', icon: FileText },
  { id: 'messages', labelKey: 'hospital.cases.detail.tabs.messages', fallback: 'Messages', icon: MessageSquare },
  { id: 'diagnosis', labelKey: 'hospital.cases.detail.tabs.diagnosis', fallback: 'Diagnosis', icon: Stethoscope },
  { id: 'quote', labelKey: 'hospital.cases.detail.tabs.quote', fallback: 'Quote', icon: Receipt },
  { id: 'marketing', labelKey: 'hospital.cases.detail.tabs.marketing', fallback: 'Marketing', icon: Megaphone },
  { id: 'invitation', labelKey: 'hospital.cases.detail.tabs.invitation', fallback: 'Invitation Letter', icon: FileSignature },
  { id: 'consultation', labelKey: 'hospital.cases.detail.tabs.consultation', fallback: 'Consultation', icon: Video },
];

// ── Main Component ──────────────────────────────────────────────────

export function CaseDetailPanel({ caseDetail }: { caseDetail: HospitalCaseDetail }) {
  const [activeTab, setActiveTab] = useState('ai-summary');
  const router = useRouter();
  const { locale, t } = useHospitalI18n();

  const { data: consultations } = useCaseConsultations(caseDetail.id);
  const consultationsList = (consultations as ConsultationSummary[] | undefined) ?? [];

  const patient = caseDetail.patient;

  return (
    <div className="flex flex-col -m-8 min-h-screen bg-[#F8F9FB]">
      {/* Patient Header */}
      <div className="bg-white border-b border-slate-200/60 px-10 py-6 shrink-0">
        <button
          onClick={() => router.push('/cases')}
          className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-indigo-600 mb-5 transition-colors"
        >
          <ChevronLeft size={16} /> {t('hospital.cases.detail.backToCases', undefined, 'Back to Cases')}
        </button>

        <div className="flex items-center gap-6">
          <div className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-2xl font-bold border-4 border-white shadow-sm ${avatarColor(patient.name)}`}>
            {getInitials(patient.name)}
          </div>

          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-2xl font-semibold text-slate-900">{patient.name}</h2>
              {patient.code && (
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                  #{patient.code}
                </span>
              )}
              <StatusBadge
                status={caseDetail.displayStatus}
                label={getHospitalStatusLabel(caseDetail.displayStatus, t)}
              />
            </div>
            <div className="flex items-center gap-3 text-sm font-medium text-slate-500">
              {patient.age != null && (
                <span>{t('hospital.common.ageYears', { age: patient.age }, '{age} y/o')}</span>
              )}
              {patient.gender && (
                <span>
                  • {getHospitalGenderShortLabel(patient.gender, t)}
                </span>
              )}
              {patient.country && (
                <>
                  <span className="w-1 h-1 bg-slate-300 rounded-full" />
                  <span className="flex items-center gap-1.5">
                    <Globe size={14} /> {getLocalizedCountryLabel(patient.country, locale, t)}
                  </span>
                </>
              )}
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              <span className="flex items-center gap-1.5">
                <FileText size={14} />{' '}
                {t('hospital.cases.detail.header.documentsCount', { count: caseDetail.documents.length }, '{count} Docs')}
              </span>
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              <span className="flex items-center gap-1.5">
                {t('hospital.cases.detail.header.createdAt', undefined, 'Created')}{' '}
                {formatDateTime(caseDetail.createdAt, locale)}
              </span>
              {caseDetail.totalMessages > 0 && (
                <>
                  <span className="w-1 h-1 bg-slate-300 rounded-full" />
                  <span className="flex items-center gap-1.5">
                    <MessageSquare size={14} />{' '}
                    {t('hospital.cases.detail.header.messagesCount', { count: caseDetail.totalMessages }, '{count} Messages')}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-10 pt-4 bg-white border-b border-slate-200/60 shrink-0 shadow-sm">
        <div className="flex gap-8 overflow-x-auto">
          {tabDefinitions.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 pb-4 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <tab.icon size={16} /> {t(tab.labelKey, undefined, tab.fallback)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-10">
        <div className="max-w-5xl mx-auto">
          {activeTab === 'ai-summary' && <CaseAiSummaryTab aiSummary={caseDetail.aiSummary} />}
          {activeTab === 'intake' && <IntakeTab caseDetail={caseDetail} />}
          {activeTab === 'documents' && <DocumentsTab caseDetail={caseDetail} />}
          {activeTab === 'messages' && <MessagesTab caseDetail={caseDetail} />}
          {activeTab === 'diagnosis' && <DiagnosisTab caseDetail={caseDetail} />}
          {activeTab === 'quote' && <CaseQuoteTab caseId={caseDetail.id} />}
          {activeTab === 'marketing' && <MarketingTab caseDetail={caseDetail} />}
          {activeTab === 'invitation' && <InvitationLetterTab caseDetail={caseDetail} />}
          {activeTab === 'consultation' && (
            <ConsultationTab
              consultations={consultationsList}
              router={router}
              caseId={caseDetail.id}
              currentCase={{
                id: caseDetail.id,
                caseNumber: caseDetail.caseNumber,
                patientName: caseDetail.patient.name,
                patientCode: caseDetail.patient.code,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Intake ─────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function IntakeTab({ caseDetail }: { caseDetail: HospitalCaseDetail }) {
  const { t } = useHospitalI18n();
  const { data: rawResponse, isLoading, error } = useCaseQuestionnaire(caseDetail.id);
  const questionnairePayload = isRecord(rawResponse) && 'data' in rawResponse
    ? (rawResponse as { data?: unknown }).data
    : rawResponse;
  const templateId = isRecord(questionnairePayload) && typeof questionnairePayload.templateId === 'string'
    ? questionnairePayload.templateId
    : null;
  const { data: template, isLoading: isLoadingTemplate } = useQuestionTemplate(templateId);

  if (isLoading || (templateId && isLoadingTemplate)) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    const message = formatCaseDetailUserFacingError(
      error,
      t,
      'hospital.cases.detail.intake.errorLoad',
      'Failed to load medical intake',
    );
    return (
      <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {message}
      </div>
    );
  }

  return (
    <QuestionnaireReadonlyView
      template={template ?? null}
      response={questionnairePayload ?? null}
      formatFieldLabel={(key) => formatQuestionnaireFallbackFieldLabel(key, t)}
      copy={{
        emptyStateTitle: t('hospital.cases.detail.intake.emptyTitle', undefined, 'No medical intake data'),
        emptyStateDescription: t(
          'hospital.cases.detail.intake.emptyDescription',
          undefined,
          'The patient has not completed the medical intake questionnaire yet.',
        ),
        fallbackSectionTitle: t(
          'hospital.cases.detail.intake.responsesTitle',
          undefined,
          'Medical intake responses',
        ),
        summarySectionTitle: t(
          'hospital.cases.detail.intake.summaryTitle',
          undefined,
          'Summary & Assessment',
        ),
      }}
    />
  );
}

// ── Tab: Documents ──────────────────────────────────────────────────

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDocumentGroupLabel(type: string, t: TranslationFn): string {
  const fallbackLabel = t('hospital.cases.detail.documents.groups.otherDocuments', undefined, 'Other Documents');
  const groupLabels: Record<string, string> = {
    MEDICAL_INTAKE: t('hospital.cases.detail.documents.groups.medicalIntake', undefined, 'Medical Intake'),
    DIAGNOSIS: t('hospital.cases.detail.documents.groups.diagnosis', undefined, 'Diagnosis'),
    INVITATION_LETTER: t('hospital.cases.detail.documents.groups.invitationLetter', undefined, 'Invitation Letter'),
    INVITATION: t('hospital.cases.detail.documents.groups.invitationLetter', undefined, 'Invitation Letter'),
    MESSAGE_ATTACHMENT: t('hospital.cases.detail.documents.groups.messageAttachments', undefined, 'Message Attachments'),
    OTHER: fallbackLabel,
  };

  return groupLabels[type] ?? fallbackLabel;
}

function DocumentsTab({ caseDetail }: { caseDetail: HospitalCaseDetail }) {
  const { locale, t } = useHospitalI18n();
  const docs = caseDetail.documents;
  const groups: Record<string, typeof docs> = {};
  for (const doc of docs) {
    const type = doc.documentType ?? doc.type ?? 'OTHER';
    if (!groups[type]) groups[type] = [];
    groups[type].push(doc);
  }
  if (docs.length === 0) return (
    <div className="text-center py-12 bg-white rounded-[1.5rem] border border-slate-100 shadow-sm">
      <FileText size={40} className="mx-auto mb-3 text-slate-300" />
      <p className="text-sm text-slate-400">
        {t('hospital.cases.detail.documents.empty', undefined, 'No documents uploaded yet')}
      </p>
    </div>
  );
  return (
    <div className="space-y-8">
      {Object.entries(groups).map(([type, typeDocs]) => (
        <div key={type}>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            {formatDocumentGroupLabel(type, t)}
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">{typeDocs.length}</span>
          </h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {typeDocs.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-indigo-100 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><FileText size={20} /></div>
                  <div>
                    <div className="text-sm font-semibold text-slate-800 truncate max-w-[200px]">
                      {doc.fileName ?? t('hospital.cases.detail.documents.unnamed', undefined, 'Unnamed')}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                      {doc.createdAt && <span>{new Intl.DateTimeFormat(locale).format(new Date(doc.createdAt))}</span>}
                      {doc.fileSize != null && doc.fileSize > 0 && <><span>-</span><span>{formatFileSize(doc.fileSize)}</span></>}
                      {doc.language && (
                        <>
                          <span>-</span>
                          <span>{getLocalizedLanguageLabel(doc.language, locale, t)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {doc.downloadUrl && (
                    <>
                      <a href={doc.downloadUrl} target="_blank" rel="noreferrer" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"><Eye size={16} /></a>
                      <a href={doc.downloadUrl} download={doc.fileName} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"><Download size={16} /></a>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab: Messages ───────────────────────────────────────────────────

type MessageSectionId = 'admin-patient' | 'hospital-patient';

const DEFAULT_ACTIVE_MESSAGE_SECTION_ID: MessageSectionId = 'hospital-patient';

function MessagesTab({ caseDetail }: { caseDetail: HospitalCaseDetail }) {
  const { user } = useAuth();
  const { locale, t } = useHospitalI18n();
  const router = useRouter();
  const patientName = caseDetail.patient.name;
  const messageSections = caseDetail.messageSections ?? [];
  const hospitalPatientSection = messageSections.find((section) => section.id === 'hospital-patient') ?? null;
  const [activeSectionId, setActiveSectionId] = useState<MessageSectionId>(DEFAULT_ACTIVE_MESSAGE_SECTION_ID);
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sendInFlightRef = useRef(false);
  const activeSection = messageSections.find((section) => section.id === activeSectionId)
    ?? hospitalPatientSection
    ?? messageSections[0]
    ?? null;
  const isHospitalPatientSectionActive = activeSection?.id === 'hospital-patient';
  const selectedConversationCategory = activeSection?.conversationCategory ?? null;
  const patientContextLabels = {
    unknownParticipant: t('hospital.common.unknown', undefined, 'Unknown'),
    patientCode: t('hospital.messages.chat.patientCodeLabel', undefined, 'Patient Code'),
    primaryDiagnosis: t('hospital.messages.chat.primaryDiagnosis', undefined, 'Primary Diagnosis'),
    language: t('hospital.messages.chat.language', undefined, 'Language'),
    profile: t('hospital.common.profile', undefined, 'Profile'),
    caseStatus: t('hospital.common.caseStatus', undefined, 'Case Status'),
    stats: t('hospital.common.stats', undefined, 'Stats'),
    documents: t('hospital.common.documents', undefined, 'Documents'),
    messages: t('hospital.common.messages', undefined, 'Messages'),
    role: t('hospital.common.role', undefined, 'Role'),
    case: t('hospital.common.case', undefined, 'Case'),
    hospital: t('hospital.messages.chat.hospital', undefined, 'Hospital'),
  };
  const formatConversationCategoryLabel = (category: string) =>
    formatCaseConversationCategoryForDisplay(category, t);

  useEffect(() => {
    if (hospitalPatientSection?.conversationId) {
      setPendingConversationId(null);
    }
  }, [hospitalPatientSection?.conversationId]);

  const handleSend = async () => {
    const trimmedMessage = draftMessage.trim();
    if (
      sendInFlightRef.current
      || !isHospitalPatientSectionActive
      || (!trimmedMessage && selectedFiles.length === 0)
    ) {
      return;
    }

    sendInFlightRef.current = true;
    setComposerError(null);
    setIsSending(true);

    try {
      let conversationId = pendingConversationId ?? hospitalPatientSection?.conversationId ?? null;
      if (!conversationId) {
        const conversation = await createConversation({ category: 'HOSPITAL_PATIENT', caseId: caseDetail.id }) as { id?: string };
        conversationId = conversation?.id ?? null;
        if (conversationId) {
          setPendingConversationId(conversationId);
        }
      }

      if (!conversationId) {
        throw new Error('Please choose a patient conversation before sending a message.');
      }

      if (selectedFiles.length > 0) {
        const attachments = [];
        for (const file of selectedFiles) {
          attachments.push(await uploadFile(conversationId, file));
        }
        const messageType = selectedFiles.every((file) => file.type.startsWith('image/')) ? 'IMAGE' : 'FILE';
        await sendMessageWithAttachments(conversationId, trimmedMessage, messageType, attachments);
      } else if (trimmedMessage) {
        await sendMessage(conversationId, trimmedMessage);
      }

      setDraftMessage('');
      setSelectedFiles([]);
      router.refresh();
    } catch (error) {
      setComposerError(
        formatCaseDetailUserFacingError(
          error,
          t,
          'hospital.cases.detail.messages.errorSend',
          'Failed to send message',
        ),
      );
    } finally {
      sendInFlightRef.current = false;
      setIsSending(false);
    }
  };

  const handleSelectSection = (sectionId: MessageSectionId) => {
    setActiveSectionId(sectionId);
    setComposerError(null);
  };

  const handleFilesSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) {
      return;
    }

    setSelectedFiles((current) => [...current, ...Array.from(files)]);
    event.target.value = '';
  };

  return (
    <div className="flex gap-6 h-[600px]">
      {/* Messages List */}
      <div className="flex-1 flex flex-col bg-white rounded-[1.5rem] border border-slate-100 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 bg-white/90 px-6 py-4 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-2xl bg-slate-100 p-1">
              {messageSections.map((section) => {
                const isActive = section.id === activeSection?.id;

                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => handleSelectSection(section.id)}
                    aria-pressed={isActive}
                    className={`inline-flex items-center gap-2 rounded-[1rem] px-4 py-2 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <span>{formatMessageSectionTitle(section.id, t)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'bg-white text-slate-500 ring-1 ring-slate-200'
                    }`}
                    >
                      {section.totalMessages}
                    </span>
                  </button>
                );
              })}
            </div>
            <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
              {formatConversationCategoryLabel(activeSection?.conversationCategory ?? 'HOSPITAL_PATIENT')}
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {isHospitalPatientSectionActive
              ? t(
                'hospital.cases.detail.messages.composerHint',
                undefined,
                'Reply here in the hospital thread.',
              )
              : t(
                'hospital.cases.detail.messages.readOnlyHint',
                undefined,
                'This view is read-only. Return to the patient thread to reply.',
              )}
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeSection ? (
            <>
              <div className="space-y-4">
                <div className="sticky top-0 z-10 -mx-2 flex items-center justify-between rounded-2xl bg-slate-50/95 px-4 py-3 backdrop-blur">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">
                      {formatMessageSectionTitle(activeSection.id, t)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {activeSection.totalMessages > 0
                        ? t(
                          'hospital.cases.detail.messages.sectionCount',
                          { count: activeSection.totalMessages },
                        )
                        : isHospitalPatientSectionActive
                          ? t(
                            'hospital.cases.detail.messages.hospitalThreadEmpty',
                            undefined,
                            'No hospital messages yet. Your first reply will start this thread.',
                          )
                          : t(
                            'hospital.cases.detail.messages.sectionEmpty',
                          )}
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">
                    {formatConversationCategoryLabel(activeSection.conversationCategory)}
                  </span>
                </div>
                {activeSection.messages.length > 0 ? (
                  [...activeSection.messages].reverse().map((msg, idx, reversed) => {
                      const senderRole = msg.senderRole
                        ?? (msg.senderId === user.id
                          ? 'HOSPITAL'
                          : activeSection.conversationCategory === 'ADMIN_PATIENT'
                            ? 'ADMIN'
                            : 'PATIENT');
                      const isHospital = senderRole === 'HOSPITAL' || senderRole === 'hospital';
                      const isAdmin = senderRole === 'ADMIN' || senderRole === 'admin';
                      const msgTime = new Date(msg.createdAt);
                      const timeStr = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(msgTime);
                      const prevMsg = idx > 0 ? reversed[idx - 1] : null;
                      const showDate = !prevMsg || new Date(prevMsg.createdAt).toDateString() !== msgTime.toDateString();
                      const translatedCopy = msg.translatedContent ?? msg.contentTranslated;
                      const avatarClass = isHospital
                        ? 'bg-indigo-100 text-indigo-600'
                        : isAdmin
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-600';
                      const bubbleClass = isHospital
                        ? 'bg-indigo-600 text-white rounded-tr-none'
                        : isAdmin
                          ? 'bg-amber-50 border border-amber-100 text-amber-900 rounded-tl-none'
                          : 'bg-white border border-slate-100 text-slate-700 rounded-tl-none';
                      const avatarLabel = isHospital ? 'H' : isAdmin ? 'A' : patientName.charAt(0);

                      return (
                        <div key={msg.id}>
                          {showDate && (
                            <div className="text-center mb-4">
                              <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1 rounded-full">
                                {new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(msgTime)}
                              </span>
                            </div>
                          )}
                          <div className={`flex gap-3 ${isHospital ? 'flex-row-reverse' : ''}`}>
                            <div className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarClass}`}>
                              {avatarLabel}
                            </div>
                            <div className="max-w-[70%] space-y-1">
                              <div className={`rounded-2xl p-3 text-sm leading-relaxed shadow-sm ${bubbleClass}`}>
                                <p>{msg.content}</p>
                                {!isHospital && translatedCopy && (
                                  <div className="mt-2 border-t border-purple-100 pt-2 text-xs text-purple-600">
                                    <Globe size={10} className="mr-1 inline" />
                                    <span>{translatedCopy}</span>
                                  </div>
                                )}
                                {msg.attachments && msg.attachments.length > 0 ? (
                                  <div className="mt-3 space-y-2">
                                    {msg.attachments.map((attachment, attachmentIndex) => (
                                      <a
                                        key={`${msg.id}-attachment-${attachmentIndex}`}
                                        href={attachment.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs ${
                                          isHospital
                                            ? 'bg-white/15 text-white'
                                            : 'bg-white text-slate-600 ring-1 ring-slate-200'
                                        }`}
                                        >
                                        <FileText size={12} />
                                        <span className="truncate">
                                          {attachment.fileName
                                            ?? attachment.name
                                            ?? t(
                                              'hospital.cases.detail.messages.attachmentFallback',
                                            )}
                                        </span>
                                      </a>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <div className={`text-[10px] text-slate-400 ${isHospital ? 'text-right' : 'pl-2'}`}>
                                {timeStr}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                  })
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-400">
                    {isHospitalPatientSectionActive
                      ? t(
                        'hospital.cases.detail.messages.hospitalThreadEmpty',
                        undefined,
                        'No hospital messages yet. Your first reply will start this thread.',
                      )
                      : t(
                        'hospital.cases.detail.messages.sectionEmpty',
                      )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <MessageSquare size={40} className="mb-3 text-slate-300" />
              <p className="text-sm">
                {t(
                  'hospital.cases.detail.messages.empty',
                  undefined,
                  'No messages yet. Start a conversation from the Messages page.',
                )}
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/50 p-4">
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <AlertCircle size={14} className="shrink-0 text-amber-600" />
            <p className="text-xs text-amber-700">
              {t(
                'hospital.cases.detail.messages.privacyNotice',
                undefined,
                'Privacy Notice: Patient contact information is hidden for privacy.',
              )}
            </p>
          </div>
          {isHospitalPatientSectionActive ? (
            <>
              {composerError && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{composerError}</span>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFilesSelected}
              />
              {selectedFiles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                  {selectedFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                      <FileText size={12} />
                      <span className="max-w-[180px] truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                        className="text-slate-400 hover:text-rose-500"
                        aria-label={t('hospital.messages.chat.removeFile', undefined, 'Remove file')}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <textarea
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder={t(
                    'hospital.cases.detail.messages.inputPlaceholder',
                    undefined,
                    'Type a message...',
                  )}
                  className="h-14 flex-1 resize-none rounded-xl border border-slate-200 bg-white p-3 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSending}
                  className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-60"
                  title={t('hospital.messages.chat.attachFiles', undefined, 'Attach files')}
                >
                  <Paperclip size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={isSending || (!draftMessage.trim() && selectedFiles.length === 0)}
                  className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
            </>
          ) : (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div>
                <div className="text-sm font-medium text-slate-800">
                  {t(
                    'hospital.cases.detail.messages.readOnlyTitle',
                    undefined,
                    'Admin / AI updates are read-only',
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  {t(
                    'hospital.cases.detail.messages.readOnlyHint',
                    undefined,
                    'This view is read-only. Return to the patient thread to reply.',
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleSelectSection('hospital-patient')}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700"
              >
                {t(
                  'hospital.cases.detail.messages.switchBackToHospital',
                  undefined,
                  'Open hospital reply',
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Patient Context Panel (shared with Admin/Hospital message experiences) */}
      <MessageCaseDetailPanel
        caseId={caseDetail.id}
        category={selectedConversationCategory}
        participantRole={t('hospital.common.patient', undefined, 'Patient')}
        participantName={patientName}
        patientCode={caseDetail.patient.code}
        patientAge={caseDetail.patient.age}
        patientGender={
          getHospitalGenderShortLabel(caseDetail.patient.gender, t) || null
        }
        caseStatus={caseDetail.displayStatus}
        diagnosis={caseDetail.medicalCondition.primaryDiagnosis}
        documentCount={caseDetail.documents.length}
        messageCount={caseDetail.totalMessages}
        patientLanguage={caseDetail.patient.language}
        labels={patientContextLabels}
        formatCategoryLabel={formatConversationCategoryLabel}
        formatLanguageLabel={(language) => getLocalizedLanguageLabel(language, locale, t)}
        formatStatusLabel={(status) => getHospitalStatusLabel(status, t)}
        formatGenderLabel={(gender) => getHospitalGenderShortLabel(gender, t)}
        formatAgeLabel={(age) => t('hospital.common.ageYears', { age }, '{age} y/o')}
        formatParticipantRoleLabel={(role) => formatCaseParticipantRoleForDisplay(role, t)}
      />
    </div>
  );
}

// ── Tab: Diagnosis ──────────────────────────────────────────────────

const SEVERITY_STYLES: Record<string, string> = {
  severe: 'bg-rose-50 text-rose-700 border-rose-200/50',
  moderate: 'bg-amber-50 text-amber-700 border-amber-200/50',
  mild: 'bg-emerald-50 text-emerald-700 border-emerald-200/50',
};

function DiagnosisTab({ caseDetail }: { caseDetail: HospitalCaseDetail }) {
  const { locale, t } = useHospitalI18n();
  const [showAddModal, setShowAddModal] = useState(false);
  const router = useRouter();
  const diagnoses = caseDetail.diagnoses;
  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-semibold rounded-full shadow-md shadow-cyan-200/50 transition-colors">
          <Plus size={16} /> {t('hospital.cases.detail.diagnosis.addButton', undefined, 'Add Diagnosis')}
        </button>
      </div>
      {diagnoses.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-[1.5rem] border border-slate-100 shadow-sm">
          <Stethoscope size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm text-slate-400">
            {t('hospital.cases.detail.diagnosis.empty', undefined, 'No diagnoses recorded yet')}
          </p>
        </div>
      ) : (
        diagnoses.map((d, i) => {
          const severityKey = (d.severity ?? '').toLowerCase();
          const severityStyle = SEVERITY_STYLES[severityKey] ?? 'bg-amber-50 text-amber-700 border-amber-200/50';
          const title = d.title || d.condition || t('hospital.cases.detail.diagnosis.unknownCondition', undefined, 'Unknown Condition');
          return (
            <div key={d.id ?? i} className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                {d.severity && (
                  <span className={`px-2.5 py-1 border rounded-md text-xs font-semibold uppercase tracking-wide ${severityStyle}`}>
                    {getDiagnosisSeverityLabel(d.severity, t)}
                  </span>
                )}
                {d.icdCode && (
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-md text-xs font-medium">
                    {t('hospital.cases.detail.diagnosis.icdCode', undefined, 'ICD')}: {d.icdCode}
                  </span>
                )}
                {d.recordedAt && (
                  <span className="ml-auto text-xs text-slate-400">
                    {new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(d.recordedAt))}
                  </span>
                )}
              </div>
              <h3 className="text-xl font-semibold text-slate-900 mb-1">{title}</h3>

              {/* Detail grid for additional fields */}
              {(d.treatmentRecommendation || d.suggestedTests || d.costEstimate || d.treatmentDuration) && (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  {d.treatmentRecommendation && (
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-500 mb-1">
                        {t('hospital.cases.detail.diagnosis.fields.treatmentRecommendation', undefined, 'Treatment Recommendation')}
                      </p>
                      <p className="text-sm text-slate-700">{d.treatmentRecommendation}</p>
                    </div>
                  )}
                  {d.suggestedTests && (
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-500 mb-1">
                        {t('hospital.cases.detail.diagnosis.fields.suggestedTests', undefined, 'Suggested Tests')}
                      </p>
                      <p className="text-sm text-slate-700">{d.suggestedTests}</p>
                    </div>
                  )}
                  {d.costEstimate && (
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-500 mb-1">
                        {t('hospital.cases.detail.diagnosis.fields.estimatedCost', undefined, 'Estimated Cost')}
                      </p>
                      <p className="text-sm font-medium text-slate-700">{getDiagnosisCostEstimateLabel(d.costEstimate, t)}</p>
                    </div>
                  )}
                  {d.treatmentDuration && (
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <p className="text-xs text-slate-500 mb-1">
                        {t('hospital.cases.detail.diagnosis.fields.treatmentDuration', undefined, 'Treatment Duration')}
                      </p>
                      <p className="text-sm font-medium text-slate-700">{getDiagnosisTreatmentDurationLabel(d.treatmentDuration, t)}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Backward compat: show old condition/notes fields if present */}
              {d.notes && (
                <div className="mt-4 bg-slate-50 p-3 rounded-lg">
                  <p className="text-xs text-slate-500 mb-1">
                    {t('hospital.cases.detail.diagnosis.fields.details', undefined, 'Details')}
                  </p>
                  <p className="text-sm text-slate-600">{d.notes}</p>
                </div>
              )}
            </div>
          );
        })
      )}
      <AddDiagnosisModal
        caseId={caseDetail.id}
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function AddDiagnosisModal({
  caseId,
  open,
  onClose,
  onSuccess,
}: {
  caseId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useHospitalI18n();
  const [diagnosisType, setDiagnosisType] = useState('Preliminary');
  const [title, setTitle] = useState('');
  const [icdCode, setIcdCode] = useState('');
  const [severity, setSeverity] = useState('moderate');
  const [description, setDescription] = useState('');
  const [treatmentRecommendation, setTreatmentRecommendation] = useState('');
  const [costEstimate, setCostEstimate] = useState('< $5k');
  const [treatmentDuration, setTreatmentDuration] = useState('< 1 Week');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<CaseDetailProgressState>({
    open: false,
    title: '',
    items: [],
    canDismiss: false,
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const updateProgressItem = (
    id: string,
    status: CaseDetailProgressStatus,
    errorMessage?: string,
  ) => {
    setSaveProgress((current) => ({
      ...current,
      items: current.items.map((item) => (
        item.id === id
          ? { ...item, status, error: errorMessage }
          : item
      )),
    }));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError(t('hospital.cases.detail.diagnosis.validation.nameRequired', undefined, 'Diagnosis name is required.'));
      return;
    }

    setError(null);
    setIsSaving(true);
    const progressItems: CaseDetailProgressItem[] = [
      ...selectedFiles.map((file, index) => ({
        id: `file-${index}`,
        label: file.name,
        status: 'pending' as const,
      })),
      {
        id: 'save-diagnosis',
        label: t('hospital.cases.detail.diagnosis.progress.saveDiagnosis', undefined, 'Saving diagnosis details'),
        status: 'pending',
      },
    ];
    setSaveProgress({
      open: true,
      title: t('hospital.cases.detail.diagnosis.progress.title', undefined, 'Saving diagnosis'),
      items: progressItems,
      canDismiss: false,
    });
    const uploadedDocumentIds: string[] = [];
    try {
      for (const [index, file] of selectedFiles.entries()) {
        updateProgressItem(`file-${index}`, 'uploading');
        const uploaded = await uploadCaseDocument(caseId, file, 'DIAGNOSIS');
        if (uploaded.documentId) {
          uploadedDocumentIds.push(uploaded.documentId);
        }
        updateProgressItem(`file-${index}`, 'done');
      }

      updateProgressItem('save-diagnosis', 'saving');
      await addDiagnosis(caseId, {
        title,
        diagnosisType,
        icdCode,
        severity: severity.toUpperCase(),
        description,
        treatmentRecommendation,
        costEstimate,
        treatmentDuration,
      });
      updateProgressItem('save-diagnosis', 'done');
      setSaveProgress((current) => ({ ...current, open: false, canDismiss: true }));
      setSelectedFiles([]);
      onSuccess();
    } catch (err) {
      const debugDetails = extractCaseDetailDebugDetails(err);
      const failingStepId = uploadedDocumentIds.length < selectedFiles.length
        ? `file-${uploadedDocumentIds.length}`
        : 'save-diagnosis';
      updateProgressItem(
        failingStepId,
        'failed',
        formatCaseDetailUserFacingError(
          err,
          t,
          'hospital.cases.detail.diagnosis.errorSave',
          'Failed to save diagnosis',
        ),
      );
      if (uploadedDocumentIds.length > 0) {
        const rollbackResults = await Promise.allSettled(
          uploadedDocumentIds.map((documentId) => deleteCaseDocument(caseId, documentId)),
        );
        const failedRollbacks = rollbackResults.filter((result) => result.status === 'rejected');
        if (failedRollbacks.length > 0) {
          console.warn('Failed to roll back uploaded diagnosis documents after diagnosis save failed:', failedRollbacks);
          setSaveProgress((current) => ({
            ...current,
            debugDetails: [
              debugDetails,
              'Rollback failures:',
              JSON.stringify(failedRollbacks, null, 2),
            ].filter(Boolean).join('\n\n'),
            canDismiss: true,
          }));
        }
      }
      setError(
        formatCaseDetailUserFacingError(
          err,
          t,
          'hospital.cases.detail.diagnosis.errorSave',
          'Failed to save diagnosis',
        ),
      );
      setSaveProgress((current) => ({
        ...current,
        debugDetails: current.debugDetails ?? debugDetails,
        canDismiss: true,
      }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <CaseDetailProgressModal
        state={saveProgress}
        onDismiss={() => setSaveProgress((current) => ({ ...current, open: false }))}
      />
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-md z-10 rounded-t-[2rem]">
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><Stethoscope size={20} className="text-cyan-600" /> {t('hospital.cases.detail.diagnosis.addModal.title', undefined, 'Add Diagnosis')}</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-50 rounded-full"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle size={16} />
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">{t('hospital.cases.detail.diagnosis.addModal.type', undefined, 'Diagnosis Type')}</label>
            <div className="grid grid-cols-3 gap-3">
              {['Preliminary', 'Confirmed', 'Follow-up'].map((option) => {
                const selected = diagnosisType === option;
                const optionKey = option === 'Preliminary'
                  ? 'hospital.cases.detail.diagnosis.type.preliminary'
                  : option === 'Confirmed'
                    ? 'hospital.cases.detail.diagnosis.type.confirmed'
                    : 'hospital.cases.detail.diagnosis.type.followUp';
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDiagnosisType(option)}
                    className={`py-3 px-4 rounded-xl text-sm transition-colors ${
                      selected
                        ? 'border-2 border-amber-500 bg-amber-50 text-amber-700 font-semibold'
                        : 'border border-slate-200 text-slate-600 font-medium hover:bg-slate-50'
                    }`}
                  >
                    {t(optionKey, undefined, option)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">{t('hospital.cases.detail.diagnosis.addModal.name', undefined, 'Diagnosis Name *')}</label><input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500/20 text-sm outline-none" placeholder={t('hospital.cases.detail.diagnosis.addModal.namePlaceholder', undefined, 'e.g. Coronary Artery Disease')} /></div>
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">{t('hospital.cases.detail.diagnosis.addModal.icdCode', undefined, 'ICD-10 Code')}</label><input type="text" value={icdCode} onChange={(e) => setIcdCode(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500/20 text-sm outline-none" placeholder={t('hospital.cases.detail.diagnosis.addModal.icdCodePlaceholder', undefined, 'e.g. I25.10')} /></div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">{t('hospital.cases.detail.diagnosis.addModal.severity', undefined, 'Severity')}</label>
            <div className="flex gap-4">
              {[
                { value: 'severe', label: 'Severe', color: 'text-rose-600' },
                { value: 'moderate', label: 'Moderate', color: 'text-amber-600' },
                { value: 'mild', label: 'Mild', color: 'text-emerald-600' },
              ].map((option) => (
                <label key={option.value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="severity"
                    checked={severity === option.value}
                    onChange={() => setSeverity(option.value)}
                  />
                  <span className={`${option.color} font-medium`}>
                    {getDiagnosisSeverityLabel(option.value, t) || option.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div><label className="block text-sm font-semibold text-slate-700 mb-2">{t('hospital.cases.detail.diagnosis.addModal.description', undefined, 'Detailed Description')}</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500/20 text-sm outline-none h-24 resize-none" /></div>
          <div><label className="block text-sm font-semibold text-slate-700 mb-2">{t('hospital.cases.detail.diagnosis.addModal.treatmentRecommendation', undefined, 'Treatment Recommendation')}</label><textarea value={treatmentRecommendation} onChange={(e) => setTreatmentRecommendation(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-cyan-500/20 text-sm outline-none h-20 resize-none" /></div>
          <div className="grid grid-cols-2 gap-6">
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">{t('hospital.cases.detail.diagnosis.addModal.estimatedCost', undefined, 'Estimated Cost')}</label><select value={costEstimate} onChange={(e) => setCostEstimate(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white"><option value="&lt; $5k">{t('hospital.caseDetail.diagnosisDialog.costOptions.5k', undefined, 'Under 5K USD')}</option><option value="$5k - $10k">{t('hospital.caseDetail.diagnosisDialog.costOptions.5-10k', undefined, '5-10K USD')}</option><option value="$10k - $20k">{t('hospital.caseDetail.diagnosisDialog.costOptions.10-20k', undefined, '10-20K USD')}</option><option value="$20k - $50k">{t('hospital.caseDetail.diagnosisDialog.costOptions.20-50k', undefined, '20-50K USD')}</option><option value="&gt; $50k">{t('hospital.caseDetail.diagnosisDialog.costOptions.50k+', undefined, 'Over 50K USD')}</option></select></div>
            <div><label className="block text-sm font-semibold text-slate-700 mb-2">{t('hospital.cases.detail.diagnosis.addModal.treatmentDuration', undefined, 'Treatment Duration')}</label><select value={treatmentDuration} onChange={(e) => setTreatmentDuration(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white"><option value="&lt; 1 Week">{t('hospital.caseDetail.diagnosisDialog.durationOptions.1week', undefined, 'Within 1 week')}</option><option value="1 - 2 Weeks">{t('hospital.caseDetail.diagnosisDialog.durationOptions.2weeks', undefined, '1-2 weeks')}</option><option value="2 Weeks - 1 Month">{t('hospital.caseDetail.diagnosisDialog.durationOptions.1month', undefined, '2 weeks - 1 month')}</option><option value="1 - 3 Months">{t('hospital.caseDetail.diagnosisDialog.durationOptions.3months', undefined, '1-3 months')}</option><option value="&gt; 3 Months">{t('hospital.caseDetail.diagnosisDialog.durationOptions.6months', undefined, 'Over 3 months')}</option></select></div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">{t('hospital.cases.detail.diagnosis.addModal.attachments', undefined, 'Attachments (Max 10MB)')}</label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length === 0) {
                  return;
                }

                const oversizedFile = files.find((file) => file.size > MAX_DIAGNOSIS_ATTACHMENT_BYTES);
                if (oversizedFile) {
                  setError(
                    t(
                      'hospital.cases.detail.diagnosis.addModal.errors.maxSize',
                      { fileName: oversizedFile.name },
                      '{fileName} exceeds the 10MB file size limit.',
                    ),
                  );
                  event.target.value = '';
                  return;
                }

                setError(null);
                setSelectedFiles((current) => [...current, ...files]);
                event.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-200 rounded-xl p-6 flex flex-col items-center justify-center text-slate-400 bg-slate-50/60 hover:border-cyan-300 hover:bg-cyan-50/40 transition-colors"
            >
              <FileText size={32} className="mb-2 text-slate-300" />
              <span className="text-sm font-medium">
                {t('hospital.cases.detail.diagnosis.addModal.attachmentsPlaceholder', undefined, 'Click to upload diagnosis report or examination results')}
              </span>
            </button>
            {selectedFiles.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedFiles.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <FileText size={12} />
                    <span className="max-w-[220px] truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50 rounded-b-[2rem]">
          <button onClick={onClose} disabled={isSaving} className="px-6 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-200 rounded-full disabled:opacity-50">{t('hospital.common.cancel', undefined, 'Cancel')}</button>
          <button onClick={() => void handleSave()} disabled={isSaving} className="px-6 py-2.5 text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-700 rounded-full flex items-center gap-2 shadow-md shadow-cyan-200/50 disabled:opacity-50">
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Stethoscope size={16} />}
            {t('hospital.cases.detail.diagnosis.addModal.save', undefined, 'Save Diagnosis')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Marketing ──────────────────────────────────────────────────

function MarketingTab({ caseDetail }: { caseDetail: HospitalCaseDetail }) {
  const { t } = useHospitalI18n();
  const [activeSubTab, setActiveSubTab] = useState<'email' | 'call'>('email');
  const [selectedModules, setSelectedModules] = useState([
    'hospitalIntroduction',
    'expertTeam',
    'serviceFeatures',
  ]);
  const [emailSubject, setEmailSubject] = useState(
    t('hospital.cases.detail.marketing.defaultSubject', undefined, 'Your Personalized Treatment Plan'),
  );
  const [emailBody, setEmailBody] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [marketingError, setMarketingError] = useState<string | null>(null);
  const [marketingSuccess, setMarketingSuccess] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const { data: templatesData } = useEmailTemplates();

  const activeTemplates: EmailTemplateItem[] = (() => {
    if (!templatesData) return [];
    const list = Array.isArray(templatesData) ? templatesData : (templatesData as { data?: EmailTemplateItem[] }).data ?? [];
    return list.filter((t) => t.status === 'active');
  })();

  const replaceVariables = (text: string) => {
    return text
      .replace(/\{\{patient_name\}\}/g, caseDetail.patient.name ?? '')
      .replace(/\{\{case_number\}\}/g, caseDetail.caseNumber ?? '')
      .replace(/\{\{hospital_name\}\}/g, t('hospital.cases.detail.marketing.variables.hospitalName', undefined, 'Our Hospital'))
      .replace(/\{\{quote_total\}\}/g, '')
      .replace(/\{\{doctor_name\}\}/g, '')
      .replace(/\{\{procedure_name\}\}/g, caseDetail.medicalCondition?.primaryDiagnosis ?? '');
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const template = activeTemplates.find((t) => t.id === templateId);
    if (!template) return;
    setEmailSubject(replaceVariables(template.subject));
    setEmailBody(replaceVariables(template.body));
  };

  const coreModules = [
    {
      id: 'logoSlogan',
      label: t('hospital.cases.detail.marketing.modules.logoSlogan', undefined, 'Logo / Slogan'),
    },
    {
      id: 'successCases',
      label: t('hospital.cases.detail.marketing.modules.successCases', undefined, 'Success Cases'),
    },
    {
      id: 'patientReviews',
      label: t('hospital.cases.detail.marketing.modules.patientReviews', undefined, 'Patient Reviews'),
    },
  ];
  const optionalModules = [
    {
      id: 'hospitalIntroduction',
      label: t('hospital.cases.detail.marketing.modules.hospitalIntroduction', undefined, 'Hospital Introduction'),
    },
    {
      id: 'expertTeam',
      label: t('hospital.cases.detail.marketing.modules.expertTeam', undefined, 'Expert Team'),
    },
    {
      id: 'serviceFeatures',
      label: t('hospital.cases.detail.marketing.modules.serviceFeatures', undefined, 'Service Features'),
    },
    {
      id: 'pricingPlans',
      label: t('hospital.cases.detail.marketing.modules.pricingPlans', undefined, 'Pricing Plans'),
    },
    {
      id: 'travelServices',
      label: t('hospital.cases.detail.marketing.modules.travelServices', undefined, 'Travel Services'),
    },
    {
      id: 'contactInformation',
      label: t('hospital.cases.detail.marketing.modules.contactInformation', undefined, 'Contact Information'),
    },
  ];
  const toggleModule = (moduleId: string) => {
    if (selectedModules.includes(moduleId)) {
      setSelectedModules(selectedModules.filter((id) => id !== moduleId));
      return;
    }

    setSelectedModules([...selectedModules, moduleId]);
  };

  const handleGenerateEmail = () => {
    const selectedLabels = [...coreModules, ...optionalModules]
      .filter((module) => coreModules.some((core) => core.id === module.id) || selectedModules.includes(module.id))
      .map((module) => `- ${module.label}`)
      .join('\n');

    setMarketingError(null);
    setMarketingSuccess(null);
    setEmailBody([
      t(
        'hospital.cases.detail.marketing.generatedGreeting',
        { patientName: caseDetail.patient.name },
        'Hello {patientName},',
      ),
      '',
      t(
        'hospital.cases.detail.marketing.generatedIntro',
        { diagnosis: caseDetail.medicalCondition.primaryDiagnosis ?? t('hospital.common.unknown', undefined, 'Unknown') },
        'We prepared a personalized treatment update for your case related to {diagnosis}.',
      ),
      '',
      selectedLabels,
      '',
      t('hospital.cases.detail.marketing.generatedClosing', undefined, 'Please reply if you would like us to walk you through the next step.'),
    ].join('\n'));
  };

  const handleSaveDraft = () => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      `hospital-case-marketing-draft:${caseDetail.id}`,
      JSON.stringify({
        subject: emailSubject,
        body: emailBody,
        selectedTemplateId,
        selectedModules,
      }),
    );
    setMarketingError(null);
    setMarketingSuccess(t('hospital.cases.detail.marketing.draftSaved', undefined, 'Draft saved on this device.'));
  };

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) {
      setMarketingError(
        t(
          'hospital.cases.detail.marketing.validation.subjectAndBodyRequired',
          undefined,
          'Subject and email content are required.',
        ),
      );
      return;
    }

    setIsSendingEmail(true);
    setMarketingError(null);
    setMarketingSuccess(null);
    try {
      await sendCaseMarketingEmail(caseDetail.id, {
        subject: emailSubject,
        messagePreview: emailBody,
      });
      setMarketingSuccess(
        t(
          'hospital.cases.detail.marketing.emailSent',
          undefined,
          'Email outreach sent to the patient.',
        ),
      );
    } catch (error) {
      setMarketingError(
        formatCaseDetailUserFacingError(
          error,
          t,
          'hospital.cases.detail.marketing.errorSend',
          'Failed to send email outreach',
        ),
      );
    } finally {
      setIsSendingEmail(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const rawDraft = window.localStorage.getItem(`hospital-case-marketing-draft:${caseDetail.id}`);
    if (!rawDraft) return;

    try {
      const parsed = JSON.parse(rawDraft) as {
        subject?: string;
        body?: string;
        selectedTemplateId?: string;
        selectedModules?: string[];
      };
      if (parsed.subject) setEmailSubject(parsed.subject);
      if (parsed.body) setEmailBody(parsed.body);
      if (parsed.selectedTemplateId) setSelectedTemplateId(parsed.selectedTemplateId);
      if (Array.isArray(parsed.selectedModules)) setSelectedModules(parsed.selectedModules);
    } catch {
      // Ignore malformed local drafts.
    }
  }, [caseDetail.id]);

  return (
    <div className="space-y-8">
      <div className="flex justify-center mb-2">
        <div className="bg-slate-200/50 p-1 rounded-xl flex gap-1 border border-slate-200/60">
          <button onClick={() => setActiveSubTab('email')} className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeSubTab === 'email' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Send size={16} /> {t('hospital.cases.detail.marketing.emailOutreach', undefined, 'Email Outreach')}</button>
          <button onClick={() => setActiveSubTab('call')} className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${activeSubTab === 'call' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><PhoneCall size={16} /> {t('hospital.cases.detail.marketing.phoneOutreach', undefined, 'Phone Outreach')}</button>
        </div>
      </div>
      {activeSubTab === 'email' && (
        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-6">
              {t('hospital.cases.detail.marketing.modules.title', undefined, 'Email Content Modules')}
            </h3>
            <div className="space-y-6">
              <div>
                <div className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wider">
                  {t('hospital.cases.detail.marketing.modules.coreIncluded', undefined, 'Core & Recommended (Included)')}
                </div>
                <div className="flex flex-wrap gap-3">
                  {coreModules.map((module) => (
                    <div key={module.id} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200/50 rounded-xl text-sm font-medium">
                      <CheckCircle size={16} /> {module.label}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wider">
                  {t('hospital.cases.detail.marketing.modules.optional', undefined, 'Optional Modules')}
                </div>
                <div className="flex flex-wrap gap-3">
                  {optionalModules.map((module) => {
                    const isSelected = selectedModules.includes(module.id);
                    return (
                      <button key={module.id} onClick={() => toggleModule(module.id)} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${isSelected ? 'bg-indigo-50 text-indigo-700 border-indigo-200/50' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                        {isSelected ? <CheckCircle size={16} /> : <Plus size={16} className="text-slate-400" />} {module.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleGenerateEmail}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-indigo-500 hover:from-pink-600 hover:to-indigo-600 text-white text-sm font-semibold rounded-full shadow-lg shadow-pink-200/50"
                >
                  <Sparkles size={16} /> {t('hospital.cases.detail.marketing.generateEmail', undefined, 'One-Click Generate Email')}
                </button>
              </div>
            </div>
          </div>
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-6">
              {t('hospital.cases.detail.marketing.composeTitle', undefined, 'Compose Email')}
            </h3>
            <div className="space-y-5">
              {marketingError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {marketingError}
                </div>
              ) : null}
              {marketingSuccess ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {marketingSuccess}
                </div>
              ) : null}
              {/* Load Template dropdown */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  {t('hospital.cases.detail.marketing.loadTemplate', undefined, 'Load Template')}
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleTemplateSelect(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-pink-500/20 text-sm outline-none bg-white"
                  disabled={activeTemplates.length === 0}
                >
                  <option value="">
                    {activeTemplates.length === 0
                      ? t('hospital.cases.detail.marketing.noActiveTemplates', undefined, 'No active templates - create one in Email Templates page')
                      : t('hospital.cases.detail.marketing.selectTemplate', undefined, '-- Select a template --')}
                  </option>
                  {activeTemplates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name} ({getMarketingTemplateTypeLabel(template.type, t)})</option>
                  ))}
                </select>
                {activeTemplates.length === 0 && templatesData && (
                  <p className="mt-1.5 text-xs text-amber-600">
                    {t(
                      'hospital.cases.detail.marketing.templatesActiveHint',
                      undefined,
                      'Templates must be set to "Active" status to appear here.',
                    )}
                  </p>
                )}
              </div>
              <div className="bg-amber-50 border border-amber-100/50 p-3 rounded-xl text-amber-700 text-sm font-medium flex items-center gap-2">
                <AlertCircle size={16} />
                {t(
                  'hospital.cases.detail.marketing.privacyNotice',
                  undefined,
                  'Privacy Notice: Patient email address is hidden for privacy.',
                )}
              </div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">{t('hospital.cases.detail.marketing.subject', undefined, 'Subject')}</label><input type="text" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-pink-500/20 text-sm outline-none" /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">{t('hospital.cases.detail.marketing.emailContent', undefined, 'Email Content')}</label><textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-pink-500/20 text-sm outline-none h-48 resize-none" placeholder={t('hospital.cases.detail.marketing.emailContentPlaceholder', undefined, 'Generated content will appear here...')} /></div>
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="px-6 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-full"
                >
                  {t('hospital.cases.detail.marketing.saveDraft', undefined, 'Save Draft')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSendEmail()}
                  disabled={isSendingEmail}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-pink-600 hover:bg-pink-700 rounded-full flex items-center gap-2 shadow-md shadow-pink-200/50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSendingEmail ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {t('hospital.cases.detail.marketing.sendEmail', undefined, 'Send Email')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {activeSubTab === 'call' && (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-full shadow-md shadow-blue-200/50"><PhoneCall size={16} /> {t('hospital.cases.detail.marketing.call.makeCall', undefined, 'Make Call')}</button>
            <div className="flex items-center gap-4 text-sm font-medium text-slate-500 bg-white px-6 py-3 rounded-full border border-slate-100 shadow-sm">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" /> {t('hospital.cases.detail.marketing.call.recording', undefined, 'Recording')}</span><span className="w-1 h-1 bg-slate-300 rounded-full" /><span>{t('hospital.cases.detail.marketing.call.saveRecords', undefined, 'Save Records')}</span><span className="w-1 h-1 bg-slate-300 rounded-full" /><span className="text-indigo-600">{t('hospital.cases.detail.marketing.call.aiSummaryActive', undefined, 'AI Summary Active')}</span>
            </div>
          </div>
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-6">{t('hospital.cases.detail.marketing.call.logTitle', undefined, 'Log New Call')}</h3>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div><label className="block text-sm font-semibold text-slate-700 mb-3">{t('hospital.cases.detail.marketing.call.type', undefined, 'Call Type')}</label><div className="flex gap-3"><label className="flex items-center gap-2 text-sm"><input type="radio" name="callType" defaultChecked /> <span className="font-medium text-slate-700">{t('hospital.cases.detail.marketing.call.typeOutbound', undefined, 'Outbound')}</span></label><label className="flex items-center gap-2 text-sm"><input type="radio" name="callType" /> <span className="font-medium text-slate-700">{t('hospital.cases.detail.marketing.call.typeInbound', undefined, 'Inbound')}</span></label><label className="flex items-center gap-2 text-sm"><input type="radio" name="callType" /> <span className="font-medium text-slate-700">{t('hospital.cases.detail.marketing.call.typeMissed', undefined, 'Missed')}</span></label></div></div>
                <div><label className="block text-sm font-semibold text-slate-700 mb-3">{t('hospital.cases.detail.marketing.call.result', undefined, 'Call Result')}</label><select className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white"><option>{t('hospital.cases.detail.marketing.call.resultInterested', undefined, 'Interested')}</option><option>{t('hospital.cases.detail.marketing.call.resultScheduled', undefined, 'Scheduled')}</option><option>{t('hospital.cases.detail.marketing.call.resultCallback', undefined, 'Callback')}</option><option>{t('hospital.cases.detail.marketing.call.resultNotInterested', undefined, 'Not Interested')}</option><option>{t('hospital.cases.detail.marketing.call.resultNoAnswer', undefined, 'No Answer')}</option></select></div>
              </div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">{t('hospital.cases.detail.marketing.call.summary', undefined, 'Summary')}</label><textarea className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm outline-none h-24 resize-none" placeholder={t('hospital.cases.detail.marketing.call.summaryPlaceholder', undefined, 'Briefly summarize the conversation...')} /></div>
              <div><label className="block text-sm font-semibold text-slate-700 mb-2">{t('hospital.cases.detail.marketing.call.nextFollowUpDate', undefined, 'Next Follow-up Date')}</label><input type="date" className="w-full max-w-xs px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none bg-white" /></div>
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button className="px-6 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-full">{t('hospital.common.cancel', undefined, 'Cancel')}</button>
                <button className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-full flex items-center gap-2 shadow-md shadow-blue-200/50"><CheckCircle size={16} /> {t('hospital.cases.detail.marketing.call.saveRecord', undefined, 'Save Record')}</button>
              </div>
            </div>
          </div>
          <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-6">{t('hospital.cases.detail.marketing.call.historyTitle', undefined, 'Call History')}</h3>
            <p className="text-sm text-slate-400 text-center py-4">{t('hospital.cases.detail.marketing.call.empty', undefined, 'No call records yet')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Invitation Letter ──────────────────────────────────────────

function InvitationLetterTab({ caseDetail }: { caseDetail: HospitalCaseDetail }) {
  const { locale, t } = useHospitalI18n();
  const router = useRouter();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const invitationDocuments = caseDetail.documents.filter((document) =>
    (document.documentType ?? document.type) === 'INVITATION'
    || (document.documentType ?? document.type) === 'INVITATION_LETTER',
  );

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      return;
    }

    setError(null);
    setIsUploading(true);
    try {
      for (const file of [...selectedFiles]) {
        await uploadCaseDocument(caseDetail.id, file, 'INVITATION');
        setSelectedFiles((current) => current.filter((selectedFile) => selectedFile !== file));
      }
      router.refresh();
    } catch (uploadError) {
      setError(
        formatCaseDetailUserFacingError(
          uploadError,
          t,
          'hospital.cases.detail.invitation.errorUpload',
          'Failed to upload invitation letter',
        ),
      );
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2"><FileSignature size={20} className="text-indigo-600" /> {t('hospital.cases.detail.invitation.title', undefined, 'Invitation Letter Upload')}</h3>
      <div className="space-y-6">
        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-800">{t('hospital.cases.detail.invitation.description', undefined, "Upload the official hospital invitation letter required for the patient's medical visa application.")}</div>
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle size={16} />
            {error}
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length === 0) {
              return;
            }

            const invalidFile = files.find((file) => !isPdfFile(file));
            if (invalidFile) {
              setError(
                t(
                  'hospital.cases.detail.invitation.errors.pdfOnly',
                  { fileName: invalidFile.name },
                  '{fileName} must be a PDF file.',
                ),
              );
              event.target.value = '';
              return;
            }

            const oversizedFile = files.find((file) => file.size > MAX_INVITATION_ATTACHMENT_BYTES);
            if (oversizedFile) {
              setError(
                t(
                  'hospital.cases.detail.invitation.errors.maxSize',
                  { fileName: oversizedFile.name },
                  '{fileName} exceeds the 5MB file size limit.',
                ),
              );
              event.target.value = '';
              return;
            }

            setError(null);
            setSelectedFiles((current) => [...current, ...files]);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 hover:border-indigo-300 transition-colors cursor-pointer"
        >
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mb-4"><Upload size={32} /></div>
          <span className="text-base font-semibold text-slate-700 mb-1">{t('hospital.cases.detail.invitation.uploadPrompt', undefined, 'Click to upload or drag and drop')}</span>
          <span className="text-sm">{t('hospital.cases.detail.invitation.uploadHint', undefined, 'PDF format only (Max 5MB)')}</span>
        </button>
        {selectedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedFiles.map((file, index) => (
              <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <FileText size={12} />
                <span className="max-w-[220px] truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                  className="text-slate-400 hover:text-rose-500"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        {invitationDocuments.length > 0 && (
          <div className="space-y-3">
            {invitationDocuments.map((document) => (
              <div key={document.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-700">{document.fileName ?? t('hospital.cases.detail.documents.unnamed', undefined, 'Unnamed')}</p>
                  {document.createdAt && (
                    <p className="text-xs text-slate-400">{new Intl.DateTimeFormat(locale).format(new Date(document.createdAt))}</p>
                  )}
                </div>
                {document.downloadUrl && (
                  <a
                    href={document.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-indigo-600 ring-1 ring-slate-200 hover:bg-indigo-50"
                  >
                    {t('hospital.cases.detail.invitation.viewFile', undefined, 'View File')}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-end pt-4">
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={isUploading || selectedFiles.length === 0}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-md shadow-indigo-200/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploading ? t('hospital.cases.detail.invitation.uploading', undefined, 'Uploading...') : t('hospital.cases.detail.invitation.submit', undefined, 'Submit Letter')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab: Consultation ───────────────────────────────────────────────

function ConsultationTab({
  consultations,
  router,
  caseId,
  currentCase,
}: {
  consultations: ConsultationSummary[];
  router: ReturnType<typeof useRouter>;
  caseId: string;
  currentCase: CaseSummary;
}) {
  const { locale, t } = useHospitalI18n();
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Schedule button */}
      <div className="flex justify-end">
        <button
          onClick={() => setShowScheduleModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-full shadow-md shadow-indigo-200/50 transition-colors"
        >
          <Video size={16} /> {t('hospital.cases.detail.consultation.scheduleButton', undefined, 'Schedule Consultation')}
        </button>
      </div>

      {/* Schedule modal — reuses the shared CreateConsultationModal with fixedCaseId */}
      <CreateConsultationModal
        open={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        fixedCaseId={caseId}
        cases={[currentCase]}
      />

      {/* Consultation list */}
      {consultations.length === 0 ? (
        <div className="bg-white p-12 rounded-[2rem] border border-slate-100 shadow-sm text-center text-sm text-slate-400">
          {t('hospital.cases.detail.consultation.empty', undefined, 'No consultations yet. Schedule one to get started.')}
        </div>
      ) : (
        <div className="space-y-4">
          {consultations.map((c) => {
            const isExpanded = expandedId === c.id;
            return (
              <div key={c.id} className="rounded-2xl border border-slate-100 bg-white shadow-sm transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-16 flex-col items-center justify-center rounded-xl bg-slate-50">
                      <span className="text-xs font-medium text-slate-400">
                        {formatConsultationDateTime(
                          c.scheduledAt,
                          locale,
                          { month: 'short', day: 'numeric' },
                          t('hospital.common.notAvailable', undefined, 'N/A'),
                        )}
                      </span>
                      <span className="text-base font-bold text-slate-900">
                        {formatConsultationDateTime(
                          c.scheduledAt,
                          locale,
                          { hour: 'numeric', minute: '2-digit' },
                          '--',
                        )}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <StatusBadge
                          status={c.status ?? 'UNKNOWN'}
                          label={getHospitalStatusLabel(c.status, t)}
                        />
                        <span className="flex items-center gap-1 text-xs text-slate-500"><Clock size={12} /> {formatDurationMinutesLabel(c.durationMinutes ?? 30, t)}</span>
                      </div>
                      {c.notes && <p className="mt-1 text-xs text-slate-400">{c.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.status === 'SCHEDULED' && (
                      <button onClick={() => router.push(`/consultations/${c.id}/room`)}
                        className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-sm">
                        <Video size={16} /> {t('hospital.cases.detail.consultation.enter', undefined, 'Enter')}
                      </button>
                    )}
                    {c.status === 'COMPLETED' && (
                      <button onClick={() => setExpandedId(isExpanded ? null : c.id)}
                        className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors">
                        {t('hospital.cases.detail.consultation.viewDetails', undefined, 'View Details')} {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded details for completed consultations */}
                {isExpanded && c.status === 'COMPLETED' && (
                  <CompletedConsultationDetails consultationId={c.id} onViewTranscript={() => setTranscriptId(c.id)} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Transcript Modal */}
      {transcriptId && <ConsultationTranscriptModal consultationId={transcriptId} onClose={() => setTranscriptId(null)} />}
    </div>
  );
}

function CompletedConsultationDetails({ consultationId: _consultationId, onViewTranscript }: { consultationId: string; onViewTranscript: () => void }) {
  const { t } = useHospitalI18n();

  return (
    <div className="border-t border-slate-100 bg-indigo-50/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-indigo-600" />
          <h4 className="font-semibold text-slate-900">{t('hospital.cases.detail.consultation.aiSummary', undefined, 'AI Summary')}</h4>
          <span className="text-xs text-slate-400 uppercase">{t('hospital.cases.detail.consultation.aiGenerated', undefined, 'AI Generated')}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onViewTranscript}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-200 rounded-full hover:bg-indigo-50">
            <FileText size={14} /> {t('hospital.cases.detail.consultation.transcript', undefined, 'Transcript')}
          </button>
          <button className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-200 rounded-full hover:bg-indigo-50">
            <Video size={14} /> {t('hospital.cases.detail.consultation.video', undefined, 'Video')}
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-500 text-center py-4">{t('hospital.cases.detail.consultation.aiSummaryPending', undefined, 'AI summary will be available after consultation recording is processed.')}</p>
    </div>
  );
}

function ConsultationTranscriptModal({ consultationId, onClose }: { consultationId: string; onClose: () => void }) {
  const { locale, t } = useHospitalI18n();
  const { data, isPending } = useConsultationTranscript(consultationId);
  const transcript = data as { entries?: Array<{ speaker: string; timestamp: string; original: string; translated?: string }> } | null;
  const entries = transcript?.entries ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm">
      <div className="w-full max-w-3xl h-[80vh] bg-white rounded-[2rem] shadow-2xl flex flex-col overflow-hidden mx-4">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center"><FileText size={18} className="text-purple-600" /></div>
            <h3 className="text-lg font-semibold text-slate-900">{t('hospital.cases.detail.consultation.fullTranscript', undefined, 'Full Transcript')}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
          {isPending ? (
            <div className="flex items-center justify-center py-12 text-slate-400">{t('hospital.cases.detail.consultation.transcriptLoading', undefined, 'Loading transcript...')}</div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <FileText size={40} className="mb-3 opacity-50" />
              <p className="text-sm">{t('hospital.cases.detail.consultation.transcriptEmpty', undefined, 'No transcript entries available yet.')}</p>
              <p className="text-xs mt-1">{t('hospital.cases.detail.consultation.transcriptPending', undefined, 'Transcript will be generated after the consultation recording is processed.')}</p>
            </div>
          ) : (
            entries.map((entry, i) => {
              const isDoctor = i % 2 === 0;
              return (
                <div key={i} className={`flex flex-col ${isDoctor ? 'items-start' : 'items-end'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-slate-700">{entry.speaker || t('hospital.common.unknown', undefined, 'Unknown')}</span>
                    <span className="text-[10px] font-mono text-slate-400">{formatTranscriptTimestamp(entry.timestamp, locale)}</span>
                  </div>
                  <div className={`max-w-[80%] p-4 border ${isDoctor ? 'bg-blue-50 border-blue-100 rounded-2xl rounded-tl-none' : 'bg-cyan-50 border-cyan-100 rounded-2xl rounded-tr-none'}`}>
                    <p className="text-sm text-slate-700">{entry.original}</p>
                    {entry.translated && (
                      <div className={`mt-2 pt-2 border-t ${isDoctor ? 'border-blue-200/60' : 'border-cyan-200/60'}`}>
                        <p className="text-sm italic text-slate-500">{entry.translated}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
