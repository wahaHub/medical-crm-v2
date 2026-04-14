import type { ChatJourneyStage } from '@medical-crm/domain';
import type {
  OrchestratorV3DecisionInput,
  OrchestratorV3Intent,
  OrchestratorV3Suggestion,
} from './orchestrator-v3.service.js';
import { CHATBOT_V3_JOURNEY_STAGES } from './types.js';

export interface SupervisorSuggestionGateway {
  suggest(input: OrchestratorV3DecisionInput): Promise<unknown>;
}

export type SupervisorSuggestion = OrchestratorV3Suggestion;

const ORCHESTRATOR_INTENTS = [
  'faq',
  'progression',
  'resource',
  'consult',
  'handoff',
  'unknown',
] as const satisfies readonly OrchestratorV3Intent[];

export class SupervisorService {
  constructor(private readonly gateway?: SupervisorSuggestionGateway) {}

  async suggest(input: OrchestratorV3DecisionInput): Promise<SupervisorSuggestion> {
    const fallback = heuristicSuggest(input);

    if (!this.gateway) {
      return fallback;
    }

    try {
      const raw = await this.gateway.suggest(input);
      return sanitizeSuggestionOnly(raw, fallback);
    } catch {
      return fallback;
    }
  }
}

export function sanitizeSuggestionOnly(
  raw: unknown,
  fallback: SupervisorSuggestion,
): SupervisorSuggestion {
  const record = asRecord(raw);
  const intent = isOrchestratorIntent(record.intent) ? record.intent : fallback.intent;
  const suggestedStage = isChatJourneyStage(record.suggestedStage)
    ? record.suggestedStage
    : fallback.suggestedStage;
  const reason = normalizeReason(record.reason, fallback.reason);

  return {
    intent,
    suggestedStage,
    reason,
  };
}

function heuristicSuggest(input: OrchestratorV3DecisionInput): SupervisorSuggestion {
  if (input.suggestion.intent === 'handoff' || input.current.stage === 'HUMAN_HANDOFF') {
    return {
      intent: 'handoff',
      suggestedStage: 'HUMAN_HANDOFF',
      reason: clampReason('handoff requested or already in human handoff'),
    };
  }

  if (input.facts?.['recommendation.picked']) {
    return {
      intent: 'progression',
      suggestedStage: 'ONLINE_CONSULT',
      reason: clampReason('recommendation has been picked'),
    };
  }

  if (input.facts?.['records.saved']) {
    return {
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      reason: clampReason('medical records are saved and ready for recommendation'),
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

  return CHATBOT_V3_JOURNEY_STAGES[0];
}

function normalizeReason(reason: unknown, fallbackReason: string): string {
  if (typeof reason !== 'string') {
    return clampReason(fallbackReason);
  }

  const trimmed = reason.trim();
  return clampReason(trimmed.length > 0 ? trimmed : fallbackReason);
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
