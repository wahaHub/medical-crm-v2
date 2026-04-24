'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Stethoscope,
  Users,
  Camera,
  Plus,
  Edit2,
  Trash2,
  Check,
  Search,
  Shield,
  Languages,
  Plane,
  Sparkles,
  CreditCard,
  ImageIcon,
  Video,
  Upload,
  MoreVertical,
  Globe,
  Copy,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Clock,
  X,
  BedDouble,
  UserCheck,
  Map as MapIcon,
  Heart,
  ChevronDown,
  ChevronRight,
  Play,
  MessageSquareQuote,
  Package,
} from 'lucide-react';
import {
  Button,
  Modal,
  EmptyState,
  LoadingSpinner,
} from '@medical-crm/ui';
import type { UploadedAsset } from '@medical-crm/ui';
import {
  useMaterialsInfo,
  useProcedures,
  useSurgeons,
  useBeforeAfterCases,
} from '@/queries/use-materials';
import {
  updateHospitalInfo,
  createProcedure,
  updateProcedure,
  deleteProcedure,
  createSurgeon,
  updateSurgeon,
  deleteSurgeon,
  createBeforeAfterCase,
  updateBeforeAfterCase,
  deleteBeforeAfterCase,
  uploadMaterialFile,
} from '@/actions/materials-actions';
import type {
  MaterialsHospitalInfoDTO,
  MaterialsProcedureDTO,
  MaterialsSurgeonDTO,
  MaterialsBeforeAfterCaseDTO,
} from '@/lib/api-types';
import { useAuth } from '@/lib/auth-context';
import { useHospitalI18n } from '@/lib/hospital-i18n';
import { sanitizeDepartmentStats } from '@/lib/materials-payload';
import { ReviewsTab } from '@/components/materials/reviews-tab';
import { PackagesTab } from '@/components/materials/packages-tab';

type TranslationFn = (key: string, values?: Record<string, string | number>, fallback?: string) => string;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function isLocalPreviewUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && (value.startsWith('blob:') || value.startsWith('data:'));
}

export async function uploadMaterialAsset(file: File, materialKind: string): Promise<UploadedAsset> {
  const result = await uploadMaterialFile(materialKind, {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || 'application/octet-stream',
  });

  const putRes = await fetch(result.upload.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error(`Upload failed for "${file.name}" (status ${putRes.status})`);
  }

  return result.asset;
}

export type SaveProgressStatus = 'pending' | 'uploading' | 'saving' | 'done' | 'failed';

export type SaveProgressItem = {
  id: string;
  label: string;
  targetKey?: string;
  status: SaveProgressStatus;
  error?: string;
};

export type SaveProgressState = {
  open: boolean;
  title: string;
  items: SaveProgressItem[];
  failedTargetKey?: string;
  canDismiss: boolean;
  debugDetails?: string;
  showDebugDetails?: boolean;
};

const MATERIALS_DEBUG_PREFIX = '[hospital.materials.debug]';
const SAFE_USER_ERROR_PATTERNS = [
  /^please\b/i,
  /^select\b/i,
  /^choose\b/i,
  /^enter\b/i,
  /^provide\b/i,
  /^upload\b/i,
  /^add\b/i,
  /^remove\b/i,
  /^set\b/i,
  /\brequired\b/i,
  /\binvalid\b/i,
  /\bmissing\b/i,
  /\bmust\b/i,
  /\bcannot\b/i,
  /\bcan't\b/i,
  /\bat least\b/i,
  /\btoo\b/i,
  /\bneeds?\s+to\b/i,
  /\bis\s+required\b/i,
  /\bis\s+invalid\b/i,
  /\bis\s+missing\b/i,
];

const UNSAFE_USER_ERROR_PATTERNS = [
  /\b(database|db|sql|prisma|orm|postgres|mysql|redis|mongo|server|service|gateway|proxy|network|fetch|request|response|timeout|exception|stack|trace|traceback|econn|enotfound|econnreset|unauthorized|forbidden|internal|bucket|storage|cdn|cloudflare|token)\b/i,
  /^failed\b/i,
  /^unable\b/i,
  /\bstatus\s*\d{3}\b/i,
  /\bcode\s*\d{3}\b/i,
  /\bnot found\b/i,
];

function extractDebugDetails(error: unknown): string | undefined {
  if (error instanceof Error) {
    const markerIndex = error.message.indexOf(MATERIALS_DEBUG_PREFIX);
    if (markerIndex >= 0) {
      return error.message.slice(markerIndex + MATERIALS_DEBUG_PREFIX.length).trim();
    }
  }

  if (typeof error === 'object' && error && 'body' in error) {
    return JSON.stringify(error.body, null, 2);
  }

  return undefined;
}

export function extractSafeUserErrorDetail(error: unknown): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  const rawDetail = error.message.trim();
  const detail = rawDetail.replace(/\s+/g, ' ');
  if (
    !detail
    || detail.includes(MATERIALS_DEBUG_PREFIX)
    || /[\r\n]/.test(rawDetail)
    || detail.length > 160
    || UNSAFE_USER_ERROR_PATTERNS.some((pattern) => pattern.test(detail))
    || !SAFE_USER_ERROR_PATTERNS.some((pattern) => pattern.test(detail))
  ) {
    return undefined;
  }

  return detail;
}

export function formatUserFacingError(
  error: unknown,
  t: TranslationFn,
  summaryKey: string,
  summaryFallback: string,
): string {
  const summary = t(summaryKey, undefined, summaryFallback);
  const detail = extractSafeUserErrorDetail(error);

  if (!detail) {
    return summary;
  }

  return t(
    'hospital.materials.errors.withDetail',
    { summary, detail },
    '{summary} Details: {detail}',
  );
}

function extractSaveFailureMessage(error: unknown, t: TranslationFn): string {
  const debugDetails = extractDebugDetails(error);
  if (!debugDetails) {
    return formatUserFacingError(
      error,
      t,
      'hospital.materials.save.failure',
      'Failed to save hospital information.',
    );
  }

  try {
    const parsed = JSON.parse(debugDetails) as {
      responseBody?: {
        error?: {
          issues?: Array<{ message?: string; path?: Array<string | number> }>;
        };
      };
    };
    const firstIssue = parsed.responseBody?.error?.issues?.[0];
    if (firstIssue?.message) {
      const fieldPath = firstIssue.path?.length ? ` (${firstIssue.path.join('.')})` : '';
      return `${firstIssue.message}${fieldPath}`;
    }
  } catch {
    return t(
      'hospital.materials.save.failureWithDebug',
      undefined,
      'Failed to save hospital information. Expand the debug logs for details.',
    );
  }

  return t(
    'hospital.materials.save.failureWithDebug',
    undefined,
    'Failed to save hospital information. Expand the debug logs for details.',
  );
}

export function getFlashClass(active: boolean) {
  return active
    ? 'rounded-2xl ring-2 ring-amber-400 ring-offset-4 ring-offset-white animate-pulse transition-shadow duration-700'
    : '';
}

export function UploadProgressModal({
  state,
  onDismiss,
}: {
  state: SaveProgressState;
  onDismiss: () => void;
}) {
  const { t } = useHospitalI18n();
  const completedCount = state.items.filter((item) => item.status === 'done').length;
  const progress = state.items.length > 0 ? Math.round((completedCount / state.items.length) * 100) : 0;

  return (
    <Modal open={state.open} onClose={state.canDismiss ? onDismiss : () => {}} title={state.title} maxWidth="max-w-xl">
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              {state.failedTargetKey
                ? t('hospital.materials.uploadProgress.errorSummary', undefined, 'Upload finished with errors')
                : t('hospital.materials.uploadProgress.inProgressSummary', undefined, 'Uploading and saving your changes')}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                state.failedTargetKey ? 'bg-gradient-to-r from-amber-400 to-rose-500' : 'bg-gradient-to-r from-cyan-500 to-blue-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {state.items.map((item) => (
            <div
              key={item.id}
              className={`rounded-xl border px-3 py-3 flex items-start gap-3 ${
                item.status === 'failed'
                  ? 'border-rose-200 bg-rose-50'
                  : item.status === 'done'
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-slate-200 bg-white'
              }`}
            >
              <div className="mt-0.5 shrink-0">
                {item.status === 'done' && <Check size={16} className="text-emerald-600" />}
                {item.status === 'failed' && <X size={16} className="text-rose-600" />}
                {(item.status === 'uploading' || item.status === 'saving') && <LoadingSpinner size="sm" />}
                {item.status === 'pending' && <div className="w-4 h-4 rounded-full bg-slate-200" />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800">{item.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {item.status === 'pending' && t('hospital.materials.uploadProgress.pending', undefined, 'Waiting')}
                  {item.status === 'uploading' && t('hospital.materials.uploadProgress.uploading', undefined, 'Uploading...')}
                  {item.status === 'saving' && t('hospital.materials.uploadProgress.saving', undefined, 'Saving...')}
                  {item.status === 'done' && t('hospital.materials.uploadProgress.done', undefined, 'Done')}
                  {item.status === 'failed' && (item.error || t('hospital.materials.uploadProgress.uploadFailed', undefined, 'Upload failed'))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {state.showDebugDetails && state.debugDetails ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-800">
                {t('hospital.materials.uploadProgress.debugTitle', undefined, 'Technical debug logs')}
              </div>
              <div className="text-xs text-slate-500">
                {t('hospital.materials.uploadProgress.debugDescription', undefined, 'Raw backend error / validation JSON')}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-950 shadow-inner">
              <pre className="max-h-64 overflow-auto px-4 py-3 text-xs leading-5 text-slate-100 whitespace-pre-wrap break-words">
                {state.debugDetails}
              </pre>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            disabled={!state.canDismiss}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {state.failedTargetKey
              ? t('hospital.materials.uploadProgress.dismissAndLocate', undefined, 'Dismiss and locate issue')
              : t('hospital.materials.uploadProgress.close', undefined, 'Close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Reusable Image Upload Widget ───────────────────────────────────
export function ImageUploadWidget({
  value,
  onChange,
  onFileSelect,
  onUpload,
  label,
  placeholder,
  previewClassName = 'h-40 w-full',
  compact = false,
  allowDirectUrl = true,
}: {
  value: string;
  onChange: (url: string) => void;
  onFileSelect?: (file: File, previewUrl: string) => void;
  onUpload?: (file: File) => Promise<UploadedAsset>;
  label?: string;
  placeholder?: string;
  previewClassName?: string;
  compact?: boolean;
  allowDirectUrl?: boolean;
}) {
  const { t } = useHospitalI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [_uploading, setUploading] = useState(false);
  const resolvedLabel = label || t('hospital.materials.media.image', undefined, 'Image');
  const resolvedPlaceholder = placeholder || t('hospital.materials.media.imagePlaceholder', undefined, 'https://... or click Upload');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (onUpload) {
      // Show immediate preview while the file uploads in the background.
      const dataUrl = await readFileAsDataUrl(file);
      onChange(dataUrl);
      setUploading(true);
      try {
        await onUpload(file);
      } catch {
        // Keep the local preview so the user can retry or remove it.
      } finally {
        setUploading(false);
      }
    } else if (onFileSelect) {
      const previewUrl = URL.createObjectURL(file);
      onChange(previewUrl);
      onFileSelect(file, previewUrl);
    } else {
      onChange(await readFileAsDataUrl(file));
    }
    e.target.value = '';
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500';

  if (compact) {
    // Compact mode: square thumbnail + upload button, used in modals
    return (
      <div>
        <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileChange} />
        <label className="block text-xs font-medium text-slate-500 mb-1">{resolvedLabel}</label>
        <div className="flex items-start gap-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer overflow-hidden shrink-0"
          >
            {value ? (
              <img src={value} alt={resolvedLabel} className="w-full h-full object-cover" />
            ) : (
              <>
                <Upload size={20} className="mb-1" />
                <span className="text-[10px] font-medium">
                  {t('hospital.materials.actions.upload', undefined, 'Upload')}
                </span>
              </>
            )}
          </div>
          <div className="flex-1 space-y-2">
            {allowDirectUrl && (
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={inputClass}
                placeholder={resolvedPlaceholder}
              />
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-blue-100 transition-colors"
            >
              <Upload size={12} /> {t('hospital.materials.actions.chooseFile', undefined, 'Choose File')}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-rose-100 transition-colors"
              >
                <Trash2 size={12} /> {t('hospital.materials.actions.remove', undefined, 'Remove')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Standard mode: text input + upload button + preview below
  return (
    <div>
      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileChange} />
      <label className="block text-xs font-medium text-slate-500 mb-1">{resolvedLabel}</label>
      <div className="space-y-2">
        <div className="flex gap-2">
          {allowDirectUrl && (
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={`flex-1 ${inputClass}`}
              placeholder={resolvedPlaceholder}
            />
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-blue-100 transition-colors shrink-0"
          >
            <Upload size={14} /> {t('hospital.materials.actions.upload', undefined, 'Upload')}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="px-3 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-rose-100 transition-colors shrink-0"
            >
              <Trash2 size={14} /> {t('hospital.materials.actions.remove', undefined, 'Remove')}
            </button>
          )}
        </div>
        {value && (
          <img src={value} alt={resolvedLabel} className={`${previewClassName} rounded-lg object-cover`} />
        )}
      </div>
    </div>
  );
}

// ── Reusable Video Upload Widget ───────────────────────────────────
export function VideoUploadWidget({
  videos,
  onAdd,
  onRemove,
  label,
  emptyText,
  editing = false,
}: {
  videos: string[];
  onAdd?: (file: File) => void;
  onRemove?: (index: number) => void;
  label?: string;
  emptyText?: string;
  editing?: boolean;
}) {
  const { t } = useHospitalI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const resolvedLabel = label || t('hospital.materials.media.videos', undefined, 'Videos');
  const resolvedEmptyText = emptyText || t('hospital.materials.media.noVideosUploaded', undefined, 'No videos uploaded');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => onAdd?.(file));
    e.target.value = '';
  };

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        accept="video/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-slate-700">{resolvedLabel}</h4>
        {editing && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-blue-100 transition-colors"
          >
            <Video size={12} /> {t('hospital.materials.actions.addVideos', undefined, 'Add Videos')}
          </button>
        )}
      </div>
      {videos.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {videos.map((videoUrl, idx) => (
            <div key={idx} className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-video bg-slate-900">
              {playingIdx === idx ? (
                <video
                  src={videoUrl}
                  className="w-full h-full object-cover"
                  controls
                  autoPlay
                  onEnded={() => setPlayingIdx(null)}
                />
              ) : (
                <>
                  <video src={videoUrl} className="w-full h-full object-cover" preload="metadata" />
                  <div
                    className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
                    onClick={() => setPlayingIdx(idx)}
                  >
                    <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                      <Play size={18} className="text-slate-800 ml-0.5" />
                    </div>
                  </div>
                </>
              )}
              {editing && (
                <button
                  type="button"
                  onClick={() => onRemove?.(idx)}
                  className="absolute top-2 right-2 p-1 bg-white text-rose-600 rounded-md hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="h-32 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <Video size={24} className="mx-auto mb-1" />
            <span className="text-xs">{resolvedEmptyText}</span>
            {editing && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="block mx-auto mt-2 text-xs font-medium text-blue-600"
              >
                <Upload size={12} className="inline mr-1" /> {t('hospital.materials.actions.uploadVideo', undefined, 'Upload Video')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function getMaterialsTabs(t: TranslationFn) {
  return [
    { id: 'info', label: t('hospital.materials.tabs.info', undefined, 'Hospital Info'), icon: Building2 },
    { id: 'procedures', label: t('hospital.materials.tabs.procedures', undefined, 'Procedures'), icon: Stethoscope },
    { id: 'surgeons', label: t('hospital.materials.tabs.surgeons', undefined, 'Surgeons'), icon: Users },
    { id: 'cases', label: t('hospital.materials.tabs.cases', undefined, 'Case Gallery'), icon: Camera },
    { id: 'reviews', label: t('hospital.materials.tabs.reviews', undefined, 'Reviews'), icon: MessageSquareQuote },
    { id: 'packages', label: t('hospital.materials.tabs.packages', undefined, 'Packages'), icon: Package },
  ];
}

function ConsumerWebsiteLink({ slug, hospitalType }: { slug: string; hospitalType: 'hospital' | 'regular_hospital' }) {
  const { t } = useHospitalI18n();
  const [copied, setCopied] = useState(false);
  const isRegular = hospitalType === 'regular_hospital';
  const url = slug
    ? isRegular
      ? `https://www.medicaltourismchina.health/hospitals/${slug}`
      : `https://www.medorabeauty.com/hospital/${slug}`
    : '';
  const description = isRegular
    ? t(
      'hospital.materials.consumerWebsite.regularDescription',
      undefined,
      'The following information will be published as hospital information on www.medicaltourismchina.health',
    )
    : t(
      'hospital.materials.consumerWebsite.defaultDescription',
      undefined,
      'The following information will be published as hospital information on www.medorabeauty.com',
    );

  const handleCopy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-5 shadow-sm border border-green-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-green-500 rounded-lg p-2">
            <Globe size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-800">
              {t('hospital.materials.consumerWebsite.title', undefined, 'Consumer Website Link')}
            </h3>
            <p className="text-sm text-slate-600 mt-0.5">{description}</p>
          </div>
        </div>
        {url && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={url}
              className="min-w-[320px] px-3 py-2 bg-white border border-green-200 rounded-lg text-sm font-mono text-slate-700 focus:outline-none cursor-text"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopy}
              className="px-3 py-2 border border-green-300 hover:bg-green-100 rounded-lg text-sm font-medium text-slate-700 flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Copy size={14} />
              {copied
                ? t('hospital.materials.consumerWebsite.copied', undefined, 'Copied!')
                : t('hospital.materials.consumerWebsite.copy', undefined, 'Copy')}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 border border-green-300 hover:bg-green-100 rounded-lg text-sm font-medium text-slate-700 flex items-center gap-1.5 transition-colors shrink-0"
            >
              <ExternalLink size={14} />
              {t('hospital.materials.consumerWebsite.open', undefined, 'Open')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function MaterialsTabs() {
  const { t } = useHospitalI18n();
  const [activeTab, setActiveTab] = useState('info');
  const { data: infoData } = useMaterialsInfo();
  const { user } = useAuth();
  const hospitalSlug = (infoData as MaterialsHospitalInfoDTO | undefined)?.slug ?? '';
  const hospitalType: 'hospital' | 'regular_hospital' = user.roles.includes('regular_hospital') ? 'regular_hospital' : 'hospital';
  const isRegular = hospitalType === 'regular_hospital';

  const tabs = getMaterialsTabs(t);
  const visibleTabs = isRegular
    ? tabs.filter((tab) => tab.id !== 'procedures')
    : tabs.filter((tab) => tab.id !== 'reviews' && tab.id !== 'packages');

  return (
    <div className="space-y-6">
      {/* Consumer Website Link */}
      <ConsumerWebsiteLink slug={hospitalSlug} hospitalType={hospitalType} />

      {/* Review Instructions Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-5 shadow-sm border border-blue-100">
        <div className="flex items-start gap-4">
          <div className="bg-blue-500 rounded-lg p-2 shrink-0">
            <Building2 size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-slate-800 mb-1">
              {t('hospital.materials.reviewBanner.title', undefined, 'Review Instructions')}
            </h4>
            <p className="text-sm text-slate-600 mb-2">
              {t(
                'hospital.materials.reviewBanner.description',
                undefined,
                'Your submitted materials will be pre-reviewed by AI and verified by our team before publication. Please ensure information is accurate and professional.',
              )}
            </p>
            <div className="flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Clock size={14} className="text-amber-500" />
                {t(
                  'hospital.materials.reviewBanner.aiReview',
                  undefined,
                  'AI review + human verification, within 0.5 business days',
                )}
              </span>
              <span className="flex items-center gap-1">
                <Languages size={14} className="text-blue-500" />
                {t(
                  'hospital.materials.reviewBanner.translation',
                  undefined,
                  'Content will be AI-translated into multiple languages',
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Underline-style Tabs with icons */}
      <div className="flex items-center gap-6 border-b border-slate-200">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-4 text-sm font-medium transition-colors relative flex items-center gap-2 ${
                isActive ? 'text-cyan-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={16} />
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-600 rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'info' && <HospitalInfoTab hospitalType={hospitalType} />}
      {activeTab === 'procedures' && !isRegular && <ProceduresTab />}
      {activeTab === 'surgeons' && <SurgeonsTab />}
      {activeTab === 'cases' && <BeforeAfterTab />}
      {activeTab === 'reviews' && isRegular && <ReviewsTab />}
      {activeTab === 'packages' && isRegular && <PackagesTab />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 1 — Hospital Info                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
        <Icon size={16} />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
    </div>
  );
}

// ── Options constants from CRM v1 ──────────────────────────────────
function getLanguageOptions(t: TranslationFn) {
  return [
    { value: 'en', label: t('hospital.materials.languages.english', undefined, 'English') },
    { value: 'zh', label: t('hospital.materials.languages.chinese', undefined, 'Chinese') },
    { value: 'kr', label: t('hospital.materials.languages.korean', undefined, 'Korean') },
    { value: 'jp', label: t('hospital.materials.languages.japanese', undefined, 'Japanese') },
    { value: 'ar', label: t('hospital.materials.languages.arabic', undefined, 'Arabic') },
    { value: 'th', label: t('hospital.materials.languages.thai', undefined, 'Thai') },
    { value: 'es', label: t('hospital.materials.languages.spanish', undefined, 'Spanish') },
    { value: 'ru', label: t('hospital.materials.languages.russian', undefined, 'Russian') },
    { value: 'fr', label: t('hospital.materials.languages.french', undefined, 'French') },
    { value: 'de', label: t('hospital.materials.languages.german', undefined, 'German') },
  ];
}

const SURGEON_LANGUAGE_ALIASES: Record<string, string> = {
  en: 'en',
  english: 'en',
  zh: 'zh',
  chinese: 'zh',
  kr: 'kr',
  ko: 'kr',
  korean: 'kr',
  jp: 'jp',
  ja: 'jp',
  japanese: 'jp',
  ar: 'ar',
  arabic: 'ar',
  th: 'th',
  thai: 'th',
  es: 'es',
  spanish: 'es',
  ru: 'ru',
  russian: 'ru',
  fr: 'fr',
  french: 'fr',
  de: 'de',
  german: 'de',
};

function normalizeSurgeonLanguageValue(value: string): string {
  const normalized = value.trim().toLowerCase();
  return SURGEON_LANGUAGE_ALIASES[normalized] ?? value;
}

function getSurgeonLanguageOptions(t: TranslationFn) {
  return getLanguageOptions(t).map((option) => ({
    value: option.value,
    label: option.label,
  }));
}

function getHospitalTierOptions(t: TranslationFn) {
  return [
    { value: '三甲', label: t('hospital.materials.hospitalTier.class3a', undefined, 'Class 3A (三甲)') },
    { value: '三乙', label: t('hospital.materials.hospitalTier.class3b', undefined, 'Class 3B (三乙)') },
    { value: '二甲', label: t('hospital.materials.hospitalTier.class2a', undefined, 'Class 2A (二甲)') },
    { value: '二乙', label: t('hospital.materials.hospitalTier.class2b', undefined, 'Class 2B (二乙)') },
    { value: '一级', label: t('hospital.materials.hospitalTier.class1', undefined, 'Class 1 (一级)') },
    { value: '国际医院', label: t('hospital.materials.hospitalTier.international', undefined, 'International Hospital (国际医院)') },
    { value: '未评级', label: t('hospital.materials.hospitalTier.unrated', undefined, 'Unrated (未评级)') },
  ];
}

function getOwnershipTypeOptions(t: TranslationFn) {
  return [
    { value: 'Public', label: t('hospital.materials.ownership.public', undefined, 'Public') },
    { value: 'Private', label: t('hospital.materials.ownership.private', undefined, 'Private') },
    { value: 'University-affiliated', label: t('hospital.materials.ownership.universityAffiliated', undefined, 'University-affiliated') },
    { value: 'Military', label: t('hospital.materials.ownership.military', undefined, 'Military') },
    { value: 'Joint Venture', label: t('hospital.materials.ownership.jointVenture', undefined, 'Joint Venture') },
    { value: 'Non-profit', label: t('hospital.materials.ownership.nonProfit', undefined, 'Non-profit') },
  ];
}

function getAirportServiceOptions(t: TranslationFn) {
  return [
    { value: 'complimentary_transfer', label: t('hospital.materials.airportServices.complimentaryTransfer', undefined, 'Complimentary Airport Transfer') },
    { value: 'paid_transfer', label: t('hospital.materials.airportServices.paidTransfer', undefined, 'Paid Airport Pickup') },
    { value: 'airport_assistance', label: t('hospital.materials.airportServices.assistance', undefined, 'Airport Assistance') },
    { value: 'visa_on_arrival', label: t('hospital.materials.airportServices.visaOnArrival', undefined, 'Visa on Arrival Assistance') },
  ];
}

function getAmenityOptions(t: TranslationFn) {
  return [
    { value: 'private_suite', label: t('hospital.materials.amenities.privateSuite', undefined, 'Private Recovery Suites') },
    { value: 'wifi', label: t('hospital.materials.amenities.wifi', undefined, 'Free Wi-Fi') },
    { value: 'concierge', label: t('hospital.materials.amenities.concierge', undefined, 'Medical Tourism Concierge') },
    { value: 'insurance_coord', label: t('hospital.materials.amenities.insuranceCoordination', undefined, 'International Insurance Coordination') },
    { value: 'visa_assistance', label: t('hospital.materials.amenities.visaAssistance', undefined, 'Visa Assistance') },
    { value: 'interpreter', label: t('hospital.materials.amenities.interpreter', undefined, 'Interpreter Services') },
    { value: 'halal_food', label: t('hospital.materials.amenities.halalFood', undefined, 'Halal Food Available') },
    { value: 'vegetarian', label: t('hospital.materials.amenities.vegetarian', undefined, 'Vegetarian Options') },
    { value: 'family_accommodation', label: t('hospital.materials.amenities.familyAccommodation', undefined, 'Family Accommodation') },
    { value: 'pharmacy', label: t('hospital.materials.amenities.pharmacy', undefined, '24/7 Pharmacy') },
  ];
}

function getPaymentMethodOptions(t: TranslationFn) {
  return [
    { value: 'cash', label: t('hospital.materials.paymentMethods.cash', undefined, 'Cash') },
    { value: 'credit_card', label: t('hospital.materials.paymentMethods.creditCard', undefined, 'Credit Card') },
    { value: 'debit_card', label: t('hospital.materials.paymentMethods.debitCard', undefined, 'Debit Card') },
    { value: 'wechat_pay', label: t('hospital.materials.paymentMethods.wechatPay', undefined, 'WeChat Pay') },
    { value: 'alipay', label: t('hospital.materials.paymentMethods.alipay', undefined, 'Alipay') },
    { value: 'unionpay', label: t('hospital.materials.paymentMethods.unionPay', undefined, 'UnionPay') },
    { value: 'bank_transfer', label: t('hospital.materials.paymentMethods.bankTransfer', undefined, 'Bank Transfer') },
    { value: 'international_transfer', label: t('hospital.materials.paymentMethods.internationalTransfer', undefined, 'International Transfer') },
    { value: 'paypal', label: t('hospital.materials.paymentMethods.paypal', undefined, 'PayPal') },
    { value: 'apple_pay', label: t('hospital.materials.paymentMethods.applePay', undefined, 'Apple Pay') },
    { value: 'google_pay', label: t('hospital.materials.paymentMethods.googlePay', undefined, 'Google Pay') },
    { value: 'insurance_direct', label: t('hospital.materials.paymentMethods.insuranceDirect', undefined, 'Insurance Direct Billing') },
  ];
}

function getCertificationPresets(t: TranslationFn) {
  return [
    {
      value: 'jci',
      label: t('hospital.materials.certifications.jci', undefined, 'JCI Accreditation'),
      persistedName: 'JCI Accreditation',
    },
    {
      value: 'iso_9001',
      label: t('hospital.materials.certifications.iso9001', undefined, 'ISO 9001:2015'),
      persistedName: 'ISO 9001:2015',
    },
    {
      value: 'iso_15189',
      label: t('hospital.materials.certifications.iso15189', undefined, 'ISO 15189'),
      persistedName: 'ISO 15189',
    },
    {
      value: 'nabh',
      label: t('hospital.materials.certifications.nabh', undefined, 'NABH Accreditation'),
      persistedName: 'NABH Accreditation',
    },
    {
      value: 'aahrpp',
      label: t('hospital.materials.certifications.aahrpp', undefined, 'AAHRPP'),
      persistedName: 'AAHRPP',
    },
    {
      value: 'cap',
      label: t('hospital.materials.certifications.cap', undefined, 'CAP Accreditation'),
      persistedName: 'CAP Accreditation',
    },
  ];
}

function formatLocaleNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(value);
}

function formatProcedurePriceRange(
  procedure: MaterialsProcedureDTO,
  locale: string,
  t: TranslationFn,
): string {
  if (procedure.priceMin != null || procedure.priceMax != null) {
    return t(
      'hospital.materials.procedures.priceRangeValue',
      {
        currency: t('hospital.materials.procedures.defaultCurrency', undefined, 'USD'),
        min: formatLocaleNumber(procedure.priceMin ?? 0, locale),
        max: formatLocaleNumber(procedure.priceMax ?? 0, locale),
      },
      'USD {min} - {max}',
    );
  }

  return procedure.priceRange ?? '-';
}

function getFollowupOptions(t: TranslationFn) {
  return [
    { value: 'lifetime', label: t('hospital.materials.followup.lifetime', undefined, 'Lifetime Follow-up Care') },
    { value: '1_year', label: t('hospital.materials.followup.oneYear', undefined, '1 Year Follow-up') },
    { value: '6_months', label: t('hospital.materials.followup.sixMonths', undefined, '6 Months Follow-up') },
    { value: 'telemedicine', label: t('hospital.materials.followup.telemedicine', undefined, 'Remote Telemedicine') },
    { value: 'local_partner', label: t('hospital.materials.followup.localPartner', undefined, 'Local Partner Clinic Referral') },
  ];
}

function mergeOptionLists(...groups: Array<Array<{ value: string; label: string }>>): Array<{ value: string; label: string }> {
  const seen = new Set<string>();
  return groups.flat().filter((option) => {
    if (seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
}

/** Shows selected items as chips + an "Add" button that opens a selection modal */
function ChipSelector({
  options,
  selected,
  onChange,
  editing,
  label,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  editing: boolean;
  label?: string;
}) {
  const { t } = useHospitalI18n();
  const [showAddModal, setShowAddModal] = useState(false);
  const selectedLabels = options.filter((o) => selected.includes(o.value));

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center">
        {selectedLabels.length > 0 ? (
          selectedLabels.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-xs font-medium"
            >
              <Check size={10} />
              {opt.label}
              {editing && (
                <button
                  onClick={() => onChange(selected.filter((v) => v !== opt.value))}
                  className="ml-0.5 text-indigo-400 hover:text-indigo-700"
                >
                  <X size={10} />
                </button>
              )}
            </span>
          ))
        ) : (
          <span className="text-sm text-slate-400">
            {t('hospital.materials.empty.noneSelected', undefined, 'None selected')}
          </span>
        )}
        {editing && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white text-blue-600 border border-blue-200 rounded-md text-xs font-medium hover:bg-blue-50 transition-colors"
          >
            <Plus size={12} /> {t('hospital.materials.actions.add', undefined, 'Add')}
          </button>
        )}
      </div>
      {showAddModal && (
        <AddOptionsModal
          title={label ?? t('hospital.materials.actions.selectOptions', undefined, 'Select Options')}
          options={options}
          selected={selected}
          onChange={onChange}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

function AddOptionsModal({
  title,
  options,
  selected,
  onChange,
  onClose,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useHospitalI18n();
  const [localSelected, setLocalSelected] = useState<string[]>([...selected]);

  const toggle = (value: string) => {
    setLocalSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const handleDone = () => {
    onChange(localSelected);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {options.map((opt) => {
          const isChecked = localSelected.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                isChecked ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(opt.value)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className={`text-sm font-medium ${isChecked ? 'text-indigo-700' : 'text-slate-700'}`}>
                {opt.label}
              </span>
            </label>
          );
        })}
      </div>
      <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
          {t('hospital.materials.actions.cancel', undefined, 'Cancel')}
        </button>
        <button onClick={handleDone} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors">
          {t(
            'hospital.materials.actions.doneSelected',
            { count: localSelected.length },
            'Done ({count} selected)',
          )}
        </button>
      </div>
    </Modal>
  );
}

function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const { t } = useHospitalI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const optionMap = new Map(options.map((option) => [option.value, option.label]));
  const selectedLabels = selected.map((value) => optionMap.get(value) ?? value);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  const toggleValue = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-left flex items-center justify-between gap-3 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
      >
        <span className={selectedLabels.length > 0 ? 'text-slate-700' : 'text-slate-400'}>
          {selectedLabels.length > 0
            ? selectedLabels.join(', ')
            : (placeholder || t('hospital.materials.actions.selectOptions', undefined, 'Select options'))}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-900/5 overflow-hidden">
          <div className="max-h-64 overflow-y-auto p-2">
            {options.map((option) => {
              const isChecked = selected.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                    isChecked ? 'bg-purple-50 text-purple-700' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleValue(option.value)}
                    className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="flex-1">{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Operating Hours picker ─────────────────────────────────────────
const TIME_OPTIONS = [
  '00:00', '00:30', '01:00', '01:30', '02:00', '02:30', '03:00', '03:30',
  '04:00', '04:30', '05:00', '05:30', '06:00', '06:30', '07:00', '07:30',
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00', '23:30',
];

function getDayNames(t: TranslationFn) {
  return [
    { key: 'monday', label: t('hospital.materials.days.mon', undefined, 'Mon'), labelFull: t('hospital.materials.days.monday', undefined, 'Monday') },
    { key: 'tuesday', label: t('hospital.materials.days.tue', undefined, 'Tue'), labelFull: t('hospital.materials.days.tuesday', undefined, 'Tuesday') },
    { key: 'wednesday', label: t('hospital.materials.days.wed', undefined, 'Wed'), labelFull: t('hospital.materials.days.wednesday', undefined, 'Wednesday') },
    { key: 'thursday', label: t('hospital.materials.days.thu', undefined, 'Thu'), labelFull: t('hospital.materials.days.thursday', undefined, 'Thursday') },
    { key: 'friday', label: t('hospital.materials.days.fri', undefined, 'Fri'), labelFull: t('hospital.materials.days.friday', undefined, 'Friday') },
    { key: 'saturday', label: t('hospital.materials.days.sat', undefined, 'Sat'), labelFull: t('hospital.materials.days.saturday', undefined, 'Saturday') },
    { key: 'sunday', label: t('hospital.materials.days.sun', undefined, 'Sun'), labelFull: t('hospital.materials.days.sunday', undefined, 'Sunday') },
  ];
}

const OPERATING_HOURS_DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

function parseHoursString(hours: string | undefined): Record<string, { open: string; close: string; closed: boolean }> {
  const result: Record<string, { open: string; close: string; closed: boolean }> = {};
  OPERATING_HOURS_DAY_KEYS.forEach((dayKey) => {
    result[dayKey] = { open: '09:00', close: '18:00', closed: false };
  });
  if (!hours) return result;
  const parts = hours.split(',').map((s) => s.trim());
  for (const part of parts) {
    const match = part.match(/^([\w-]+)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/i);
    if (match) {
      const [, dayRange, open, close] = match;
      const days = parseDayRange(dayRange!);
      days.forEach((day) => {
        if (result[day]) {
          result[day] = { open: padTime(open!), close: padTime(close!), closed: false };
        }
      });
    }
  }
  return result;
}

function parseDayRange(range: string): string[] {
  const dayMap: Record<string, string> = {
    mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday',
    fri: 'friday', sat: 'saturday', sun: 'sunday',
    monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday',
    thursday: 'thursday', friday: 'friday', saturday: 'saturday', sunday: 'sunday',
  };
  const rangeParts = range.toLowerCase().split('-');
  if (rangeParts.length === 2) {
    const startDay = dayMap[rangeParts[0]!.trim()];
    const endDay = dayMap[rangeParts[1]!.trim()];
    if (startDay && endDay) {
      const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const startIdx = dayOrder.indexOf(startDay);
      const endIdx = dayOrder.indexOf(endDay);
      if (startIdx !== -1 && endIdx !== -1) {
        return dayOrder.slice(startIdx, endIdx + 1);
      }
    }
  }
  const singleDay = dayMap[range.toLowerCase().trim()];
  return singleDay ? [singleDay] : [];
}

function padTime(time: string): string {
  const [h, m] = time.split(':');
  return `${(h ?? '').padStart(2, '0')}:${m}`;
}

function formatHoursToString(hours: Record<string, { open: string; close: string; closed: boolean }>): string {
  const groups: { days: string[]; open: string; close: string }[] = [];
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const day of dayOrder) {
    const h = hours[day]!;
    if (h.closed) continue;
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.open === h.open && lastGroup.close === h.close) {
      lastGroup.days.push(day);
    } else {
      groups.push({ days: [day], open: h.open, close: h.close });
    }
  }
  const dayShort: Record<string, string> = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
    friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
  };
  return groups
    .map((g) => {
      const dayStr =
        g.days.length > 1
          ? `${dayShort[g.days[0]!]}-${dayShort[g.days[g.days.length - 1]!]}`
          : dayShort[g.days[0]!];
      return `${dayStr} ${g.open}-${g.close}`;
    })
    .join(', ');
}

export function OperatingHoursModal({
  hours,
  onChange,
  isOpen,
  onClose,
}: {
  hours?: string;
  onChange: (hours: string) => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { t } = useHospitalI18n();
  const dayNames = useMemo(() => getDayNames(t), [t]);
  const [structuredHours, setStructuredHours] = useState(() => parseHoursString(hours));
  const [quickOpen, setQuickOpen] = useState('09:00');
  const [quickClose, setQuickClose] = useState('18:00');

  useEffect(() => {
    setStructuredHours(parseHoursString(hours));
  }, [hours]);

  const updateDay = (dayKey: string, field: 'open' | 'close' | 'closed', value: string | boolean) => {
    setStructuredHours((prev) => ({
      ...prev,
      [dayKey]: { ...prev[dayKey]!, [field]: value },
    }));
  };

  const applyToWeekdays = () => {
    setStructuredHours((prev) => {
      const next = { ...prev };
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach((day) => {
        next[day] = { open: quickOpen, close: quickClose, closed: false };
      });
      return next;
    });
  };

  const handleSave = () => {
    onChange(formatHoursToString(structuredHours));
    onClose();
  };

  const timeSelectOptions = TIME_OPTIONS.filter((_, i) => i % 2 === 0); // whole hours only in dropdown

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={t('hospital.materials.operatingHours.title', undefined, 'Operating Hours')}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        {/* Quick Set Weekdays */}
        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
          <span className="text-sm text-slate-600 shrink-0">
            {t('hospital.materials.operatingHours.weekdays', undefined, 'Weekdays:')}
          </span>
          <select
            value={quickOpen}
            onChange={(e) => setQuickOpen(e.target.value)}
            className="w-20 h-8 text-xs border border-slate-200 rounded-md px-1 bg-white"
          >
            {timeSelectOptions.map((time) => (
              <option key={time} value={time}>{time}</option>
            ))}
          </select>
          <span className="text-slate-400">-</span>
          <select
            value={quickClose}
            onChange={(e) => setQuickClose(e.target.value)}
            className="w-20 h-8 text-xs border border-slate-200 rounded-md px-1 bg-white"
          >
            {timeSelectOptions.map((time) => (
              <option key={time} value={time}>{time}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={applyToWeekdays}
            className="ml-auto h-8 px-3 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
          >
            {t('hospital.materials.actions.apply', undefined, 'Apply')}
          </button>
        </div>

        {/* Day-by-day */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {dayNames.map((day) => {
            const dayData = structuredHours[day.key]!;
            return (
              <div key={day.key} className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg">
                <div className="w-10 text-sm font-medium text-slate-700">{day.label}</div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!dayData.closed}
                    onChange={(e) => updateDay(day.key, 'closed', !e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-200 rounded-full peer peer-checked:bg-green-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-full" />
                </label>
                {!dayData.closed ? (
                  <>
                    <select
                      value={dayData.open}
                      onChange={(e) => updateDay(day.key, 'open', e.target.value)}
                      className="w-20 h-7 text-xs border border-slate-200 rounded-md px-1 bg-white"
                    >
                      {timeSelectOptions.map((time) => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                    <span className="text-slate-400 text-xs">-</span>
                    <select
                      value={dayData.close}
                      onChange={(e) => updateDay(day.key, 'close', e.target.value)}
                      className="w-20 h-7 text-xs border border-slate-200 rounded-md px-1 bg-white"
                    >
                      {timeSelectOptions.map((time) => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">
                    {t('hospital.materials.operatingHours.closed', undefined, 'Closed')}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Preview & Save */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="text-xs text-slate-500">
            {formatHoursToString(structuredHours)
              || t('hospital.materials.operatingHours.none', undefined, 'No hours set')}
          </span>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
          >
            {t('hospital.materials.actions.save', undefined, 'Save')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Empty Map initializers (typed outside JSX to avoid TSX generic parsing issues)
type PendingVideoMap = Map<string, File>;
type PendingTestimonialMap = Map<string, { file: File; patientName: string; patientCountry: string; procedureName: string }>;
type PendingDeptImageMap = Map<string, { previewUrl: string; file: File }>;
const emptyVideoMap: PendingVideoMap = new Map();
const emptyTestimonialMap: PendingTestimonialMap = new Map();
const emptyDeptImageMap: PendingDeptImageMap = new Map();
type EditablePhoto = { previewUrl: string; storageKey: string | null };
type EditableVideo = { previewUrl: string; storageKey: string | null };

function HospitalInfoTab({ hospitalType }: { hospitalType: 'hospital' | 'regular_hospital' }) {
  const { locale, t } = useHospitalI18n();
  const { data, isLoading } = useMaterialsInfo();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [languages, setLanguages] = useState<string[]>(['en', 'zh']);
  const [airportServices, setAirportServices] = useState<string[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<Array<{ id: string; name: string; year?: number }>>([]);
  const [newCertType, setNewCertType] = useState('');
  const [newCertYear, setNewCertYear] = useState('');
  const [followupCare, setFollowupCare] = useState<string[]>([]);
  const [attractions, setAttractions] = useState<Array<{ id: string; name: string; distance: string }>>([]);
  const [newAttractionName, setNewAttractionName] = useState('');
  const [newAttractionDistance, setNewAttractionDistance] = useState('');
  const [heroImageStorageKey, setHeroImageStorageKey] = useState<string | null>(null);
  const [pendingHeroFile, setPendingHeroFile] = useState<File | null>(null);
  const [photos, setPhotos] = useState<EditablePhoto[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<Array<{ previewUrl: string; file: File }>>([]);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [flashTargetKey, setFlashTargetKey] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState<SaveProgressState>({
    open: false,
    title: '',
    items: [],
    canDismiss: false,
  });
  const isRegular = hospitalType === 'regular_hospital';
  const languageOptions = getLanguageOptions(t);
  const airportServiceOptions = getAirportServiceOptions(t);
  const amenityOptions = getAmenityOptions(t);
  const paymentMethodOptions = getPaymentMethodOptions(t);
  const certificationPresets = getCertificationPresets(t);
  const followupOptions = getFollowupOptions(t);
  const hospitalTierOptions = getHospitalTierOptions(t);
  const ownershipTypeOptions = getOwnershipTypeOptions(t);
  const departmentOptions = getDepartmentOptions(t);

  // Department state (regular_hospital only)
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [showDeptSelector, setShowDeptSelector] = useState(false);
  const [deptDescriptions, setDeptDescriptions] = useState<Record<string, string>>({});
  const [deptKeyServices, setDeptKeyServices] = useState<Record<string, string[]>>({});
  const [deptStats, setDeptStats] = useState<Record<string, { specialists?: number; annualPatients?: number }>>({});
  const [deptServiceInputs, setDeptServiceInputs] = useState<Record<string, string>>({});
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  // Equipment state (regular_hospital only)
  const [equipment, setEquipment] = useState<Array<{ name: string; description: string; imageUrl: string; imageStorageKey?: string | null }>>([]);
  const [pendingEquipmentImages, setPendingEquipmentImages] = useState<Map<string, File>>(new Map());

  // Promotional videos state
  const [promotionalVideos, setPromotionalVideos] = useState<EditableVideo[]>([]);
  const [pendingVideos, setPendingVideos] = useState(emptyVideoMap);

  // Video testimonials state
  const [videoTestimonials, setVideoTestimonials] = useState<Array<{
    id: string;
    videoUrl: string;
    videoStorageKey?: string | null;
    thumbnailUrl?: string;
    thumbnailStorageKey?: string | null;
    patientName?: string;
    patientCountry?: string;
    procedureName?: string;
    duration?: string;
  }>>([]);
  const [pendingTestimonials, setPendingTestimonials] = useState(emptyTestimonialMap);
  const [isAddingTestimonial, setIsAddingTestimonial] = useState(false);
  const [pendingTestimonial, setPendingTestimonial] = useState<{
    previewUrl: string;
    storageKey?: string | null;
    file: File;
    patientName: string;
    patientCountry: string;
    procedureName: string;
  } | null>(null);
  const testimonialInputRef = useRef<HTMLInputElement>(null);

  // Department images state (regular_hospital only)
  const [deptImages, setDeptImages] = useState<Record<string, string>>({});
  const [deptImageStorageKeys, setDeptImageStorageKeys] = useState<Record<string, string>>({});
  const [pendingDeptImages, setPendingDeptImages] = useState(emptyDeptImageMap);

  const registerSectionRef = (key: string) => (node: HTMLDivElement | null) => {
    sectionRefs.current[key] = node;
  };

  const focusSection = (key?: string) => {
    if (!key) return;
    const node = sectionRefs.current[key];
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashTargetKey(key);
    window.setTimeout(() => {
      setFlashTargetKey((current) => (current === key ? null : current));
    }, 2200);
  };

  const updateSaveProgress = (taskId: string, patch: Partial<SaveProgressItem>) => {
    setSaveProgress((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === taskId ? { ...item, ...patch } : item)),
    }));
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (data as any) ?? null;
  const info = {
    name: raw?.name ?? '',
    nameEn: raw?.nameEn ?? '',
    slug: raw?.slug ?? '',
    heroImage: raw?.heroImage ?? '',
    photos: raw?.photos ?? [],
    highlights: raw?.highlights ?? [],
    yearEstablished: raw?.yearEstablished ?? '',
    tagline: raw?.tagline ?? '',
    description: raw?.description ?? '',
    phone: raw?.phone ?? '',
    email: raw?.email ?? '',
    address: raw?.address ?? '',
    website: raw?.website ?? '',
    operatingHours: raw?.operatingHours ?? raw?.hours ?? '',
    bedCount: raw?.bedCount ?? '',
    patientCapacity: raw?.patientCapacity ?? '',
    totalPatients: raw?.totalPatients ?? '',
    nearbyAttractions: raw?.nearbyAttractions ?? [],
    departments: raw?.departments ?? [],
    departmentDescriptions: raw?.departmentDescriptions ?? {},
    departmentKeyServices: raw?.departmentKeyServices ?? {},
    departmentStats: sanitizeDepartmentStats(raw?.departmentStats),
    departmentImages: raw?.departmentImages ?? {},
    equipment: raw?.equipment ?? [],
    promotionalVideos: raw?.promotionalVideos ?? [],
    videoTestimonials: raw?.videoTestimonials ?? [],
    province: raw?.province ?? '',
    city: raw?.city ?? '',
    district: raw?.district ?? '',
    tier: raw?.tier ?? '',
    ownershipType: raw?.ownershipType ?? '',
    hospitalType: raw?.hospitalType ?? '',
    // Array fields from API for chip selectors
    multilingualStaff: raw?.multilingualStaff ?? [],
    airportServices: raw?.airportServices ?? [],
    amenities: raw?.amenities ?? [],
    paymentMethods: raw?.paymentMethods ?? [],
    certifications: raw?.certifications ?? [],
    followUpCare: raw?.followUpCare ?? [],
  };

  // Sync array/chip state from loaded data when data first loads
  // This ensures read-only display and edit mode show correct data from the API
  useEffect(() => {
    if (!raw) return;
    setForm({
      name: raw.name ?? '',
      nameEn: raw.nameEn ?? '',
      heroImage: raw.heroImage ?? '',
      yearEstablished: raw.yearEstablished != null ? String(raw.yearEstablished) : '',
      tagline: raw.tagline ?? '',
      description: raw.description ?? '',
      phone: raw.phone ?? '',
      email: raw.email ?? '',
      address: raw.address ?? '',
      website: raw.website ?? '',
      operatingHours: raw.operatingHours ?? raw.hours ?? '',
      bedCount: raw.bedCount != null ? String(raw.bedCount) : '',
      patientCapacity: raw.patientCapacity != null ? String(raw.patientCapacity) : '',
      totalPatients: raw.totalPatients != null ? String(raw.totalPatients) : '',
      province: raw.province ?? '',
      city: raw.city ?? '',
      district: raw.district ?? '',
      tier: raw.tier ?? '',
      ownershipType: raw.ownershipType ?? '',
      hospitalType: raw.hospitalType ?? '',
    });
    setHeroImageStorageKey(raw.heroImageStorageKey ?? null);
    setLanguages(raw.multilingualStaff ?? []);
    setAirportServices(raw.airportServices ?? []);
    setAmenities(raw.amenities ?? []);
    setPaymentMethods(raw.paymentMethods ?? []);
    setCertifications((raw.certifications ?? []).map((c: { id?: string; name: string; year?: number }, i: number) => ({
      id: c.id ?? `cert-${i}`,
      name: c.name ?? '',
      year: c.year,
    })));
    setFollowupCare(raw.followUpCare ?? []);
    setAttractions((raw.nearbyAttractions ?? []).map((a: { id?: string; name: string; distance: string }, i: number) => ({
      id: a.id ?? `attr-${i}`,
      name: a.name ?? '',
      distance: a.distance ?? '',
    })));
    setPhotos((raw.photos ?? []).map((url: string, index: number) => ({
      previewUrl: url,
      storageKey: raw.photoStorageKeys?.[index] ?? null,
    })));
    setSelectedDepartments(raw.departments ?? []);
    setDeptDescriptions(raw.departmentDescriptions ?? {});
    setDeptKeyServices(raw.departmentKeyServices ?? {});
    setDeptStats(sanitizeDepartmentStats(raw.departmentStats));
    setDeptImages(raw.departmentImages ?? {});
    setDeptImageStorageKeys(raw.departmentImageStorageKeys ?? {});
    setEquipment((raw.equipment ?? []).map((e: { name: string; description?: string; image_url?: string }) => ({
      name: e.name ?? '',
      description: e.description ?? '',
      imageUrl: e.image_url ?? '',
      imageStorageKey: (e as { imageStorageKey?: string | null }).imageStorageKey ?? null,
    })));
    setPromotionalVideos((raw.promotionalVideos ?? []).map((url: string, index: number) => ({
      previewUrl: url,
      storageKey: raw.promotionalVideoStorageKeys?.[index] ?? null,
    })));
    setVideoTestimonials((raw.videoTestimonials ?? []).map((item: Record<string, unknown>) => ({
      ...item,
      id: String(item['id'] ?? ''),
      videoUrl: String(item['videoUrl'] ?? ''),
      videoStorageKey: (item['videoStorageKey'] as string | null | undefined) ?? null,
      thumbnailUrl: (item['thumbnailUrl'] as string | undefined) ?? undefined,
      thumbnailStorageKey: (item['thumbnailStorageKey'] as string | null | undefined) ?? null,
      patientName: (item['patientName'] as string | undefined) ?? undefined,
      patientCountry: (item['patientCountry'] as string | undefined) ?? undefined,
      procedureName: (item['procedureName'] as string | undefined) ?? undefined,
      duration: (item['duration'] as string | undefined) ?? undefined,
    })));
  }, [raw]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const startEdit = () => {
    setForm({
      name: info.name,
      nameEn: info.nameEn,
      heroImage: info.heroImage,
      yearEstablished: String(info.yearEstablished),
      tagline: info.tagline,
      description: info.description,
      phone: info.phone,
      email: info.email,
      address: info.address,
      website: info.website,
      operatingHours: info.operatingHours,
      bedCount: String(info.bedCount),
      patientCapacity: String(info.patientCapacity),
      totalPatients: String(info.totalPatients),
      province: info.province,
      city: info.city,
      district: info.district,
      tier: info.tier,
      ownershipType: info.ownershipType,
      hospitalType: info.hospitalType,
    });
    setHeroImageStorageKey(raw?.heroImageStorageKey ?? null);
    setPendingHeroFile(null);
    setAttractions(info.nearbyAttractions.map((a: { name: string; distance: string }, i: number) => ({ id: `attr-${i}`, name: a.name ?? '', distance: a.distance ?? '' })));
    if (info.departments.length) setSelectedDepartments(info.departments);
    setDeptDescriptions(info.departmentDescriptions ?? {});
    setDeptKeyServices(info.departmentKeyServices ?? {});
    setDeptStats(sanitizeDepartmentStats(info.departmentStats));
    setDeptServiceInputs({});
    setEquipment((info.equipment ?? []).map((e: { name: string; description?: string; image_url?: string }) => ({
      name: e.name ?? '',
      description: e.description ?? '',
      imageUrl: e.image_url ?? '',
      imageStorageKey: (e as { imageStorageKey?: string | null }).imageStorageKey ?? null,
    })));
    setPhotos((info.photos ?? []).map((url: string, index: number) => ({
      previewUrl: url,
      storageKey: raw?.photoStorageKeys?.[index] ?? null,
    })));
    setPendingPhotos([]);
    // Sync chip/array state from loaded data into edit mode
    setLanguages(info.multilingualStaff ?? []);
    setAirportServices(info.airportServices ?? []);
    setAmenities(info.amenities ?? []);
    setPaymentMethods(info.paymentMethods ?? []);
    setCertifications((info.certifications ?? []).map((c: { id?: string; name: string; year?: number }, i: number) => ({
      id: c.id ?? `cert-${i}`,
      name: c.name ?? '',
      year: c.year,
    })));
    setFollowupCare(info.followUpCare ?? []);
    setPromotionalVideos((info.promotionalVideos ?? []).map((url: string, index: number) => ({
      previewUrl: url,
      storageKey: raw?.promotionalVideoStorageKeys?.[index] ?? null,
    })));
    setPendingVideos(new Map());
    setVideoTestimonials((info.videoTestimonials ?? []).map((item: Record<string, unknown>) => ({
      ...item,
      id: String(item['id'] ?? ''),
      videoUrl: String(item['videoUrl'] ?? ''),
      videoStorageKey: (item['videoStorageKey'] as string | null | undefined) ?? null,
      thumbnailUrl: (item['thumbnailUrl'] as string | undefined) ?? undefined,
      thumbnailStorageKey: (item['thumbnailStorageKey'] as string | null | undefined) ?? null,
      patientName: (item['patientName'] as string | undefined) ?? undefined,
      patientCountry: (item['patientCountry'] as string | undefined) ?? undefined,
      procedureName: (item['procedureName'] as string | undefined) ?? undefined,
      duration: (item['duration'] as string | undefined) ?? undefined,
    })));
    setPendingTestimonials(new Map());
    setPendingTestimonial(null);
    setIsAddingTestimonial(false);
    setDeptImages(info.departmentImages ?? {});
    setDeptImageStorageKeys(raw?.departmentImageStorageKeys ?? {});
    setPendingDeptImages(new Map());
    setPendingEquipmentImages(new Map());
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    let failedTargetKey: string | undefined;
    let nextHeroImage = heroImageStorageKey ?? (form.heroImage || null);
    const nextPhotos = [...photos];
    const nextPromotionalVideos = [...promotionalVideos];
    const nextVideoTestimonials = [...videoTestimonials];
    const nextDepartmentImages = { ...deptImages };
    const nextDepartmentImageStorageKeys = { ...deptImageStorageKeys };
    const nextEquipment = [...equipment];

    const uploadTasks: Array<{
      id: string;
      label: string;
      targetKey: string;
      run: () => Promise<void>;
    }> = [];

    if (pendingHeroFile && form.heroImage && isLocalPreviewUrl(form.heroImage)) {
      uploadTasks.push({
        id: 'upload-hero-image',
        label: t(
          'hospital.materials.save.uploadHeroImage',
          { fileName: pendingHeroFile.name },
          'Upload hero image: {fileName}',
        ),
        targetKey: 'hero-image',
        run: async () => {
          const asset = await uploadMaterialAsset(pendingHeroFile, 'hero');
          nextHeroImage = asset.storageKey;
        },
      });
    }

    pendingPhotos.forEach(({ previewUrl, file }, index) => {
      const photoIndex = nextPhotos.findIndex((photo) => photo.previewUrl === previewUrl && !photo.storageKey);
      if (photoIndex === -1) return;
      uploadTasks.push({
        id: `upload-photo-${index}`,
        label: t(
          'hospital.materials.save.uploadHospitalPhoto',
          { fileName: file.name },
          'Upload hospital photo: {fileName}',
        ),
        targetKey: 'hospital-photos',
        run: async () => {
          const asset = await uploadMaterialAsset(file, 'gallery');
          nextPhotos[photoIndex] = { ...nextPhotos[photoIndex]!, storageKey: asset.storageKey };
        },
      });
    });

    Array.from(pendingVideos.entries()).forEach(([previewUrl, file], index) => {
      const videoIndex = nextPromotionalVideos.findIndex((video) => video.previewUrl === previewUrl && !video.storageKey);
      if (videoIndex === -1) return;
      uploadTasks.push({
        id: `upload-promotional-video-${index}`,
        label: t(
          'hospital.materials.save.uploadPromotionalVideo',
          { fileName: file.name },
          'Upload promotional video: {fileName}',
        ),
        targetKey: 'promotional-videos',
        run: async () => {
          const asset = await uploadMaterialAsset(file, 'hospital_video');
          nextPromotionalVideos[videoIndex] = { ...nextPromotionalVideos[videoIndex]!, storageKey: asset.storageKey };
        },
      });
    });

    Array.from(pendingTestimonials.entries()).forEach(([previewUrl, pending], index) => {
      const testimonialIndex = nextVideoTestimonials.findIndex(
        (testimonial) => testimonial.videoUrl === previewUrl && !testimonial.videoStorageKey,
      );
      if (testimonialIndex === -1) return;
      uploadTasks.push({
        id: `upload-testimonial-video-${index}`,
        label: t(
          'hospital.materials.save.uploadTestimonialVideo',
          { fileName: pending.file.name },
          'Upload testimonial video: {fileName}',
        ),
        targetKey: 'video-testimonials',
        run: async () => {
          const asset = await uploadMaterialAsset(pending.file, 'testimonial_video');
          nextVideoTestimonials[testimonialIndex] = {
            ...nextVideoTestimonials[testimonialIndex]!,
            videoStorageKey: asset.storageKey,
          };
        },
      });
    });

    Array.from(pendingDeptImages.entries()).forEach(([deptValue, pending], index) => {
      if (!nextDepartmentImages[deptValue] || nextDepartmentImageStorageKeys[deptValue]) return;
      uploadTasks.push({
        id: `upload-department-image-${index}`,
        label: t(
          'hospital.materials.save.uploadDepartmentImage',
          { fileName: pending.file.name },
          'Upload department image: {fileName}',
        ),
        targetKey: `department:${deptValue}`,
        run: async () => {
          const asset = await uploadMaterialAsset(pending.file, 'gallery');
          nextDepartmentImageStorageKeys[deptValue] = asset.storageKey;
          nextDepartmentImages[deptValue] = asset.storageKey;
        },
      });
    });

    Array.from(pendingEquipmentImages.entries()).forEach(([previewUrl, file], index) => {
      const equipmentIndex = nextEquipment.findIndex((item) => item.imageUrl === previewUrl && !item.imageStorageKey);
      if (equipmentIndex === -1) return;
      uploadTasks.push({
        id: `upload-equipment-image-${index}`,
        label: t(
          'hospital.materials.save.uploadEquipmentImage',
          { fileName: file.name },
          'Upload equipment image: {fileName}',
        ),
        targetKey: `equipment:${equipmentIndex}`,
        run: async () => {
          const asset = await uploadMaterialAsset(file, 'equipment');
          nextEquipment[equipmentIndex] = { ...nextEquipment[equipmentIndex]!, imageStorageKey: asset.storageKey };
        },
      });
    });

    setSaveProgress({
      open: true,
      title: t('hospital.materials.save.hospitalInfoTitle', undefined, 'Saving hospital information'),
      canDismiss: false,
      items: [
        ...uploadTasks.map((task) => ({
          id: task.id,
          label: task.label,
          targetKey: task.targetKey,
          status: 'pending' as const,
        })),
        {
          id: 'save-hospital-info',
          label: t('hospital.materials.save.hospitalInfoAction', undefined, 'Save hospital information'),
          targetKey: 'hospital-info-root',
          status: 'pending' as const,
        },
      ],
      showDebugDetails: false,
    });

    try {
      const uploadResults = await Promise.allSettled(
        uploadTasks.map(async (task) => {
          updateSaveProgress(task.id, { status: 'uploading', error: undefined });
          try {
            await task.run();
            updateSaveProgress(task.id, { status: 'done' });
          } catch (error) {
            const message = formatUserFacingError(
              error,
              t,
              'hospital.materials.uploadProgress.uploadFailed',
              'Upload failed',
            );
            failedTargetKey ??= task.targetKey;
            updateSaveProgress(task.id, { status: 'failed', error: message });
            throw error;
          }
        }),
      );

      if (uploadResults.some((result) => result.status === 'rejected')) {
        setSaveProgress((prev) => ({
          ...prev,
          canDismiss: true,
          failedTargetKey,
          showDebugDetails: false,
        }));
        return;
      }

      const unresolvedPhoto = nextPhotos.find((photo) => !photo.storageKey && isLocalPreviewUrl(photo.previewUrl));
      const unresolvedPromotionalVideo = nextPromotionalVideos.find(
        (video) => !video.storageKey && isLocalPreviewUrl(video.previewUrl),
      );
      const unresolvedTestimonial = nextVideoTestimonials.find(
        (testimonial) => !testimonial.videoStorageKey && isLocalPreviewUrl(testimonial.videoUrl),
      );
      const unresolvedDepartmentKey = Object.keys(nextDepartmentImages).find(
        (key) => !nextDepartmentImageStorageKeys[key] && isLocalPreviewUrl(nextDepartmentImages[key]),
      );
      const unresolvedEquipmentIndex = nextEquipment.findIndex(
        (item) => !item.imageStorageKey && isLocalPreviewUrl(item.imageUrl),
      );

      let unresolvedMedia:
        | { targetKey: string; message: string }
        | undefined;

      if (typeof nextHeroImage === 'string' && isLocalPreviewUrl(nextHeroImage)) {
        unresolvedMedia = {
          targetKey: 'hero-image',
          message: t('hospital.materials.save.heroImageIncomplete', undefined, 'Hero image upload did not finalize.'),
        };
      } else if (unresolvedPhoto) {
        unresolvedMedia = {
          targetKey: 'hospital-photos',
          message: t('hospital.materials.save.hospitalPhotoIncomplete', undefined, 'At least one hospital photo is still a local preview.'),
        };
      } else if (unresolvedPromotionalVideo) {
        unresolvedMedia = {
          targetKey: 'promotional-videos',
          message: t('hospital.materials.save.promotionalVideoIncomplete', undefined, 'At least one promotional video is still a local preview.'),
        };
      } else if (unresolvedTestimonial) {
        unresolvedMedia = {
          targetKey: 'video-testimonials',
          message: t('hospital.materials.save.testimonialVideoIncomplete', undefined, 'At least one testimonial video is still a local preview.'),
        };
      } else if (unresolvedDepartmentKey) {
        unresolvedMedia = {
          targetKey: `department:${unresolvedDepartmentKey}`,
          message: t('hospital.materials.save.departmentImageIncomplete', undefined, 'A department image is still a local preview.'),
        };
      } else if (unresolvedEquipmentIndex >= 0) {
        unresolvedMedia = {
          targetKey: `equipment:${unresolvedEquipmentIndex}`,
          message: t('hospital.materials.save.equipmentImageIncomplete', undefined, 'An equipment image is still a local preview.'),
        };
      }

      if (unresolvedMedia) {
        updateSaveProgress('save-hospital-info', {
          status: 'failed',
          error: unresolvedMedia.message,
        });
        setSaveProgress((prev) => ({
          ...prev,
          canDismiss: true,
          failedTargetKey: unresolvedMedia.targetKey,
          showDebugDetails: false,
        }));
        return;
      }

      updateSaveProgress('save-hospital-info', { status: 'saving' });

      await updateHospitalInfo({
        name: form.name || undefined,
        nameEn: form.nameEn || undefined,
        heroImage: nextHeroImage,
        photos: nextPhotos.map((photo) => photo.storageKey ?? photo.previewUrl),
        yearEstablished: form.yearEstablished ? Number(form.yearEstablished) : undefined,
        tagline: form.tagline || undefined,
        description: form.description || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        website: form.website || undefined,
        operatingHours: form.operatingHours || undefined,
        bedCount: form.bedCount ? Number(form.bedCount) : undefined,
        patientCapacity: form.patientCapacity ? Number(form.patientCapacity) : undefined,
        totalPatients: form.totalPatients ? Number(form.totalPatients) : undefined,
        province: form.province || undefined,
        city: form.city || undefined,
        district: form.district || undefined,
        tier: form.tier || undefined,
        ownershipType: form.ownershipType || undefined,
        hospitalType: form.hospitalType || undefined,
        nearbyAttractions: attractions
          .map((a) => ({ name: a.name.trim(), distance: a.distance.trim() }))
          .filter((a) => a.name.length > 0 && a.distance.length > 0),
        // Chip/array fields
        multilingualStaff: languages,
        airportServices,
        amenities,
        paymentMethods,
        certifications: certifications.map((c) => ({ id: c.id, name: c.name, year: c.year, isActive: true })),
        followUpCare: followupCare,
        promotionalVideos: nextPromotionalVideos
          .map((video) => video.storageKey ?? video.previewUrl)
          .filter((value) => !isLocalPreviewUrl(value)),
        videoTestimonials: nextVideoTestimonials
          .filter((t) => !isLocalPreviewUrl(t.videoUrl) || Boolean(t.videoStorageKey))
          .map((t) => ({
            id: t.id,
            videoUrl: t.videoStorageKey ?? t.videoUrl,
            thumbnailUrl: t.thumbnailStorageKey ?? t.thumbnailUrl,
            patientName: t.patientName,
            patientCountry: t.patientCountry,
            procedureName: t.procedureName,
            duration: t.duration,
          })),
        ...(isRegular ? {
          departments: selectedDepartments,
          departmentDescriptions: deptDescriptions,
          departmentKeyServices: deptKeyServices,
          departmentStats: sanitizeDepartmentStats(deptStats),
          departmentImages: Object.fromEntries(
            Object.keys(nextDepartmentImages).map((key) => [key, nextDepartmentImageStorageKeys[key] ?? nextDepartmentImages[key] ?? '']),
          ),
          equipment: nextEquipment.map((e) => ({
            name: e.name,
            description: e.description,
            image_url: e.imageStorageKey ?? e.imageUrl,
          })),
        } : {}),
      });
      updateSaveProgress('save-hospital-info', { status: 'done' });
      await queryClient.invalidateQueries({ queryKey: ['materials', 'info'] });
      setPendingHeroFile(null);
      setPendingPhotos([]);
      setPendingVideos(new Map());
      setPendingTestimonials(new Map());
      setPendingTestimonial(null);
      setIsAddingTestimonial(false);
      setPendingDeptImages(new Map());
      setPendingEquipmentImages(new Map());
      setHeroImageStorageKey(typeof nextHeroImage === 'string' ? nextHeroImage : null);
      setEditing(false);
      window.setTimeout(() => {
        setSaveProgress({
          open: false,
          title: '',
          items: [],
          canDismiss: false,
        });
      }, 500);
    } catch (error) {
      failedTargetKey ??= 'hospital-info-root';
      updateSaveProgress('save-hospital-info', {
        status: 'failed',
        error: extractSaveFailureMessage(error, t),
      });
      setSaveProgress((prev) => ({
        ...prev,
        canDismiss: true,
        failedTargetKey,
        debugDetails: extractDebugDetails(error),
        showDebugDetails: false,
      }));
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const previewUrl = URL.createObjectURL(file);
      setPhotos((prev) => [...prev, { previewUrl, storageKey: null }]);
      setPendingPhotos((prev) => [...prev, { previewUrl, file }]);
    });
    e.target.value = '';
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500';

  const renderField = (
    label: string,
    key: string,
    opts?: {
      type?: string;
      placeholder?: string;
      icon?: React.ElementType;
      rows?: number;
      options?: Array<{ value: string; label: string }>;
    },
  ) => {
    const Icon = opts?.icon;
    const selectedOption = opts?.options?.find((option) => option.value === (form[key] ?? ''));
    return (
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          {Icon && <Icon size={12} className="inline mr-1" />}{label}
        </label>
        {editing ? (
          opts?.rows ? (
            <textarea
              value={form[key] ?? ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className={`${inputClass} resize-none`}
              rows={opts.rows}
              placeholder={opts?.placeholder ?? ''}
            />
          ) : opts?.options ? (
            <select
              value={form[key] ?? ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className={inputClass}
            >
              <option value="">
                {opts.placeholder
                  ?? t('hospital.materials.fields.selectField', { field: label }, 'Select {field}')}
              </option>
              {opts.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={opts?.type ?? 'text'}
              value={form[key] ?? ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className={inputClass}
              placeholder={opts?.placeholder ?? ''}
            />
          )
        ) : (
          <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
            {selectedOption?.label ?? form[key] ?? (
              <span className="text-slate-400">
                {opts?.placeholder ?? t('hospital.materials.fields.notSet', undefined, 'Not set')}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={registerSectionRef('hospital-info-root')} className={`space-y-6 pb-10 ${getFlashClass(flashTargetKey === 'hospital-info-root')}`}>
      <UploadProgressModal
        state={saveProgress}
        onDismiss={() => {
          if (saveProgress.failedTargetKey && saveProgress.debugDetails && !saveProgress.showDebugDetails) {
            setSaveProgress((prev) => ({
              ...prev,
              showDebugDetails: true,
            }));
            return;
          }
          const failedKey = saveProgress.failedTargetKey;
          setSaveProgress({
            open: false,
            title: '',
            items: [],
            canDismiss: false,
            debugDetails: undefined,
            showDebugDetails: false,
          });
          focusSection(failedKey);
        }}
      />
      {/* Edit Profile sticky bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="text-sm text-slate-500">
          {editing
            ? t('hospital.materials.header.editing', undefined, 'Editing hospital information...')
            : t('hospital.materials.header.viewing', undefined, 'Viewing hospital information')}
        </div>
        <div className="flex items-center gap-3">
          {editing ? (
            <>
              <button
                onClick={() => {
                  // Clean up blob URLs
                  pendingPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
                  for (const url of pendingVideos.keys()) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); }
                  for (const p of pendingDeptImages.values()) { if (p.previewUrl.startsWith('blob:')) URL.revokeObjectURL(p.previewUrl); }
                  if (pendingTestimonial?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(pendingTestimonial.previewUrl);
                  for (const key of pendingTestimonials.keys()) { if (key.startsWith('blob:')) URL.revokeObjectURL(key); }
                  if (form.heroImage && form.heroImage.startsWith('blob:')) URL.revokeObjectURL(form.heroImage);
                  for (const previewUrl of pendingEquipmentImages.keys()) { if (previewUrl.startsWith('blob:')) URL.revokeObjectURL(previewUrl); }
                  setPendingPhotos([]);
                  setPendingVideos(new Map());
                  setPendingTestimonials(new Map());
                  setPendingTestimonial(null);
                  setIsAddingTestimonial(false);
                  setPendingDeptImages(new Map());
                  setPendingHeroFile(null);
                  setPendingEquipmentImages(new Map());
                  setEditing(false);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                {t('hospital.materials.actions.cancel', undefined, 'Cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Check size={16} /> {saving
                  ? t('hospital.materials.actions.saving', undefined, 'Saving...')
                  : t('hospital.materials.actions.saveChanges', undefined, 'Save Changes')}
              </button>
            </>
          ) : (
            <button
              onClick={startEdit}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-2"
            >
              <Edit2 size={16} /> {t('hospital.materials.actions.editProfile', undefined, 'Edit Profile')}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div ref={registerSectionRef('hero-image')} className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm ${getFlashClass(flashTargetKey === 'hero-image')}`}>
            <SectionHeader icon={Building2} title={t('hospital.materials.sections.basicInformation', undefined, 'Basic Information')} />
            <div className="space-y-4">
              <div>
                {renderField(
                  t('hospital.materials.fields.hospitalName', undefined, 'Hospital Name'),
                  'name',
                  { placeholder: t('hospital.materials.placeholders.hospitalName', undefined, 'Hospital name') },
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {renderField(
                  t('hospital.materials.fields.yearEstablished', undefined, 'Year Established'),
                  'yearEstablished',
                  { type: 'number', placeholder: t('hospital.materials.placeholders.yearEstablished', undefined, 'e.g. 2005') },
                )}
                {renderField(
                  t('hospital.materials.fields.tagline', undefined, 'Tagline'),
                  'tagline',
                  { placeholder: t('hospital.materials.placeholders.tagline', undefined, 'A short tagline') },
                )}
              </div>
              {renderField(
                t('hospital.materials.fields.description', undefined, 'Description'),
                'description',
                { rows: 4, placeholder: t('hospital.materials.placeholders.hospitalDescription', undefined, 'Hospital description...') },
              )}
              {editing ? (
                <ImageUploadWidget
                  value={form.heroImage ?? ''}
                  onChange={(url) => {
                    setForm({ ...form, heroImage: url });
                    if (!url) {
                      setHeroImageStorageKey(null);
                      setPendingHeroFile(null);
                    }
                  }}
                  onFileSelect={(file, previewUrl) => {
                    setPendingHeroFile(file);
                    setForm({ ...form, heroImage: previewUrl });
                    setHeroImageStorageKey(null);
                  }}
                  label={t('hospital.materials.fields.heroImage', undefined, 'Hero Image')}
                  previewClassName="h-40 w-full"
                  allowDirectUrl={false}
                />
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">
                    {t('hospital.materials.fields.heroImage', undefined, 'Hero Image')}
                  </label>
                  {info.heroImage ? (
                    <img
                      src={info.heroImage}
                      alt={t('hospital.materials.media.heroAlt', undefined, 'Hero')}
                      className="h-40 w-full rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-32 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400">
                      <div className="text-center">
                        <ImageIcon size={24} className="mx-auto mb-1" />
                        <span className="text-xs">
                          {t('hospital.materials.empty.noHeroImage', undefined, 'No hero image')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Contact & Location */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <SectionHeader icon={MapPin} title={t('hospital.materials.sections.contactLocation', undefined, 'Contact & Location')} />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {renderField(t('hospital.materials.fields.phone', undefined, 'Phone'), 'phone', {
                  icon: Phone,
                  placeholder: t('hospital.materials.placeholders.phone', undefined, '+1 234 567 890'),
                })}
                {renderField(t('hospital.materials.fields.email', undefined, 'Email'), 'email', {
                  icon: Mail,
                  placeholder: t('hospital.materials.placeholders.email', undefined, 'hospital@example.com'),
                })}
              </div>
              {renderField(t('hospital.materials.fields.address', undefined, 'Address'), 'address', {
                icon: MapPin,
                placeholder: t('hospital.materials.placeholders.address', undefined, 'Full address'),
              })}
              {renderField(t('hospital.materials.fields.website', undefined, 'Website'), 'website', {
                icon: Globe,
                placeholder: t('hospital.materials.placeholders.website', undefined, 'https://...'),
              })}
              {/* Operating Hours with picker */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  <Clock size={12} className="inline mr-1" />
                  {t('hospital.materials.fields.operatingHours', undefined, 'Operating Hours')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editing ? (form.operatingHours ?? '') : (info.operatingHours || '')}
                    onChange={(e) => setForm({ ...form, operatingHours: e.target.value })}
                    readOnly={!editing}
                    className={inputClass}
                    placeholder={t('hospital.materials.placeholders.operatingHours', undefined, 'e.g. Mon-Fri 09:00-18:00')}
                  />
                  {editing && (
                    <button
                      type="button"
                      onClick={() => setShowHoursModal(true)}
                      className="shrink-0 px-3 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-sm font-medium text-slate-700 flex items-center gap-1.5 transition-colors"
                    >
                      <Clock size={14} />
                      {t('hospital.materials.actions.setHours', undefined, 'Set Hours')}
                    </button>
                  )}
                </div>
              </div>
              <OperatingHoursModal
                hours={form.operatingHours || info.operatingHours}
                onChange={(newHours) => setForm({ ...form, operatingHours: newHours })}
                isOpen={showHoursModal}
                onClose={() => setShowHoursModal(false)}
              />
            </div>
          </div>

          {/* Hospital Photos & Videos */}
          <div className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm ${getFlashClass(flashTargetKey === 'hospital-photos' || flashTargetKey === 'promotional-videos')}`}>
            <SectionHeader icon={ImageIcon} title={t('hospital.materials.sections.photosVideos', undefined, 'Hospital Photos & Videos')} />
            <input type="file" ref={photoInputRef} accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
            <div className="space-y-6">
              <div ref={registerSectionRef('hospital-photos')}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-slate-700">
                    {t('hospital.materials.fields.photos', undefined, 'Photos')}
                  </h4>
                  {editing && (
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="text-xs font-medium text-blue-600 flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <Upload size={12} /> {t('hospital.materials.actions.uploadPhotos', undefined, 'Upload Photos')}
                    </button>
                  )}
                </div>
                {((editing ? photos : info.photos).length > 0) ? (
                  <div className="grid grid-cols-4 gap-3">
                    {(editing ? photos.map((photo) => photo.previewUrl) : info.photos).map((url: string, i: number) => (
                      <div
                        key={`${editing ? 'editing' : 'existing'}-${i}-${url}`}
                        className="aspect-square rounded-lg bg-slate-100 border border-slate-200 overflow-hidden relative group"
                      >
                        <img
                          src={url}
                          alt={t('hospital.materials.media.photoNumber', { count: i + 1 }, 'Photo {count}')}
                          className="w-full h-full object-cover"
                        />
                        {editing && (
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button
                              onClick={() => {
                                setPhotos((prev) => prev.filter((_, idx) => idx !== i));
                                setPendingPhotos((prev) => prev.filter((photo) => photo.previewUrl !== url));
                              }}
                              className="p-1.5 bg-white text-rose-600 rounded-md hover:bg-rose-50"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className={`h-32 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 ${editing ? 'cursor-pointer hover:bg-slate-100 hover:border-blue-300' : ''}`}
                    onClick={editing ? () => photoInputRef.current?.click() : undefined}
                  >
                    <div className="text-center">
                      <ImageIcon size={24} className="mx-auto mb-1" />
                      <span className="text-xs">
                        {editing
                          ? t('hospital.materials.empty.clickToUploadPhotos', undefined, 'Click to upload photos')
                          : t('hospital.materials.empty.noPhotosUploaded', undefined, 'No photos uploaded')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div ref={registerSectionRef('promotional-videos')}>
                <VideoUploadWidget
                  videos={editing ? promotionalVideos.map((video) => video.previewUrl) : (info.promotionalVideos ?? [])}
                  editing={editing}
                  label={t('hospital.materials.fields.promotionalVideos', undefined, 'Promotional Videos')}
                  emptyText={t('hospital.materials.media.noVideosUploaded', undefined, 'No videos uploaded')}
                  onAdd={(file) => {
                    const previewUrl = URL.createObjectURL(file);
                    setPendingVideos((prev) => new Map(prev).set(previewUrl, file));
                    setPromotionalVideos((prev) => [...prev, { previewUrl, storageKey: null }]);
                  }}
                  onRemove={(idx) => {
                    const url = promotionalVideos[idx]?.previewUrl;
                    if (url?.startsWith('blob:')) {
                      setPendingVideos((prev) => { const m = new Map(prev); m.delete(url); return m; });
                      URL.revokeObjectURL(url);
                    }
                    setPromotionalVideos((prev) => prev.filter((_, i) => i !== idx));
                  }}
                />
              </div>
            </div>
          </div>

          {/* Video Testimonials */}
          <div
            ref={registerSectionRef('video-testimonials')}
            className={`bg-white p-6 rounded-2xl border border-slate-200 shadow-sm ${getFlashClass(flashTargetKey === 'video-testimonials')}`}
          >
              <SectionHeader icon={Video} title={t('hospital.materials.sections.videoTestimonials', undefined, 'Video Testimonials')} />
              <input
                type="file"
                ref={testimonialInputRef}
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const previewUrl = URL.createObjectURL(file);
                  setPendingTestimonial({
                    previewUrl,
                    storageKey: null,
                    file,
                    patientName: '',
                    patientCountry: '',
                    procedureName: '',
                  });
                  setIsAddingTestimonial(true);
                  e.target.value = '';
                }}
              />
              {editing && (
                <div className="mb-4 flex justify-end">
                  <button
                  type="button"
                  onClick={() => testimonialInputRef.current?.click()}
                  className="px-3 py-1.5 bg-purple-50 text-purple-600 border border-purple-200 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-purple-100 transition-colors"
                >
                  <Plus size={12} /> {t('hospital.materials.actions.addTestimonial', undefined, 'Add Testimonial')}
                </button>
              </div>
              )}
              {(() => {
                const testimonials = editing ? videoTestimonials : (info.videoTestimonials ?? []);
                return testimonials.length > 0 || (editing && isAddingTestimonial) ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {testimonials.map((testimonial: { id: string; videoUrl: string; thumbnailUrl?: string; patientName?: string; patientCountry?: string; procedureName?: string; duration?: string }, i: number) => (
                      <div key={testimonial.id} className="rounded-xl border border-slate-200 overflow-hidden relative group">
                        <div className="aspect-video bg-slate-900 flex items-center justify-center relative">
                          {testimonial.thumbnailUrl ? (
                            <img src={testimonial.thumbnailUrl} alt={testimonial.patientName ?? ''} className="w-full h-full object-cover" />
                          ) : testimonial.videoUrl ? (
                            <video src={testimonial.videoUrl} className="w-full h-full object-cover" muted preload="metadata" />
                          ) : (
                            <Video size={32} className="text-white/50" />
                          )}
                          {/* Play button overlay */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                              <Play size={18} className="text-slate-800 ml-0.5" />
                            </div>
                          </div>
                          {testimonial.duration && (
                            <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                              {testimonial.duration}
                            </span>
                          )}
                          {editing && (
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
                              <button
                                type="button"
                                onClick={() => {
                                  const t = (editing ? videoTestimonials : [])[i];
                                  if (t?.videoUrl.startsWith('blob:')) {
                                    setPendingTestimonials((prev) => { const m = new Map(prev); m.delete(t.videoUrl); return m; });
                                    URL.revokeObjectURL(t.videoUrl);
                                  }
                                  setVideoTestimonials((prev) => prev.filter((_, idx) => idx !== i));
                                }}
                                className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-rose-700 transition-colors"
                              >
                                <Trash2 size={12} /> {t('hospital.materials.actions.remove', undefined, 'Remove')}
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="p-3 bg-white">
                          <p className="font-medium text-sm">
                            {testimonial.patientName || t('hospital.materials.testimonials.unknownPatient', undefined, 'Unknown Patient')}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                            {testimonial.patientCountry && (
                              <span className="flex items-center gap-1">
                                <Globe size={10} />
                                {testimonial.patientCountry}
                              </span>
                            )}
                            {testimonial.procedureName && (
                              <span className="flex items-center gap-1">
                                <Stethoscope size={10} />
                                {testimonial.procedureName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {/* Inline "add new" card while adding */}
                    {editing && isAddingTestimonial && pendingTestimonial && (
                      <div className="rounded-xl border-2 border-purple-400 bg-purple-50 p-4 space-y-3">
                        <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative">
                          <video src={pendingTestimonial.previewUrl} className="w-full h-full object-cover" controls />
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">
                              {t('hospital.materials.fields.patientNameRequired', undefined, 'Patient Name *')}
                            </label>
                            <input
                              type="text"
                              placeholder={t('hospital.materials.placeholders.patientName', undefined, 'e.g. John D.')}
                              value={pendingTestimonial.patientName}
                              onChange={(e) => setPendingTestimonial({ ...pendingTestimonial, patientName: e.target.value })}
                              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                {t('hospital.materials.fields.country', undefined, 'Country')}
                              </label>
                              <input
                                type="text"
                                placeholder={t('hospital.materials.placeholders.country', undefined, 'e.g. USA')}
                                value={pendingTestimonial.patientCountry}
                                onChange={(e) => setPendingTestimonial({ ...pendingTestimonial, patientCountry: e.target.value })}
                                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                {t('hospital.materials.fields.procedure', undefined, 'Procedure')}
                              </label>
                              <input
                                type="text"
                                placeholder={t('hospital.materials.placeholders.procedure', undefined, 'e.g. Rhinoplasty')}
                                value={pendingTestimonial.procedureName}
                                onChange={(e) => setPendingTestimonial({ ...pendingTestimonial, procedureName: e.target.value })}
                                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              URL.revokeObjectURL(pendingTestimonial.previewUrl);
                              setPendingTestimonial(null);
                              setIsAddingTestimonial(false);
                            }}
                            className="flex-1 px-3 py-1.5 bg-white text-slate-600 border border-slate-300 rounded-lg text-xs font-medium flex items-center justify-center gap-1 hover:bg-slate-50 transition-colors"
                          >
                            <X size={12} /> {t('hospital.materials.actions.cancel', undefined, 'Cancel')}
                          </button>
                          <button
                            type="button"
                            disabled={!pendingTestimonial.patientName}
                            onClick={() => {
                              const tempId = `temp-${Date.now()}`;
                              const previewUrl = pendingTestimonial.previewUrl;
                              setPendingTestimonials((prev) => new Map(prev).set(previewUrl, {
                                file: pendingTestimonial.file,
                                patientName: pendingTestimonial.patientName,
                                patientCountry: pendingTestimonial.patientCountry,
                                procedureName: pendingTestimonial.procedureName,
                              }));
                              setVideoTestimonials((prev) => [
                                ...prev,
                              {
                                id: tempId,
                                videoUrl: previewUrl,
                                videoStorageKey: pendingTestimonial.storageKey ?? null,
                                patientName: pendingTestimonial.patientName,
                                patientCountry: pendingTestimonial.patientCountry,
                                procedureName: pendingTestimonial.procedureName,
                              },
                              ]);
                              setPendingTestimonial(null);
                              setIsAddingTestimonial(false);
                            }}
                            className="flex-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Check size={12} /> {t('hospital.materials.actions.confirm', undefined, 'Confirm')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-32 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <Video size={24} className="mx-auto mb-1" />
                      <span className="text-xs">
                        {t('hospital.materials.empty.noVideoTestimonials', undefined, 'No video testimonials yet')}
                      </span>
                      {editing && (
                        <button
                          type="button"
                          onClick={() => testimonialInputRef.current?.click()}
                          className="block mx-auto mt-2 text-xs font-medium text-purple-600"
                        >
                          <Plus size={12} className="inline mr-1" /> {t('hospital.materials.actions.addTestimonial', undefined, 'Add Testimonial')}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
          </div>

          {/* Hospital Capacity */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <SectionHeader icon={BedDouble} title={t('hospital.materials.sections.hospitalCapacity', undefined, 'Hospital Capacity')} />
            <div className="grid grid-cols-3 gap-4">
              {[
                {
                  key: 'bedCount',
                  label: t('hospital.materials.fields.beds', undefined, 'Beds'),
                  placeholder: t('hospital.materials.placeholders.bedCount', undefined, 'e.g. 200'),
                },
                {
                  key: 'patientCapacity',
                  label: t('hospital.materials.fields.patientCapacity', undefined, 'Patient Capacity'),
                  placeholder: t('hospital.materials.placeholders.patientCapacity', undefined, 'e.g. 500'),
                },
                {
                  key: 'totalPatients',
                  label: t('hospital.materials.fields.totalPatientsServed', undefined, 'Total Patients Served'),
                  placeholder: t('hospital.materials.placeholders.totalPatientsServed', undefined, 'e.g. 10000'),
                },
              ].map((item) => (
                <div key={item.key} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  {editing ? (
                    <input
                      type="number"
                      value={form[item.key] ?? ''}
                      onChange={(e) => setForm({ ...form, [item.key]: e.target.value })}
                      className="w-full text-center text-2xl font-bold text-indigo-600 bg-transparent border-none outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder={item.placeholder}
                    />
                  ) : (
                    <div className="text-2xl font-bold text-slate-900">
                      {form[item.key] && form[item.key] !== '0' && form[item.key] !== ''
                        ? formatLocaleNumber(Number(form[item.key]), locale)
                        : '\u2014'}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 mt-1">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Nearby Attractions */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <SectionHeader icon={MapIcon} title={t('hospital.materials.sections.nearbyAttractions', undefined, 'Nearby Attractions')} />
            <div className="space-y-3">
              {attractions.length > 0 && attractions.map((attraction) => (
                <div key={attraction.id} className="flex items-center justify-between p-3 bg-teal-50 rounded-lg border border-teal-100">
                  <div className="flex items-center gap-3">
                    <MapPin size={16} className="text-teal-600" />
                    <span className="font-medium text-sm text-slate-800">{attraction.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 bg-white border border-teal-200 rounded text-teal-700">{attraction.distance}</span>
                    {editing && (
                      <button
                        onClick={() => setAttractions((prev) => prev.filter((a) => a.id !== attraction.id))}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {editing ? (
                <div className="p-4 border-2 border-dashed border-slate-200 rounded-lg">
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
                    <input
                      type="text"
                      placeholder={t('hospital.materials.placeholders.attractionName', undefined, 'Attraction name')}
                      value={newAttractionName}
                      onChange={(e) => setNewAttractionName(e.target.value)}
                      className={inputClass}
                    />
                    <input
                      type="text"
                      placeholder={t('hospital.materials.placeholders.attractionDistance', undefined, 'Distance (e.g. 2km)')}
                      value={newAttractionDistance}
                      onChange={(e) => setNewAttractionDistance(e.target.value)}
                      className={inputClass}
                    />
                    <button
                      disabled={!newAttractionName || !newAttractionDistance}
                      onClick={() => {
                        setAttractions((prev) => [
                          ...prev,
                          { id: `attr-${Date.now()}`, name: newAttractionName, distance: newAttractionDistance },
                        ]);
                        setNewAttractionName('');
                        setNewAttractionDistance('');
                      }}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus size={14} /> {t('hospital.materials.actions.add', undefined, 'Add')}
                    </button>
                  </div>
                </div>
              ) : attractions.length === 0 ? (
                <div className="h-24 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <MapIcon size={20} className="mx-auto mb-1" />
                    <span className="text-xs">
                      {t('hospital.materials.empty.noNearbyAttractions', undefined, 'No nearby attractions added')}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Departments — regular_hospital only */}
          {isRegular && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <SectionHeader icon={Building2} title={t('hospital.materials.sections.departments', undefined, 'Departments')} />
              {/* Department selector chips */}
              {editing && (
                <div className="mb-4">
                  <div className="flex flex-wrap gap-2">
                    {selectedDepartments.map((dept) => {
                      const opt = departmentOptions.find((o) => o.value === dept);
                      return (
                        <span key={dept} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-xs font-medium">
                          {opt?.label ?? dept}
                          <button onClick={() => setSelectedDepartments((p) => p.filter((d) => d !== dept))} className="ml-0.5 text-indigo-400 hover:text-indigo-700"><X size={10} /></button>
                        </span>
                      );
                    })}
                    <button
                      onClick={() => setShowDeptSelector(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white text-blue-600 border border-blue-200 rounded-md text-xs font-medium hover:bg-blue-50 transition-colors"
                    >
                      <Plus size={12} /> {t('hospital.materials.actions.addDepartments', undefined, 'Add Departments')}
                    </button>
                  </div>
                  {showDeptSelector && (
                    <AddOptionsModal
                      title={t('hospital.materials.actions.selectDepartments', undefined, 'Select Departments')}
                      options={departmentOptions}
                      selected={selectedDepartments}
                      onChange={setSelectedDepartments}
                      onClose={() => setShowDeptSelector(false)}
                    />
                  )}
                </div>
              )}

              {/* Non-editing: show chips */}
              {!editing && selectedDepartments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedDepartments.map((dept) => {
                    const opt = departmentOptions.find((o) => o.value === dept);
                    return (
                      <span key={dept} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-sm font-medium">
                        {opt?.label ?? dept}
                      </span>
                    );
                  })}
                </div>
              )}

              {!editing && selectedDepartments.length === 0 && (
                <p className="text-sm text-slate-400">
                  {t('hospital.materials.empty.noDepartmentsConfigured', undefined, 'No departments configured.')}
                </p>
              )}

              {/* Department detail cards */}
              {selectedDepartments.length > 0 && (
                <div className="space-y-3 mt-2 pt-4 border-t border-slate-200">
                  {selectedDepartments.map((deptValue) => {
                    const opt = departmentOptions.find((o) => o.value === deptValue);
                    const deptLabel = opt?.label ?? deptValue;
                    const isExpanded = expandedDepts.has(deptValue);
                    const keyServices = deptKeyServices[deptValue] ?? [];
                    const stats = deptStats[deptValue] ?? {};
                    const desc = deptDescriptions[deptValue] ?? '';
                    const hasSpecialists = stats.specialists !== undefined && stats.specialists !== null;
                    const hasAnnualPatients = stats.annualPatients !== undefined && stats.annualPatients !== null;

                    return (
                      <div
                        key={deptValue}
                        ref={registerSectionRef(`department:${deptValue}`)}
                        className={`border border-slate-200 rounded-lg overflow-hidden ${getFlashClass(flashTargetKey === `department:${deptValue}`)}`}
                      >
                        {/* Department header — clickable to expand/collapse */}
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedDepts((prev) => {
                              const next = new Set(prev);
                              if (next.has(deptValue)) next.delete(deptValue);
                              else next.add(deptValue);
                              return next;
                            });
                          }}
                          className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                            <h4 className="font-medium text-sm text-slate-800">{deptLabel}</h4>
                          </div>
                          {!editing && (hasSpecialists || hasAnnualPatients) && (
                            <div className="flex gap-4 text-xs text-slate-500">
                              {hasSpecialists && (
                                <span className="flex items-center gap-1">
                                  <Users size={12} />
                                  {t('hospital.materials.departments.specialistsCount', { count: stats.specialists! }, '{count} Specialists')}
                                </span>
                              )}
                              {hasAnnualPatients && (
                                <span className="flex items-center gap-1">
                                  <Heart size={12} />
                                  {t(
                                    'hospital.materials.departments.annualPatientsCount',
                                    {
                                      count: stats.annualPatients != null
                                        ? formatLocaleNumber(stats.annualPatients, locale)
                                        : '',
                                    },
                                    '{count} Annual Patients',
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                        </button>

                        {/* Expanded detail content */}
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-4 border-t border-slate-100">
                            {/* Department Image */}
                            <div className="pt-3">
                              {(() => {
                                // In edit mode: check pending uploads first, then local state, then original data
                                // In view mode: only use original data from the server
                                const hasLocalDeptImage = Object.prototype.hasOwnProperty.call(deptImages, deptValue);
                                const imageUrl = editing
                                  ? (pendingDeptImages.get(deptValue)?.previewUrl
                                    ?? (hasLocalDeptImage ? (deptImages[deptValue] ?? '') : (info.departmentImages?.[deptValue] ?? '')))
                                  : (info.departmentImages?.[deptValue] || '');
                                return editing ? (
                                  <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0">
                                      {imageUrl ? (
                                        <div className="relative group w-32 h-24 rounded-lg overflow-hidden border border-slate-200">
                                          <img src={imageUrl} alt={deptLabel} className="w-full h-full object-cover" />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (pendingDeptImages.has(deptValue)) {
                                                setPendingDeptImages((p) => { const m = new Map(p); m.delete(deptValue); return m; });
                                              }
                                              setDeptImages((prev) => ({ ...prev, [deptValue]: '' }));
                                              setDeptImageStorageKeys((prev) => {
                                                const next = { ...prev };
                                                delete next[deptValue];
                                                return next;
                                              });
                                            }}
                                            className="absolute top-1 right-1 bg-rose-600 text-white rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      ) : (
                                        <label className="w-32 h-24 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 transition-colors">
                                          <Camera size={18} className="text-slate-400" />
                                          <span className="text-xs text-slate-400 mt-1">
                                            {t('hospital.materials.actions.upload', undefined, 'Upload')}
                                          </span>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) {
                                                const previewUrl = URL.createObjectURL(file);
                                                setPendingDeptImages((prev) => {
                                                  const m = new Map(prev);
                                                  m.set(deptValue, { previewUrl, file });
                                                  return m;
                                                });
                                                setDeptImages((prev) => ({ ...prev, [deptValue]: previewUrl }));
                                              }
                                              e.target.value = '';
                                            }}
                                          />
                                        </label>
                                      )}
                                    </div>
                                    <div className="flex-1">
                                      <label className="block text-xs font-medium text-slate-500 mb-1">
                                        {t('hospital.materials.fields.departmentImage', undefined, 'Department Image')}
                                      </label>
                                      <p className="text-xs text-slate-400">
                                        {t('hospital.materials.hints.departmentImage', undefined, 'Upload an image representing this department')}
                                      </p>
                                    </div>
                                  </div>
                                ) : imageUrl ? (
                                  <div className="w-32 h-24 rounded-lg overflow-hidden border border-slate-200">
                                    <img src={imageUrl} alt={deptLabel} className="w-full h-full object-cover" />
                                  </div>
                                ) : null;
                              })()}
                            </div>
                            {/* Department Stats — editing mode */}
                            {editing && (
                              <div className="flex gap-4 pt-3">
                                <div className="flex-1">
                                  <label className="block text-xs font-medium text-slate-500 mb-1">
                                    <Users size={10} className="inline mr-1" />
                                    {t('hospital.materials.fields.specialists', undefined, 'Specialists')}
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={stats.specialists ?? ''}
                                    onChange={(e) => setDeptStats((prev) => ({
                                      ...prev,
                                      [deptValue]: {
                                        ...prev[deptValue],
                                        specialists: e.target.value ? parseInt(e.target.value) : undefined,
                                      },
                                    }))}
                                    placeholder="0"
                                    className={`${inputClass} h-8 text-sm`}
                                  />
                                </div>
                                <div className="flex-1">
                                  <label className="block text-xs font-medium text-slate-500 mb-1">
                                    <Heart size={10} className="inline mr-1" />
                                    {t('hospital.materials.fields.annualPatients', undefined, 'Annual Patients')}
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={stats.annualPatients ?? ''}
                                    onChange={(e) => setDeptStats((prev) => ({
                                      ...prev,
                                      [deptValue]: {
                                        ...prev[deptValue],
                                        annualPatients: e.target.value ? parseInt(e.target.value) : undefined,
                                      },
                                    }))}
                                    placeholder="0"
                                    className={`${inputClass} h-8 text-sm`}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Key Services */}
                            <div className="pt-2">
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                {t('hospital.materials.fields.keyServices', undefined, 'Key Services')}
                              </label>
                              {editing ? (
                                <div className="space-y-2">
                                  <div className="rounded-lg border border-slate-200 px-2 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/30">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {keyServices.map((svc, idx) => (
                                        <span key={`${svc}-${idx}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                                          {svc}
                                          <button
                                            onClick={() => {
                                              const newServices = keyServices.filter((_, i) => i !== idx);
                                              setDeptKeyServices((prev) => ({ ...prev, [deptValue]: newServices }));
                                            }}
                                            className="ml-0.5 text-blue-400 hover:text-red-500"
                                          >
                                            <X size={10} />
                                          </button>
                                        </span>
                                      ))}
                                      <input
                                        value={deptServiceInputs[deptValue] ?? ''}
                                        onChange={(e) => setDeptServiceInputs((prev) => ({ ...prev, [deptValue]: e.target.value }))}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
                                            e.preventDefault();
                                            const raw = (deptServiceInputs[deptValue] ?? '').trim();
                                            if (!raw) return;
                                            const newTags = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
                                            const merged = [...keyServices, ...newTags.filter((t) => !keyServices.includes(t))];
                                            setDeptKeyServices((prev) => ({ ...prev, [deptValue]: merged }));
                                            setDeptServiceInputs((prev) => ({ ...prev, [deptValue]: '' }));
                                          }
                                        }}
                                        onBlur={() => {
                                          const raw = (deptServiceInputs[deptValue] ?? '').trim();
                                          if (!raw) return;
                                          const newTags = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
                                          const merged = [...keyServices, ...newTags.filter((t) => !keyServices.includes(t))];
                                          setDeptKeyServices((prev) => ({ ...prev, [deptValue]: merged }));
                                          setDeptServiceInputs((prev) => ({ ...prev, [deptValue]: '' }));
                                        }}
                                        placeholder={t('hospital.materials.placeholders.keyServices', undefined, 'Press Enter/Tab/comma to add tags')}
                                        className="h-7 min-w-[180px] flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {keyServices.length > 0 ? keyServices.map((svc, idx) => (
                                    <span key={idx} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                                      {svc}
                                    </span>
                                  )) : (
                                    <span className="text-xs text-slate-400">
                                      {t('hospital.materials.empty.noKeyServices', undefined, 'No key services set')}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Description */}
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">
                                {t('hospital.materials.fields.description', undefined, 'Description')}
                              </label>
                              {editing ? (
                                <textarea
                                  value={desc}
                                  onChange={(e) => setDeptDescriptions((prev) => ({ ...prev, [deptValue]: e.target.value }))}
                                  placeholder={t('hospital.materials.placeholders.departmentDescription', undefined, 'Describe the department and its capabilities...')}
                                  className={`${inputClass} resize-none`}
                                  rows={3}
                                />
                              ) : (
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{desc || '-'}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Medical Equipment — regular_hospital only */}
          {isRegular && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <SectionHeader icon={Sparkles} title={t('hospital.materials.sections.medicalEquipment', undefined, 'Medical Equipment')} />
              {editing && (
                <button
                  type="button"
                  onClick={() => setEquipment((prev) => [...prev, { name: '', description: '', imageUrl: '' }])}
                  className="mb-4 inline-flex items-center gap-1 px-3 py-1.5 bg-white text-blue-600 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-50 transition-colors"
                >
                  <Plus size={12} /> {t('hospital.materials.actions.addEquipment', undefined, 'Add Equipment')}
                </button>
              )}
              <div className="space-y-4">
                {equipment.map((equip, idx) => (
                  <div
                    key={idx}
                    ref={registerSectionRef(`equipment:${idx}`)}
                    className={`border border-slate-200 rounded-lg p-4 space-y-3 ${getFlashClass(flashTargetKey === `equipment:${idx}`)}`}
                  >
                    {editing ? (
                      <>
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">
                            {t(
                              'hospital.materials.hospitalInfo.equipmentItem',
                              { index: idx + 1 },
                              'Equipment {index}',
                            )}
                          </label>
                          <button
                            type="button"
                            onClick={() => setEquipment((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            {t('hospital.materials.hospitalInfo.nameLabel', undefined, 'Name')}
                          </label>
                          <input
                            type="text"
                            value={equip.name}
                            onChange={(e) => {
                              const newEquip = [...equipment];
                              const current = newEquip[idx]!;
                              newEquip[idx] = { ...current, name: e.target.value };
                              setEquipment(newEquip);
                            }}
                            placeholder={t(
                              'hospital.materials.hospitalInfo.equipmentNamePlaceholder',
                              undefined,
                              'e.g. Da Vinci Surgical Robot',
                            )}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">
                            {t('hospital.materials.fields.description', undefined, 'Description')}
                          </label>
                          <textarea
                            rows={2}
                            value={equip.description}
                            onChange={(e) => {
                              const newEquip = [...equipment];
                              const current = newEquip[idx]!;
                              newEquip[idx] = { ...current, description: e.target.value };
                              setEquipment(newEquip);
                            }}
                            placeholder={t(
                              'hospital.materials.hospitalInfo.equipmentDescriptionPlaceholder',
                              undefined,
                              'Equipment usage and advantages...',
                            )}
                            className={`${inputClass} resize-none`}
                          />
                        </div>
                        <ImageUploadWidget
                          value={equip.imageUrl}
                          onChange={(url) => {
                            const newEquip = [...equipment];
                            const current = newEquip[idx]!;
                            newEquip[idx] = { ...current, imageUrl: url, imageStorageKey: url ? current.imageStorageKey ?? null : null };
                            setEquipment(newEquip);
                            if (!url && current.imageUrl) {
                              setPendingEquipmentImages((prev) => {
                                const next = new Map(prev);
                                next.delete(current.imageUrl);
                                return next;
                              });
                            }
                          }}
                          onFileSelect={(file, previewUrl) => {
                            setPendingEquipmentImages((prev) => {
                              const next = new Map(prev);
                              next.set(previewUrl, file);
                              return next;
                            });
                            setEquipment((prev) => prev.map((item, itemIndex) => (
                              itemIndex === idx ? { ...item, imageUrl: previewUrl, imageStorageKey: null } : item
                            )));
                          }}
                          label={t(
                            'hospital.materials.hospitalInfo.equipmentImageLabel',
                            undefined,
                            'Equipment Image',
                          )}
                          previewClassName="h-24 w-32"
                          allowDirectUrl={false}
                        />
                      </>
                    ) : (
                      <div className="flex gap-4">
                        {equip.imageUrl && (
                          <div className="w-24 h-24 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                            <img src={equip.imageUrl} alt={equip.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex-1">
                          <h4 className="font-medium text-slate-800">{equip.name}</h4>
                          {equip.description && (
                            <p className="text-sm text-slate-600 mt-1">{equip.description}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {equipment.length === 0 && !editing && (
                  <div className="h-24 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <Sparkles size={20} className="mx-auto mb-1" />
                      <span className="text-xs">
                        {t(
                          'hospital.materials.hospitalInfo.noEquipment',
                          undefined,
                          'No equipment added',
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Hospital Classification — regular_hospital only */}
          {isRegular && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <SectionHeader
                icon={Shield}
                title={t(
                  'hospital.materials.hospitalInfo.classificationTitle',
                  undefined,
                  'Hospital Classification',
                )}
              />
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {renderField(t('hospital.materials.hospitalInfo.hospitalTierLabel', undefined, 'Hospital Tier'), 'tier', {
                    placeholder: t('hospital.materials.hospitalInfo.selectTier', undefined, 'Select tier'),
                    options: hospitalTierOptions,
                  })}
                  {renderField(
                    t('hospital.materials.hospitalInfo.ownershipTypeLabel', undefined, 'Ownership Type'),
                    'ownershipType',
                    {
                      placeholder: t(
                        'hospital.materials.hospitalInfo.selectOwnership',
                        undefined,
                        'Select ownership',
                      ),
                      options: ownershipTypeOptions,
                    },
                  )}
                  {renderField(
                    t('hospital.materials.hospitalInfo.hospitalTypeLabel', undefined, 'Hospital Type'),
                    'hospitalType',
                    {
                      placeholder: t(
                        'hospital.materials.hospitalInfo.hospitalTypePlaceholder',
                        undefined,
                        'e.g. General',
                      ),
                    },
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Geographic Info — regular_hospital only */}
          {isRegular && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <SectionHeader
                icon={MapPin}
                title={t(
                  'hospital.materials.hospitalInfo.geographicTitle',
                  undefined,
                  'Geographic Location',
                )}
              />
              <div className="grid grid-cols-3 gap-4">
                {renderField(
                  t('hospital.materials.hospitalInfo.provinceLabel', undefined, 'Province'),
                  'province',
                  { placeholder: t('hospital.materials.hospitalInfo.provincePlaceholder', undefined, 'Province') },
                )}
                {renderField(
                  t('hospital.materials.hospitalInfo.cityLabel', undefined, 'City'),
                  'city',
                  { placeholder: t('hospital.materials.hospitalInfo.cityPlaceholder', undefined, 'City') },
                )}
                {renderField(
                  t('hospital.materials.hospitalInfo.districtLabel', undefined, 'District'),
                  'district',
                  { placeholder: t('hospital.materials.hospitalInfo.districtPlaceholder', undefined, 'District') },
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-6">
          {/* Certifications */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <SectionHeader
              icon={Shield}
              title={t(
                'hospital.materials.hospitalInfo.certificationsTitle',
                undefined,
                'Certifications & Awards',
              )}
            />
            <div className="space-y-3">
              {certifications.map((cert) => (
                <div key={cert.id} className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Shield size={14} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-slate-800">{cert.name}</p>
                      {cert.year && (
                        <p className="text-xs text-slate-500">
                          {t('hospital.materials.hospitalInfo.sinceYear', { year: cert.year }, 'Since {year}')}
                        </p>
                      )}
                    </div>
                  </div>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => setCertifications((prev) => prev.filter((c) => c.id !== cert.id))}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {certifications.length === 0 && !editing && (
                <span className="text-sm text-slate-400">
                  {t(
                    'hospital.materials.hospitalInfo.noCertifications',
                    undefined,
                    'No certifications added',
                  )}
                </span>
              )}
              {editing && (
                <div className="p-4 border-2 border-dashed border-slate-200 rounded-lg">
                  <p className="text-xs text-slate-500 mb-2">
                    {t('hospital.materials.hospitalInfo.addCertificationTitle', undefined, 'Add Certification')}
                  </p>
                  <div className="space-y-2">
                    <select
                      value={newCertType}
                      onChange={(e) => setNewCertType(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                    >
                      <option value="">
                        {t(
                          'hospital.materials.hospitalInfo.selectCertificationType',
                          undefined,
                          'Select certification type...',
                        )}
                      </option>
                      {certificationPresets.map((cert) => (
                        <option key={cert.value} value={cert.value}>{cert.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder={t(
                        'hospital.materials.hospitalInfo.certificationYearPlaceholder',
                        undefined,
                        'Year (e.g. 2012)',
                      )}
                      value={newCertYear}
                      onChange={(e) => setNewCertYear(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      disabled={!newCertType}
                      onClick={() => {
                        const certPreset = certificationPresets.find((c) => c.value === newCertType);
                        if (certPreset) {
                          setCertifications((prev) => [
                            ...prev,
                            {
                              id: `cert-${Date.now()}`,
                              name: certPreset.persistedName,
                              year: newCertYear ? parseInt(newCertYear) : undefined,
                            },
                          ]);
                          setNewCertType('');
                          setNewCertYear('');
                        }
                      }}
                      className="w-full px-4 py-2 bg-white text-blue-600 border border-blue-200 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus size={14} /> {t('hospital.materials.buttons.add', undefined, 'Add')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Services & Amenities */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <SectionHeader
                icon={Languages}
                title={t('hospital.materials.hospitalInfo.multilingualStaffTitle', undefined, 'Multilingual Staff')}
              />
              <ChipSelector
                options={languageOptions}
                selected={languages}
                onChange={setLanguages}
                editing={editing}
                label={t('hospital.materials.hospitalInfo.selectLanguages', undefined, 'Select Languages')}
              />
            </div>

            <div>
              <SectionHeader
                icon={Plane}
                title={t('hospital.materials.hospitalInfo.airportServicesTitle', undefined, 'Airport Services')}
              />
              <ChipSelector
                options={airportServiceOptions}
                selected={airportServices}
                onChange={setAirportServices}
                editing={editing}
                label={t(
                  'hospital.materials.hospitalInfo.selectAirportServices',
                  undefined,
                  'Select Airport Services',
                )}
              />
            </div>

            <div>
              <SectionHeader
                icon={Heart}
                title={t('hospital.materials.hospitalInfo.amenitiesTitle', undefined, 'Amenities')}
              />
              <ChipSelector
                options={amenityOptions}
                selected={amenities}
                onChange={setAmenities}
                editing={editing}
                label={t('hospital.materials.hospitalInfo.selectAmenities', undefined, 'Select Amenities')}
              />
            </div>

            <div>
              <SectionHeader
                icon={CreditCard}
                title={t('hospital.materials.hospitalInfo.paymentMethodsTitle', undefined, 'Payment Methods')}
              />
              <ChipSelector
                options={paymentMethodOptions}
                selected={paymentMethods}
                onChange={setPaymentMethods}
                editing={editing}
                label={t(
                  'hospital.materials.hospitalInfo.selectPaymentMethods',
                  undefined,
                  'Select Payment Methods',
                )}
              />
            </div>

            <div>
              <SectionHeader
                icon={UserCheck}
                title={t('hospital.materials.hospitalInfo.followUpCareTitle', undefined, 'Follow-up Care')}
              />
              <ChipSelector
                options={followupOptions}
                selected={followupCare}
                onChange={setFollowupCare}
                editing={editing}
                label={t(
                  'hospital.materials.hospitalInfo.selectFollowUpCare',
                  undefined,
                  'Select Follow-up Care',
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Department options (regular_hospital) ──────────────────────────
function getDepartmentOptions(t: TranslationFn) {
  return [
    { value: 'cardiology', label: t('hospital.materials.departments.cardiology', undefined, 'Cardiology (心血管内科)') },
    { value: 'respiratory', label: t('hospital.materials.departments.respiratory', undefined, 'Respiratory Medicine (呼吸内科)') },
    { value: 'gastroenterology', label: t('hospital.materials.departments.gastroenterology', undefined, 'Gastroenterology (消化内科)') },
    { value: 'nephrology', label: t('hospital.materials.departments.nephrology', undefined, 'Nephrology (肾内科)') },
    { value: 'neurology', label: t('hospital.materials.departments.neurology', undefined, 'Neurology (神经内科)') },
    { value: 'endocrinology', label: t('hospital.materials.departments.endocrinology', undefined, 'Endocrinology (内分泌科)') },
    { value: 'hematology', label: t('hospital.materials.departments.hematology', undefined, 'Hematology (血液科)') },
    { value: 'rheumatology', label: t('hospital.materials.departments.rheumatology', undefined, 'Rheumatology (风湿免疫科)') },
    { value: 'general_surgery', label: t('hospital.materials.departments.generalSurgery', undefined, 'General Surgery (普外科)') },
    { value: 'orthopedics', label: t('hospital.materials.departments.orthopedics', undefined, 'Orthopedics (骨科)') },
    { value: 'neurosurgery', label: t('hospital.materials.departments.neurosurgery', undefined, 'Neurosurgery (神经外科)') },
    { value: 'cardiothoracic', label: t('hospital.materials.departments.cardiothoracic', undefined, 'Cardiothoracic Surgery (心胸外科)') },
    { value: 'urology', label: t('hospital.materials.departments.urology', undefined, 'Urology (泌尿外科)') },
    { value: 'vascular', label: t('hospital.materials.departments.vascular', undefined, 'Vascular Surgery (血管外科)') },
    { value: 'obgyn', label: t('hospital.materials.departments.obgyn', undefined, 'Obstetrics & Gynecology (妇产科)') },
    { value: 'pediatrics', label: t('hospital.materials.departments.pediatrics', undefined, 'Pediatrics (儿科)') },
    { value: 'neonatology', label: t('hospital.materials.departments.neonatology', undefined, 'Neonatology (新生儿科)') },
    { value: 'ophthalmology', label: t('hospital.materials.departments.ophthalmology', undefined, 'Ophthalmology (眼科)') },
    { value: 'ent', label: t('hospital.materials.departments.ent', undefined, 'ENT (耳鼻喉科)') },
    { value: 'stomatology', label: t('hospital.materials.departments.stomatology', undefined, 'Stomatology (口腔科)') },
    { value: 'dermatology', label: t('hospital.materials.departments.dermatology', undefined, 'Dermatology (皮肤科)') },
    { value: 'tcm', label: t('hospital.materials.departments.tcm', undefined, 'Traditional Chinese Medicine (中医科)') },
    { value: 'rehabilitation', label: t('hospital.materials.departments.rehabilitation', undefined, 'Rehabilitation (康复科)') },
    { value: 'oncology', label: t('hospital.materials.departments.oncology', undefined, 'Oncology (肿瘤科)') },
    { value: 'emergency', label: t('hospital.materials.departments.emergency', undefined, 'Emergency (急诊科)') },
    { value: 'icu', label: t('hospital.materials.departments.icu', undefined, 'ICU (重症医学科)') },
    { value: 'infectious', label: t('hospital.materials.departments.infectious', undefined, 'Infectious Disease (感染科)') },
    { value: 'psychiatry', label: t('hospital.materials.departments.psychiatry', undefined, 'Psychiatry (精神科)') },
    { value: 'radiology', label: t('hospital.materials.departments.radiology', undefined, 'Radiology (放射科)') },
    { value: 'laboratory', label: t('hospital.materials.departments.laboratory', undefined, 'Laboratory (检验科)') },
    { value: 'pathology', label: t('hospital.materials.departments.pathology', undefined, 'Pathology (病理科)') },
    { value: 'pharmacy', label: t('hospital.materials.departments.pharmacy', undefined, 'Pharmacy (药剂科)') },
    { value: 'anesthesiology', label: t('hospital.materials.departments.anesthesiology', undefined, 'Anesthesiology (麻醉科)') },
  ];
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 2 — Procedures                                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ProcedureRow({
  proc,
  onEdit,
  onDelete,
}: {
  proc: MaterialsProcedureDTO;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { locale, t } = useHospitalI18n();
  const [expanded, setExpanded] = useState(false);
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t(key, values, fallback);
  const hasDetails =
    proc.recoveryTime ||
    proc.duration ||
    proc.hospitalStayDays ||
    proc.indications ||
    proc.risks ||
    (proc.inclusions && proc.inclusions.length > 0);

  return (
    <>
      <tr className="hover:bg-slate-50/50 transition-colors">
        <td className="px-6 py-4">
          <div className="flex items-center gap-2">
            {hasDetails ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="text-slate-400 hover:text-slate-700 transition-colors"
                aria-label={tx('hospital.materials.procedures.toggleDetails', 'Toggle details')}
              >
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : (
              <span className="w-4" />
            )}
            <span className="font-medium text-slate-900">{proc.procedureName}</span>
          </div>
        </td>
        <td className="px-6 py-4 text-slate-600">
          {formatProcedurePriceRange(proc, locale, t)}
        </td>
        <td className="px-6 py-4">
          {proc.isPopular && (
            <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200/50 rounded-md text-xs font-medium">
              {tx('hospital.materials.procedures.popular', 'Popular')}
            </span>
          )}
        </td>
        <td className="px-6 py-4">
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-md text-xs font-medium">
            {tx('hospital.materials.hospitalInfo.activeStatus', 'Active')}
          </span>
        </td>
        <td className="px-6 py-4 text-right">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              aria-label={tx('hospital.materials.buttons.edit', 'Edit')}
            >
              <Edit2 size={16} />
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
              aria-label={tx('hospital.materials.buttons.delete', 'Delete')}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr className="bg-slate-50/70">
          <td colSpan={5} className="px-10 py-4">
            <div className="grid grid-cols-2 gap-4 text-sm text-slate-700">
              {proc.recoveryTime && (
                <div>
                  <span className="font-medium text-slate-500">
                    {tx('hospital.materials.procedures.recoveryTimeLabel', 'Recovery Time: ')}
                  </span>
                  {proc.recoveryTime}
                </div>
              )}
              {proc.duration && (
                <div>
                  <span className="font-medium text-slate-500">
                    {tx('hospital.materials.procedures.durationLabel', 'Duration: ')}
                  </span>
                  {proc.duration}
                </div>
              )}
              {proc.hospitalStayDays && (
                <div>
                  <span className="font-medium text-slate-500">
                    {tx('hospital.materials.procedures.hospitalStayLabel', 'Hospital Stay: ')}
                  </span>
                  {proc.hospitalStayDays}
                </div>
              )}
              {proc.indications && (
                <div className="col-span-2">
                  <span className="font-medium text-slate-500">
                    {tx('hospital.materials.procedures.indicationsLabel', 'Indications: ')}
                  </span>
                  {proc.indications}
                </div>
              )}
              {proc.risks && (
                <div className="col-span-2">
                  <span className="font-medium text-slate-500">
                    {tx('hospital.materials.procedures.risksLabel', 'Risks: ')}
                  </span>
                  {proc.risks}
                </div>
              )}
              {proc.inclusions && proc.inclusions.length > 0 && (
                <div className="col-span-2">
                  <span className="font-medium text-slate-500 block mb-1">
                    {tx('hospital.materials.procedures.inclusionsLabel', 'Inclusions:')}
                  </span>
                  <ul className="list-disc list-inside space-y-0.5">
                    {proc.inclusions.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ProceduresTab() {
  const { t } = useHospitalI18n();
  const { data, isLoading } = useProcedures();
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialsProcedureDTO | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t(key, values, fallback);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-sm text-slate-500">
        <LoadingSpinner size="lg" />
        <span>{tx('hospital.materials.procedures.loadingProcedures', 'Loading procedures...')}</span>
      </div>
    );
  }

  const allProcedures: MaterialsProcedureDTO[] = (data as MaterialsProcedureDTO[] | undefined) ?? [];
  const procedures = allProcedures.filter(
    (p) => !searchQuery || p.procedureName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleDeleteProcedure = async (id: string) => {
    if (!confirm(tx('hospital.materials.procedures.confirmDelete', 'Delete this procedure?'))) return;
    await deleteProcedure(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={tx('hospital.materials.procedures.searchPlaceholder', 'Search procedures...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
          />
        </div>
        <button
          onClick={() => {
            setEditingItem(null);
            setShowModal(true);
          }}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm shadow-cyan-500/20 transition-all"
        >
          <Plus size={16} /> {tx('hospital.materials.procedures.addProcedure', 'Add Procedure')}
        </button>
      </div>

      {procedures.length === 0 ? (
        <EmptyState
          icon={<Stethoscope size={48} />}
          title={tx('hospital.materials.procedures.emptyTitle', 'No procedures yet')}
          description={tx(
            'hospital.materials.procedures.emptyDescription',
            'Add your first procedure to get started.',
          )}
          action={
            <Button
              onClick={() => {
                setEditingItem(null);
                setShowModal(true);
              }}
              className="gap-2"
            >
              <Plus size={16} /> {tx('hospital.materials.procedures.addProcedure', 'Add Procedure')}
            </Button>
          }
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-medium">
                  {tx('hospital.materials.procedures.procedureNameHeader', 'Procedure Name')}
                </th>
                <th className="px-6 py-4 font-medium">
                  {tx('hospital.materials.procedures.priceRangeHeader', 'Price Range')}
                </th>
                <th className="px-6 py-4 font-medium">
                  {tx('hospital.materials.procedures.tagsHeader', 'Tags')}
                </th>
                <th className="px-6 py-4 font-medium">
                  {tx('hospital.materials.procedures.statusHeader', 'Status')}
                </th>
                <th className="px-6 py-4 font-medium text-right">
                  {tx('hospital.materials.procedures.actionsHeader', 'Actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {procedures.map((proc) => (
                <ProcedureRow
                  key={proc.id}
                  proc={proc}
                  onEdit={() => {
                    setEditingItem(proc);
                    setShowModal(true);
                  }}
                  onDelete={() => handleDeleteProcedure(proc.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ProcedureModal
          open={showModal}
          onClose={() => {
            setShowModal(false);
            setEditingItem(null);
          }}
          existing={editingItem}
        />
      )}
    </div>
  );
}

function ProcedureModal({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing: MaterialsProcedureDTO | null;
}) {
  const { t } = useHospitalI18n();
  const [procedureName, setProcedureName] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [isPopular, setIsPopular] = useState(false);
  const [sortOrder, setSortOrder] = useState('');
  const [recoveryTime, setRecoveryTime] = useState('');
  const [duration, setDuration] = useState('');
  const [hospitalStayDays, setHospitalStayDays] = useState('');
  const [indications, setIndications] = useState('');
  const [risks, setRisks] = useState('');
  const [inclusions, setInclusions] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [flashTargetKey, setFlashTargetKey] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState<SaveProgressState>({
    open: false,
    title: '',
    items: [],
    canDismiss: false,
  });
  const formRef = useRef<HTMLFormElement | null>(null);
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t(key, values, fallback);

  useEffect(() => {
    setProcedureName(existing?.procedureName ?? '');
    setPriceMin(existing?.priceMin != null ? String(existing.priceMin) : '');
    setPriceMax(existing?.priceMax != null ? String(existing.priceMax) : '');
    setIsPopular(existing?.isPopular ?? false);
    setSortOrder(existing?.sortOrder != null ? String(existing.sortOrder) : '');
    setRecoveryTime(existing?.recoveryTime ?? '');
    setDuration(existing?.duration ?? '');
    setHospitalStayDays(existing?.hospitalStayDays ?? '');
    setIndications(existing?.indications ?? '');
    setRisks(existing?.risks ?? '');
    setInclusions(existing?.inclusions ?? []);
  }, [existing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!procedureName.trim()) return;
    setSubmitting(true);
    setSaveProgress({
      open: true,
      title: existing
        ? tx('hospital.materials.procedures.savingEditTitle', 'Saving procedure changes')
        : tx('hospital.materials.procedures.savingCreateTitle', 'Creating procedure'),
      canDismiss: false,
      items: [
        {
          id: 'save-procedure',
          label: existing
            ? tx('hospital.materials.procedures.saveEditAction', 'Save procedure changes')
            : tx('hospital.materials.procedures.saveCreateAction', 'Create procedure'),
          targetKey: 'procedure-form',
          status: 'saving',
        },
      ],
    });
    try {
      const payload: Record<string, unknown> = {
        procedureName: procedureName.trim(),
        priceMin: priceMin ? Number(priceMin) : null,
        priceMax: priceMax ? Number(priceMax) : null,
        isPopular,
        sortOrder: sortOrder ? Number(sortOrder) : 0,
        recoveryTime: recoveryTime.trim() || null,
        duration: duration.trim() || null,
        hospitalStayDays: hospitalStayDays.trim() || null,
        indications: indications.trim() || null,
        risks: risks.trim() || null,
        inclusions: inclusions.filter((s) => s.trim()),
      };
      if (existing) {
        await updateProcedure(existing.id, payload);
      } else {
        await createProcedure(payload);
      }
      setSaveProgress((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === 'save-procedure' ? { ...item, status: 'done' } : item)),
      }));
      window.setTimeout(() => {
        setSaveProgress({
          open: false,
          title: '',
          items: [],
          canDismiss: false,
        });
      }, 400);
      onClose();
    } catch {
      setSaveProgress((prev) => ({
        ...prev,
        canDismiss: true,
        failedTargetKey: 'procedure-form',
        items: prev.items.map((item) => (
          item.id === 'save-procedure'
            ? {
              ...item,
              status: 'failed',
              error: tx('hospital.materials.procedures.saveFailed', 'Failed to save procedure.'),
            }
            : item
        )),
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500';
  const textareaClass =
    'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 resize-none';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing
        ? tx('hospital.materials.procedures.editProcedure', 'Edit Procedure')
        : tx('hospital.materials.procedures.addProcedureModalTitle', 'Add New Procedure')}
    >
      <UploadProgressModal
        state={saveProgress}
        onDismiss={() => {
          setSaveProgress({
            open: false,
            title: '',
            items: [],
            canDismiss: false,
          });
          formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setFlashTargetKey('procedure-form');
          window.setTimeout(() => setFlashTargetKey(null), 2200);
        }}
      />
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className={`space-y-4 ${getFlashClass(flashTargetKey === 'procedure-form')}`}
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {tx('hospital.materials.procedures.procedureNameLabel', 'Procedure Name')}
          </label>
          <input
            type="text"
            value={procedureName}
            onChange={(e) => setProcedureName(e.target.value)}
            required
            className={inputClass}
            placeholder={tx('hospital.materials.procedures.procedureNamePlaceholder', 'e.g. Rhinoplasty')}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {tx('hospital.materials.procedures.currencyLabel', 'Currency')}
            </label>
            <select className={inputClass}>
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
              <option>CNY</option>
              <option>THB</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {tx('hospital.materials.procedures.minPriceLabel', 'Min Price')}
            </label>
            <input
              type="number"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              placeholder={tx('hospital.materials.procedures.minPricePlaceholder', 'e.g. 5000')}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {tx('hospital.materials.procedures.maxPriceLabel', 'Max Price')}
            </label>
            <input
              type="number"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              placeholder={tx('hospital.materials.procedures.maxPricePlaceholder', 'e.g. 8000')}
              className={inputClass}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {tx('hospital.materials.procedures.recoveryTimeField', 'Recovery Time')}
            </label>
            <input
              type="text"
              value={recoveryTime}
              onChange={(e) => setRecoveryTime(e.target.value)}
              placeholder={tx('hospital.materials.procedures.recoveryTimePlaceholder', 'e.g. 2-4 weeks')}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {tx('hospital.materials.procedures.durationField', 'Duration')}
            </label>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder={tx('hospital.materials.procedures.durationPlaceholder', 'e.g. 2-3 hours')}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {tx('hospital.materials.procedures.hospitalStayField', 'Hospital Stay Days')}
            </label>
            <input
              type="text"
              value={hospitalStayDays}
              onChange={(e) => setHospitalStayDays(e.target.value)}
              placeholder={tx('hospital.materials.procedures.hospitalStayPlaceholder', 'e.g. 1-2 days')}
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {tx('hospital.materials.procedures.indicationsField', 'Indications')}
          </label>
          <textarea
            value={indications}
            onChange={(e) => setIndications(e.target.value)}
            placeholder={tx(
              'hospital.materials.procedures.indicationsPlaceholder',
              'Suitable candidates / conditions',
            )}
            rows={3}
            className={textareaClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {tx('hospital.materials.procedures.risksField', 'Risks')}
          </label>
          <textarea
            value={risks}
            onChange={(e) => setRisks(e.target.value)}
            placeholder={tx('hospital.materials.procedures.risksPlaceholder', 'Risks and precautions')}
            rows={3}
            className={textareaClass}
          />
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">
            {tx('hospital.materials.procedures.inclusionsField', 'Inclusions')}
          </label>
          <div className="space-y-2">
            {inclusions.map((item, index) => (
              <div key={`inclusion-${index}`} className="flex items-center gap-2">
                <input
                  type="text"
                  value={item}
                  onChange={(e) => {
                    const next = [...inclusions];
                    next[index] = e.target.value;
                    setInclusions(next);
                  }}
                  placeholder={tx(
                    'hospital.materials.procedures.inclusionPlaceholder',
                    'e.g. Post-op consultation',
                  )}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setInclusions(inclusions.filter((_, i) => i !== index))}
                  className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                  aria-label={tx('hospital.materials.procedures.removeInclusion', 'Remove inclusion')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setInclusions([...inclusions, ''])}
              className="w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:border-cyan-300 hover:text-cyan-600 transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={14} />
              {tx('hospital.materials.procedures.addInclusion', 'Add Inclusion')}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="isPopularProc"
            checked={isPopular}
            onChange={(e) => setIsPopular(e.target.checked)}
            className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
          />
          <label htmlFor="isPopularProc" className="text-sm font-medium text-slate-700">
            {tx('hospital.materials.procedures.markAsPopular', 'Mark as Popular Procedure')}
          </label>
        </div>
        <div className="pt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            {tx('hospital.materials.buttons.cancel', 'Cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting || !procedureName.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-xl transition-colors disabled:opacity-50"
          >
            {submitting
              ? tx('hospital.materials.buttons.saving', 'Saving...')
              : tx('hospital.materials.procedures.saveProcedure', 'Save Procedure')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 3 — Surgeons                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

function RepeatableTextList({
  label,
  values,
  onChange,
  placeholder,
  addLabel,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  const updateValue = (index: number, value: string) => {
    const next = [...values];
    next[index] = value;
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <div className="space-y-2">
        {values.map((value, index) => (
          <div key={`${label}-${index}`} className="flex items-center gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => updateValue(index, e.target.value)}
              placeholder={placeholder}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            />
            <button
              type="button"
              onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))}
              className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
              aria-label={`Remove ${label}`}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...values, ''])}
          className="w-full px-3 py-2 border border-dashed border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:border-purple-300 hover:text-purple-600 transition-colors flex items-center justify-center gap-2"
        >
          <Plus size={14} />
          {addLabel}
        </button>
      </div>
    </div>
  );
}

function SurgeonsTab() {
  const { t } = useHospitalI18n();
  const { data, isLoading, isError, error } = useSurgeons();
  const { data: proceduresData } = useProcedures();
  const { data: infoData } = useMaterialsInfo();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialsSurgeonDTO | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const isRegular = user.roles.includes('regular_hospital');
  const procedureOptions = ((proceduresData as MaterialsProcedureDTO[] | undefined) ?? []).map((procedure) => ({
    value: procedure.procedureName,
    label: procedure.procedureName,
  }));
  const departmentOptions = ((infoData as MaterialsHospitalInfoDTO | undefined)?.departments ?? []).map((department) => ({
    value: department,
    label: department,
  }));
  const specialtyOptions = isRegular ? departmentOptions : procedureOptions;
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t(key, values, fallback);
  const languageLabelByValue = new Map(
    getLanguageOptions(t).map((option) => [option.value, option.label]),
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<Users size={48} />}
        title={tx('hospital.materials.surgeons.loadFailedTitle', 'Surgeons failed to load')}
        description={formatUserFacingError(
          error,
          t,
          'hospital.materials.surgeons.loadFailedDescription',
          'Unable to load surgeons.',
        )}
      />
    );
  }

  const allSurgeons: MaterialsSurgeonDTO[] = (data as MaterialsSurgeonDTO[] | undefined) ?? [];
  const surgeons = allSurgeons.filter(
    (s) => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleDelete = async (id: string) => {
    if (!confirm(tx('hospital.materials.surgeons.confirmDelete', 'Delete this surgeon?'))) return;
    await deleteSurgeon(id);
    await queryClient.invalidateQueries({ queryKey: ['materials', 'surgeons'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={tx('hospital.materials.surgeons.searchPlaceholder', 'Search surgeons...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
          />
        </div>
        <button
          onClick={() => {
            setEditingItem(null);
            setShowModal(true);
          }}
          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm shadow-purple-500/20 transition-all"
        >
          <Plus size={16} /> {tx('hospital.materials.surgeons.addSurgeon', 'Add Surgeon')}
        </button>
      </div>

      {surgeons.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title={tx('hospital.materials.surgeons.emptyTitle', 'No surgeons yet')}
          description={tx(
            'hospital.materials.surgeons.emptyDescription',
            'Add your surgeons to showcase your team.',
          )}
          action={
            <Button
              onClick={() => {
                setEditingItem(null);
                setShowModal(true);
              }}
              className="gap-2"
            >
              <Plus size={16} /> {tx('hospital.materials.surgeons.addSurgeon', 'Add Surgeon')}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {surgeons.map((surgeon) => (
            <div
              key={surgeon.id}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex gap-6"
            >
              <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 bg-slate-100 border border-slate-200">
                {surgeon.imageUrl ? (
                  <img src={surgeon.imageUrl} alt={surgeon.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <Users size={32} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 truncate">{surgeon.name}</h3>
                    {surgeon.title && <p className="text-sm text-slate-500">{surgeon.title}</p>}
                  </div>
                  <button className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md">
                    <MoreVertical size={16} />
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {surgeon.experienceYears != null && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="font-medium text-slate-900">
                        {tx('hospital.materials.surgeons.experienceLabel', 'Experience:')}
                      </span>{' '}
                      {tx('hospital.materials.surgeons.experienceValue', '{count} Years', {
                        count: surgeon.experienceYears,
                      })}
                    </div>
                  )}
                  {surgeon.specialties.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="font-medium text-slate-900">
                        {tx('hospital.materials.surgeons.specialtiesLabel', 'Specialties:')}
                      </span>
                      <div className="flex gap-1 flex-wrap">
                        {surgeon.specialties.map((s) => (
                          <span key={s} className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {surgeon.languages.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="font-medium text-slate-900">
                        {tx('hospital.materials.surgeons.languagesLabel', 'Languages:')}
                      </span>{' '}
                      {surgeon.languages
                        .map((value) => {
                          const normalized = normalizeSurgeonLanguageValue(value);
                          return languageLabelByValue.get(normalized) ?? value;
                        })
                        .join(', ')}
                    </div>
                  )}
                  {surgeon.education.length > 0 && (
                    <div className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="font-medium text-slate-900">
                        {tx('hospital.materials.surgeons.educationLabel', 'Education:')}
                      </span>
                      <span className="line-clamp-2">{surgeon.education.join(', ')}</span>
                    </div>
                  )}
                  {surgeon.intro && (
                    <p className="text-xs text-slate-500 line-clamp-2">{surgeon.intro}</p>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-md text-xs font-medium">
                    {tx('hospital.materials.surgeons.publishedStatus', 'Published')}
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setEditingItem(surgeon); setShowModal(true); }}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      {tx('hospital.materials.surgeons.editProfile', 'Edit Profile')}
                    </button>
                    <button
                      onClick={() => handleDelete(surgeon.id)}
                      className="text-xs font-medium text-rose-600 hover:text-rose-700"
                    >
                      {tx('hospital.materials.buttons.delete', 'Delete')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <SurgeonModal
          open={showModal}
          onClose={() => { setShowModal(false); setEditingItem(null); }}
          existing={editingItem}
          specialtyOptions={specialtyOptions}
        />
      )}
    </div>
  );
}

function SurgeonModal({
  open,
  onClose,
  existing,
  specialtyOptions: availableSpecialtyOptions,
}: {
  open: boolean;
  onClose: () => void;
  existing: MaterialsSurgeonDTO | null;
  specialtyOptions: Array<{ value: string; label: string }>;
}) {
  const { t } = useHospitalI18n();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [pendingImageFile, setPendingImageFile] = useState<File | null>(null);
  const [imageDirty, setImageDirty] = useState(false);
  const [experienceYears, setExperienceYears] = useState('');
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [education, setEducation] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [intro, setIntro] = useState('');
  const [expertise, setExpertise] = useState('');
  const [philosophy, setPhilosophy] = useState('');
  const [achievements, setAchievements] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [flashTargetKey, setFlashTargetKey] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState<SaveProgressState>({
    open: false,
    title: '',
    items: [],
    canDismiss: false,
  });
  const imageSectionRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const specialtyOptions = mergeOptionLists(
    availableSpecialtyOptions,
    specialties.map((value) => ({ value, label: value })),
  );
  const languageOptions = mergeOptionLists(
    getSurgeonLanguageOptions(t),
    languages.map((value) => ({ value, label: value })),
  );
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t(key, values, fallback);

  useEffect(() => {
    setName(existing?.name ?? '');
    setTitle(existing?.title ?? '');
    setImageUrl(existing?.imageUrl ?? '');
    setPendingImageFile(null);
    setImageDirty(false);
    setExperienceYears(existing?.experienceYears != null ? String(existing.experienceYears) : '');
    setSpecialties(existing?.specialties ?? []);
    setLanguages(existing?.languages ?? []);
    setEducation(existing?.education ?? []);
    setCertifications(existing?.certifications ?? []);
    setIntro(existing?.intro ?? '');
    setExpertise(existing?.expertise ?? '');
    setPhilosophy(existing?.philosophy ?? '');
    setAchievements(existing?.achievements ?? []);
  }, [existing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    let nextImageUrl = imageUrl.trim() || null;
    const needsImageUpload = Boolean(pendingImageFile);
    setSaveProgress({
      open: true,
      title: existing
        ? tx('hospital.materials.surgeons.savingEditTitle', 'Saving surgeon profile')
        : tx('hospital.materials.surgeons.savingCreateTitle', 'Creating surgeon profile'),
      canDismiss: false,
      items: [
        ...(needsImageUpload
          ? [{
            id: 'upload-surgeon-image',
            label: tx(
              'hospital.materials.surgeons.uploadImageTask',
              'Upload surgeon image: {fileName}',
              { fileName: pendingImageFile!.name },
            ),
            targetKey: 'surgeon-image',
            status: 'pending' as const,
          }]
          : []),
        {
          id: 'save-surgeon',
          label: existing
            ? tx('hospital.materials.surgeons.saveEditAction', 'Save surgeon profile')
            : tx('hospital.materials.surgeons.saveCreateAction', 'Create surgeon profile'),
          targetKey: 'surgeon-form',
          status: 'pending' as const,
        },
      ],
    });
    try {
      if (needsImageUpload && pendingImageFile) {
        setSaveProgress((prev) => ({
          ...prev,
          items: prev.items.map((item) => (item.id === 'upload-surgeon-image' ? { ...item, status: 'uploading' } : item)),
        }));
        try {
          const asset = await uploadMaterialAsset(pendingImageFile, 'surgeon');
          nextImageUrl = asset.storageKey;
          setSaveProgress((prev) => ({
            ...prev,
            items: prev.items.map((item) => (item.id === 'upload-surgeon-image' ? { ...item, status: 'done' } : item)),
          }));
        } catch (error) {
          const message = formatUserFacingError(
            error,
            t,
            'hospital.materials.uploadProgress.uploadFailed',
            'Upload failed',
          );
          setSaveProgress((prev) => ({
            ...prev,
            canDismiss: true,
            failedTargetKey: 'surgeon-image',
            items: prev.items.map((item) => (
              item.id === 'upload-surgeon-image' ? { ...item, status: 'failed', error: message } : item
            )),
          }));
          return;
        }
      }

      setSaveProgress((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === 'save-surgeon' ? { ...item, status: 'saving' } : item)),
      }));

      const payload: Record<string, unknown> = {
        name: name.trim(),
        title: title.trim() || null,
        experienceYears: experienceYears ? Number(experienceYears) : null,
        specialties,
        languages: languages.map(normalizeSurgeonLanguageValue),
        education: education.map((item) => item.trim()).filter(Boolean),
        certifications: certifications.map((item) => item.trim()).filter(Boolean),
        intro: intro.trim() || null,
        expertise: expertise.trim() || null,
        philosophy: philosophy.trim() || null,
        achievements: achievements.map((item) => item.trim()).filter(Boolean),
      };
      if (!existing || imageDirty) {
        payload.imageUrl = nextImageUrl;
      }
      if (existing) {
        await updateSurgeon(existing.id, payload);
      } else {
        await createSurgeon(payload);
      }
      await queryClient.invalidateQueries({ queryKey: ['materials', 'surgeons'] });
      setPendingImageFile(null);
      setSaveProgress((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === 'save-surgeon' ? { ...item, status: 'done' } : item)),
      }));
      window.setTimeout(() => {
        setSaveProgress({
          open: false,
          title: '',
          items: [],
          canDismiss: false,
        });
      }, 400);
      onClose();
    } catch (error) {
      setSaveProgress((prev) => ({
        ...prev,
        canDismiss: true,
        failedTargetKey: 'surgeon-form',
        items: prev.items.map((item) => (
          item.id === 'save-surgeon'
            ? {
              ...item,
              status: 'failed',
              error: formatUserFacingError(
                error,
                t,
                'hospital.materials.surgeons.saveFailed',
                'Failed to save surgeon.',
              ),
            }
            : item
        )),
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing
        ? tx('hospital.materials.surgeons.editSurgeon', 'Edit Surgeon')
        : tx('hospital.materials.surgeons.addSurgeonModalTitle', 'Add New Surgeon')}
      maxWidth="max-w-4xl"
    >
      <UploadProgressModal
        state={saveProgress}
        onDismiss={() => {
          const failedKey = saveProgress.failedTargetKey;
          setSaveProgress({
            open: false,
            title: '',
            items: [],
            canDismiss: false,
          });
          if (failedKey === 'surgeon-image') {
            imageSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else if (failedKey === 'surgeon-form') {
            formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          setFlashTargetKey(failedKey ?? null);
          window.setTimeout(() => setFlashTargetKey(null), 2200);
        }}
      />
      <div className="max-h-[80vh] overflow-y-auto pr-1">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className={`space-y-5 ${getFlashClass(flashTargetKey === 'surgeon-form')}`}
        >
          <div ref={imageSectionRef} className={getFlashClass(flashTargetKey === 'surgeon-image')}>
            <ImageUploadWidget
              value={imageUrl}
              onChange={(url) => {
                setImageUrl(url);
                setImageDirty(true);
                if (!url) setPendingImageFile(null);
              }}
              onFileSelect={(file, previewUrl) => {
                setPendingImageFile(file);
                setImageDirty(true);
                setImageUrl(previewUrl);
              }}
              label={tx('hospital.materials.surgeons.profilePhotoLabel', 'Profile Photo')}
              compact
              allowDirectUrl={false}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{tx('hospital.materials.surgeons.fullNameLabel', 'Full Name')}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder={tx('hospital.materials.surgeons.fullNamePlaceholder', 'Dr. First Last')} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{tx('hospital.materials.surgeons.titleLabel', 'Title / Position')}</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tx('hospital.materials.surgeons.titlePlaceholder', 'e.g. Chief of Surgery')} className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{tx('hospital.materials.surgeons.yearsOfExperienceLabel', 'Years of Experience')}</label>
            <input type="number" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} placeholder={tx('hospital.materials.surgeons.yearsOfExperiencePlaceholder', 'e.g. 15')} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{tx('hospital.materials.surgeons.specialtiesField', 'Specialties')}</label>
          <MultiSelectDropdown
            options={specialtyOptions}
            selected={specialties}
            onChange={setSpecialties}
            placeholder={tx('hospital.materials.surgeons.searchPlaceholderSpecialties', 'Select specialties')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{tx('hospital.materials.surgeons.languagesField', 'Languages')}</label>
          <MultiSelectDropdown
            options={languageOptions}
            selected={languages}
            onChange={setLanguages}
            placeholder={tx('hospital.materials.surgeons.searchPlaceholderLanguages', 'Select languages')}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RepeatableTextList
            label={tx('hospital.materials.surgeons.educationField', 'Education')}
            values={education}
            onChange={setEducation}
            placeholder={tx('hospital.materials.surgeons.educationPlaceholder', 'e.g. Seoul National University School of Medicine')}
            addLabel={tx('hospital.materials.surgeons.addEducation', 'Add Education')}
          />
          <RepeatableTextList
            label={tx('hospital.materials.surgeons.certificationsField', 'Certifications')}
            values={certifications}
            onChange={setCertifications}
            placeholder={tx('hospital.materials.surgeons.certificationsPlaceholder', 'e.g. Board Certified Plastic Surgeon')}
            addLabel={tx('hospital.materials.surgeons.addCertification', 'Add Certification')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{tx('hospital.materials.surgeons.introductionField', 'Introduction')}</label>
          <textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={2} placeholder={tx('hospital.materials.surgeons.introductionPlaceholder', 'A brief introduction to the surgeon...')} className={`${inputClass} resize-none`} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{tx('hospital.materials.surgeons.expertiseField', 'Expertise & Specialization')}</label>
          <textarea value={expertise} onChange={(e) => setExpertise(e.target.value)} rows={3} placeholder={tx('hospital.materials.surgeons.expertisePlaceholder', 'Describe core areas of expertise...')} className={`${inputClass} resize-none`} />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{tx('hospital.materials.surgeons.philosophyField', 'Treatment Philosophy')}</label>
          <textarea value={philosophy} onChange={(e) => setPhilosophy(e.target.value)} rows={2} placeholder={tx('hospital.materials.surgeons.philosophyPlaceholder', "Describe the surgeon's treatment philosophy...")} className={`${inputClass} resize-none`} />
        </div>
        <RepeatableTextList
          label={tx('hospital.materials.surgeons.achievementsField', 'Achievements')}
          values={achievements}
          onChange={setAchievements}
          placeholder={tx('hospital.materials.surgeons.achievementsPlaceholder', 'e.g. Published 50 research papers')}
          addLabel={tx('hospital.materials.surgeons.addAchievement', 'Add Achievement')}
        />
        <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">{tx('hospital.materials.buttons.cancel', 'Cancel')}</button>
          <button type="submit" disabled={submitting || !name.trim()} className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors disabled:opacity-50">
            {submitting ? tx('hospital.materials.buttons.saving', 'Saving...') : tx('hospital.materials.surgeons.saveSurgeon', 'Save Surgeon')}
          </button>
        </div>
        </form>
      </div>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 4 — Case Gallery                                                       */
/* ═══════════════════════════════════════════════════════════════════════════ */

function BeforeAfterTab() {
  const { t } = useHospitalI18n();
  const { data, isLoading, isError, error } = useBeforeAfterCases();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialsBeforeAfterCaseDTO | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t(key, values, fallback);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={<Camera size={48} />}
        title={tx('hospital.materials.cases.loadFailedTitle', 'Cases failed to load')}
        description={formatUserFacingError(
          error,
          t,
          'hospital.materials.cases.loadFailedDescription',
          'Unable to load case gallery.',
        )}
      />
    );
  }

  const allCases: MaterialsBeforeAfterCaseDTO[] = (data as MaterialsBeforeAfterCaseDTO[] | undefined) ?? [];
  const cases = allCases.filter(
    (c) => !searchQuery || c.procedureName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleDelete = async (id: string) => {
    if (!confirm(tx('hospital.materials.cases.confirmDelete', 'Delete this case?'))) return;
    await deleteBeforeAfterCase(id);
    await queryClient.invalidateQueries({ queryKey: ['materials', 'cases'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={tx('hospital.materials.cases.searchPlaceholder', 'Search cases...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>
        <button
          onClick={() => { setEditingItem(null); setShowModal(true); }}
          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm shadow-amber-500/20 transition-all"
        >
          <Plus size={16} /> {tx('hospital.materials.cases.addCase', 'Add Case')}
        </button>
      </div>

      {cases.length === 0 ? (
        <EmptyState
          icon={<Camera size={48} />}
          title={tx('hospital.materials.cases.emptyTitle', 'No case photos')}
          description={tx('hospital.materials.cases.emptyDescription', 'Add cases to showcase your results.')}
          action={
            <Button onClick={() => { setEditingItem(null); setShowModal(true); }} className="gap-2">
              <Plus size={16} /> {tx('hospital.materials.cases.addCase', 'Add Case')}
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cases.map((c) => {
            const coverImage = c.images[0]?.url ?? '';

            return (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="h-40 bg-slate-100 relative">
                  {coverImage ? (
                    <img
                      src={coverImage}
                      alt={c.procedureName || tx('hospital.materials.cases.caseCoverAlt', 'Case cover')}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <ImageIcon size={32} />
                    </div>
                  )}
                </div>
                {/* Details */}
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-slate-900">
                      {c.procedureName || tx('hospital.materials.cases.procedureFallback', 'Procedure')}
                    </h3>
                    <button className="text-slate-400 hover:text-slate-600">
                      <MoreVertical size={16} />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-sm text-slate-600 mb-4 flex-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">
                        {tx('hospital.materials.cases.surgeonLabel', 'Surgeon:')}
                      </span>
                      <span className="font-medium text-slate-900">
                        {c.surgeonName ?? tx('hospital.materials.cases.notSpecified', 'Not specified')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">
                        {tx('hospital.materials.cases.photosLabel', 'Photos:')}
                      </span>
                      <span className="font-medium text-slate-900">{c.images.length}</span>
                    </div>
                    {c.description && <p className="text-xs text-slate-500 mt-1">{c.description}</p>}
                  </div>
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-md text-xs font-medium">
                      {tx('hospital.materials.cases.publishedStatus', 'Published')}
                    </span>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setEditingItem(c); setShowModal(true); }}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        {tx('hospital.materials.cases.editCase', 'Edit Case')}
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-xs font-medium text-rose-600 hover:text-rose-700"
                      >
                        {tx('hospital.materials.buttons.delete', 'Delete')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <BeforeAfterModal
          open={showModal}
          onClose={() => { setShowModal(false); setEditingItem(null); }}
          existing={editingItem}
        />
      )}
    </div>
  );
}

function BeforeAfterModal({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing: MaterialsBeforeAfterCaseDTO | null;
}) {
  const { t } = useHospitalI18n();
  const queryClient = useQueryClient();
  const [procedureName, setProcedureName] = useState('');
  const [surgeonName, setSurgeonName] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [pendingImageFiles, setPendingImageFiles] = useState<Map<string, File>>(new Map());
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [flashTargetKey, setFlashTargetKey] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState<SaveProgressState>({
    open: false,
    title: '',
    items: [],
    canDismiss: false,
  });
  const imagesInputRef = useRef<HTMLInputElement>(null);
  const imageSectionRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const tx = (key: string, fallback: string, values?: Record<string, string | number>) =>
    t(key, values, fallback);

  useEffect(() => {
    setProcedureName(existing?.procedureName ?? '');
    setSurgeonName(existing?.surgeonName ?? '');
    setImageUrls(existing?.images.map((img) => img.url) ?? []);
    setPendingImageFiles(new Map());
    setDescription(existing?.description ?? '');
  }, [existing]);

  const addImagesFromFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);
    const previewUrls = fileArr.map((file) => URL.createObjectURL(file));
    setImageUrls((prev) => [...prev, ...previewUrls]);
    setPendingImageFiles((prev) => {
      const next = new Map(prev);
      previewUrls.forEach((url, index) => {
        next.set(url, fileArr[index]!);
      });
      return next;
    });
  };

  const removeImageAt = (idx: number) => {
    setImageUrls((prev) => {
      const target = prev[idx];
      if (target) {
        setPendingImageFiles((files) => {
          const next = new Map(files);
          next.delete(target);
          return next;
        });
      }
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const pendingEntries = imageUrls
      .map((url, index) => ({ url, index, file: pendingImageFiles.get(url) }))
      .filter((entry): entry is { url: string; index: number; file: File } => Boolean(entry.file && isLocalPreviewUrl(entry.url)));

    setSaveProgress({
      open: true,
      title: existing
        ? tx('hospital.materials.cases.savingEditTitle', 'Saving case study')
        : tx('hospital.materials.cases.savingCreateTitle', 'Creating case study'),
      canDismiss: false,
      items: [
        ...pendingEntries.map((entry, index) => ({
          id: `upload-case-image-${index}`,
          label: tx('hospital.materials.cases.uploadImageTask', 'Upload case image: {fileName}', {
            fileName: entry.file.name,
          }),
          targetKey: 'case-images',
          status: 'pending' as const,
        })),
        {
          id: 'save-case',
          label: existing
            ? tx('hospital.materials.cases.saveEditAction', 'Save case study')
            : tx('hospital.materials.cases.saveCreateAction', 'Create case study'),
          targetKey: 'case-form',
          status: 'pending' as const,
        },
      ],
    });
    try {
      const nextImageUrls = [...imageUrls];
      const uploadResults = await Promise.allSettled(
        pendingEntries.map(async (entry, index) => {
          const taskId = `upload-case-image-${index}`;
          setSaveProgress((prev) => ({
            ...prev,
            items: prev.items.map((item) => (item.id === taskId ? { ...item, status: 'uploading' } : item)),
          }));
          try {
            const asset = await uploadMaterialAsset(entry.file, 'case');
            nextImageUrls[entry.index] = asset.storageKey;
            setSaveProgress((prev) => ({
              ...prev,
              items: prev.items.map((item) => (item.id === taskId ? { ...item, status: 'done' } : item)),
            }));
          } catch (error) {
            const message = formatUserFacingError(
              error,
              t,
              'hospital.materials.uploadProgress.uploadFailed',
              'Upload failed',
            );
            setSaveProgress((prev) => ({
              ...prev,
              canDismiss: true,
              failedTargetKey: 'case-images',
              items: prev.items.map((item) => (
                item.id === taskId ? { ...item, status: 'failed', error: message } : item
              )),
            }));
            throw error;
          }
        }),
      );

      if (uploadResults.some((result) => result.status === 'rejected')) {
        return;
      }

      setSaveProgress((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === 'save-case' ? { ...item, status: 'saving' } : item)),
      }));

      const images = nextImageUrls
        .map((url) => ({ url: url.trim() }))
        .filter((img) => img.url.length > 0 && !isLocalPreviewUrl(img.url));

      const payload: Record<string, unknown> = {
        procedureName: procedureName.trim() || undefined,
        surgeonName: surgeonName.trim() || null,
        description: description.trim() || null,
        images,
      };
      if (existing) {
        await updateBeforeAfterCase(existing.id, payload);
      } else {
        await createBeforeAfterCase(payload);
      }
      await queryClient.invalidateQueries({ queryKey: ['materials', 'cases'] });
      setPendingImageFiles(new Map());
      setSaveProgress((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === 'save-case' ? { ...item, status: 'done' } : item)),
      }));
      window.setTimeout(() => {
        setSaveProgress({
          open: false,
          title: '',
          items: [],
          canDismiss: false,
        });
      }, 400);
      onClose();
    } catch (error) {
      const message = formatUserFacingError(
        error,
        t,
        'hospital.materials.cases.saveFailed',
        'Failed to save case study.',
      );
      setSaveProgress((prev) => ({
        ...prev,
        canDismiss: true,
        failedTargetKey: prev.failedTargetKey ?? 'case-form',
        items: prev.items.map((item) => (
          item.id === 'save-case' ? { ...item, status: 'failed', error: message } : item
        )),
      }));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing
        ? tx('hospital.materials.cases.editCase', 'Edit Case')
        : tx('hospital.materials.cases.addCaseModalTitle', 'Add New Case Study')}
    >
      <UploadProgressModal
        state={saveProgress}
        onDismiss={() => {
          const failedKey = saveProgress.failedTargetKey ?? 'case-images';
          setSaveProgress({
            open: false,
            title: '',
            items: [],
            canDismiss: false,
          });
          if (failedKey === 'case-form') {
            formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          } else {
            imageSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          setFlashTargetKey(failedKey);
          window.setTimeout(() => setFlashTargetKey(null), 2200);
        }}
      />
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className={`space-y-4 ${getFlashClass(flashTargetKey === 'case-form')}`}
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{tx('hospital.materials.cases.procedureLabel', 'Procedure')}</label>
            <input type="text" value={procedureName} onChange={(e) => setProcedureName(e.target.value)} placeholder={tx('hospital.materials.cases.procedurePlaceholder', 'e.g. Rhinoplasty')} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{tx('hospital.materials.cases.leadSurgeonLabel', 'Lead Surgeon')}</label>
            <input type="text" value={surgeonName} onChange={(e) => setSurgeonName(e.target.value)} placeholder={tx('hospital.materials.cases.leadSurgeonPlaceholder', 'e.g. Dr. Sarah Jenkins')} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{tx('hospital.materials.cases.caseDescriptionLabel', 'Case Description')}</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={tx('hospital.materials.cases.caseDescriptionPlaceholder', 'Describe the procedure and outcome...')} className={`${inputClass} resize-none`} />
        </div>
        <div ref={imageSectionRef} className={`space-y-3 ${getFlashClass(flashTargetKey === 'case-images')}`}>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700">{tx('hospital.materials.cases.casePhotosLabel', 'Case Photos')}</label>
            <span className="text-xs text-slate-500">{tx('hospital.materials.cases.firstImageIsCover', 'First image is cover')}</span>
          </div>

          <input
            type="file"
            ref={imagesInputRef}
            accept="image/*"
            multiple
            className="hidden"
            onChange={async (e) => {
              await addImagesFromFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => imagesInputRef.current?.click()}
              className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-blue-100 transition-colors"
            >
              <Upload size={12} /> {tx('hospital.materials.cases.uploadPhotos', 'Upload Photos')}
            </button>
          </div>

          {imageUrls.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              {tx('hospital.materials.cases.uploadHint', 'Upload multiple photos to build the case gallery.')}
            </div>
          ) : (
            <div className="space-y-2">
              {imageUrls.map((url, idx) => (
                <div key={`${idx}-${url}`} className="flex items-start gap-2">
                  <div className="w-16 h-16 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center text-slate-300">
                    {url ? <img src={url} alt={tx('hospital.materials.cases.casePhotoAlt', 'Case photo {index}', { index: idx + 1 })} className="w-full h-full object-cover" /> : <ImageIcon size={18} />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{idx === 0 ? tx('hospital.materials.cases.coverPhoto', 'Cover photo') : tx('hospital.materials.cases.photoIndex', 'Photo {index}', { index: idx + 1 })}</span>
                      <span className="text-xs text-slate-400">
                        {pendingImageFiles.has(url)
                          ? tx('hospital.materials.cases.readyToUploadOnSave', 'Ready to upload on save')
                          : tx('hospital.materials.cases.savedImage', 'Saved image')}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeImageAt(idx)}
                    className="p-2 text-slate-400 hover:text-rose-500"
                    aria-label={tx('hospital.materials.cases.removePhoto', 'Remove photo {index}', { index: idx + 1 })}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">{tx('hospital.materials.buttons.cancel', 'Cancel')}</button>
          <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors disabled:opacity-50">
            {submitting ? tx('hospital.materials.buttons.saving', 'Saving...') : tx('hospital.materials.cases.saveCase', 'Save Case')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
