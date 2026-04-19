import { FileText } from 'lucide-react';
import { EmptyState } from './empty-state';

type TemplateQuestion = {
  id: string;
  prompt: string;
  required?: boolean;
};

type TemplateStep = {
  id: string;
  title: string;
  description?: string;
  questions: TemplateQuestion[];
};

type ResponseEnvelope = {
  responses: Record<string, unknown>;
  extractedData?: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function humanizeKey(key: string): string {
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function defaultFormatFieldLabel(key: string): string {
  return humanizeKey(key);
}

function parseMaybeJsonObject(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) {
    return value;
  }

  const text = asNonEmptyString(value);
  if (!text) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeResponseEnvelope(response: unknown): ResponseEnvelope | null {
  const payload = isRecord(response) && 'data' in response
    ? (response as { data?: unknown }).data
    : response;

  const parsed = parseMaybeJsonObject(payload);
  if (!parsed) {
    return null;
  }

  if (isRecord(parsed.responses)) {
    return {
      responses: parsed.responses as Record<string, unknown>,
      extractedData: isRecord(parsed.extractedData) ? parsed.extractedData as Record<string, unknown> : null,
    };
  }

  return {
    responses: parsed,
    extractedData: null,
  };
}

function extractTemplateSteps(template: unknown): TemplateStep[] {
  const payload = isRecord(template) && 'data' in template
    ? (template as { data?: unknown }).data
    : template;

  const parsed = parseMaybeJsonObject(payload);
  const questionsRoot = isRecord(parsed?.questions) ? parsed.questions : parsed;
  const steps = Array.isArray(questionsRoot?.steps) ? questionsRoot.steps : [];

  const parsedSteps = steps
    .map((step): TemplateStep | null => {
      if (!isRecord(step)) {
        return null;
      }

      const title = asNonEmptyString(step.title);
      const questions: TemplateQuestion[] = Array.isArray(step.questions)
        ? step.questions
          .map((question): TemplateQuestion | null => {
            if (!isRecord(question)) {
              return null;
            }

            const id = asNonEmptyString(question.id);
            const prompt = asNonEmptyString(question.prompt)
              ?? asNonEmptyString(question.label)
              ?? asNonEmptyString(question.text);

            if (!id || !prompt) {
              return null;
            }

            return {
              id,
              prompt,
              required: question.required === true ? true : undefined,
            };
          })
          .filter((question): question is TemplateQuestion => question !== null)
        : [];

      if (!title || questions.length === 0) {
        return null;
      }

      return {
        id: asNonEmptyString(step.id) ?? title,
        title,
        description: asNonEmptyString(step.description) ?? undefined,
        questions,
      };
    })
    .filter((step): step is TemplateStep => step !== null);

  return parsedSteps;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasMeaningfulValue(item));
  }

  if (isRecord(value)) {
    return Object.values(value).some((item) => hasMeaningfulValue(item));
  }

  return true;
}

function flattenArrayValues(values: unknown[]): string[] {
  return values.flatMap((value) => {
    if (typeof value === 'string') {
      return value.trim().length > 0 ? [value] : [];
    }

    if (Array.isArray(value)) {
      return flattenArrayValues(value);
    }

    if (isRecord(value)) {
      return Object.values(value).flatMap((nested) => flattenArrayValues([nested]));
    }

    return value === null || value === undefined ? [] : [String(value)];
  });
}

type RenderValueOptions = {
  emptyValueLabel: string;
  formatFieldLabel: (key: string) => string;
};

function renderValue(value: unknown, options: RenderValueOptions) {
  if (!hasMeaningfulValue(value)) {
    return <span className="text-slate-400">{options.emptyValueLabel}</span>;
  }

  if (Array.isArray(value)) {
    const items = flattenArrayValues(value);
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-medium text-cyan-800"
          >
            {item}
          </span>
        ))}
      </div>
    );
  }

  if (isRecord(value)) {
    return (
      <div className="space-y-1.5">
        {Object.entries(value)
          .filter(([, nested]) => hasMeaningfulValue(nested))
          .map(([key, nested]) => (
            <div key={key} className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {options.formatFieldLabel(key)}
              </p>
              <div className="mt-1 text-sm text-slate-700">{renderValue(nested, options)}</div>
            </div>
          ))}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

function ResponseField({
  label,
  value,
  renderValueOptions,
}: {
  label: string;
  value: unknown;
  renderValueOptions: RenderValueOptions;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <div className="mt-2 text-sm text-slate-800">{renderValue(value, renderValueOptions)}</div>
    </div>
  );
}

export interface QuestionnaireReadonlyViewCopy {
  emptyStateTitle?: string;
  emptyStateDescription?: string;
  fallbackSectionTitle?: string;
  summarySectionTitle?: string;
  emptyValueLabel?: string;
}

export interface QuestionnaireReadonlyViewProps {
  template?: unknown | null;
  response?: unknown | null;
  copy?: QuestionnaireReadonlyViewCopy;
  formatFieldLabel?: (key: string) => string;
}

export function QuestionnaireReadonlyView({
  template = null,
  response = null,
  copy,
  formatFieldLabel = defaultFormatFieldLabel,
}: QuestionnaireReadonlyViewProps) {
  const normalizedResponse = normalizeResponseEnvelope(response);
  const responses = normalizedResponse?.responses ?? {};
  const extractedData = normalizedResponse?.extractedData ?? null;
  const templateSteps = extractTemplateSteps(template);
  const fallbackEntries = Object.entries(responses).filter(([, value]) => hasMeaningfulValue(value));
  const summaryEntries = Object.entries(extractedData ?? {}).filter(([, value]) => hasMeaningfulValue(value));

  const renderedTemplateSteps = templateSteps
    .map((step) => ({
      ...step,
      answeredQuestions: step.questions.filter((question) => hasMeaningfulValue(responses[question.id])),
    }))
    .filter((step) => step.answeredQuestions.length > 0);
  const renderValueOptions: RenderValueOptions = {
    emptyValueLabel: copy?.emptyValueLabel ?? '—',
    formatFieldLabel,
  };

  if (renderedTemplateSteps.length === 0 && fallbackEntries.length === 0 && summaryEntries.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={40} />}
        title={copy?.emptyStateTitle ?? 'No medical intake data'}
        description={copy?.emptyStateDescription ?? 'The patient has not completed the medical intake questionnaire yet.'}
      />
    );
  }

  return (
    <div className="space-y-6">
      {renderedTemplateSteps.length > 0 ? renderedTemplateSteps.map((step, index) => (
        <section
          key={step.id}
          className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-4"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-600 text-sm font-bold text-white">
              {index + 1}
            </span>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
              {step.description && <p className="mt-1 text-sm text-slate-500">{step.description}</p>}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {step.answeredQuestions.map((question) => (
              <ResponseField
                key={question.id}
                label={question.required ? `${question.prompt} *` : question.prompt}
                value={responses[question.id]}
                renderValueOptions={renderValueOptions}
              />
            ))}
          </div>
        </section>
      )) : (
        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {copy?.fallbackSectionTitle ?? 'Medical intake responses'}
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {fallbackEntries.map(([key, value]) => (
              <ResponseField
                key={key}
                label={formatFieldLabel(key)}
                value={value}
                renderValueOptions={renderValueOptions}
              />
            ))}
          </div>
        </section>
      )}

      {summaryEntries.length > 0 && (
        <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {copy?.summarySectionTitle ?? 'Summary & Assessment'}
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {summaryEntries.map(([key, value]) => (
              <ResponseField
                key={key}
                label={formatFieldLabel(key)}
                value={value}
                renderValueOptions={renderValueOptions}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
