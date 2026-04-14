import type { ChatJourneyPhase, ChatJourneyStage } from '@medical-crm/domain';
import type { AgentAction, AgentName } from './agents.js';
import type {
  StatusQueryOutput,
  ToolErrorCode,
  ToolGateway,
  ToolResult,
} from './tool-gateway.js';

export interface ConversationOrchestratorV3StageRef {
  stage: ChatJourneyStage;
  phase: ChatJourneyPhase;
}

export type ConversationOrchestratorV3Intent =
  | 'faq'
  | 'progression'
  | 'resource'
  | 'consult'
  | 'handoff'
  | 'unknown';

export interface ConversationOrchestratorV3Suggestion {
  intent: ConversationOrchestratorV3Intent;
  suggestedStage: ChatJourneyStage;
  reason: string;
}

export type ConversationOrchestratorV3Facts =
  Record<string, boolean | number | string | null | undefined>;

export interface ConversationOrchestratorV3HandoffSignals {
  userRequestedHuman?: boolean;
  consecutiveCriticalToolFailures?: number;
  safetyPolicyHit?: boolean;
}

export interface ConversationOrchestratorV3DecisionInput {
  current: ConversationOrchestratorV3StageRef;
  suggestion: ConversationOrchestratorV3Suggestion;
  facts?: ConversationOrchestratorV3Facts;
  handoff?: ConversationOrchestratorV3HandoffSignals;
}

export interface ConversationOrchestratorV3Decision {
  action: 'STAY' | 'ADVANCE' | 'SKIP' | 'HANDOFF';
  from: ConversationOrchestratorV3StageRef;
  to: ConversationOrchestratorV3StageRef;
  dispatchAgent?: AgentName;
  dispatchSource: 'orchestrator';
  matchedRuleId?: string;
  whyNotSkip?: string;
}

export interface ConversationOrchestratorV3HandleTurnInput {
  sessionId: string;
  turnId: string;
  message: string;
  attachments?: Array<Record<string, unknown>>;
  current: ConversationOrchestratorV3StageRef;
  facts?: ConversationOrchestratorV3Facts;
  handoff?: ConversationOrchestratorV3HandoffSignals;
  suggestion?: ConversationOrchestratorV3Suggestion;
}

export interface ConversationOrchestratorV3TurnResult {
  suggestion: ConversationOrchestratorV3Suggestion;
  decision: ConversationOrchestratorV3Decision;
  journey: ConversationOrchestratorV3StageRef;
  dispatchResult: ToolResult<unknown> | null;
  fallbackStatus: ToolResult<StatusQueryOutput> | null;
  turnOutcome: {
    status: 'ok' | 'degraded';
    recoverableErrorCode: 'TIMEOUT' | 'UPSTREAM_UNAVAILABLE' | 'UNKNOWN' | null;
  };
  runtimeDebug: {
    idempotencyKey: string;
    lastDispatchSource?: 'orchestrator';
  };
}

export interface ConversationOrchestratorV3IdempotencyExecutor {
  execute<T>(key: string, operation: string, fn: () => Promise<T>): Promise<T>;
}

export interface ConversationOrchestratorV3Supervisor {
  suggest(input: ConversationOrchestratorV3DecisionInput): Promise<ConversationOrchestratorV3Suggestion>;
}

export interface ConversationOrchestratorV3Orchestrator {
  decide(input: ConversationOrchestratorV3DecisionInput): ConversationOrchestratorV3Decision;
}

export interface ConversationOrchestratorV3AgentExecutor {
  execute(action: AgentAction): Promise<ToolResult<unknown>>;
}

export interface ConversationOrchestratorV3RuntimeDependencies {
  idempotency: ConversationOrchestratorV3IdempotencyExecutor;
  supervisor: ConversationOrchestratorV3Supervisor;
  orchestrator: ConversationOrchestratorV3Orchestrator;
  gateway: Pick<ToolGateway, 'status'>;
  agents: Partial<Record<AgentName, ConversationOrchestratorV3AgentExecutor>>;
}

export class ConversationOrchestratorV3RuntimeService {
  constructor(
    private readonly dependencies: ConversationOrchestratorV3RuntimeDependencies,
  ) {}

  handleTurn(input: ConversationOrchestratorV3HandleTurnInput): Promise<ConversationOrchestratorV3TurnResult> {
    const idempotencyKey = `${input.sessionId}:${input.turnId}:chatbot-v3-turn`;

    return this.dependencies.idempotency.execute(
      idempotencyKey,
      'chatbot_v3_turn',
      () => this.runTurnPipeline(input, idempotencyKey),
    );
  }

  private async runTurnPipeline(
    input: ConversationOrchestratorV3HandleTurnInput,
    idempotencyKey: string,
  ): Promise<ConversationOrchestratorV3TurnResult> {
    const supervisorInput = this.buildDecisionInput(input);
    const suggestion = await this.dependencies.supervisor.suggest(supervisorInput);
    const decision = this.dependencies.orchestrator.decide({
      ...supervisorInput,
      suggestion,
    });
    const runtimeDebug = {
      idempotencyKey,
      lastDispatchSource: decision.dispatchSource,
    } satisfies ConversationOrchestratorV3TurnResult['runtimeDebug'];

    if (!decision.dispatchAgent) {
      return {
        suggestion,
        decision,
        journey: decision.to,
        dispatchResult: null,
        fallbackStatus: null,
        turnOutcome: {
          status: 'ok',
          recoverableErrorCode: null,
        },
        runtimeDebug,
      };
    }

    const agent = this.dependencies.agents[decision.dispatchAgent];
    if (!agent) {
      return this.buildDegradedResult({
        input,
        suggestion,
        decision,
        dispatchResult: {
          status: 'error',
          code: 'UPSTREAM_UNAVAILABLE',
          message: `${decision.dispatchAgent} is unavailable`,
        },
        runtimeDebug,
      });
    }

    try {
      const dispatchAction = buildDispatchAction(input, decision as ConversationOrchestratorV3Decision & {
        dispatchAgent: AgentName;
      }, suggestion);
      const dispatchResult = await agent.execute(dispatchAction);

      if (dispatchResult.status === 'error') {
        return this.buildDegradedResult({
          input,
          suggestion,
          decision,
          dispatchResult,
          runtimeDebug,
        });
      }

      return {
        suggestion,
        decision,
        journey: decision.to,
        dispatchResult,
        fallbackStatus: null,
        turnOutcome: {
          status: 'ok',
          recoverableErrorCode: null,
        },
        runtimeDebug,
      };
    } catch (error) {
      return this.buildDegradedResult({
        input,
        suggestion,
        decision,
        dispatchResult: {
          status: 'error',
          code: 'UNKNOWN',
          message: error instanceof Error ? error.message : 'agent dispatch failed',
        },
        runtimeDebug,
      });
    }
  }

  private buildDecisionInput(
    input: ConversationOrchestratorV3HandleTurnInput,
  ): ConversationOrchestratorV3DecisionInput {
    return {
      current: input.current,
      suggestion: input.suggestion ?? {
        intent: 'unknown',
        suggestedStage: input.current.stage,
        reason: normalizeReason(input.message),
      },
      facts: input.facts,
      handoff: input.handoff,
    };
  }

  private async buildDegradedResult({
    input,
    suggestion,
    decision,
    dispatchResult,
    runtimeDebug,
  }: {
    input: ConversationOrchestratorV3HandleTurnInput;
    suggestion: ConversationOrchestratorV3Suggestion;
    decision: ConversationOrchestratorV3Decision;
    dispatchResult: Extract<ToolResult<unknown>, { status: 'error' }>;
    runtimeDebug: ConversationOrchestratorV3TurnResult['runtimeDebug'];
  }): Promise<ConversationOrchestratorV3TurnResult> {
    const fallbackStatus = await queryStatusFallback(this.dependencies.gateway, input.sessionId);

    return {
      suggestion,
      decision,
      journey: decision.to,
      dispatchResult,
      fallbackStatus,
      turnOutcome: {
        status: 'degraded',
        recoverableErrorCode: normalizeRecoverableErrorCode(dispatchResult.code),
      },
      runtimeDebug,
    };
  }
}

function buildDispatchAction(
  input: ConversationOrchestratorV3HandleTurnInput,
  decision: ConversationOrchestratorV3Decision & {
    dispatchAgent: AgentName;
  },
  suggestion: ConversationOrchestratorV3Suggestion,
): AgentAction {
  switch (decision.dispatchAgent) {
    case 'FaqAgent':
      return {
        type: 'faq.search',
        input: {
          query: input.message,
          sessionId: input.sessionId,
        },
      };
    case 'RecordsAgent':
      if ((input.attachments?.length ?? 0) > 0) {
        return {
          type: 'records.upload',
          input: {
            sessionId: input.sessionId,
            turnId: input.turnId,
            attachments: input.attachments,
          },
        };
      }

      return {
        type: 'records.status',
        input: {
          sessionId: input.sessionId,
        },
      };
    case 'RecommendationAgent':
      return {
        type: 'recommendation.generate',
        input: {
          sessionId: input.sessionId,
          turnId: input.turnId,
          context: {
            message: input.message,
            facts: input.facts ?? {},
            targetStage: decision.to.stage,
            supervisorReason: suggestion.reason,
          },
        },
      };
    case 'ConsultAgent':
      return {
        type: 'consult.status',
        input: {
          sessionId: input.sessionId,
        },
      };
    case 'HandoffAgent':
      return {
        type: 'handoff.create',
        input: {
          sessionId: input.sessionId,
          turnId: input.turnId,
          reason: normalizeReason(suggestion.reason || input.message || 'human handoff requested'),
        },
      };
  }
}

async function queryStatusFallback(
  gateway: Pick<ToolGateway, 'status'>,
  sessionId: string,
): Promise<ToolResult<StatusQueryOutput>> {
  try {
    return await gateway.status.query({ sessionId });
  } catch (error) {
    return {
      status: 'error',
      code: 'UNKNOWN',
      message: error instanceof Error ? error.message : 'status.query fallback failed',
    };
  }
}

function normalizeRecoverableErrorCode(
  code: ToolErrorCode,
): 'TIMEOUT' | 'UPSTREAM_UNAVAILABLE' | 'UNKNOWN' {
  switch (code) {
    case 'TIMEOUT':
    case 'UPSTREAM_UNAVAILABLE':
    case 'UNKNOWN':
      return code;
    default:
      return 'UNKNOWN';
  }
}

function normalizeReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return 'chatbot v3 turn';
  }

  return trimmed.length <= 240 ? trimmed : trimmed.slice(0, 240);
}
