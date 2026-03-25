import { FileText, Image as ImageIcon, X } from 'lucide-react';

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function isPdfMimeType(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
  const hasPreview = Boolean(url) && isPreviewableAttachment(mimeType);
  const imagePreview = hasPreview && isImageMimeType(mimeType);
  const pdfPreview = hasPreview && isPdfMimeType(mimeType);

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
              title={`${fileName} preview`}
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
                {formatFileSize(fileSize)}
              </div>
            </div>
            <button
              type="button"
              onClick={onRemove}
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
              {pending ? 'Pending upload' : 'Attached'}
            </span>
            <span className="text-[11px] text-slate-400">
              {pdfPreview ? 'PDF preview' : imagePreview ? 'Image preview' : 'File attachment'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
