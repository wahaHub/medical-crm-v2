import type { ChatJourneyStage } from '@medical-crm/domain';
import type {
  ChatbotV3DispatchAgent,
  ChatbotV3Facts,
  OrchestratorV3BootstrapSignals,
  OrchestratorV3DecisionInput,
  OrchestratorV3Intent,
  SupervisorGatewayInput,
  SupervisorReadDomain,
  SupervisorReadHints,
  SupervisorProposal,
  SupervisorSuggestionSeed,
  SupervisorTask,
} from './types.js';
import type { LlmNodeAdapter } from './llm-adapter.types.js';
import {
  CHATBOT_V3_JOURNEY_STAGES,
  resolveChatbotV3DispatchAgent,
  SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT,
} from './types.js';

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

const DIRECT_HUMAN_REQUEST_PATTERNS = [
  /\bneed (?:a |to talk to a |to speak to a )?(?:human|person|advisor|agent|operator|representative)\b/i,
  /\b(?:want|wanna|would like) (?:a |to talk to a |to speak to a )?(?:human|person|advisor|agent|operator|representative)\b/i,
  /\b(?:talk|speak|chat|connect|transfer|handoff|escalat(?:e|ion)?)\b[\s\w]*\b(?:human|person|advisor|agent|operator|representative)\b/i,
  /\b(?:live|real) (?:agent|person|human)\b/i,
] as const;

export class SupervisorService {
  private lastRunMetadata: SupervisorLlmRunMetadata | null = null;

  constructor(private readonly gateway?: SupervisorSuggestionGateway) {}

  async suggest(input: OrchestratorV3DecisionInput): Promise<SupervisorSuggestion> {
    const bootstrapOverride = deriveBootstrapOverride(input);
    const fallback = buildProposal(heuristicSuggest(input), input);

    if (!this.gateway) {
      this.lastRunMetadata = null;
      return bootstrapOverride ? buildProposal(bootstrapOverride, input) : fallback;
    }

    const metadataBase = {
      nodePromptVersion: this.gateway.promptVersion,
      nodeModel: this.gateway.model,
    } satisfies SupervisorLlmRunMetadata;

    try {
      const raw = await this.gateway.run(buildGatewayInput(input));
      const sanitized = sanitizeSuggestion(raw, input, fallback);
      if (bootstrapOverride) {
        this.lastRunMetadata = {
          ...metadataBase,
          fallbackUsed: true,
          schemaValidationFailed: false,
        };
        return buildProposal(bootstrapOverride, input);
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
      return fallback;
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

  return {
    suggestion: buildProposal({
      intent: record.intent,
      suggestedStage: record.suggestedStage,
      dispatchAgent: isDispatchAgent(record.dispatchAgent) ? record.dispatchAgent : undefined,
      reason: reason ?? fallback.reason,
    }, input),
    fallbackUsed: false,
    schemaValidationFailed: false,
  };
}

function heuristicSuggest(input: OrchestratorV3DecisionInput): SupervisorSuggestionSeed {
  const bootstrapOverride = deriveBootstrapOverride(input);
  if (bootstrapOverride) {
    return bootstrapOverride;
  }

  if (input.suggestion.intent === 'handoff' || input.current.stage === 'HUMAN_HANDOFF') {
    return {
      intent: 'handoff',
      suggestedStage: 'HUMAN_HANDOFF',
      reason: clampReason('handoff requested or already in human handoff'),
    };
  }

  if (input.facts?.['recommendation.selected']) {
    if (input.facts['process.explained'] !== true) {
      return {
        intent: 'progression',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: clampReason('recommendation selected and process explanation should follow'),
      };
    }

    return {
      intent: 'progression',
      suggestedStage: 'ONLINE_CONSULT',
      reason: clampReason('recommendation has been selected'),
    };
  }

  if (input.facts?.['records.minimal_triage.complete']) {
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function isDirectHumanRequest(bootstrap: OrchestratorV3BootstrapSignals | undefined): boolean {
  const message = bootstrap?.message.trim() ?? '';
  if (message.length === 0) {
    return false;
  }

  return DIRECT_HUMAN_REQUEST_PATTERNS.some((pattern) => pattern.test(message));
}

function deriveBootstrapOverride(
  input: OrchestratorV3DecisionInput,
): SupervisorSuggestionSeed | null {
  if (isDirectHumanRequest(input.bootstrap)) {
    if (input.bootstrap?.canCreateHandoff) {
      return {
        intent: 'handoff',
        suggestedStage: 'HUMAN_HANDOFF',
        reason: clampReason('direct user request for a human'),
      };
    }

    return {
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: clampReason('direct human request cannot create handoff ticket for this session'),
    };
  }

  if ((input.bootstrap?.attachments?.length ?? 0) > 0) {
    return {
      intent: 'progression',
      suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      reason: clampReason('attachments provided by user'),
    };
  }

  return null;
}

function buildProposal(
  suggestion: SupervisorSuggestionSeed,
  input: OrchestratorV3DecisionInput,
): SupervisorProposal {
  const suggestedStage = isChatJourneyStage(suggestion.suggestedStage)
    ? suggestion.suggestedStage
    : inferStageFromInput(input);
  const dispatchAgent = resolveChatbotV3DispatchAgent(suggestedStage);

  if (!dispatchAgent) {
    throw new Error(`Unable to resolve dispatch agent for stage ${suggestedStage}`);
  }

  return {
    intent: suggestion.intent,
    suggestedStage,
    dispatchAgent,
    reason: clampReason(suggestion.reason || 'supervisor fallback suggestion'),
    task: buildTask(dispatchAgent, suggestedStage, input),
  };
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
        readBooleanFact(input.facts, 'records.minimal_triage.complete') ?? false,
      );
      if (suggestedStage === 'COLLECT_MEDICAL_INPUTS') {
        copyFact(necessaryFacts, input.facts, 'recommendation.selected');
      }
      return necessaryFacts;
    case 'RecommendationAgent':
      appendIntakeFacts(necessaryFacts, input);
      copyFact(necessaryFacts, input.facts, 'records.minimal_triage.complete');
      copyFact(necessaryFacts, input.facts, 'recommendation.generated');
      copyFact(necessaryFacts, input.facts, 'recommendation.selected');
      return necessaryFacts;
    case 'ConsultAgent':
      copyFact(necessaryFacts, input.facts, 'recommendation.selected');
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
  return {
    currentStage: resolveCurrentStage(input),
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
  return input.currentStage ?? input.current.stage;
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
