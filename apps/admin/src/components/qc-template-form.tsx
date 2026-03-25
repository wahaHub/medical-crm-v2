'use client';

import { useEffect, useState, useTransition } from 'react';
import { Modal, Button } from '@medical-crm/ui';
import { Plus, Trash2 } from 'lucide-react';
import { createTemplate, updateTemplate } from '@/actions/qc-actions';

type HospitalSection = 'REGULAR' | 'COSMETIC';
type QuestionType =
  | 'SINGLE_CHOICE'
  | 'MULTI_CHOICE'
  | 'TEXT'
  | 'TEXT_WITH_FILE'
  | 'MULTI_CHOICE_WITH_FILE'
  | 'MULTI_CHOICE_WITH_TEXT';

interface TemplateQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  required: boolean;
  options: string[];
  optionsInput: string;
}

interface TemplateStep {
  id: string;
  title: string;
  description: string;
  questions: TemplateQuestion[];
}

interface QuestionEditorModel {
  version: number;
  disease: string;
  isDefault: boolean;
  hospitalSection: HospitalSection;
  steps: Array<{
    id: string;
    title: string;
    description: string;
    questions: Array<{
      id: string;
      type: QuestionType;
      prompt: string;
      required: boolean;
      options: string[];
    }>;
  }>;
}

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

interface FormState {
  templateName: string;
  disease: string;
  isDefault: boolean;
  hospitalSection: HospitalSection;
  isActive: boolean;
  steps: TemplateStep[];
}

const QUESTION_TYPE_OPTIONS: Array<{ value: QuestionType; label: string }> = [
  { value: 'SINGLE_CHOICE', label: 'Single Choice' },
  { value: 'MULTI_CHOICE', label: 'Multi Choice' },
  { value: 'TEXT', label: 'Text Field' },
  { value: 'TEXT_WITH_FILE', label: 'Text + File Upload' },
  { value: 'MULTI_CHOICE_WITH_FILE', label: 'Multi Choice + File Upload' },
  { value: 'MULTI_CHOICE_WITH_TEXT', label: 'Multi Choice + Text Field' },
];

const OPTION_BASED_TYPES = new Set<QuestionType>([
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'MULTI_CHOICE_WITH_FILE',
  'MULTI_CHOICE_WITH_TEXT',
]);

const EMPTY_QUESTION = (type: QuestionType = 'TEXT'): TemplateQuestion => ({
  id: createId('q'),
  type,
  prompt: '',
  required: true,
  options: OPTION_BASED_TYPES.has(type) ? ['Option 1', 'Option 2'] : [],
  optionsInput: OPTION_BASED_TYPES.has(type) ? 'Option 1, Option 2' : '',
});

const EMPTY_STEP = (): TemplateStep => ({
  id: createId('s'),
  title: 'Step 1',
  description: '',
  questions: [EMPTY_QUESTION()],
});

const EMPTY_FORM: FormState = {
  templateName: '',
  disease: '',
  isDefault: false,
  hospitalSection: 'REGULAR',
  isActive: true,
  steps: [EMPTY_STEP()],
};

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function mapLegacyQuestionType(raw: unknown): QuestionType {
  const v = typeof raw === 'string' ? raw.toUpperCase() : '';
  if (v === 'SINGLE_CHOICE' || v === 'RADIO') return 'SINGLE_CHOICE';
  if (v === 'MULTI_CHOICE' || v === 'CHECKBOX') return 'MULTI_CHOICE';
  if (v === 'TEXT_WITH_FILE') return 'TEXT_WITH_FILE';
  if (v === 'MULTI_CHOICE_WITH_FILE') return 'MULTI_CHOICE_WITH_FILE';
  if (v === 'MULTI_CHOICE_WITH_TEXT') return 'MULTI_CHOICE_WITH_TEXT';
  return 'TEXT';
}

function normalizeOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') return item.trim();
      if (item && typeof item === 'object') {
        const maybe = item as { value?: unknown; labelEn?: unknown; labelZh?: unknown };
        if (typeof maybe.value === 'string') return maybe.value.trim();
        if (typeof maybe.labelEn === 'string') return maybe.labelEn.trim();
        if (typeof maybe.labelZh === 'string') return maybe.labelZh.trim();
      }
      return '';
    })
    .filter(Boolean);
}

function toEditorModel(template: QcTemplateRow): FormState {
  const raw = template.questions;
  const fromCategoryDefault = template.category?.toUpperCase() === 'DEFAULT';
  const inferredSection: HospitalSection = template.procedureTypes?.includes('COSMETIC')
    ? 'COSMETIC'
    : 'REGULAR';

  if (raw && typeof raw === 'object' && Array.isArray((raw as { steps?: unknown[] }).steps)) {
    const editor = raw as {
      disease?: unknown;
      isDefault?: unknown;
      hospitalSection?: unknown;
      steps?: unknown[];
    };
    const steps = (editor.steps ?? []).map((step, stepIndex) => {
      const s = step as {
        id?: unknown;
        title?: unknown;
        description?: unknown;
        questions?: unknown[];
      };
      const questions = Array.isArray(s.questions)
        ? s.questions.map((q) => {
            const qq = q as {
              id?: unknown;
              questionId?: unknown;
              type?: unknown;
              questionType?: unknown;
              prompt?: unknown;
              questionTextEn?: unknown;
              questionTextZh?: unknown;
              required?: unknown;
              options?: unknown;
            };
            const type = mapLegacyQuestionType(qq.type ?? qq.questionType);
            return {
              id:
                (typeof qq.id === 'string' && qq.id) ||
                (typeof qq.questionId === 'string' && qq.questionId) ||
                createId('q'),
              type,
              prompt:
                (typeof qq.prompt === 'string' && qq.prompt) ||
                (typeof qq.questionTextEn === 'string' && qq.questionTextEn) ||
                (typeof qq.questionTextZh === 'string' && qq.questionTextZh) ||
                '',
              required: typeof qq.required === 'boolean' ? qq.required : true,
              options: OPTION_BASED_TYPES.has(type) ? normalizeOptions(qq.options) : [],
              optionsInput: OPTION_BASED_TYPES.has(type) ? joinCsv(normalizeOptions(qq.options)) : '',
            } satisfies TemplateQuestion;
          })
        : [];
      return {
        id: (typeof s.id === 'string' && s.id) || createId('s'),
        title: (typeof s.title === 'string' && s.title) || `Step ${stepIndex + 1}`,
        description: typeof s.description === 'string' ? s.description : '',
        questions: questions.length > 0 ? questions : [EMPTY_QUESTION()],
      } satisfies TemplateStep;
    });

    const diseaseFromEditor =
      typeof editor.disease === 'string' && editor.disease.toUpperCase() !== 'DEFAULT'
        ? editor.disease
        : '';
    const isDefault = editor.isDefault === true || fromCategoryDefault;
    const hospitalSection =
      editor.hospitalSection === 'COSMETIC' || editor.hospitalSection === 'REGULAR'
        ? editor.hospitalSection
        : inferredSection;

    return {
      templateName: template.templateName,
      disease:
        diseaseFromEditor || (!fromCategoryDefault ? template.category : ''),
      isDefault,
      hospitalSection,
      isActive: template.isActive,
      steps: steps.length > 0 ? steps : [EMPTY_STEP()],
    };
  }

  if (Array.isArray(raw)) {
    const questions = raw.map((item) => {
      const q = item as {
        questionId?: unknown;
        questionType?: unknown;
        questionTextEn?: unknown;
        questionTextZh?: unknown;
        required?: unknown;
        options?: unknown;
      };
      const type = mapLegacyQuestionType(q.questionType);
      return {
        id: (typeof q.questionId === 'string' && q.questionId) || createId('q'),
        type,
        prompt:
          (typeof q.questionTextEn === 'string' && q.questionTextEn) ||
          (typeof q.questionTextZh === 'string' && q.questionTextZh) ||
          '',
        required: typeof q.required === 'boolean' ? q.required : true,
        options: OPTION_BASED_TYPES.has(type) ? normalizeOptions(q.options) : [],
        optionsInput: OPTION_BASED_TYPES.has(type) ? joinCsv(normalizeOptions(q.options)) : '',
      } satisfies TemplateQuestion;
    });
    return {
      templateName: template.templateName,
      disease: fromCategoryDefault ? '' : template.category,
      isDefault: fromCategoryDefault,
      hospitalSection: inferredSection,
      isActive: template.isActive,
      steps: [
        {
          id: createId('s'),
          title: 'Step 1',
          description: '',
          questions: questions.length > 0 ? questions : [EMPTY_QUESTION()],
        },
      ],
    };
  }

  return {
    ...EMPTY_FORM,
    templateName: template.templateName,
    disease: fromCategoryDefault ? '' : template.category,
    isDefault: fromCategoryDefault,
    hospitalSection: inferredSection,
    isActive: template.isActive,
  };
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinCsv(values: string[]): string {
  return values.join(', ');
}

export function QcTemplateForm({ open, onClose, onSuccess, editTemplate }: QcTemplateFormProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isEdit = !!editTemplate;

  useEffect(() => {
    if (open) {
      setForm(editTemplate ? toEditorModel(editTemplate) : EMPTY_FORM);
      setError(null);
    }
  }, [open, editTemplate]);

  function updateStep(stepId: string, updater: (step: TemplateStep) => TemplateStep) {
    setForm((prev) => ({
      ...prev,
      steps: prev.steps.map((step) => (step.id === stepId ? updater(step) : step)),
    }));
  }

  function addStep() {
    setForm((prev) => ({
      ...prev,
      steps: [
        ...prev.steps,
        { ...EMPTY_STEP(), title: `Step ${prev.steps.length + 1}` },
      ],
    }));
  }

  function removeStep(stepId: string) {
    setForm((prev) => ({
      ...prev,
      steps:
        prev.steps.length > 1
          ? prev.steps.filter((step) => step.id !== stepId)
          : prev.steps,
    }));
  }

  function addQuestion(stepId: string, type: QuestionType) {
    updateStep(stepId, (step) => ({
      ...step,
      questions: [...step.questions, EMPTY_QUESTION(type)],
    }));
  }

  function removeQuestion(stepId: string, questionId: string) {
    updateStep(stepId, (step) => ({
      ...step,
      questions:
        step.questions.length > 1
          ? step.questions.filter((q) => q.id !== questionId)
          : step.questions,
    }));
  }

  function updateQuestion(
    stepId: string,
    questionId: string,
    updater: (q: TemplateQuestion) => TemplateQuestion,
  ) {
    updateStep(stepId, (step) => ({
      ...step,
      questions: step.questions.map((q) => (q.id === questionId ? updater(q) : q)),
    }));
  }

  function buildPayload() {
    const templateName = form.templateName.trim();
    if (!templateName) throw new Error('Template name is required.');
    if (!form.isDefault && !form.disease.trim()) throw new Error('Disease is required for non-default templates.');
    if (form.steps.length === 0) throw new Error('At least one step is required.');

    for (const step of form.steps) {
      if (!step.title.trim()) throw new Error('Each step must have a title.');
      if (step.questions.length === 0) throw new Error('Each step must include at least one question.');
      for (const q of step.questions) {
        if (!q.prompt.trim()) throw new Error('Each question must have text.');
        if (OPTION_BASED_TYPES.has(q.type) && q.options.filter(Boolean).length < 2) {
          throw new Error('Choice questions require at least two options.');
        }
      }
    }

    const normalizedDisease = form.isDefault ? 'DEFAULT' : form.disease.trim().toUpperCase();
    const steps = form.steps.map((step) => ({
      id: step.id,
      title: step.title.trim(),
      description: step.description.trim(),
      questions: step.questions.map((q) => ({
        id: q.id,
        type: q.type,
        prompt: q.prompt.trim(),
        required: q.required,
        options: OPTION_BASED_TYPES.has(q.type)
          ? q.options.map((opt) => opt.trim()).filter(Boolean)
          : [],
      })),
    }));

    const editor: QuestionEditorModel = {
      version: 1,
      disease: normalizedDisease,
      isDefault: form.isDefault,
      hospitalSection: form.hospitalSection,
      steps,
    };

    return {
      templateName,
      category: normalizedDisease,
      procedureTypes: [form.hospitalSection],
      questions: editor,
      isActive: form.isActive,
    };
  }

  function handleSubmit() {
    setError(null);
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
      maxWidth="max-w-4xl"
    >
      <div className="space-y-5 max-h-[72vh] overflow-y-auto pr-1">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Template Name *</label>
            <input
              type="text"
              value={form.templateName}
              onChange={(e) => setForm((prev) => ({ ...prev, templateName: e.target.value }))}
              placeholder="e.g. Breast Cancer Intake"
              className={inputClass}
              maxLength={200}
            />
          </div>
          <div>
            <label className={labelClass}>Hospital Section *</label>
            <select
              value={form.hospitalSection}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, hospitalSection: e.target.value as HospitalSection }))
              }
              className={inputClass}
            >
              <option value="REGULAR">Regular</option>
              <option value="COSMETIC">Cosmetic</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>
              Disease {form.isDefault ? '(ignored for default template)' : '*'}
            </label>
            <input
              type="text"
              value={form.disease}
              onChange={(e) => setForm((prev) => ({ ...prev, disease: e.target.value }))}
              placeholder="e.g. BREAST_CANCER"
              className={inputClass}
              disabled={form.isDefault}
              maxLength={100}
            />
          </div>
          <div className="flex items-end gap-6 pb-1">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm((prev) => ({ ...prev, isDefault: e.target.checked }))}
              />
              Default template
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              Active
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Template Editor (Steps + Questions)</h3>
            <button
              type="button"
              onClick={addStep}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              <Plus size={14} />
              Add Step
            </button>
          </div>

          {form.steps.map((step, stepIndex) => (
            <div key={step.id} className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Step {stepIndex + 1}
                </div>
                <button
                  type="button"
                  onClick={() => removeStep(step.id)}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  disabled={form.steps.length <= 1}
                >
                  <Trash2 size={12} />
                  Remove Step
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  type="text"
                  value={step.title}
                  onChange={(e) => updateStep(step.id, (s) => ({ ...s, title: e.target.value }))}
                  className={inputClass}
                  placeholder="Step title"
                />
                <input
                  type="text"
                  value={step.description}
                  onChange={(e) => updateStep(step.id, (s) => ({ ...s, description: e.target.value }))}
                  className={inputClass}
                  placeholder="Step description (optional)"
                />
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                <p className="text-xs font-medium text-slate-600">Add Question Type</p>
                <div className="flex flex-wrap gap-2">
                  {QUESTION_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => addQuestion(step.id, option.value)}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                    >
                      + {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {step.questions.map((question, qIndex) => (
                  <div key={question.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-500">Q{qIndex + 1}</span>
                      <select
                        value={question.type}
                        onChange={(e) =>
                          updateQuestion(step.id, question.id, (q) => {
                            const nextType = e.target.value as QuestionType;
                            const nextOptions = OPTION_BASED_TYPES.has(nextType)
                              ? (q.options.length > 0 ? q.options : ['Option 1', 'Option 2'])
                              : [];
                            return {
                              ...q,
                              type: nextType,
                              options: nextOptions,
                              optionsInput: OPTION_BASED_TYPES.has(nextType) ? joinCsv(nextOptions) : '',
                            };
                          })
                        }
                        className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-700"
                      >
                        {QUESTION_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <label className="ml-auto flex items-center gap-1 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={question.required}
                          onChange={(e) =>
                            updateQuestion(step.id, question.id, (q) => ({ ...q, required: e.target.checked }))
                          }
                        />
                        Required
                      </label>
                      <button
                        type="button"
                        onClick={() => removeQuestion(step.id, question.id)}
                        disabled={step.questions.length <= 1}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={question.prompt}
                      onChange={(e) =>
                        updateQuestion(step.id, question.id, (q) => ({ ...q, prompt: e.target.value }))
                      }
                      className={inputClass}
                      placeholder="Question text"
                    />

                    {OPTION_BASED_TYPES.has(question.type) && (
                      <div>
                        <label className={labelClass}>
                          Options (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={question.optionsInput}
                          onChange={(e) =>
                            updateQuestion(step.id, question.id, (q) => ({
                              ...q,
                              optionsInput: e.target.value,
                              options: splitCsv(e.target.value),
                            }))
                          }
                          className={inputClass}
                          placeholder="Option A, Option B, Option C"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

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
