import React from 'react';
import { FileText, Image as ImageIcon, X } from 'lucide-react';
import { useHospitalI18n } from '@/lib/hospital-i18n';

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function isPdfMimeType(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

function formatNumber(value: number, locale: string, maximumFractionDigits: number): string {
  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits,
  });
  return formatter.format(value);
}

function formatFileSize(
  bytes: number,
  locale: string,
  t: (key: string, values?: Record<string, string | number>, fallback?: string) => string,
): string {
  if (bytes < 1024) {
    return t(
      'hospital.attachments.fileSize.bytes',
      { value: formatNumber(bytes, locale, 0) },
      '{value} B',
    );
  }

  if (bytes < 1024 * 1024) {
    return t(
      'hospital.attachments.fileSize.kb',
      { value: formatNumber(bytes / 1024, locale, 0) },
      '{value} KB',
    );
  }

  return t(
    'hospital.attachments.fileSize.mb',
    { value: formatNumber(bytes / 1024 / 1024, locale, 1) },
    '{value} MB',
  );
}

function getPdfPreviewUrl(url: string): string {
  return `${url}#toolbar=0&navpanes=0&scrollbar=0&page=1&view=FitH`;
}

export function isPreviewableAttachment(mimeType: string): boolean {
  return isImageMimeType(mimeType) || isPdfMimeType(mimeType);
}

type AttachmentPreviewCardProps = {
  fileName: string;
  mimeType: string;
  fileSize: number;
  url?: string;
  pending?: boolean;
  onRemove: () => void;
};

export function AttachmentPreviewCard({
  fileName,
  mimeType,
  fileSize,
  url,
  pending = false,
  onRemove,
}: AttachmentPreviewCardProps) {
  const { locale, t } = useHospitalI18n();
  const hasPreview = Boolean(url) && isPreviewableAttachment(mimeType);
  const imagePreview = hasPreview && isImageMimeType(mimeType);
  const pdfPreview = hasPreview && isPdfMimeType(mimeType);
  const previewTitle = t(
    'hospital.attachments.preview.title',
    { fileName },
    'Preview of {fileName}',
  );
  const removeLabel = t(
    'hospital.attachments.actions.remove',
    { fileName },
    'Remove {fileName}',
  );
  const statusLabel = pending
    ? t('hospital.attachments.status.pending', undefined, 'Pending upload')
    : t('hospital.attachments.status.attached', undefined, 'Attached');
  const previewLabel = pdfPreview
    ? t('hospital.attachments.preview.pdf', undefined, 'PDF preview')
    : imagePreview
      ? t('hospital.attachments.preview.image', undefined, 'Image preview')
      : t('hospital.attachments.preview.file', undefined, 'File attachment');

  return (
    <div
      className={`rounded-2xl border p-3 ${
        pending ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {imagePreview && (
            <img alt={fileName} src={url} className="h-full w-full object-cover" />
          )}
          {pdfPreview && (
            <iframe
              title={previewTitle}
              src={getPdfPreviewUrl(url!)}
              className="h-full w-full pointer-events-none bg-white"
            />
          )}
          {!hasPreview && (
            <div className="flex h-full w-full items-center justify-center bg-slate-100">
              {isImageMimeType(mimeType) ? (
                <ImageIcon size={20} className="text-slate-400" />
              ) : (
                <FileText size={20} className="text-slate-400" />
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={`truncate text-sm font-medium ${pending ? 'text-amber-900' : 'text-slate-800'}`}>
                {fileName}
              </div>
              <div className={`mt-1 text-xs ${pending ? 'text-amber-600' : 'text-slate-500'}`}>
                {formatFileSize(fileSize, locale, t)}
              </div>
            </div>
            <button
              type="button"
              onClick={onRemove}
              aria-label={removeLabel}
              title={removeLabel}
              className={`rounded-lg p-1 transition-colors ${
                pending
                  ? 'text-amber-400 hover:bg-rose-50 hover:text-rose-500'
                  : 'text-slate-400 hover:bg-rose-50 hover:text-rose-500'
              }`}
            >
              <X size={14} />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                pending ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {statusLabel}
            </span>
            <span className="text-[11px] text-slate-400">
              {previewLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
