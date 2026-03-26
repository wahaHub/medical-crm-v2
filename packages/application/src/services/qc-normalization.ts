import type { QCTemplateQuestion, QCResponsePayload } from '@medical-crm/domain';

/**
 * Validates and extracts a question array from a raw (unknown) payload.
 * Returns an empty array if the payload is not a valid question array.
 * Individual items that fail validation are silently skipped.
 */
export function normalizeQCQuestions(raw: unknown): QCTemplateQuestion[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const result: QCTemplateQuestion[] = [];

  for (const item of raw) {
    if (!isPlainObject(item)) continue;

    const id = item['id'];
    const type = item['type'];
    const label = item['label'];

    if (typeof id !== 'string' || id.trim() === '') continue;
    if (!isValidQuestionType(type)) continue;
    if (typeof label !== 'string') continue;

    const question: QCTemplateQuestion = { id, type, label };

    const placeholder = item['placeholder'];
    if (typeof placeholder === 'string') {
      question.placeholder = placeholder;
    }

    const options = item['options'];
    if (Array.isArray(options) && options.every((o) => typeof o === 'string')) {
      question.options = options as string[];
    }

    const required = item['required'];
    if (typeof required === 'boolean') {
      question.required = required;
    }

    result.push(question);
  }

  return result;
}

/**
 * Validates and extracts a response map from a raw (unknown) payload.
 * Returns an empty object if the payload is not a valid response map.
 * Keys whose values are not string, string[], or null are silently skipped.
 */
export function normalizeQCResponses(raw: unknown): QCResponsePayload {
  if (!isPlainObject(raw)) {
    return {};
  }

  const result: QCResponsePayload = {};

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      result[key] = value;
    } else if (value === null) {
      result[key] = null;
    } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      result[key] = value as string[];
    }
    // skip invalid values silently
  }

  return result;
}

/**
 * Extracts translatable fields (labels, placeholders, options) from a validated
 * question array for use by the AI translation worker.
 *
 * The returned record uses namespaced keys:
 *   `q.<id>.label`       — question label
 *   `q.<id>.placeholder` — question placeholder (if present)
 *   `q.<id>.opt.<i>`     — option text at index i (if present)
 */
export function extractTranslatableQCFields(questions: QCTemplateQuestion[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const q of questions) {
    result[`q.${q.id}.label`] = q.label;

    if (q.placeholder !== undefined) {
      result[`q.${q.id}.placeholder`] = q.placeholder;
    }

    if (q.options !== undefined) {
      q.options.forEach((opt, i) => {
        result[`q.${q.id}.opt.${i}`] = opt;
      });
    }
  }

  return result;
}

/**
 * Extracts translatable text values from a validated response payload.
 * Only string values are extracted (string[] and null are excluded because
 * they represent selections, not free-text that needs translation).
 *
 * The returned record uses the original question-id keys.
 */
export function extractTranslatableQCResponses(responses: QCResponsePayload): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(responses)) {
    if (typeof value === 'string' && value.trim() !== '') {
      result[key] = value;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const VALID_QUESTION_TYPES = new Set(['text', 'textarea', 'select', 'multiselect', 'checkbox', 'date']);

function isValidQuestionType(value: unknown): value is QCTemplateQuestion['type'] {
  return typeof value === 'string' && VALID_QUESTION_TYPES.has(value);
}
