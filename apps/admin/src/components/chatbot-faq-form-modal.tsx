'use client';

import { useState, useTransition, useEffect } from 'react';
import { Modal, Button } from '@medical-crm/ui';
import { createFaq, updateFaq } from '@/actions/chatbot-faq-actions';

// ── Types ─────────────────────────────────────────────────────────────

export interface FaqRow {
  id: string;
  category: string;
  questionEn: string;
  questionZh: string;
  answerEn: string;
  answerZh: string;
  keywords: string[];
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
}

// ── Form State ────────────────────────────────────────────────────────

interface FormState {
  category: string;
  questionEn: string;
  questionZh: string;
  answerEn: string;
  answerZh: string;
  keywordsRaw: string;
  sortOrder: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  category: '',
  questionEn: '',
  questionZh: '',
  answerEn: '',
  answerZh: '',
  keywordsRaw: '',
  sortOrder: '0',
  isActive: true,
};

function toFormState(faq: FaqRow): FormState {
  return {
    category: faq.category,
    questionEn: faq.questionEn,
    questionZh: faq.questionZh,
    answerEn: faq.answerEn,
    answerZh: faq.answerZh,
    keywordsRaw: (faq.keywords ?? []).join(', '),
    sortOrder: String(faq.sortOrder ?? 0),
    isActive: faq.isActive,
  };
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
        placeholder={tags.length === 0 ? placeholder : 'Add more…'}
        className="flex-1 min-w-[120px] text-sm text-slate-700 outline-none bg-transparent"
      />
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────

export function ChatbotFaqFormModal({ open, onClose, onSuccess, editFaq }: ChatbotFaqFormModalProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEdit = !!editFaq;

  useEffect(() => {
    if (open) {
      setForm(editFaq ? toFormState(editFaq) : EMPTY_FORM);
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
      category: form.category,
      questionEn: form.questionEn,
      questionZh: form.questionZh,
      answerEn: form.answerEn,
      answerZh: form.answerZh,
      keywords,
      sortOrder: parseInt(form.sortOrder, 10) || 0,
      isActive: form.isActive,
    };
  }

  function handleSubmit() {
    setError(null);
    if (!form.category.trim()) { setError('Category is required.'); return; }
    if (!form.questionEn.trim()) { setError('Question (English) is required.'); return; }
    if (!form.questionZh.trim()) { setError('Question (Chinese) is required.'); return; }
    if (!form.answerEn.trim()) { setError('Answer (English) is required.'); return; }
    if (!form.answerZh.trim()) { setError('Answer (Chinese) is required.'); return; }

    startTransition(async () => {
      try {
        const payload = buildPayload();
        if (isEdit && editFaq) {
          await updateFaq(editFaq.id, payload);
        } else {
          await createFaq(payload);
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit FAQ' : 'New FAQ'}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Category + Sort Order row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Category *</label>
            <input
              type="text"
              value={form.category}
              onChange={(e) => handleChange('category', e.target.value)}
              placeholder="e.g. PRICING, VISA, TREATMENT"
              className={inputClass}
              maxLength={100}
            />
          </div>
          <div>
            <label className={labelClass}>Sort Order</label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => handleChange('sortOrder', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {/* Question EN */}
        <div>
          <label className={labelClass}>Question (English) *</label>
          <input
            type="text"
            value={form.questionEn}
            onChange={(e) => handleChange('questionEn', e.target.value)}
            placeholder="e.g. How much does rhinoplasty cost?"
            className={inputClass}
            maxLength={1000}
          />
        </div>

        {/* Question ZH */}
        <div>
          <label className={labelClass}>Question (Chinese) *</label>
          <input
            type="text"
            value={form.questionZh}
            onChange={(e) => handleChange('questionZh', e.target.value)}
            placeholder="例：鼻整形手术费用是多少？"
            className={inputClass}
            maxLength={1000}
          />
        </div>

        {/* Answer EN */}
        <div>
          <label className={labelClass}>Answer (English) *</label>
          <textarea
            value={form.answerEn}
            onChange={(e) => handleChange('answerEn', e.target.value)}
            rows={4}
            placeholder="Detailed answer in English…"
            className={`${inputClass} resize-none`}
          />
        </div>

        {/* Answer ZH */}
        <div>
          <label className={labelClass}>Answer (Chinese) *</label>
          <textarea
            value={form.answerZh}
            onChange={(e) => handleChange('answerZh', e.target.value)}
            rows={4}
            placeholder="中文详细回答…"
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
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create FAQ'}
        </Button>
      </div>
    </Modal>
  );
}
