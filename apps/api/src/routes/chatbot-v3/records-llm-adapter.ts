import type { LlmNodeAdapter } from '@medical-crm/application';
import {
  buildRecordsMinimalTriageClarifyingFollowUp,
  buildRecordsMinimalTriageInitialFollowUp,
  buildRecordsMinimalTriageMissingFollowUp,
  RECORDS_DIAGNOSIS_PROOF_UPLOAD_GUIDANCE,
  RECORDS_COLLECTION_PROMPT_VERSION,
  RECORDS_MINIMAL_TRIAGE_MISSING_FIELDS,
  RECORDS_MINIMAL_TRIAGE_PROMPT_VERSION,
  RECORDS_MINIMAL_TRIAGE_QUESTIONS,
  type RecordsMinimalTriageDetectedDetails,
  type RecordsMinimalTriageMissingField,
} from './records-prompts.js';
import type {
  RecordsWorkerMode,
  RecordsWorkerTask,
} from './worker-task.js';
import type { ChatbotV3LlmFailureMetadata } from './llm-route-error.js';
import { summarizeChatbotV3LlmError } from './llm-route-error.js';

export interface RecordsLlmRunMetadata extends ChatbotV3LlmFailureMetadata {
  nodePromptVersion?: string;
  nodeModel?: string;
  fallbackUsed?: boolean;
  schemaValidationFailed?: boolean;
}

export interface RecordsStatusWorkerInput {
  task: RecordsWorkerTask;
}

export interface RecordsWorkerResult {
  'records.minimal_triage.complete': boolean;
  questions?: readonly string[];
  followUp?: string;
  missing?: readonly RecordsMinimalTriageMissingField[];
  collectionPrompt?: string;
}

export interface RecordsLlmAdapterOptions {
  worker?: LlmNodeAdapter<RecordsStatusWorkerInput, unknown>;
  promptVersionByMode?: Partial<Record<RecordsWorkerMode, string>>;
}

export class RecordsLlmAdapter {
  private lastRunMetadata: RecordsLlmRunMetadata | null = null;

  constructor(private readonly options: RecordsLlmAdapterOptions = {}) {}

  async runStatus(input: RecordsStatusWorkerInput): Promise<RecordsWorkerResult> {
    const fallback = buildFallbackRecordsWorkerResult(input.task);
    const mode = input.task.mode;
    const promptVersion = resolveRecordsNodePromptVersion(input.task, this.options);
    const metadataBase = {
      nodePromptVersion: promptVersion,
      nodeModel: this.options.worker?.model,
    } satisfies RecordsLlmRunMetadata;

    if (!this.options.worker) {
      this.lastRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
      };
      return fallback;
    }

    try {
      const raw = await this.options.worker.run(input);
      const sanitized = sanitizeRecordsWorkerResult(raw, fallback, mode);
      this.lastRunMetadata = {
        ...metadataBase,
        fallbackUsed: sanitized.fallbackUsed,
        schemaValidationFailed: sanitized.schemaValidationFailed,
      };
      return sanitized.result;
    } catch (error) {
      this.lastRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
        ...summarizeChatbotV3LlmError(error),
      };
      return fallback;
    }
  }

  getLastRunMetadata(): RecordsLlmRunMetadata | null {
    return this.lastRunMetadata;
  }
}

function sanitizeRecordsWorkerResult(
  raw: unknown,
  fallback: RecordsWorkerResult,
  mode: RecordsWorkerMode,
): {
  result: RecordsWorkerResult;
  fallbackUsed: boolean;
  schemaValidationFailed: boolean;
} {
  const record = asRecord(raw);
  const complete = record['records.minimal_triage.complete'];
  if (typeof complete !== 'boolean') {
    return {
      result: fallback,
      fallbackUsed: true,
      schemaValidationFailed: true,
    };
  }
  const canonicalComplete = mode === 'medical_collection'
    ? fallback['records.minimal_triage.complete']
    : complete;

  const questions = sanitizeQuestions(record.questions);
  const followUp = normalizeString(record.followUp);
  const missing = sanitizeMissing(record.missing);
  const collectionPrompt = normalizeString(record.collectionPrompt);
  const sanitizedCollectionPrompt = mode === 'medical_collection'
    ? sanitizeDiagnosisProofCollectionPrompt(collectionPrompt)
    : collectionPrompt;
  const hasInvalidQuestions = record.questions !== undefined && questions === null;
  const hasInvalidMissing = record.missing !== undefined && missing === null;
  const hasInvalidFollowUp = record.followUp !== undefined && followUp === null;
  const hasInvalidCollectionPrompt = record.collectionPrompt !== undefined && collectionPrompt === null;
  const hasInvalidDiagnosisProofCollectionPrompt = mode === 'medical_collection'
    && collectionPrompt !== null
    && sanitizedCollectionPrompt === null;
  const lacksRequiredMinimalTriageFields = mode === 'minimal_triage'
    && complete === false
    && (questions === null || questions.length === 0 || followUp === null || missing === null || missing.length === 0);
  const lacksRequiredCollectionPrompt = mode === 'medical_collection'
    && collectionPrompt === null;

  if (
    hasInvalidQuestions
    || hasInvalidMissing
    || hasInvalidFollowUp
    || hasInvalidCollectionPrompt
    || hasInvalidDiagnosisProofCollectionPrompt
    || lacksRequiredMinimalTriageFields
    || lacksRequiredCollectionPrompt
  ) {
    return {
      result: fallback,
      fallbackUsed: true,
      schemaValidationFailed: true,
    };
  }

  return {
    result: {
      'records.minimal_triage.complete': canonicalComplete,
      ...(questions ? { questions } : {}),
      ...(followUp ? { followUp } : {}),
      ...(missing ? { missing } : {}),
      ...(sanitizedCollectionPrompt ? { collectionPrompt: sanitizedCollectionPrompt } : {}),
    },
    fallbackUsed: false,
    schemaValidationFailed: false,
  };
}

function buildFallbackRecordsWorkerResult(task: RecordsWorkerTask): RecordsWorkerResult {
  const mode = task.mode;
  if (mode === 'medical_collection') {
    return buildFallbackRecordsCollectionResult(task);
  }

  return buildFallbackRecordsMinimalTriageResult(task);
}

function buildFallbackRecordsCollectionResult(task: RecordsWorkerTask): RecordsWorkerResult {
  return {
    'records.minimal_triage.complete': task.minimalTriageComplete,
    collectionPrompt: RECORDS_DIAGNOSIS_PROOF_UPLOAD_GUIDANCE,
  };
}

function buildFallbackRecordsMinimalTriageResult(task: RecordsWorkerTask): RecordsWorkerResult {
  const analysis = analyzeRecordsMinimalTriage(
    buildMinimalTriageAnalysisText(task),
    task.latestUserMessage,
  );

  if (analysis.complete) {
    return {
      'records.minimal_triage.complete': true,
    };
  }

  if (analysis.reason === 'insufficient') {
    return {
      'records.minimal_triage.complete': false,
      questions: getFocusedMinimalTriageQuestions(task),
      followUp: buildRecordsMinimalTriageClarifyingFollowUp(analysis.missing, analysis.detected),
      missing: analysis.missing,
    };
  }

  return {
    'records.minimal_triage.complete': false,
    questions: getFocusedMinimalTriageQuestions(task),
    followUp: analysis.reason === 'initial' && analysis.missing.length === RECORDS_MINIMAL_TRIAGE_MISSING_FIELDS.length
      ? buildRecordsMinimalTriageInitialFollowUp()
      : buildRecordsMinimalTriageMissingFollowUp(analysis.missing),
    missing: analysis.missing,
  };
}

function buildMinimalTriageAnalysisText(task: RecordsWorkerTask): string {
  const priorUserMessages = (task.recentMessages ?? [])
    .filter((message) => message.role === 'USER')
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0);
  return [...priorUserMessages, task.latestUserMessage].join(' ');
}

function getFocusedMinimalTriageQuestions(task: RecordsWorkerTask): readonly string[] {
  const maxQuestions = task.responseContract?.constraints?.maxQuestions === 2 ? 2 : 1;
  return RECORDS_MINIMAL_TRIAGE_QUESTIONS.slice(0, maxQuestions);
}

function resolveRecordsNodePromptVersion(
  task: RecordsWorkerTask,
  options: RecordsLlmAdapterOptions,
): string {
  const configured = options.promptVersionByMode?.[task.mode];
  if (configured) {
    return configured;
  }

  if (options.worker?.promptVersion) {
    return options.worker.promptVersion;
  }

  return task.mode === 'medical_collection'
    ? RECORDS_COLLECTION_PROMPT_VERSION
    : RECORDS_MINIMAL_TRIAGE_PROMPT_VERSION;
}

function analyzeRecordsMinimalTriage(latestUserMessage: string, unclearSignalText = latestUserMessage): {
  complete: boolean;
  reason: 'complete' | 'initial' | 'partial' | 'insufficient';
  missing: RecordsMinimalTriageMissingField[];
  detected: RecordsMinimalTriageDetectedDetails;
} {
  const normalized = normalizeRecordsMessage(latestUserMessage);
  const detected = detectRecordsMinimalTriageDetails(normalized);
  const missing = getMissingRecordsMinimalTriageFields(detected);

  if (normalized.length === 0 || isClearlyUnusableMedicalReply(normalized)) {
    return {
      complete: false,
      reason: 'insufficient',
      missing,
      detected,
    };
  }

  if (missing.length === 0) {
    return {
      complete: true,
      reason: 'complete',
      missing: [],
      detected,
    };
  }

  if (hasUnclearSignal(normalizeRecordsMessage(unclearSignalText))) {
    return {
      complete: false,
      reason: 'insufficient',
      missing,
      detected,
    };
  }

  const completedFieldCount = countCompletedRecordsMinimalTriageFields(detected);
  return {
    complete: false,
    reason: completedFieldCount >= 2 ? 'partial' : 'initial',
    missing,
    detected,
  };
}

function normalizeRecordsMessage(value: string): string {
  return value.trim().toLowerCase();
}

function detectRecordsMinimalTriageDetails(value: string): RecordsMinimalTriageDetectedDetails {
  return {
    hasSymptomOrDiagnosis: hasSymptomSignal(value),
    hasTiming: hasTimingSignal(value),
    hasSeverity: hasSeveritySignal(value),
    hasExistingTestsOrTreatments: hasTreatmentSignal(value),
  };
}

function getMissingRecordsMinimalTriageFields(
  detected: RecordsMinimalTriageDetectedDetails,
): RecordsMinimalTriageMissingField[] {
  return RECORDS_MINIMAL_TRIAGE_MISSING_FIELDS.filter((field) => !hasRecordsMinimalTriageField(detected, field));
}

function countCompletedRecordsMinimalTriageFields(
  detected: RecordsMinimalTriageDetectedDetails,
): number {
  return RECORDS_MINIMAL_TRIAGE_MISSING_FIELDS.filter((field) => hasRecordsMinimalTriageField(detected, field)).length;
}

function hasRecordsMinimalTriageField(
  detected: RecordsMinimalTriageDetectedDetails,
  field: RecordsMinimalTriageMissingField,
): boolean {
  switch (field) {
    case 'symptom_or_diagnosis':
      return detected.hasSymptomOrDiagnosis;
    case 'duration_or_severity':
      return detected.hasTiming && detected.hasSeverity;
    case 'existing_tests_or_treatments':
      return detected.hasExistingTestsOrTreatments;
  }
}

function isClearlyUnusableMedicalReply(value: string): boolean {
  return !/[a-z]/i.test(value) || value.length < 3;
}

function hasUnclearSignal(value: string): boolean {
  return /\b(?:i am not sure|i'm not sure|not sure|unsure|don't know|dont know|no idea|unknown|maybe)\b/i.test(value);
}

function hasSymptomSignal(value: string): boolean {
  return /(?:pain|fever|cough|bleed|bleeding|rash|swelling|nausea|vomit|vomiting|diarrhea|dizzy|dizziness|shortness of breath|symptom|diagnos|problem|mass|tumou?r|tumor|infection|fracture|injury)/i.test(value);
}

function hasTimingSignal(value: string): boolean {
  return /(?:today|yesterday|day|days|week|weeks|month|months|year|years|since|ago|hour|hours|started|started\s|started-)/i.test(value);
}

function hasSeveritySignal(value: string): boolean {
  return /(?:mild|moderate|severe|worse|worst|pain\s*(?:is|feels)?\s*\d|[1-9]\/10|ten out of ten|can(?:not|'t) walk|can(?:not|'t) sleep|hard to breathe|getting worse)/i.test(value);
}

function hasTreatmentSignal(value: string): boolean {
  return hasNegativeTreatmentSignal(value)
    || /\b(?:medicine|medication|medications|drug|drugs|tablet|tablets|pill|pills|treatment|treatments|therapy|surgery|operation|operations|test|tests|scan|scans|biopsy|biopsies|injection|injections|antibiotic|antibiotics|diagnosis|diagnoses|x-ray|xray|ct|mri|ultrasound|lab|labs)\b/i.test(value)
    || /\bblood\s+(?:work|test|tests)\b/i.test(value)
    || /\blab\s+(?:work|test|tests)\b/i.test(value);
}

function hasNegativeTreatmentSignal(value: string): boolean {
  return /\b(?:none|nothing)\s+yet\b/i.test(value)
    || /\bnothing\s+yet\s+has\s+been\s+done\b/i.test(value)
    || /\bnothing\s+has\s+been\s+done\s+yet\b/i.test(value)
    || /\bnone\s+so\s+far\b/i.test(value)
    || /\bno\s+(?:tests?|treatments?|medications?|medicines?|diagnoses?|diagnosis|meds?)\s+(?:yet|so\s+far)\b/i.test(value);
}

function sanitizeQuestions(value: unknown): readonly string[] | null {
  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const questions = value
    .map((entry) => normalizeString(entry))
    .filter((entry): entry is string => entry !== null);

  return questions.length === value.length ? questions : null;
}

function sanitizeMissing(value: unknown): RecordsMinimalTriageMissingField[] | null {
  if (value === undefined) {
    return null;
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const missing = value.filter(isMissingField);
  return missing.length === value.length ? missing : null;
}

function isMissingField(value: unknown): value is RecordsMinimalTriageMissingField {
  return typeof value === 'string' && RECORDS_MINIMAL_TRIAGE_MISSING_FIELDS.includes(value as RecordsMinimalTriageMissingField);
}

function normalizeString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function sanitizeDiagnosisProofCollectionPrompt(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  if (isAllowedDiagnosisProofCollectionPrompt(value)) {
    return value;
  }

  return null;
}

function isAllowedDiagnosisProofCollectionPrompt(value: string): boolean {
  return value === RECORDS_DIAGNOSIS_PROOF_UPLOAD_GUIDANCE
    || value === 'Please upload your diagnosis proof or diagnosis certificate.';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
