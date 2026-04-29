import type { RecordsWorkerTask } from './worker-task.js';

export const RECORDS_MINIMAL_TRIAGE_PROMPT_VERSION = 'records-minimal-triage-v1';
export const RECORDS_COLLECTION_PROMPT_VERSION = 'records-diagnosis-proof-v1';
export const RECORDS_DIAGNOSIS_PROOF_UPLOAD_GUIDANCE = 'Please upload your diagnosis proof, diagnosis certificate, or another supporting diagnosis document so our medical team can prepare the next step.';

export const RECORDS_MINIMAL_TRIAGE_QUESTIONS = [
  'What is the main symptom, diagnosis, or medical problem right now?',
  'When did it start, how long has it been going on, and how severe is it?',
  'What tests, treatments, medicines, or diagnoses already exist?',
] as const;

export const RECORDS_MINIMAL_TRIAGE_MISSING_FIELDS = [
  'symptom_or_diagnosis',
  'duration_or_severity',
  'existing_tests_or_treatments',
] as const;

export type RecordsMinimalTriageMissingField =
  typeof RECORDS_MINIMAL_TRIAGE_MISSING_FIELDS[number];

export interface RecordsMinimalTriageDetectedDetails {
  hasSymptomOrDiagnosis: boolean;
  hasTiming: boolean;
  hasSeverity: boolean;
  hasExistingTestsOrTreatments: boolean;
}

const RECORDS_MINIMAL_TRIAGE_FOLLOW_UP_LABELS: Record<
  RecordsMinimalTriageMissingField,
  string
> = {
  symptom_or_diagnosis: 'the main symptom, diagnosis, or medical problem right now',
  duration_or_severity: 'when it started, how long it has been going on, and how severe it is',
  existing_tests_or_treatments: 'what tests, treatments, medicines, or diagnoses already exist',
};

export function buildRecordsWorkerPrompt(task: RecordsWorkerTask): string {
  if (task.mode === 'medical_collection') {
    return buildRecordsCollectionPrompt(task);
  }

  return buildRecordsMinimalTriagePrompt(task);
}

export function buildRecordsMinimalTriagePrompt(task: RecordsWorkerTask): string {
  return [
    `version=${RECORDS_MINIMAL_TRIAGE_PROMPT_VERSION}`,
    'role=records minimal triage worker',
    'instructions=Return only the exact structured JSON fields required below. Do not add any extra keys, explanations, nested objects, or alternative field names.',
    'We already have the submitted intake, so this step is only the 3-question follow-up needed to refine recommendation.',
    `current_stage=${renderCurrentStage(task)}`,
    `primary_stage=${renderPrimaryStage(task)}`,
    `minimal_triage_complete=${String(task.minimalTriageComplete)}`,
    ...buildTaskContextLines(task),
    `latest_user_message=${task.latestUserMessage}`,
    'output_contract=',
    'When triage is complete, return exactly:',
    '{"records.minimal_triage.complete":true}',
    'When triage is incomplete, return exactly these keys:',
    '- "records.minimal_triage.complete": false',
    '- "questions": array of exactly the 3 canonical question strings below, in the same order',
    '- "followUp": one string',
    '- "missing": array using only these exact enum values: symptom_or_diagnosis, duration_or_severity, existing_tests_or_treatments',
    'Never return:',
    '- "minimal_triage_complete"',
    '- boolean followUp values',
    '- object items inside questions',
    '- free-text missing labels',
    '- any extra keys',
    'Use the canonical question strings exactly as written below. Do not translate or paraphrase them.',
    'questions=',
    `1. ${RECORDS_MINIMAL_TRIAGE_QUESTIONS[0]}`,
    `2. ${RECORDS_MINIMAL_TRIAGE_QUESTIONS[1]}`,
    `3. ${RECORDS_MINIMAL_TRIAGE_QUESTIONS[2]}`,
  ].join('\n');
}

export function buildRecordsCollectionPrompt(task: RecordsWorkerTask): string {
  return [
    `version=${RECORDS_COLLECTION_PROMPT_VERSION}`,
    'role=diagnosis proof upload worker',
    'instructions=Return only the exact structured JSON fields required below. Do not add any extra keys or explanations.',
    'Ask only for diagnosis proof, a diagnosis certificate, or another supporting diagnosis document for this stage. Do not reopen generic symptom, medication, pathology, scan, or treatment-history interviews. Preserve records.minimal_triage.complete.',
    `current_stage=${renderCurrentStage(task)}`,
    `primary_stage=${renderPrimaryStage(task)}`,
    `minimal_triage_complete=${String(task.minimalTriageComplete)}`,
    ...buildTaskContextLines(task),
    `latest_user_message=${task.latestUserMessage}`,
    'output_contract=',
    'Return exactly these keys:',
    '- "records.minimal_triage.complete": boolean',
    '- "collectionPrompt": one string asking only for diagnosis proof / diagnosis certificate / supporting diagnosis document',
    'Never return any extra keys.',
  ].join('\n');
}

function buildTaskContextLines(task: RecordsWorkerTask): string[] {
  return [
    `primary_action=${stringifyTaskField(task.primaryAction)}`,
    `follow_up_action=${stringifyTaskField(task.followUpAction)}`,
    `loaded_skill_sections=${formatLoadedSkillSections(task.loadedSkillSections)}`,
    `read_intents=${formatReadIntents(task.readIntents)}`,
    `response_contract=${stringifyTaskField(task.responseContract)}`,
    `conversation_summary=${task.conversationSummary?.trim() || 'none'}`,
    `recent_messages=${JSON.stringify(task.recentMessages ?? [])}`,
  ];
}

function stringifyTaskField(value: unknown): string {
  return value === undefined ? 'none' : JSON.stringify(value);
}

function renderCurrentStage(task: RecordsWorkerTask): string {
  return task.currentStage ?? (task as { fromStage?: string }).fromStage ?? 'unknown';
}

function renderPrimaryStage(task: RecordsWorkerTask): string {
  return task.primaryStage ?? (task as { toStage?: string }).toStage ?? 'unknown';
}

function formatLoadedSkillSections(
  sections: RecordsWorkerTask['loadedSkillSections'],
): string {
  if (!sections || sections.length === 0) {
    return 'none';
  }

  return JSON.stringify(sections.map((section) => ({
    skillId: section.skillId,
    role: section.role,
    reasonCode: section.reasonCode,
    sectionIds: section.sectionIds,
    policyText: section.policyText,
    retrievalGuidance: section.retrievalGuidance,
    handlingGuidance: section.handlingGuidance,
    ...(section.readIntentTypes.length > 0 ? { readIntentTypes: section.readIntentTypes } : {}),
  })));
}

function formatReadIntents(readIntents: RecordsWorkerTask['readIntents']): string {
  if (!readIntents || readIntents.length === 0) {
    return 'none';
  }

  return readIntents.map((intent) => {
    if (typeof intent === 'string') {
      return intent;
    }

    const stableIntent = {
      type: intent.type,
      ...('category' in intent ? { category: intent.category } : {}),
      reasonCode: intent.reasonCode,
    };
    return JSON.stringify(stableIntent);
  }).join(', ');
}

export function buildRecordsMinimalTriageInitialFollowUp(): string {
  return 'We already received your basic intake. Please answer these 3 follow-up questions so we can refine your recommendation, or you can skip them if you prefer.';
}

export function buildRecordsMinimalTriageInsufficientFollowUp(): string {
  return 'Please share clearer medical details, including the main problem, how long it has been happening, how severe it is, and any tests, treatments, medicines, or diagnoses so far.';
}

export function buildRecordsMinimalTriageMissingFollowUp(
  missing: readonly RecordsMinimalTriageMissingField[],
): string {
  if (missing.length === 0) {
    return buildRecordsMinimalTriageInitialFollowUp();
  }

  const labels = missing.map((field) => RECORDS_MINIMAL_TRIAGE_FOLLOW_UP_LABELS[field]);
  return `Please tell me ${joinWithCommasAnd(labels)}.`;
}

export function buildRecordsMinimalTriageClarifyingFollowUp(
  missing: readonly RecordsMinimalTriageMissingField[],
  detected: RecordsMinimalTriageDetectedDetails,
): string {
  if (missing.length === RECORDS_MINIMAL_TRIAGE_MISSING_FIELDS.length) {
    return buildRecordsMinimalTriageInsufficientFollowUp();
  }

  const labels = missing.map((field) => {
    if (field === 'duration_or_severity') {
      return buildDurationOrSeverityClarifyingLabel(detected);
    }

    if (field === 'existing_tests_or_treatments') {
      return 'any tests, treatments, medicines, or diagnoses so far';
    }

    return 'the main symptom, diagnosis, or medical problem right now';
  });

  return `Please share clearer medical details, including ${joinWithCommasAnd(labels)}.`;
}

function joinWithCommasAnd(values: readonly string[]): string {
  if (values.length === 1) {
    return values[0]!;
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(', ')}, and ${values.at(-1)}`;
}

function buildDurationOrSeverityClarifyingLabel(
  detected: RecordsMinimalTriageDetectedDetails,
): string {
  if (detected.hasTiming && !detected.hasSeverity) {
    return 'how severe it is';
  }

  if (!detected.hasTiming && detected.hasSeverity) {
    return 'when it started and how long it has been going on';
  }

  return 'when it started, how long it has been going on, and how severe it is';
}
