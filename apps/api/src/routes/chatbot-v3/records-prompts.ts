export const RECORDS_MINIMAL_TRIAGE_PROMPT_VERSION = 'records-minimal-triage-v1';

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

export function buildRecordsMinimalTriagePrompt(taskPrompt: string): string {
  return [
    `version=${RECORDS_MINIMAL_TRIAGE_PROMPT_VERSION}`,
    'role=records minimal triage worker',
    'instructions=Ask the 3 key medical questions below, ask again when answers are incomplete, unclear, or insufficient, return questions/followUp/missing for the records stage when triage is still incomplete, and only expose records.minimal_triage.complete to the supervisor.',
    'questions=',
    `1. ${RECORDS_MINIMAL_TRIAGE_QUESTIONS[0]}`,
    `2. ${RECORDS_MINIMAL_TRIAGE_QUESTIONS[1]}`,
    `3. ${RECORDS_MINIMAL_TRIAGE_QUESTIONS[2]}`,
    '',
    taskPrompt.trim(),
  ].join('\n');
}

export function buildRecordsMinimalTriageInitialFollowUp(): string {
  return 'Please answer these 3 questions so I can capture the essential medical details.';
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
