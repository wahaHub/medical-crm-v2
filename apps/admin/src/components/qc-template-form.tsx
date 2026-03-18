'use client';

import { useState, useTransition, useEffect } from 'react';
import { Modal, Button } from '@medical-crm/ui';
import { createTemplate, updateTemplate } from '@/actions/qc-actions';

// ── Types ─────────────────────────────────────────────────────────────

export interface QcTemplateRow {
  id: string;
  templateName: string;
  category: string;
  procedureTypes: string[];
  version?: number | null;
  questions?: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

interface QcTemplateFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editTemplate?: QcTemplateRow | null;
}

// ── Form State ────────────────────────────────────────────────────────

interface FormState {
  templateName: string;
  category: string;
  procedureTypesRaw: string; // comma-separated tag input
  version: string;
  questionsJson: string;
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  templateName: '',
  category: '',
  procedureTypesRaw: '',
  version: '1',
  questionsJson: JSON.stringify(
    [
      {
        questionId: 'q1',
        questionType: 'text',
        questionTextZh: '问题文本',
        questionTextEn: 'Question text',
        required: true,
      },
    ],
    null,
    2,
  ),
  isActive: true,
};

function toFormState(t: QcTemplateRow): FormState {
  return {
    templateName: t.templateName,
    category: t.category,
    procedureTypesRaw: (t.procedureTypes ?? []).join(', '),
    version: String(t.version ?? 1),
    questionsJson: t.questions ? JSON.stringify(t.questions, null, 2) : EMPTY_FORM.questionsJson,
    isActive: t.isActive,
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

export function QcTemplateForm({ open, onClose, onSuccess, editTemplate }: QcTemplateFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isEdit = !!editTemplate;

  useEffect(() => {
    if (open) {
      setForm(editTemplate ? toFormState(editTemplate) : EMPTY_FORM);
      setError(null);
      setJsonError(null);
    }
  }, [open, editTemplate]);

  function handleChange<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function validateJson(raw: string): unknown | null {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function handleJsonChange(raw: string) {
    handleChange('questionsJson', raw);
    const parsed = validateJson(raw);
    setJsonError(parsed === null ? 'Invalid JSON — please check the format.' : null);
  }

  function buildPayload() {
    const parsed = validateJson(form.questionsJson);
    if (parsed === null) throw new Error('Questions JSON is invalid.');

    const procedureTypes = form.procedureTypesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      templateName: form.templateName,
      category: form.category,
      procedureTypes,
      questions: parsed,
      isActive: form.isActive,
    };
  }

  function handleSubmit() {
    setError(null);
    if (!form.templateName.trim()) { setError('Template name is required.'); return; }
    if (!form.category.trim()) { setError('Category is required.'); return; }
    if (jsonError) { setError('Fix JSON errors before saving.'); return; }

    startTransition(async () => {
      try {
        const payload = buildPayload();
        if (isEdit && editTemplate) {
          await updateTemplate(editTemplate.id, payload);
        } else {
          await createTemplate(payload);
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
      title={isEdit ? 'Edit Template' : 'New Template'}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Template Name */}
        <div>
          <label className={labelClass}>Template Name *</label>
          <input
            type="text"
            value={form.templateName}
            onChange={(e) => handleChange('templateName', e.target.value)}
            placeholder="e.g. Pre-Surgery Intake Form"
            className={inputClass}
            maxLength={200}
          />
        </div>

        {/* Category */}
        <div>
          <label className={labelClass}>Category *</label>
          <input
            type="text"
            value={form.category}
            onChange={(e) => handleChange('category', e.target.value)}
            placeholder="e.g. COSMETIC, DENTAL, ORTHOPEDIC"
            className={inputClass}
            maxLength={100}
          />
        </div>

        {/* Procedure Types */}
        <div>
          <label className={labelClass}>Procedure Types (press Enter or comma to add)</label>
          <TagInput
            value={form.procedureTypesRaw}
            onChange={(v) => handleChange('procedureTypesRaw', v)}
            placeholder="e.g. rhinoplasty, liposuction"
          />
        </div>

        {/* Version + isActive row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Version</label>
            <input
              type="number"
              value={form.version}
              onChange={(e) => handleChange('version', e.target.value)}
              min={1}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col justify-end pb-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <span className={labelClass.replace('mb-1', 'mb-0')}>Active</span>
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

        {/* Questions JSON */}
        <div>
          <label className={labelClass}>
            Questions (JSON array){' '}
            <span className="text-slate-400 font-normal">
              — each item: {`{ questionId, questionType, questionTextZh, questionTextEn, required, options?, conditionalLogic? }`}
            </span>
          </label>
          <textarea
            value={form.questionsJson}
            onChange={(e) => handleJsonChange(e.target.value)}
            rows={10}
            spellCheck={false}
            className={`${inputClass} resize-y font-mono text-xs ${jsonError ? 'border-red-300 focus:border-red-400 focus:ring-red-500/20' : ''}`}
          />
          {jsonError && (
            <p className="mt-1 text-xs text-red-600">{jsonError}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Template'}
        </Button>
      </div>
    </Modal>
  );
}
