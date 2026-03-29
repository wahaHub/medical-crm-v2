import { randomUUID } from 'node:crypto';

const SESSION_PREFIX = 'it-policy-session-';
const PROFILE_PREFIX = 'it-policy-profile-';

export function buildPolicySessionRow() {
  const id = randomUUID();
  const sessionId = `${SESSION_PREFIX}${randomUUID()}`;
  const now = new Date().toISOString();

  return {
    id,
    sessionId,
    sessionSecretHash: `secret-hash-${sessionId}`,
    hospitalType: 'COSMETIC',
    status: 'ACTIVE',
    conditionStatus: 'unknown',
    formStatus: 'not_started',
    docUploadStatus: 'none',
    recommendationStatus: 'not_started',
    consultationStatus: 'not_introduced',
    packageStatus: 'not_introduced',
    handoffStatus: 'not_needed',
    leadMaturity: 'browsing',
    riskLevel: 'low',
    trustOrObjection: 'none',
    pendingOfferType: 'FORM_COMPLETION',
    pendingOfferPayload: { source: 'test' },
    pendingQuestionType: 'ASK_BUDGET',
    pendingQuestionPayload: { source: 'test' },
    lastNextAction: 'REQUEST_DOCS',
    lastResolvedIntent: 'ASK_FOR_RECOMMENDATION',
    conversationSummary: 'Interested in rhinoplasty in Korea with mid-range budget.',
    lastPolicyDecisionAt: now,
    lastUserMessageAt: now,
    lastAssistantMessageAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildPolicyProfileRow(sessionId: string) {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    patientId: null,
    anonymousKey: `${PROFILE_PREFIX}${sessionId}`,
    conditionOrGoal: 'rhinoplasty consultation',
    conditionCategory: 'PROCEDURE',
    preferredDestination: ['KR'],
    preferredLanguage: 'en',
    budgetBand: 'mid',
    urgencyLevel: 'medium',
    existingReportsStatus: 'none',
    objectionTags: ['trust'],
    leadStage: 'considering',
    nextBestAction: 'REQUEST_DOC_UPLOAD',
    memorySummary: 'Interested in rhinoplasty in Korea with mid-range budget.',
    sourceConfidenceMap: { budgetBand: 0.9 },
    createdAt: now,
    updatedAt: now,
  };
}

export function buildTimelineEventRow(sessionDbId: string) {
  return {
    id: randomUUID(),
    sessionId: sessionDbId,
    patientId: null,
    eventType: 'DOC_UPLOAD_REQUESTED',
    summary: 'Asked the user to upload supporting documents.',
    payload: { source: 'test' },
    actor: 'AI',
    confidence: '0.9500',
    createdAt: new Date().toISOString(),
  };
}

export function buildFollowupTriggerRow(sessionDbId: string) {
  return {
    id: randomUUID(),
    sessionId: sessionDbId,
    patientId: null,
    triggerType: 'DOC_UPLOAD_PENDING',
    status: 'pending',
    dueAt: new Date(Date.now() + 3600_000).toISOString(),
    channel: 'crm_queue',
    reason: 'Waiting for medical report upload.',
    payload: { source: 'test' },
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
}

export function buildHandoffRow(sessionDbId: string) {
  return {
    id: randomUUID(),
    sessionId: sessionDbId,
    patientId: null,
    supportTicketId: null,
    handoffType: 'HIGH_VALUE_LEAD',
    priority: 'MEDIUM',
    reasonCode: 'needs_human_followup',
    brief: { source: 'test' },
    status: 'requested',
    assignedTo: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
}

export function buildPolicyMessageRow(sessionDbId: string) {
  return {
    id: randomUUID(),
    sessionId: sessionDbId,
    role: 'ASSISTANT',
    content: 'Please upload your medical report so we can continue.',
    intent: 'ASK_FOR_RECOMMENDATION',
    resolvedIntent: 'ASK_FOR_RECOMMENDATION',
    riskLevel: 'LOW',
    canAnswer: true,
    nextAction: 'REQUEST_DOC_UPLOAD',
    secondaryAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
    responseMode: 'grounded_plus_guidance',
    citations: [{ sourceTitle: 'FAQ', snippet: 'Example snippet' }],
    metadata: { source: 'test' },
    reasonCodes: ['missing_documents'],
    shortlist: [],
    writebackStatus: 'pending',
    toolTrace: [],
    createdAt: new Date().toISOString(),
  };
}

export const policyTestPrefixes = {
  session: SESSION_PREFIX,
  profile: PROFILE_PREFIX,
};
