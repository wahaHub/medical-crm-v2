import type { ChatJourneyPhase, ChatJourneyStage } from '@medical-crm/domain';
import type {
  ChatbotV3BootstrapOverride,
  ChatbotV3DispatchAgent,
  ChatbotV3Facts,
  ChatbotV3StageRef,
  ChatbotV3StatusSnapshot,
  OrchestratorV3BootstrapSignals,
  OrchestratorV3DecisionInput,
  OrchestratorV3Intent,
  SupervisorDecisionLineage,
  SupervisorGatewayInput,
  SupervisorReadDomain,
  SupervisorReadHints,
  SupervisorProposal,
  SupervisorSuggestionSeed,
  SupervisorTask,
} from './types.js';
import type { LlmNodeAdapter } from './llm-adapter.types.js';
import type { SupervisorEvent } from './supervisor-event.types.js';
import {
  CHATBOT_V3_JOURNEY_STAGES,
  resolveChatbotV3ProposalDispatchAgent,
  SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT,
} from './types.js';
import {
  SUPERVISOR_EVENT_TYPES,
} from './supervisor-event.types.js';
import {
  extractDeterministicEvent,
} from './deterministic-event-extractor.js';

export type SupervisorSuggestionGateway = LlmNodeAdapter<SupervisorGatewayInput, unknown>;

export type SupervisorSuggestion = SupervisorProposal;
export interface SupervisorLlmRunMetadata {
  nodePromptVersion?: string;
  nodeModel?: string;
  fallbackUsed?: boolean;
  schemaValidationFailed?: boolean;
}

const ORCHESTRATOR_INTENTS = [
  'faq',
  'progression',
  'resource',
  'consult',
  'handoff',
  'unknown',
] as const satisfies readonly OrchestratorV3Intent[];
const MAX_SUPERVISOR_READ_DOMAINS = 2;
const SEMANTIC_FORBIDDEN_EVENT_TYPES = new Set<SupervisorEvent['eventType']>([
  'TRIAGE_SUBMITTED',
  'TRIAGE_SKIPPED',
  'RECOMMENDATION_SELECTED',
  'RECOMMENDATION_SKIPPED',
  'DOCUMENTS_UPLOADED',
  'USER_REQUESTED_HUMAN',
]);

const DIRECT_HUMAN_REQUEST_PATTERNS = [
  /\bneed (?:a |to talk to a |to speak to a )?(?:human|person|advisor|agent|operator|representative)\b/i,
  /\b(?:want|wanna|would like) (?:a |to talk to a |to speak to a )?(?:human|person|advisor|agent|operator|representative)\b/i,
  /\b(?:talk|speak|chat|connect|transfer|handoff|escalat(?:e|ion)?)\b[\s\w]*\b(?:human|person|advisor|agent|operator|representative)\b/i,
  /\b(?:live|real) (?:agent|person|human)\b/i,
] as const;

const FAQ_QUESTION_PATTERNS = [
  /(?:^|\b)(?:what|when|where|which|who|why|how|can|could|do|does|did|is|are|am|was|were|should|would|will|may|might)\b/i,
  /\?/,
  /\b(?:can you|could you|would you|do you|does it|do we|is it|is that|are you|am i|should i|would it|what are|what is|how long|how much|how often|why is|where is|when is)\b/i,
] as const;

const RISKY_MEDICAL_ADVICE_PATTERNS = [
  /\bshould (?:i|we|he|she|they|my|our|the patient)\b.*\b(?:start|stop|take|use|change|increase|decrease|skip|avoid)\b.*\b(?:chemo(?:therapy)?|radiation|surgery|medicine|medication|drug|dose|dosage|treatment|therapy)\b/i,
  /\bshould (?:i|we|he|she|they|my|our|the patient)\b.*\b(?:get|receive|undergo|have)\b.*\b(?:chemo(?:therapy)?|radiation|surgery|medicine|medication|drug|dose|dosage|treatment|therapy)\b/i,
  /\b(?:start|stop|take|use|change|increase|decrease|skip|avoid)\b.*\b(?:chemo(?:therapy)?|radiation|surgery|medicine|medication|drug|dose|dosage|treatment|therapy)\b/i,
  /\b(?:get|receive|undergo|have)\b.*\b(?:chemo(?:therapy)?|radiation|surgery|treatment|therapy)\b.*\b(?:now|today|right away|immediately)\b/i,
  /\b(?:diagnose|diagnosis|treat|treatment|prescribe|dosage|dose)\b.*\b(?:now|today|right away|immediately)\b/i,
] as const;

const RESTRICTED_MEDICAL_PROMISE_PATTERNS = [
  /\b(?:guarantee|promise|ensure)\b.*\b(?:cure|cured|heal|healed|recover|recovered|survive|success)\b/i,
] as const;

const WORKFLOW_QUESTION_PATTERNS = [
  /\bwhat (?:should|do) i do (?:next|now|from here)\b/i,
  /\bwhat(?:'s| is) next\b/i,
] as const;

const EXPLICIT_PROGRESSION_PATTERNS = [
  /\bupload\b/i,
  /\battach(?:ed|ment)?\b/i,
  /\bshare\b/i,
  /\bsend\b/i,
  /\bsubmit\b/i,
  /\bselect\b/i,
  /\bchoose\b/i,
  /\bskip\b/i,
  /\bcontinue\b/i,
  /\bproceed\b/i,
  /\bnext step\b/i,
] as const;

export class SupervisorService {
  private lastRunMetadata: SupervisorLlmRunMetadata | null = null;

  constructor(private readonly gateway?: SupervisorSuggestionGateway) {}

  deriveDecisionLineage(input: OrchestratorV3DecisionInput): SupervisorDecisionLineage | null {
    const bootstrapOverride = resolveBootstrapOverride(input);
    return bootstrapOverride ? { bootstrapOverride } : null;
  }

  async suggest(input: OrchestratorV3DecisionInput): Promise<SupervisorSuggestion> {
    const bootstrapOverride = this.deriveDecisionLineage(input)?.bootstrapOverride;
    const bootstrapSuggestion = bootstrapOverride
      ? buildBootstrapOverrideSuggestion(bootstrapOverride)
      : null;
    const fallback = buildProposal(heuristicSuggest(input), input);

    if (!this.gateway) {
      this.lastRunMetadata = null;
      return bootstrapSuggestion ? buildProposal(bootstrapSuggestion, input) : fallback;
    }

    const metadataBase = {
      nodePromptVersion: this.gateway.promptVersion,
      nodeModel: this.gateway.model,
    } satisfies SupervisorLlmRunMetadata;

    try {
      const raw = await this.gateway.run(buildGatewayInput(input));
      const sanitized = sanitizeSuggestion(raw, input, fallback);
      if (bootstrapSuggestion) {
        this.lastRunMetadata = {
          ...metadataBase,
          fallbackUsed: true,
          schemaValidationFailed: false,
        };
        return buildProposal(bootstrapSuggestion, input);
      }
      this.lastRunMetadata = {
        ...metadataBase,
        fallbackUsed: sanitized.fallbackUsed,
        schemaValidationFailed: sanitized.schemaValidationFailed,
      };
      return sanitized.suggestion;
    } catch {
      this.lastRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
      };
      return bootstrapSuggestion ? buildProposal(bootstrapSuggestion, input) : fallback;
    }
  }

  async extractEvent(input: OrchestratorV3DecisionInput): Promise<SupervisorEvent> {
    const message = resolveLatestUserMessage(input) || input.bootstrap?.message;
    const deterministicEvent = extractDeterministicEvent({
      message,
      userAction: input.userAction,
      attachments: input.bootstrap?.attachments ?? [],
    });

    if (deterministicEvent?.eventType === 'USER_REQUESTED_HUMAN') {
      this.lastRunMetadata = null;
      return deterministicEvent;
    }

    const heuristicEvent = buildHeuristicSupervisorEvent(input);
    if (
      heuristicEvent.eventType === 'USER_ASKED_RISKY_MEDICAL_ADVICE'
      || heuristicEvent.eventType === 'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE'
    ) {
      this.lastRunMetadata = null;
      return heuristicEvent;
    }

    if (deterministicEvent) {
      this.lastRunMetadata = null;
      return deterministicEvent;
    }

    if (heuristicEvent.eventType === 'USER_ASKED_FAQ' && !this.gateway) {
      this.lastRunMetadata = null;
      return heuristicEvent;
    }

    if (!this.gateway) {
      this.lastRunMetadata = null;
      return heuristicEvent;
    }

    const metadataBase = {
      nodePromptVersion: this.gateway.promptVersion,
      nodeModel: this.gateway.model,
    } satisfies SupervisorLlmRunMetadata;

    try {
      const raw = await this.gateway.run(buildGatewayInput(input));
      const event = sanitizeSemanticSupervisorEvent(raw);
      this.lastRunMetadata = {
        ...metadataBase,
        fallbackUsed: event.source === 'fallback_unknown',
        schemaValidationFailed: event.source === 'fallback_unknown',
      };
      return event;
    } catch {
      this.lastRunMetadata = {
        ...metadataBase,
        fallbackUsed: true,
        schemaValidationFailed: false,
      };
      return buildFallbackUnknownEvent('supervisor semantic event extraction failed');
    }
  }

  async requestDomainReads(input: OrchestratorV3DecisionInput): Promise<SupervisorReadHints> {
    if (!this.gateway) {
      return [];
    }

    try {
      const raw = await this.gateway.run(buildGatewayInput(input));
      return sanitizeRequestedReadDomains(raw, input.availableReadDomains ?? []);
    } catch {
      return [];
    }
  }

  getLastLlmRunMetadata(): SupervisorLlmRunMetadata | null {
    return this.lastRunMetadata;
  }
}

function sanitizeSemanticSupervisorEvent(raw: unknown): SupervisorEvent {
  const record = asRecord(raw);
  const hasOnlyEventKeys = Object.keys(record).every((key) => key === 'eventType' || key === 'confidence' || key === 'source' || key === 'metadata');

  if (
    !hasOnlyEventKeys
    || !isSupervisorEventType(record.eventType)
    || typeof record.confidence !== 'number'
    || !Number.isFinite(record.confidence)
    || record.source !== 'llm'
    || SEMANTIC_FORBIDDEN_EVENT_TYPES.has(record.eventType)
    || (record.metadata !== undefined && !isSupervisorEventMetadata(record.metadata))
  ) {
    return buildFallbackUnknownEvent('supervisor semantic event extraction failed');
  }

  return {
    eventType: record.eventType,
    confidence: record.confidence,
    source: record.source,
    ...(record.metadata ? { metadata: record.metadata } : {}),
  };
}

function buildFallbackUnknownEvent(rawText: string): SupervisorEvent {
  return {
    eventType: 'UNKNOWN_MESSAGE',
    confidence: 0,
    source: 'fallback_unknown',
    metadata: { rawText },
  };
}

function buildHeuristicSupervisorEvent(input: OrchestratorV3DecisionInput): SupervisorEvent {
  const rawText = resolveLatestUserMessage(input);
  const metadata = rawText ? { rawText } : undefined;

  if (looksLikeRiskyMedicalAdvice(rawText)) {
    return {
      eventType: 'USER_ASKED_RISKY_MEDICAL_ADVICE',
      confidence: 0.9,
      source: 'deterministic',
      metadata: {
        ...(metadata ?? {}),
        riskType: 'medical_advice',
      },
    };
  }

  if (looksLikeRestrictedMedicalPromise(rawText)) {
    return {
      eventType: 'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE',
      confidence: 0.9,
      source: 'deterministic',
      metadata: {
        ...(metadata ?? {}),
        redirectTarget: 'medical_travel_support',
      },
    };
  }

  if (looksLikeFaqQuestion(rawText)) {
    return {
      eventType: 'USER_ASKED_FAQ',
      confidence: 0.75,
      source: 'llm',
      ...(metadata ? { metadata } : {}),
    };
  }

  if (/\b(?:recommend|recommendation|hospital|hospitals|clinic|clinics|option|options)\b/i.test(rawText)) {
    return {
      eventType: 'USER_ASKED_NEXT_STEP',
      confidence: 0.65,
      source: 'llm',
      ...(metadata ? { metadata } : {}),
    };
  }

  const suggestion = heuristicSuggest(input);

  if (suggestion.intent === 'handoff') {
    return {
      eventType: 'USER_REQUESTED_HUMAN',
      confidence: 0.8,
      source: 'deterministic',
      ...(metadata ? { metadata } : {}),
    };
  }

  if (suggestion.intent === 'faq' || suggestion.intent === 'resource') {
    return {
      eventType: 'USER_ASKED_FAQ',
      confidence: 0.75,
      source: 'llm',
      ...(metadata ? { metadata } : {}),
    };
  }

  if (suggestion.intent === 'consult') {
    return {
      eventType: 'USER_INTERESTED_IN_CONSULT',
      confidence: 0.7,
      source: 'llm',
      ...(metadata ? { metadata } : {}),
    };
  }

  if (suggestion.intent === 'progression') {
    return {
      eventType: 'USER_ASKED_NEXT_STEP',
      confidence: 0.65,
      source: 'llm',
      ...(metadata ? { metadata } : {}),
    };
  }

  return buildFallbackUnknownEvent(rawText || 'supervisor semantic event extraction failed');
}

export function sanitizeSuggestionOnly(
  raw: unknown,
  input: OrchestratorV3DecisionInput,
  fallback: SupervisorSuggestion,
): SupervisorSuggestion {
  return sanitizeSuggestion(raw, input, fallback).suggestion;
}

function sanitizeSuggestion(
  raw: unknown,
  input: OrchestratorV3DecisionInput,
  fallback: SupervisorSuggestion,
): {
  suggestion: SupervisorSuggestion;
  fallbackUsed: boolean;
  schemaValidationFailed: boolean;
} {
  const record = asRecord(raw);
  const reason = normalizeReason(record.reason);

  if (!isOrchestratorIntent(record.intent) || !isChatJourneyStage(record.suggestedStage)) {
    return {
      suggestion: fallback,
      fallbackUsed: true,
      schemaValidationFailed: true,
    };
  }

  const gatewaySuggestion = buildProposal({
    intent: record.intent,
    suggestedStage: record.suggestedStage,
    dispatchAgent: isDispatchAgent(record.dispatchAgent) ? record.dispatchAgent : undefined,
    reason: reason ?? fallback.reason,
  }, input);
  const correctedSuggestion = applyDeterministicPostGatewayCorrection(gatewaySuggestion, fallback);
  const fallbackUsed = correctedSuggestion !== gatewaySuggestion;

  return {
    suggestion: correctedSuggestion,
    fallbackUsed,
    schemaValidationFailed: false,
  };
}

function applyDeterministicPostGatewayCorrection(
  suggestion: SupervisorSuggestion,
  fallback: SupervisorSuggestion,
): SupervisorSuggestion {
  return shouldRepairStaleMedicalInputCollection(suggestion, fallback)
    ? fallback
    : suggestion;
}

function shouldRepairStaleMedicalInputCollection(
  suggestion: SupervisorSuggestion,
  fallback: SupervisorSuggestion,
): boolean {
  return suggestion.intent === 'progression'
    && suggestion.suggestedStage === 'COLLECT_MEDICAL_INPUTS'
    && fallback.intent === 'progression'
    && fallback.suggestedStage === 'ONLINE_CONSULT';
}

function heuristicSuggest(input: OrchestratorV3DecisionInput): SupervisorSuggestionSeed {
  const currentStage = resolveCurrentStage(input);
  const recommendationSelectionStatus = resolveRecommendationSelectionStatus(input);
  const minimalTriageComplete = hasStructuredMinimalTriageComplete(input);
  const processExplained = resolveProcessExplained(input);
  const supportingDocuments = input.supportingDocuments ?? input.statusSnapshot?.supportingDocuments ?? [];

  if (input.suggestion.intent === 'handoff' || currentStage === 'HUMAN_HANDOFF') {
    return {
      intent: 'handoff',
      suggestedStage: 'HUMAN_HANDOFF',
      reason: clampReason('handoff requested or already in human handoff'),
    };
  }

  if (
    isSidePathIntent(input.suggestion.intent)
    && isChatJourneyStage(input.suggestion.suggestedStage)
  ) {
    return {
      intent: input.suggestion.intent,
      suggestedStage: input.suggestion.suggestedStage,
      reason: clampReason(input.suggestion.reason || 'side-path detour should not rewrite the primary stage'),
    };
  }

  const recoveredSidePathIntent = recoverLaterStageSidePathIntent(input);
  if (recoveredSidePathIntent) {
    return {
      intent: recoveredSidePathIntent,
      suggestedStage: 'EXPLAIN_PROCESS',
      reason: clampReason('clear later-stage faq request should detour without advancing the journey'),
    };
  }

  const recoveredFaqDetour = recoverFaqDetour(input, currentStage);
  if (recoveredFaqDetour) {
    return recoveredFaqDetour;
  }

  if (shouldContinueMedicalInputCollection(input)) {
    return {
      intent: 'progression',
      suggestedStage: 'COLLECT_MEDICAL_INPUTS',
      reason: clampReason('clear records-sharing follow-up should stay on medical input collection'),
    };
  }

  const recommendationSelected = recommendationSelectionStatus === 'selected'
    || input.facts?.['recommendation.selected'] === true;
  const recommendationSkipped = recommendationSelectionStatus === 'skipped';

  if (currentStage === 'RECOMMENDATION' || recommendationSelectionStatus !== null || recommendationSelected) {
    if (recommendationSkipped) {
      return {
        intent: 'progression',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: clampReason('recommendation skip should continue into process explanation'),
      };
    }

    if (recommendationSelected && processExplained !== true) {
      return {
        intent: 'progression',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: clampReason('recommendation selected and process explanation should follow'),
      };
    }

    if (
      recommendationSelected
      && processExplained === true
      && supportingDocuments.length === 0
    ) {
      return {
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: clampReason('supporting documents should be collected before online consult'),
      };
    }

    if (
      recommendationSelected
      && processExplained === true
      && supportingDocuments.length > 0
    ) {
      return {
        intent: 'progression',
        suggestedStage: 'ONLINE_CONSULT',
        reason: clampReason('recommendation has been selected'),
      };
    }
  }

  if (minimalTriageComplete) {
    return {
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      reason: clampReason('minimal triage is complete and recommendation should begin'),
    };
  }

  return {
    intent: input.suggestion.intent,
    suggestedStage: inferStageFromInput(input),
    reason: clampReason(input.suggestion.reason || 'supervisor fallback suggestion'),
  };
}

function recoverFaqDetour(
  input: OrchestratorV3DecisionInput,
  currentStage: ChatJourneyStage,
): SupervisorSuggestionSeed | null {
  const latestUserMessage = resolveLatestUserMessage(input);
  if (isClearResourceQuestion(latestUserMessage)) {
    return {
      intent: 'resource',
      suggestedStage: 'EXPLAIN_PROCESS',
      reason: clampReason(
        isLaterStage(currentStage) && input.facts?.['records.minimal_triage.complete'] === true
          ? 'clear later-stage resource request should detour without advancing the journey'
          : 'clear resource request should detour through FAQ handling without rewriting the primary stage',
      ),
    };
  }

  if (!looksLikeFaqQuestion(latestUserMessage)) {
    return null;
  }

  return {
    intent: 'faq',
    suggestedStage: 'EXPLAIN_PROCESS',
    reason: clampReason(
      isLaterStage(currentStage) && input.facts?.['records.minimal_triage.complete'] === true
        ? 'clear later-stage faq request should detour without advancing the journey'
        : 'clear faq-style question should detour through FAQ handling without rewriting the primary stage',
    ),
  };
}

function inferStageFromInput(input: OrchestratorV3DecisionInput): ChatJourneyStage {
  if (isChatJourneyStage(input.suggestion.suggestedStage)) {
    return input.suggestion.suggestedStage;
  }

  if (isChatJourneyStage(input.currentStage)) {
    return input.currentStage;
  }

  return CHATBOT_V3_JOURNEY_STAGES[0];
}

function normalizeReason(reason: unknown): string | null {
  if (typeof reason !== 'string') {
    return null;
  }

  const trimmed = reason.trim();
  return trimmed.length > 0 ? clampReason(trimmed) : null;
}

function clampReason(reason: string): string {
  return reason.length <= 240 ? reason : reason.slice(0, 240);
}

function isChatJourneyStage(value: unknown): value is ChatJourneyStage {
  return typeof value === 'string' && (CHATBOT_V3_JOURNEY_STAGES as readonly string[]).includes(value);
}

function isOrchestratorIntent(value: unknown): value is OrchestratorV3Intent {
  return typeof value === 'string' && (ORCHESTRATOR_INTENTS as readonly string[]).includes(value);
}

function isDispatchAgent(value: unknown): value is ChatbotV3DispatchAgent {
  return value === 'FaqAgent'
    || value === 'RecordsAgent'
    || value === 'RecommendationAgent'
    || value === 'ConsultAgent'
    || value === 'HandoffAgent';
}

function isSupervisorEventType(value: unknown): value is SupervisorEvent['eventType'] {
  return typeof value === 'string' && (SUPERVISOR_EVENT_TYPES as readonly string[]).includes(value);
}

function isSupervisorEventMetadata(value: unknown): value is NonNullable<SupervisorEvent['metadata']> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const metadata = value as Record<string, unknown>;
  const allowedKeys = new Set([
    'topic',
    'subtopic',
    'condition',
    'destination',
    'urgency',
    'extractedFacts',
    'selectedHospitalIds',
    'documentCount',
    'riskType',
    'redirectTarget',
    'rawText',
  ]);

  if (!Object.keys(metadata).every((key) => allowedKeys.has(key))) {
    return false;
  }

  return isOptionalString(metadata.topic)
    && isOptionalString(metadata.subtopic)
    && isOptionalString(metadata.condition)
    && isOptionalString(metadata.destination)
    && (metadata.urgency === undefined || metadata.urgency === 'low' || metadata.urgency === 'medium' || metadata.urgency === 'high' || metadata.urgency === 'unknown')
    && (metadata.extractedFacts === undefined || isPlainRecord(metadata.extractedFacts))
    && (metadata.selectedHospitalIds === undefined || isStringArray(metadata.selectedHospitalIds))
    && (metadata.documentCount === undefined || typeof metadata.documentCount === 'number')
    && isOptionalString(metadata.riskType)
    && isOptionalString(metadata.redirectTarget)
    && isOptionalString(metadata.rawText);
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isSidePathIntent(
  intent: OrchestratorV3DecisionInput['suggestion']['intent'],
): boolean {
  return intent === 'faq' || intent === 'resource';
}

function isLaterStage(stage: ChatJourneyStage): boolean {
  return stage === 'RECOMMENDATION'
    || stage === 'EXPLAIN_PROCESS'
    || stage === 'COLLECT_MEDICAL_INPUTS'
    || stage === 'ONLINE_CONSULT';
}

function looksLikeFaqQuestion(message: string): boolean {
  const normalized = message.trim();
  if (normalized.length === 0) {
    return false;
  }

  if (EXPLICIT_PROGRESSION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  if (WORKFLOW_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return FAQ_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function looksLikeRiskyMedicalAdvice(message: string): boolean {
  return RISKY_MEDICAL_ADVICE_PATTERNS.some((pattern) => pattern.test(message));
}

function looksLikeRestrictedMedicalPromise(message: string): boolean {
  return RESTRICTED_MEDICAL_PROMISE_PATTERNS.some((pattern) => pattern.test(message));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function recoverLaterStageSidePathIntent(
  input: OrchestratorV3DecisionInput,
): OrchestratorV3Intent | null {
  if (input.suggestion.intent === 'faq' || input.suggestion.intent === 'resource') {
    return null;
  }

  if (!isLaterStageForSidePathRecovery(resolveCurrentStage(input))) {
    return null;
  }

  const latestUserMessage = resolveLatestUserMessage(input);
  if (isClearResourceQuestion(latestUserMessage)) {
    return 'resource';
  }

  if (looksLikeFaqQuestion(latestUserMessage)) {
    return 'faq';
  }

  return null;
}

function isLaterStageForSidePathRecovery(stage: ChatJourneyStage | null | undefined): boolean {
  return stage === 'RECOMMENDATION'
    || stage === 'COLLECT_MEDICAL_INPUTS'
    || stage === 'ONLINE_CONSULT';
}

function isClearResourceQuestion(message: string): boolean {
  const normalized = normalizeMessage(message)?.toLowerCase();
  if (!normalized) {
    return false;
  }

  const resourceVerbSignals = /\b(send|share|show|give|provide|upload|open)\b/.test(normalized);
  const resourceNounSignals = /\b(link|form|questionnaire|guide|brochure|address|contact details|hours|documents?)\b/.test(normalized);

  return resourceVerbSignals && resourceNounSignals;
}

function shouldContinueMedicalInputCollection(
  input: OrchestratorV3DecisionInput,
): boolean {
  if (resolveCurrentStage(input) !== 'COLLECT_MEDICAL_INPUTS') {
    return false;
  }

  const normalized = normalizeMessage(resolveLatestUserMessage(input))?.toLowerCase();
  if (!normalized) {
    return false;
  }

  const sharingSignals = /\b(share|upload|send|provide|submit|attach|bring)\b/.test(normalized);
  const recordSignals = /\b(record|records|report|reports|medical record|medical records|pathology|scan|lab|labs|results|documents?)\b/.test(normalized);

  return sharingSignals && recordSignals;
}

function isDirectHumanRequest(bootstrap: OrchestratorV3BootstrapSignals | undefined): boolean {
  const message = bootstrap?.message.trim() ?? '';
  if (message.length === 0) {
    return false;
  }

  return DIRECT_HUMAN_REQUEST_PATTERNS.some((pattern) => pattern.test(message));
}

function resolveBootstrapOverride(
  input: OrchestratorV3DecisionInput,
): ChatbotV3BootstrapOverride | null {
  const bootstrap = input.bootstrap;
  if (isDirectHumanRequest(bootstrap)) {
    return bootstrap?.canCreateHandoff
      ? 'direct_human_request_handoff'
      : 'direct_human_request_faq_fallback';
  }

  return (bootstrap?.attachments?.length ?? 0) > 0
    && resolveCurrentStage(input) === 'COLLECT_MINIMAL_MEDICAL_FACTS'
    && !isLaterStageBootstrapContext(input)
    && recoverLaterStageSidePathIntent(input) === null
    ? 'attachments_to_minimal_triage'
    : null;
}

function buildBootstrapOverrideSuggestion(
  bootstrapOverride: ChatbotV3BootstrapOverride,
): SupervisorSuggestionSeed {
  switch (bootstrapOverride) {
    case 'direct_human_request_handoff':
      return {
        intent: 'handoff',
        suggestedStage: 'HUMAN_HANDOFF',
        reason: clampReason('direct user request for a human'),
      };
    case 'direct_human_request_faq_fallback':
      return {
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        dispatchAgent: 'FaqAgent',
        reason: clampReason('direct human request cannot create handoff ticket for this session'),
      };
    case 'attachments_to_minimal_triage':
      return {
        intent: 'progression',
        suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        reason: clampReason('attachments provided by user'),
      };
  }
}

function buildProposal(
  suggestion: SupervisorSuggestionSeed,
  input: OrchestratorV3DecisionInput,
): SupervisorProposal {
  const suggestedStage = isChatJourneyStage(suggestion.suggestedStage)
    ? suggestion.suggestedStage
    : inferStageFromInput(input);
  const dispatchAgent = resolveChatbotV3ProposalDispatchAgent({
    intent: suggestion.intent,
    suggestedStage,
    dispatchAgent: suggestion.dispatchAgent,
  });

  const proposal: SupervisorProposal = {
    intent: suggestion.intent,
    suggestedStage,
    dispatchAgent,
    reason: clampReason(suggestion.reason || 'supervisor fallback suggestion'),
  };

  if (dispatchAgent) {
    proposal.task = buildTask(dispatchAgent, suggestedStage, input);
  }

  return proposal;
}

function buildTask(
  dispatchAgent: ChatbotV3DispatchAgent,
  suggestedStage: ChatJourneyStage,
  input: OrchestratorV3DecisionInput,
): SupervisorTask {
  return {
    goal: deriveTaskGoal(dispatchAgent, suggestedStage),
    latestUserMessage: resolveLatestUserMessage(input),
    necessaryFacts: buildNecessaryFacts(dispatchAgent, suggestedStage, input),
  };
}

function deriveTaskGoal(
  dispatchAgent: ChatbotV3DispatchAgent,
  suggestedStage: ChatJourneyStage,
): string {
  switch (dispatchAgent) {
    case 'FaqAgent':
      return 'Answer the user\'s question using FAQ knowledge only.';
    case 'RecordsAgent':
      return suggestedStage === 'COLLECT_MEDICAL_INPUTS'
        ? 'Collect the medical inputs needed to support online consultation for this user.'
        : 'Collect the minimal medical triage needed for this user.';
    case 'RecommendationAgent':
      return 'Generate hospital recommendations for this user.';
    case 'ConsultAgent':
      return 'Advance the online consultation workflow for this user.';
    case 'HandoffAgent':
      return 'Initiate a human handoff for this user.';
  }
}

function buildNecessaryFacts(
  dispatchAgent: ChatbotV3DispatchAgent,
  suggestedStage: ChatJourneyStage,
  input: OrchestratorV3DecisionInput,
): ChatbotV3Facts {
  const necessaryFacts: ChatbotV3Facts = {};
  const minimalTriageComplete = hasStructuredMinimalTriageComplete(input);

  switch (dispatchAgent) {
    case 'FaqAgent':
      addFact(necessaryFacts, 'current.stage', resolveCurrentStage(input));
      addFact(necessaryFacts, 'intake.target_destination', resolveIntake(input).targetDestination);
      return necessaryFacts;
    case 'RecordsAgent':
      addFact(necessaryFacts, 'intake.condition', resolveIntake(input).condition);
      addFact(
        necessaryFacts,
        'intake.target_destination',
        resolveIntake(input).targetDestination,
      );
      addFact(
        necessaryFacts,
        'records.minimal_triage.complete',
        minimalTriageComplete,
      );
      if (suggestedStage === 'COLLECT_MEDICAL_INPUTS') {
        addFact(
          necessaryFacts,
          'recommendation.selected',
          hasStructuredRecommendationSelected(input),
        );
      }
      return necessaryFacts;
    case 'RecommendationAgent':
      appendIntakeFacts(necessaryFacts, input);
      addFact(necessaryFacts, 'records.minimal_triage.complete', minimalTriageComplete);
      addFact(necessaryFacts, 'recommendation.generated', minimalTriageComplete);
      addFact(necessaryFacts, 'recommendation.selected', hasStructuredRecommendationSelected(input));
      return necessaryFacts;
    case 'ConsultAgent':
      addFact(necessaryFacts, 'recommendation.selected', hasStructuredRecommendationSelected(input));
      copyFact(necessaryFacts, input.facts, 'consult.completed');
      copyFact(necessaryFacts, input.facts, 'consult.scheduled');
      copyFact(necessaryFacts, input.facts, 'selected_hospital.id');
      return necessaryFacts;
    case 'HandoffAgent':
      addFact(necessaryFacts, 'current.stage', resolveCurrentStage(input));
      addFact(
        necessaryFacts,
        'handoff.active',
        readBooleanFact(input.facts, 'handoff.active') ?? false,
      );
      copyFact(necessaryFacts, input.facts, 'handoff.reason');
      return necessaryFacts;
  }
}

function buildGatewayInput(input: OrchestratorV3DecisionInput): SupervisorGatewayInput {
  const structuredState = {
    journeyCurrentStage: input.journeyCurrentStage ?? input.statusSnapshot?.journeyCurrentStage,
    journeyCurrentPhase: input.journeyCurrentPhase ?? input.statusSnapshot?.journeyCurrentPhase,
    minimalTriageStatus: input.minimalTriageStatus ?? input.statusSnapshot?.minimalTriageStatus,
    minimalTriageAnswersSummary: input.minimalTriageAnswersSummary
      ?? input.statusSnapshot?.minimalTriageAnswersSummary
      ?? null,
    processExplained: resolveProcessExplained(input),
    recommendationSelectionStatus: input.recommendationSelectionStatus
      ?? input.statusSnapshot?.recommendationSelectionStatus
      ?? undefined,
    recommendationSelectedHospitalIds: input.recommendationSelectedHospitalIds
      ?? input.statusSnapshot?.recommendationSelectedHospitalIds
      ?? undefined,
    supportingDocuments: input.supportingDocuments ?? input.statusSnapshot?.supportingDocuments,
  } as const;

  return {
    currentStage: resolveCurrentStage(input),
    ...structuredState,
    statusSnapshot: input.statusSnapshot
      ? {
          journeyCurrentStage: structuredState.journeyCurrentStage,
          ...(structuredState.journeyCurrentPhase
            ? { journeyCurrentPhase: structuredState.journeyCurrentPhase }
            : {}),
          minimalTriageStatus: structuredState.minimalTriageStatus,
          minimalTriageAnswersSummary: structuredState.minimalTriageAnswersSummary,
          processExplained: structuredState.processExplained,
          recommendationSelectionStatus: structuredState.recommendationSelectionStatus,
          recommendationSelectedHospitalIds: structuredState.recommendationSelectedHospitalIds,
          minimalTriageComplete: input.statusSnapshot?.minimalTriageComplete,
          supportingDocuments: structuredState.supportingDocuments ?? [],
        }
      : undefined,
    processExplained: structuredState.processExplained,
    conversationSummary: input.conversationSummary ?? '',
    latestUserMessage: resolveLatestUserMessage(input),
    intake: resolveIntake(input),
    availableReadDomains: input.availableReadDomains ?? [],
    ...(input.domainReadResults ? { domainReadResults: input.domainReadResults } : {}),
    conversationSummaryContract: SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT,
  };
}

function sanitizeRequestedReadDomains(
  raw: unknown,
  availableReadDomains: readonly SupervisorReadDomain[],
): SupervisorReadHints {
  const requested = asRecord(raw).requestedReadDomains;
  if (!Array.isArray(requested) || requested.length === 0) {
    return [];
  }

  const allowlist = new Set<SupervisorReadDomain>(availableReadDomains);
  const normalized: SupervisorReadDomain[] = [];

  for (const candidate of requested) {
    if (!isSupervisorReadDomain(candidate) || !allowlist.has(candidate)) {
      continue;
    }

    if (!normalized.includes(candidate)) {
      normalized.push(candidate);
    }

    if (normalized.length >= MAX_SUPERVISOR_READ_DOMAINS) {
      break;
    }
  }

  return normalized;
}

function appendIntakeFacts(
  target: ChatbotV3Facts,
  input: OrchestratorV3DecisionInput,
): void {
  const intake = resolveIntake(input);
  addFact(target, 'intake.condition', intake.condition);
  addFact(target, 'intake.target_destination', intake.targetDestination);
  addFact(target, 'intake.language', intake.language);
  addFact(target, 'intake.gender', intake.gender);
}

function resolveIntake(
  input: OrchestratorV3DecisionInput,
): {
  condition: string | null;
  targetDestination: string | null;
  language: string | null;
  gender: string | null;
} {
  return {
    condition: input.intake?.condition ?? readStringFact(input.facts, 'intake.condition') ?? null,
    targetDestination: input.intake?.targetDestination
      ?? readStringFact(input.facts, 'intake.target_destination')
      ?? null,
    language: input.intake?.language ?? readStringFact(input.facts, 'intake.language') ?? null,
    gender: input.intake?.gender ?? readStringFact(input.facts, 'intake.gender') ?? null,
  };
}

function resolveLatestUserMessage(input: OrchestratorV3DecisionInput): string {
  const minimalContextMessage = normalizeMessage(input.latestUserMessage);
  if (minimalContextMessage) {
    return minimalContextMessage;
  }

  return normalizeMessage(input.bootstrap?.message) ?? '';
}

function resolveCurrentStage(input: OrchestratorV3DecisionInput): ChatJourneyStage {
  return resolveCurrentStageRef(input).stage;
}

function resolveCurrentStageRef(
  input: OrchestratorV3DecisionInput,
): ChatbotV3StageRef {
  if (isChatJourneyStage(input.currentStage)) {
    return {
      stage: input.currentStage,
      phase: input.current.phase,
    };
  }

  if (isChatJourneyStage(input.current?.stage)) {
    return input.current;
  }

  const journeyCurrentStage = input.statusSnapshot?.journeyCurrentStage;
  const journeyCurrentPhase = input.statusSnapshot?.journeyCurrentPhase;

  if (isChatJourneyStage(journeyCurrentStage)) {
    return {
      stage: journeyCurrentStage,
      phase: isChatJourneyPhase(journeyCurrentPhase) ? journeyCurrentPhase : input.current.phase,
    };
  }

  return {
    stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    phase: 'active',
  };
}

function resolveRecommendationSelectionStatus(
  input: OrchestratorV3DecisionInput,
): ChatbotV3StatusSnapshot['recommendationSelectionStatus'] {
  return input.recommendationSelectionStatus
    ?? input.statusSnapshot?.recommendationSelectionStatus
    ?? null;
}

function hasStructuredRecommendationSelected(
  input: OrchestratorV3DecisionInput,
): boolean {
  return resolveRecommendationSelectionStatus(input) === 'selected'
    || input.facts?.['recommendation.selected'] === true;
}

function resolveProcessExplained(
  input: OrchestratorV3DecisionInput,
): boolean {
  return input.statusSnapshot?.processExplained === true
    || input.facts?.['process.explained'] === true;
}

function isLaterStageBootstrapContext(
  input: OrchestratorV3DecisionInput,
): boolean {
  return isLaterStageForSidePathRecovery(input.currentStage)
    || isLaterStageForSidePathRecovery(input.current?.stage)
    || isLaterStageForSidePathRecovery(input.statusSnapshot?.journeyCurrentStage)
    || isLaterStageForSidePathRecovery(
      isChatJourneyStage(input.suggestion.suggestedStage) ? input.suggestion.suggestedStage : undefined,
    )
    || input.facts?.['records.minimal_triage.complete'] === true
    || input.facts?.['recommendation.selected'] === true
    || input.facts?.['process.explained'] === true;
}

function hasStructuredMinimalTriageComplete(
  input: OrchestratorV3DecisionInput,
): boolean {
  const status = input.minimalTriageStatus ?? input.statusSnapshot?.minimalTriageStatus;
  const answersSummary = input.minimalTriageAnswersSummary
    ?? input.statusSnapshot?.minimalTriageAnswersSummary
    ?? null;
  if (status === 'skipped') {
    return true;
  }

  if (status === 'pending') {
    return answersSummary !== null && answersSummary.trim().length > 0;
  }

  return false;
}

function isChatJourneyPhase(value: unknown): value is ChatJourneyPhase {
  return value === 'active' || value === 'post';
}

function readStringFact(
  facts: ChatbotV3Facts | undefined,
  key: string,
): string | null | undefined {
  const value = facts?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readBooleanFact(
  facts: ChatbotV3Facts | undefined,
  key: string,
): boolean | undefined {
  const value = facts?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function isSupervisorReadDomain(value: unknown): value is SupervisorReadDomain {
  return value === 'records.status'
    || value === 'recommendation.status'
    || value === 'consult.status'
    || value === 'handoff.status';
}

function copyFact(target: ChatbotV3Facts, source: ChatbotV3Facts | undefined, key: string): void {
  addFact(target, key, source?.[key]);
}

function addFact(
  target: ChatbotV3Facts,
  key: string,
  value: boolean | number | string | null | undefined,
): void {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return;
  }

  target[key] = value;
}

function normalizeMessage(message: string | undefined): string | null {
  if (typeof message !== 'string') {
    return null;
  }

  const trimmed = message.trim();
  return trimmed.length > 0 ? trimmed : null;
}
