import type { SupervisorEvent, SupervisorEventType } from './supervisor-event.types.js';

const STRUCTURED_ACTION_EVENT_TYPES = new Set<SupervisorEventType>([
  'TRIAGE_SUBMITTED',
  'TRIAGE_SKIPPED',
  'RECOMMENDATION_SELECTED',
  'RECOMMENDATION_SKIPPED',
]);

const HUMAN_REQUEST_PATTERNS = [
  /\b(?:human|person|agent|advisor|representative|specialist|staff)\b/i,
  /\b(?:talk|speak|chat|connect|transfer|handoff)\s+(?:to|with)\b/i,
  /真人|人工|客服|顾问|专员|人工服务|转人工/,
];

const NEXT_STEP_REQUEST_PATTERNS = [
  /\b(?:what|whats|what's)\s+(?:is\s+)?(?:the\s+)?next\s+step\b/i,
  /\bnext\s+steps?\b/i,
  /\bwhat\s+(?:should|do)\s+i\s+do\s+next\b/i,
  /\bhow\s+(?:do\s+we|should\s+we)\s+proceed\b/i,
  /下一步|接下来|然后呢|怎么办|怎么继续/,
];

export interface DeterministicEventExtractionInput {
  message?: string | null;
  userAction?: DeterministicUserAction | null;
  attachments?: readonly unknown[] | null;
}

export interface DeterministicUserAction {
  type?: string | null;
  selectedHospitalIds?: readonly unknown[] | null;
  payload?: {
    selectedHospitalIds?: readonly unknown[] | null;
  } | null;
}

export function extractDeterministicEvent(
  input: DeterministicEventExtractionInput,
): SupervisorEvent | null {
  const message = input.message ?? '';

  if (isExplicitHumanRequest(message)) {
    return buildEvent('USER_REQUESTED_HUMAN', { rawText: message });
  }

  const documentCount = input.attachments?.length ?? 0;
  if (documentCount > 0) {
    return buildEvent('DOCUMENTS_UPLOADED', { documentCount });
  }

  const structuredActionEvent = extractStructuredActionEvent(input.userAction, message);
  if (structuredActionEvent) {
    return structuredActionEvent;
  }

  if (isExplicitNextStepRequest(message)) {
    return buildEvent('USER_ASKED_NEXT_STEP', { rawText: message });
  }

  return null;
}

function extractStructuredActionEvent(
  userAction: DeterministicUserAction | null | undefined,
  rawText: string,
): SupervisorEvent | null {
  const actionType = userAction?.type;
  if (!isStructuredActionEventType(actionType)) {
    return null;
  }

  if (actionType === 'RECOMMENDATION_SELECTED' && userAction) {
    const selectedHospitalIds = extractSelectedHospitalIds(userAction);
    return buildEvent(actionType, {
      rawText,
      ...(selectedHospitalIds.length > 0 ? { selectedHospitalIds } : {}),
    });
  }

  return buildEvent(actionType, { rawText });
}

function isStructuredActionEventType(value: unknown): value is SupervisorEventType {
  return typeof value === 'string' && STRUCTURED_ACTION_EVENT_TYPES.has(value as SupervisorEventType);
}

function extractSelectedHospitalIds(userAction: DeterministicUserAction): string[] {
  const selectedHospitalIds = userAction.selectedHospitalIds ?? userAction.payload?.selectedHospitalIds ?? [];
  return selectedHospitalIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

function isExplicitHumanRequest(message: string): boolean {
  const normalized = message.trim();
  if (normalized.length === 0) {
    return false;
  }

  const hasHumanWord = HUMAN_REQUEST_PATTERNS.some((pattern) => pattern.test(normalized));
  const hasRequestVerb = /\b(?:want|need|let|please|can|could|would|talk|speak|chat|connect|transfer|handoff)\b/i.test(normalized)
    || /想|要|需要|请|帮我|联系|转/.test(normalized);

  return hasHumanWord && hasRequestVerb;
}

function isExplicitNextStepRequest(message: string): boolean {
  const normalized = message.trim();
  return normalized.length > 0 && NEXT_STEP_REQUEST_PATTERNS.some((pattern) => pattern.test(normalized));
}

function buildEvent(
  eventType: SupervisorEventType,
  metadata?: NonNullable<SupervisorEvent['metadata']>,
): SupervisorEvent {
  const cleanMetadata = metadata && Object.keys(metadata).length > 0 ? metadata : undefined;

  return {
    eventType,
    confidence: 1,
    source: 'deterministic',
    ...(cleanMetadata ? { metadata: cleanMetadata } : {}),
  };
}
