import type { ChatJourneyStage } from '@medical-crm/domain';
import type {
  OrchestratorV3DecisionInput,
  OrchestratorV3Intent,
  OrchestratorV3Suggestion,
} from './orchestrator-v3.service.js';
import type { LlmNodeAdapter } from './llm-adapter.types.js';
import { CHATBOT_V3_JOURNEY_STAGES } from './types.js';

export type SupervisorSuggestionGateway = LlmNodeAdapter<OrchestratorV3DecisionInput, unknown>;

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
      const raw = await this.gateway.run(input);
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
  const reason = normalizeReason(record.reason);

  if (!isOrchestratorIntent(record.intent) || !isChatJourneyStage(record.suggestedStage)) {
    return fallback;
  }

  return {
    intent: record.intent,
    suggestedStage: record.suggestedStage,
    reason: reason ?? fallback.reason,
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

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
