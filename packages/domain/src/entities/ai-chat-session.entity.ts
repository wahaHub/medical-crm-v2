import type { PatientSite } from '../ports/patient-repository.port.js';
import type { AiChatSessionStatus, HospitalType } from '../enums/index.js';

export interface AiChatPendingState {
  type: string;
  payload: Record<string, unknown>;
}

export type AiChatMinimalTriageStatus = 'pending' | 'skipped';
export type AiChatRecommendationSelectionStatus = 'pending' | 'selected' | 'skipped';

export interface AiChatStatusSnapshot {
  conditionStatus: string;
  formStatus: string;
  docUploadStatus: string;
  recommendationStatus: string;
  consultationStatus: string;
  packageStatus: string;
  handoffStatus: string;
  riskLevel: string;
  trustOrObjection: string;
  engagementMode: string;
  enteredDeepWorkflowAt: Date | null;
  minimalTriageStatus: AiChatMinimalTriageStatus;
  minimalTriageAnswersSummary: string | null;
  minimalTriageComplete: boolean | null;
  processExplained: boolean;
  recommendationGenerated: boolean | null;
  recommendationSelectionStatus: AiChatRecommendationSelectionStatus | null;
  recommendationSelectedHospitalIds: string[] | null;
  recommendationSelected: boolean | null;
  consultCompleted: boolean | null;
  handoffActive: boolean | null;
  conversationSummary: string;
  lastPolicyDecisionAt: Date | null;
  lastUserMessageAt: Date | null;
  lastAssistantMessageAt: Date | null;
}

export const AI_CHAT_STATUS_SNAPSHOT_CANONICAL_TRUTH_MAP = {
  'records.minimal_triage.complete': 'minimalTriageComplete',
  'process.explained': 'processExplained',
  'recommendation.generated': 'recommendationGenerated',
  'recommendation.selected': 'recommendationSelected',
  'consult.completed': 'consultCompleted',
  'handoff.active': 'handoffActive',
} as const;

export interface AiChatCanonicalTruthFlags {
  'records.minimal_triage.complete': boolean;
  'process.explained': boolean;
  'recommendation.generated': boolean;
  'recommendation.selected': boolean;
  'consult.completed': boolean;
  'handoff.active': boolean;
}

export type AiChatCanonicalTruthPatch = Partial<Pick<
  AiChatStatusSnapshot,
  | 'minimalTriageComplete'
  | 'processExplained'
  | 'recommendationGenerated'
  | 'recommendationSelected'
  | 'consultCompleted'
  | 'handoffActive'
>>;

export interface AiChatSessionProps {
  id: string;
  sessionId: string;
  site?: PatientSite;
  sessionSecretHash: string | null;
  difyConversationId: string | null;
  patientId: string | null;
  hospitalType: HospitalType;
  status: AiChatSessionStatus;
  statusSnapshot?: Partial<AiChatStatusSnapshot>;
  createdAt: Date;
  updatedAt: Date;
}

export class AiChatSession {
  readonly id: string;
  sessionId: string;
  site: PatientSite;
  sessionSecretHash: string | null;
  difyConversationId: string | null;
  patientId: string | null;
  hospitalType: HospitalType;
  status: AiChatSessionStatus;
  statusSnapshot: AiChatStatusSnapshot;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: AiChatSessionProps) {
    const normalizedMinimalTriage = normalizeMinimalTriageSnapshot(props.statusSnapshot);
    const normalizedRecommendationSelection = normalizeRecommendationSelectionSnapshot(
      props.statusSnapshot,
    );

    this.id = props.id;
    this.sessionId = props.sessionId;
    this.site = props.site ?? 'china';
    this.sessionSecretHash = props.sessionSecretHash;
    this.difyConversationId = props.difyConversationId;
    this.patientId = props.patientId;
    this.hospitalType = props.hospitalType;
    this.status = props.status;
    this.statusSnapshot = {
      conditionStatus: props.statusSnapshot?.conditionStatus ?? 'unknown',
      formStatus: props.statusSnapshot?.formStatus ?? 'not_started',
      docUploadStatus: props.statusSnapshot?.docUploadStatus ?? 'none',
      recommendationStatus: props.statusSnapshot?.recommendationStatus ?? 'not_started',
      consultationStatus: props.statusSnapshot?.consultationStatus ?? 'not_introduced',
      packageStatus: props.statusSnapshot?.packageStatus ?? 'not_introduced',
      handoffStatus: props.statusSnapshot?.handoffStatus ?? 'not_needed',
      riskLevel: props.statusSnapshot?.riskLevel ?? 'low',
      trustOrObjection: props.statusSnapshot?.trustOrObjection ?? 'none',
      engagementMode: props.statusSnapshot?.engagementMode ?? 'LIGHT_DISCOVERY',
      enteredDeepWorkflowAt: props.statusSnapshot?.enteredDeepWorkflowAt ?? null,
      minimalTriageStatus: normalizedMinimalTriage.status,
      minimalTriageAnswersSummary: normalizedMinimalTriage.answersSummary,
      minimalTriageComplete: normalizedMinimalTriage.complete,
      processExplained: props.statusSnapshot?.processExplained ?? false,
      recommendationGenerated: normalizedRecommendationSelection.generated,
      recommendationSelectionStatus: normalizedRecommendationSelection.status,
      recommendationSelectedHospitalIds: normalizedRecommendationSelection.selectedHospitalIds,
      recommendationSelected: normalizedRecommendationSelection.selected,
      consultCompleted: props.statusSnapshot?.consultCompleted ?? null,
      handoffActive: props.statusSnapshot?.handoffActive ?? null,
      conversationSummary: props.statusSnapshot?.conversationSummary ?? '',
      lastPolicyDecisionAt: props.statusSnapshot?.lastPolicyDecisionAt ?? null,
      lastUserMessageAt: props.statusSnapshot?.lastUserMessageAt ?? null,
      lastAssistantMessageAt: props.statusSnapshot?.lastAssistantMessageAt ?? null,
    };
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}

export function deriveCanonicalTruthFlagsFromStatusSnapshot(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): AiChatCanonicalTruthFlags {
  const normalizedMinimalTriage = normalizeMinimalTriageSnapshot(statusSnapshot);
  const processExplained = statusSnapshot?.processExplained === true;
  const legacyRecommendationSelected = hasAnyStatus(statusSnapshot?.recommendationStatus, ['CONFIRMED', 'ACCEPTED'])
    || hasAnyStatus(statusSnapshot?.packageStatus, ['CONFIRMED', 'ACCEPTED'])
    || hasAnyStatus(statusSnapshot?.consultationStatus, ['SCHEDULED', 'BOOKED', 'COMPLETED']);
  const legacyRecommendationGenerated = legacyRecommendationSelected
    || hasWorkflowStatus(statusSnapshot?.recommendationStatus, ['NOT_STARTED'])
    || hasWorkflowStatus(statusSnapshot?.packageStatus, ['NOT_INTRODUCED', 'NOT_STARTED']);
  const legacyConsultCompleted = hasAnyStatus(statusSnapshot?.consultationStatus, ['COMPLETED']);
  const legacyHandoffActive = deriveHandoffLifecycleActive(statusSnapshot?.handoffStatus);

  const minimalTriageComplete = normalizedMinimalTriage.complete === true;
  const normalizedRecommendationSelection = normalizeRecommendationSelectionSnapshot(statusSnapshot);
  const hasStructuredRecommendationSelection = normalizedRecommendationSelection.status !== null;
  const recommendationSelected = hasStructuredRecommendationSelection
    ? normalizedRecommendationSelection.selected === true
    : normalizedRecommendationSelection.selected === true || legacyRecommendationSelected;
  const recommendationGenerated = hasStructuredRecommendationSelection
    ? normalizedRecommendationSelection.generated === true
    : normalizedRecommendationSelection.generated === true || legacyRecommendationGenerated;
  const consultCompleted = readPersistedBoolean(statusSnapshot?.consultCompleted) || legacyConsultCompleted;
  const persistedHandoffActive = readPersistedBoolean(statusSnapshot?.handoffActive);
  const handoffActive = legacyHandoffActive ?? persistedHandoffActive ?? false;

  return {
    'records.minimal_triage.complete': minimalTriageComplete,
    'process.explained': processExplained,
    'recommendation.generated': recommendationGenerated,
    'recommendation.selected': recommendationSelected,
    'consult.completed': consultCompleted,
    'handoff.active': handoffActive,
  };
}

export function deriveCanonicalTruthTruePatchFromStatusSnapshot(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): AiChatCanonicalTruthPatch {
  const canonicalTruthFlags = deriveCanonicalTruthFlagsFromStatusSnapshot(statusSnapshot);
  const patch: AiChatCanonicalTruthPatch = {};

  for (const [canonicalKey, fieldName] of Object.entries(AI_CHAT_STATUS_SNAPSHOT_CANONICAL_TRUTH_MAP)) {
    const currentValue = statusSnapshot?.[fieldName];
    if (currentValue !== true && canonicalTruthFlags[canonicalKey as keyof AiChatCanonicalTruthFlags]) {
      patch[fieldName] = true;
    }
  }

  return patch;
}

function readPersistedBoolean(value: boolean | null | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

interface MinimalTriageNormalization {
  status: AiChatMinimalTriageStatus;
  answersSummary: string | null;
  complete: boolean | null;
}

interface RecommendationSelectionNormalization {
  status: AiChatRecommendationSelectionStatus | null;
  selectedHospitalIds: string[] | null;
  generated: boolean | null;
  selected: boolean | null;
}

function normalizeMinimalTriageSnapshot(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): MinimalTriageNormalization {
  const rawStatus = readMinimalTriageStatus(statusSnapshot);
  const persistedComplete = readPersistedBoolean(statusSnapshot?.minimalTriageComplete);
  const explicitSummary = normalizeCompactSummary(statusSnapshot?.minimalTriageAnswersSummary);
  const legacySummary = rawStatus === 'answered'
    ? deriveLegacySummaryFromConversation(statusSnapshot?.conversationSummary)
    : null;
  const answersSummary = explicitSummary ?? legacySummary;

  if (answersSummary !== null) {
    return {
      status: rawStatus === 'skipped' ? 'skipped' : 'pending',
      answersSummary,
      complete: true,
    };
  }

  if (rawStatus === 'skipped') {
    return {
      status: 'skipped',
      answersSummary: null,
      complete: true,
    };
  }

  if (rawStatus === 'answered') {
    return {
      status: 'pending',
      answersSummary: null,
      complete: false,
    };
  }

  if (rawStatus === null) {
    return {
      status: 'pending',
      answersSummary: null,
      complete: persistedComplete ?? null,
    };
  }

  return {
    status: rawStatus,
    answersSummary: null,
    complete: persistedComplete ?? null,
  };
}

function normalizeRecommendationSelectionSnapshot(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): RecommendationSelectionNormalization {
  const rawStatus = readRecommendationSelectionStatus(statusSnapshot);
  const selectedHospitalIds = normalizeSelectedHospitalIds(
    (statusSnapshot as { recommendationSelectedHospitalIds?: unknown } | null | undefined)
      ?.recommendationSelectedHospitalIds,
  );
  const persistedGenerated = readPersistedBoolean(statusSnapshot?.recommendationGenerated);
  const persistedSelected = readPersistedBoolean(statusSnapshot?.recommendationSelected);
  const recommendationStatus = normalizeStatus(statusSnapshot?.recommendationStatus);
  const packageStatus = normalizeStatus(statusSnapshot?.packageStatus);
  const legacyFailed = recommendationStatus === 'FAILED' || packageStatus === 'FAILED';

  if (rawStatus === 'selected') {
    return {
      status: 'selected',
      selectedHospitalIds,
      generated: true,
      selected: true,
    };
  }

  if (rawStatus === 'skipped') {
    return {
      status: 'skipped',
      selectedHospitalIds: [],
      generated: true,
      selected: false,
    };
  }

  if (rawStatus === 'pending') {
    return {
      status: 'pending',
      selectedHospitalIds: [],
      generated: true,
      selected: false,
    };
  }

  if (persistedSelected === true) {
    return {
      status: 'selected',
      selectedHospitalIds,
      generated: true,
      selected: true,
    };
  }

  if (legacyFailed) {
    return {
      status: null,
      selectedHospitalIds: selectedHospitalIds.length > 0 ? selectedHospitalIds : null,
      generated: persistedGenerated ?? true,
      selected: persistedSelected ?? false,
    };
  }

  if (persistedGenerated === true) {
    return {
      status: 'pending',
      selectedHospitalIds: [],
      generated: true,
      selected: false,
    };
  }

  return {
    status: null,
    selectedHospitalIds: selectedHospitalIds.length > 0 ? selectedHospitalIds : null,
    generated: persistedGenerated ?? null,
    selected: persistedSelected ?? null,
  };
}

function readMinimalTriageStatus(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): AiChatMinimalTriageStatus | 'answered' | null {
  const rawValue = (statusSnapshot as { minimalTriageStatus?: string | null } | null | undefined)
    ?.minimalTriageStatus;
  const normalized = (rawValue ?? '').trim().toLowerCase();

  if (normalized === 'pending' || normalized === 'skipped' || normalized === 'answered') {
    return normalized;
  }

  return null;
}

function readRecommendationSelectionStatus(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): AiChatRecommendationSelectionStatus | null {
  const rawValue = (statusSnapshot as { recommendationSelectionStatus?: string | null } | null | undefined)
    ?.recommendationSelectionStatus;
  const normalized = (rawValue ?? '').trim().toLowerCase();

  if (normalized === 'pending' || normalized === 'selected' || normalized === 'skipped') {
    return normalized;
  }

  return null;
}

function normalizeSelectedHospitalIds(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .filter((candidate): candidate is string => typeof candidate === 'string')
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.length > 0);

  return normalized.length > 0 ? [normalized[0]!] : [];
}

function normalizeCompactSummary(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function deriveLegacySummaryFromConversation(value: string | null | undefined): string | null {
  const normalizedConversation = value?.trim();
  if (!normalizedConversation) {
    return null;
  }

  const labelMatch = /minimal triage summary:\s*(.+)$/i.exec(normalizedConversation);
  if (!labelMatch) {
    return null;
  }

  const labeledSection = labelMatch[1]?.trim();
  if (!labeledSection) {
    return null;
  }

  const sentenceMatch = /^(.+?\.)\s+[A-Z]/.exec(labeledSection);
  const normalizedSummary = (sentenceMatch?.[1] ?? labeledSection).trim();
  return normalizedSummary.length > 0 ? normalizedSummary : null;
}

function deriveHandoffLifecycleActive(value: string | null | undefined): boolean | undefined {
  const normalized = normalizeStatus(value);
  if (normalized.length === 0) {
    return undefined;
  }

  return ['REQUESTED', 'OPEN', 'IN_PROGRESS'].includes(normalized);
}

function hasAnyStatus(value: string | null | undefined, expectedStates: string[]): boolean {
  return expectedStates.includes(normalizeStatus(value));
}

function hasWorkflowStatus(value: string | null | undefined, emptyStates: string[]): boolean {
  const normalized = normalizeStatus(value);
  return normalized.length > 0 && !emptyStates.includes(normalized);
}

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}
