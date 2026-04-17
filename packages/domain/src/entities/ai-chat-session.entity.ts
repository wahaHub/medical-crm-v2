import type { PatientSite } from '../ports/patient-repository.port.js';
import type { AiChatSessionStatus, HospitalType } from '../enums/index.js';

export interface AiChatPendingState {
  type: string;
  payload: Record<string, unknown>;
}

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
  minimalTriageComplete: boolean | null;
  processExplained: boolean;
  recommendationGenerated: boolean | null;
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
      minimalTriageComplete: props.statusSnapshot?.minimalTriageComplete ?? null,
      processExplained: props.statusSnapshot?.processExplained ?? false,
      recommendationGenerated: props.statusSnapshot?.recommendationGenerated ?? null,
      recommendationSelected: props.statusSnapshot?.recommendationSelected ?? null,
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
  const processExplained = statusSnapshot?.processExplained === true;
  const legacyRecommendationSelected = hasAnyStatus(statusSnapshot?.recommendationStatus, ['CONFIRMED', 'ACCEPTED'])
    || hasAnyStatus(statusSnapshot?.packageStatus, ['CONFIRMED', 'ACCEPTED'])
    || hasAnyStatus(statusSnapshot?.consultationStatus, ['SCHEDULED', 'BOOKED', 'COMPLETED']);
  const legacyRecommendationGenerated = legacyRecommendationSelected
    || hasWorkflowStatus(statusSnapshot?.recommendationStatus, ['NOT_STARTED'])
    || hasWorkflowStatus(statusSnapshot?.packageStatus, ['NOT_INTRODUCED', 'NOT_STARTED']);
  const legacyConsultCompleted = hasAnyStatus(statusSnapshot?.consultationStatus, ['COMPLETED']);
  const legacyHandoffActive = deriveHandoffLifecycleActive(statusSnapshot?.handoffStatus);

  const minimalTriageComplete = readPersistedBoolean(statusSnapshot?.minimalTriageComplete) ?? false;
  const recommendationSelected = readPersistedBoolean(statusSnapshot?.recommendationSelected) || legacyRecommendationSelected;
  const recommendationGenerated = readPersistedBoolean(statusSnapshot?.recommendationGenerated) || legacyRecommendationGenerated;
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
