'use client';

import { useState, useTransition, useEffect, useMemo, useRef } from 'react';
import { Modal, Button, useMediaUpload } from '@medical-crm/ui';
import { Paperclip, FileText, Image as ImageIcon, X as XIcon } from 'lucide-react';
import { createFaq, updateFaq } from '@/actions/chatbot-faq-actions';
import { uploadFaqAttachment } from '@/actions/faq-upload-actions';

// ── Types ─────────────────────────────────────────────────────────────

interface FaqAttachment {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface FaqRow {
  id: string;
  category: string;
  question: string;
  answer: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  keywords: string[];
  attachments?: FaqAttachment[];
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface ChatbotFaqFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editFaq?: FaqRow | null;
  existingCategories?: Array<{
    name: string;
    hospitalType: 'REGULAR' | 'COSMETIC';
  }>;
}

// ── Form State ────────────────────────────────────────────────────────

interface FormState {
  category: string;
  question: string;
  answer: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  keywordsRaw: string;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  category: '',
  question: '',
  answer: '',
  hospitalType: 'REGULAR',
  keywordsRaw: '',
  sortOrder: '0',
  isActive: true,
};

function toFormState(faq: FaqRow): FormState {
  return {
    category: faq.category,
    question: faq.question,
    answer: faq.answer,
    hospitalType: faq.hospitalType,
    keywordsRaw: (faq.keywords ?? []).join(', '),
    sortOrder: String(faq.sortOrder ?? 0),
    isActive: faq.isActive,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return ImageIcon;
  return FileText;
}

// ── Tag Input ─────────────────────────────────────────────────────────

function TagInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const tags = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  function removeTag(idx: number) {
    const next = tags.filter((_, i) => i !== idx);
    onChange(next.join(', '));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && e.currentTarget.value.trim()) {
      e.preventDefault();
      const newTag = e.currentTarget.value.trim().replace(/,+$/, '');
      if (newTag && !tags.includes(newTag)) {
        onChange([...tags, newTag].join(', '));
      }
      e.currentTarget.value = '';
    }
    if (e.key === 'Backspace' && !e.currentTarget.value && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 min-h-[38px] focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-500/20 bg-white">
      {tags.map((tag, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-md bg-cyan-50 px-2 py-0.5 text-xs text-cyan-700"
        >
          {tag}
          <button
            type="button"
            onClick={() => removeTag(i)}
            className="text-cyan-400 hover:text-cyan-700 leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : 'Add more...'}
        className="flex-1 min-w-[120px] text-sm text-slate-700 outline-none bg-transparent"
      />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────

export function ChatbotFaqFormModal({
  open,
  onClose,
  onSuccess,
  editFaq,
  existingCategories,
}: ChatbotFaqFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Attachment state
  const [attachments, setAttachments] = useState<FaqAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { upload, isUploading, error: uploadError } = useMediaUpload({
    allowedMimeTypes: [
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ],
    maxFileSize: 20 * 1024 * 1024,
  });

  const isEdit = !!editFaq;

  useEffect(() => {
    if (open) {
      setForm(editFaq ? toFormState(editFaq) : EMPTY_FORM);
      setAttachments(editFaq?.attachments ?? []);
      setPendingFiles([]);
      setError(null);
    }
  }, [open, editFaq]);

  function handleChange<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function buildPayload() {
    const keywords = form.keywordsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      category: form.category.trim(),
      question: form.question.trim(),
      answer: form.answer.trim(),
      hospitalType: form.hospitalType,
      keywords,
      sortOrder: parseInt(form.sortOrder, 10) || 0,
      isActive: form.isActive,
    };
  }

  async function handleAttachmentUpload(files: File[]) {
    if (isEdit && editFaq) {
      // Edit mode: upload immediately using the real FAQ ID
      const initFn = (params: { fileName: string; fileSize: number; mimeType: string }) =>
        uploadFaqAttachment(editFaq.id, params);
      const uploaded = await upload(files, initFn);
      if (uploaded.length > 0) {
        setAttachments((prev) => [...prev, ...uploaded]);
      }
    } else {
      // Create mode: store files as pending (no FAQ ID yet)
      setPendingFiles((prev) => [...prev, ...files]);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    handleAttachmentUpload(Array.from(files));
    e.target.value = '';
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  function removePendingFile(index: number) {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit() {
    setError(null);
    if (!form.category.trim()) { setError('Category is required.'); return; }
    if (!form.question.trim()) { setError('Question is required.'); return; }
    if (!form.answer.trim()) { setError('Answer is required.'); return; }

    startTransition(async () => {
      try {
        const payload = buildPayload();
        if (isEdit && editFaq) {
          // Edit: include current attachments in the update
          await updateFaq(editFaq.id, { ...payload, attachments });
        } else {
          // Create: two-phase flow
          // Phase 1: Create FAQ without attachments
          const created = await createFaq(payload) as { id: string };

          // Phase 2: Upload pending files using the real FAQ ID
          if (pendingFiles.length > 0 && created.id) {
            const initFn = (params: { fileName: string; fileSize: number; mimeType: string }) =>
              uploadFaqAttachment(created.id, params);
            const uploaded = await upload(pendingFiles, initFn);

            // Phase 3: Patch FAQ with uploaded attachments
            if (uploaded.length > 0) {
              await updateFaq(created.id, { attachments: uploaded });
            }
          }
        }
        onSuccess();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'An error occurred');
      }
    });
  }

  const inputClass =
    'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20';
  const labelClass = 'block text-xs font-medium text-slate-600 mb-1';
  const categoryDatalistId = 'faq-category-options';
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          (existingCategories ?? [])
            .filter((c) => c.hospitalType === form.hospitalType)
            .map((c) => c.name.trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [existingCategories, form.hospitalType],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit FAQ' : 'New FAQ'}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {(error || uploadError) && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error || uploadError}
          </div>
        )}

        {/* Category + Hospital Type + Sort Order row */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Category *</label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => handleChange('category', e.target.value)}
              placeholder="e.g. pricing, visa, treatment"
              className={inputClass}
              maxLength={100}
              list={categoryDatalistId}
            />
            <datalist id={categoryDatalistId}>
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p className="mt-1 text-[11px] text-slate-500">
              You can select an existing category or type a new one.
            </p>
          </div>
          <div>
            <label className={labelClass}>Hospital Type *</label>
            <select
              value={form.hospitalType}
              onChange={(e) => handleChange('hospitalType', e.target.value as FormState['hospitalType'])}
              className={inputClass}
            >
              <option value="REGULAR">Regular</option>
              <option value="COSMETIC">Cosmetic</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Sort Order</label>
            <input type="number" value={form.sortOrder} onChange={(e) => handleChange('sortOrder', e.target.value)} className={inputClass} />
          </div>
        </div>

        {/* Question */}
        <div>
          <label className={labelClass}>Question *</label>
          <input
            type="text"
            value={form.question}
            onChange={(e) => handleChange('question', e.target.value)}
            placeholder="e.g. How much does rhinoplasty cost?"
            className={inputClass}
            maxLength={1000}
          />
        </div>

        {/* Answer */}
        <div>
          <label className={labelClass}>Answer *</label>
          <textarea
            value={form.answer}
            onChange={(e) => handleChange('answer', e.target.value)}
            rows={4}
            placeholder="Detailed answer..."
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Keywords */}
        <div>
          <label className={labelClass}>Keywords (press Enter or comma to add)</label>
          <TagInput
            value={form.keywordsRaw}
            onChange={(v) => handleChange('keywordsRaw', v)}
            placeholder="e.g. cost, price, surgery"
          />
        </div>

        {/* Attachments */}
        <div>
          <label className={labelClass}>Attachments</label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            accept="image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <Paperclip size={14} />
            {isUploading ? 'Uploading...' : 'Add Attachment'}
          </button>

          {/* Uploaded attachments (edit mode) */}
          {attachments.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {attachments.map((att, i) => {
                const Icon = getFileIcon(att.mimeType);
                return (
                  <div
                    key={att.storageKey}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs"
                  >
                    <Icon size={14} className="text-slate-500 shrink-0" />
                    <span className="text-slate-700 truncate flex-1">{att.fileName}</span>
                    <span className="text-slate-400 shrink-0">{formatFileSize(att.fileSize)}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="text-slate-400 hover:text-red-500 shrink-0"
                    >
                      <XIcon size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pending files (create mode) */}
          {pendingFiles.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {pendingFiles.map((file, i) => {
                const Icon = getFileIcon(file.type);
                return (
                  <div
                    key={`${file.name}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs"
                  >
                    <Icon size={14} className="text-amber-600 shrink-0" />
                    <span className="text-amber-800 truncate flex-1">{file.name}</span>
                    <span className="text-amber-500 shrink-0">{formatFileSize(file.size)}</span>
                    <span className="text-amber-500 text-[10px] shrink-0">pending</span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(i)}
                      className="text-amber-400 hover:text-red-500 shrink-0"
                    >
                      <XIcon size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* isActive toggle */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs font-medium text-slate-600">Active</span>
            <div className="relative inline-flex">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => handleChange('isActive', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 rounded-full border border-slate-200 bg-slate-200 peer-checked:bg-cyan-500 peer-checked:border-cyan-500 transition-colors" />
              <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
            </div>
          </label>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button variant="ghost" onClick={onClose} disabled={isPending || isUploading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isPending || isUploading}>
          {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create FAQ'}
        </Button>
      </div>
    </Modal>
  );
}
