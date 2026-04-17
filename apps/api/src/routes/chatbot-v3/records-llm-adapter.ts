import type { LlmNodeAdapter } from '@medical-crm/application';
import {
  buildRecordsMinimalTriageClarifyingFollowUp,
  buildRecordsMinimalTriageInitialFollowUp,
  buildRecordsMinimalTriageMissingFollowUp,
  RECORDS_MINIMAL_TRIAGE_MISSING_FIELDS,
  RECORDS_MINIMAL_TRIAGE_PROMPT_VERSION,
  RECORDS_MINIMAL_TRIAGE_QUESTIONS,
  type RecordsMinimalTriageDetectedDetails,
  type RecordsMinimalTriageMissingField,
} from './records-prompts.js';

export interface RecordsLlmRunMetadata {
  nodePromptVersion?: string;
  nodeModel?: string;
  fallbackUsed?: boolean;
  schemaValidationFailed?: boolean;
}

export interface RecordsStatusWorkerInput {
  taskPrompt: string;
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
}

type RecordsWorkerMode = 'minimal_triage' | 'medical_collection';

export class RecordsLlmAdapter {
  readonly promptVersion: string;
  private lastRunMetadata: RecordsLlmRunMetadata | null = null;

  constructor(private readonly options: RecordsLlmAdapterOptions = {}) {
    this.promptVersion = options.worker?.promptVersion ?? RECORDS_MINIMAL_TRIAGE_PROMPT_VERSION;
  }

  async runStatus(input: RecordsStatusWorkerInput): Promise<RecordsWorkerResult> {
    const fallback = buildFallbackRecordsWorkerResult(input.taskPrompt);
    const mode = resolveRecordsWorkerMode(input.taskPrompt);
    const metadataBase = {
      nodePromptVersion: this.promptVersion,
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
    } catch {
      this.lastRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
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

  const questions = sanitizeQuestions(record.questions);
  const followUp = normalizeString(record.followUp);
  const missing = sanitizeMissing(record.missing);
  const collectionPrompt = normalizeString(record.collectionPrompt);
  const hasInvalidQuestions = record.questions !== undefined && questions === null;
  const hasInvalidMissing = record.missing !== undefined && missing === null;
  const hasInvalidFollowUp = record.followUp !== undefined && followUp === null;
  const hasInvalidCollectionPrompt = record.collectionPrompt !== undefined && collectionPrompt === null;
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
      'records.minimal_triage.complete': complete,
      ...(questions ? { questions } : {}),
      ...(followUp ? { followUp } : {}),
      ...(missing ? { missing } : {}),
      ...(collectionPrompt ? { collectionPrompt } : {}),
    },
    fallbackUsed: false,
    schemaValidationFailed: false,
  };
}

function buildFallbackRecordsWorkerResult(taskPrompt: string): RecordsWorkerResult {
  const mode = resolveRecordsWorkerMode(taskPrompt);
  if (mode === 'medical_collection') {
    return buildFallbackRecordsCollectionResult(taskPrompt);
  }

  return buildFallbackRecordsMinimalTriageResult(taskPrompt);
}

function buildFallbackRecordsCollectionResult(taskPrompt: string): RecordsWorkerResult {
  return {
    'records.minimal_triage.complete': extractMinimalTriageTruthFromFacts(taskPrompt),
    collectionPrompt: 'Please upload or share any pathology reports, imaging, blood tests, discharge summaries, medication lists, or treatment history you already have.',
  };
}

function buildFallbackRecordsMinimalTriageResult(taskPrompt: string): RecordsWorkerResult {
  const latestUserMessage = extractLatestUserMessage(taskPrompt);
  const analysis = analyzeRecordsMinimalTriage(latestUserMessage);

  if (analysis.complete) {
    return {
      'records.minimal_triage.complete': true,
    };
  }

  if (analysis.reason === 'insufficient') {
    return {
      'records.minimal_triage.complete': false,
      questions: RECORDS_MINIMAL_TRIAGE_QUESTIONS,
      followUp: buildRecordsMinimalTriageClarifyingFollowUp(analysis.missing, analysis.detected),
      missing: analysis.missing,
    };
  }

  return {
    'records.minimal_triage.complete': false,
    questions: RECORDS_MINIMAL_TRIAGE_QUESTIONS,
    followUp: analysis.reason === 'initial' && analysis.missing.length === RECORDS_MINIMAL_TRIAGE_MISSING_FIELDS.length
      ? buildRecordsMinimalTriageInitialFollowUp()
      : buildRecordsMinimalTriageMissingFollowUp(analysis.missing),
    missing: analysis.missing,
  };
}

function resolveRecordsWorkerMode(taskPrompt: string): RecordsWorkerMode {
  const toStage = extractTaskPromptValue(taskPrompt, 'to');
  const fromStage = extractTaskPromptValue(taskPrompt, 'from');
  const stage = toStage ?? fromStage ?? '';

  return stage === 'COLLECT_MEDICAL_INPUTS' ? 'medical_collection' : 'minimal_triage';
}

function extractMinimalTriageTruthFromFacts(taskPrompt: string): boolean {
  const facts = extractTaskPromptValue(taskPrompt, 'facts') ?? '';
  return /\brecords\.minimal_triage\.complete:true\b/.test(facts);
}

function extractTaskPromptValue(taskPrompt: string, key: string): string | null {
  const marker = `${key}=`;
  const linePrefixedMarker = `\n${marker}`;
  const prefixedIndex = taskPrompt.indexOf(linePrefixedMarker);

  if (prefixedIndex >= 0) {
    const start = prefixedIndex + linePrefixedMarker.length;
    const end = taskPrompt.indexOf('\n', start);
    return taskPrompt.slice(start, end >= 0 ? end : undefined).trim();
  }

  if (taskPrompt.startsWith(marker)) {
    const end = taskPrompt.indexOf('\n', marker.length);
    return taskPrompt.slice(marker.length, end >= 0 ? end : undefined).trim();
  }

  return null;
}

function extractLatestUserMessage(taskPrompt: string): string {
  const marker = 'latest_user_message=';
  const linePrefixedMarker = `\n${marker}`;
  const prefixedIndex = taskPrompt.indexOf(linePrefixedMarker);

  if (prefixedIndex >= 0) {
    return taskPrompt.slice(prefixedIndex + linePrefixedMarker.length).trim();
  }

  if (taskPrompt.startsWith(marker)) {
    return taskPrompt.slice(marker.length).trim();
  }

  return '';
}

function analyzeRecordsMinimalTriage(latestUserMessage: string): {
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

  if (hasUnclearSignal(normalized)) {
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
