import type { ChatJourneyPhase, ChatJourneyStage } from '@medical-crm/domain';
import type { AgentAction, AgentName } from './agents.js';
import type {
  ChatbotV3RuntimeNodeEventEmitter,
  ChatbotV3RuntimeNodeEventInput,
  ChatbotV3RuntimeNodeStatus,
} from './observability.js';
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
  traceId: string;
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
    traceId: string;
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
  nodeEventEmitter?: Pick<ChatbotV3RuntimeNodeEventEmitter, 'emit'>;
  now?: () => number;
}

export class ConversationOrchestratorV3RuntimeService {
  private readonly inflightTurns = new Map<string, Promise<ConversationOrchestratorV3TurnResult>>();
  private readonly now: () => number;

  constructor(
    private readonly dependencies: ConversationOrchestratorV3RuntimeDependencies,
  ) {
    this.now = dependencies.now ?? (() => Date.now());
  }

  handleTurn(input: ConversationOrchestratorV3HandleTurnInput): Promise<ConversationOrchestratorV3TurnResult> {
    const idempotencyKey = `${input.sessionId}:${input.turnId}:chatbot-v3-turn`;
    const inflightTurn = this.inflightTurns.get(idempotencyKey);

    if (inflightTurn) {
      return inflightTurn;
    }

    const turnPromise = this.dependencies.idempotency.execute(
      idempotencyKey,
      'chatbot_v3_turn',
      () => this.runTurnPipeline(input, idempotencyKey),
    );

    this.inflightTurns.set(idempotencyKey, turnPromise);
    void turnPromise.finally(() => {
      if (this.inflightTurns.get(idempotencyKey) === turnPromise) {
        this.inflightTurns.delete(idempotencyKey);
      }
    });

    return turnPromise;
  }

  private async runTurnPipeline(
    input: ConversationOrchestratorV3HandleTurnInput,
    idempotencyKey: string,
  ): Promise<ConversationOrchestratorV3TurnResult> {
    const turnStartedAt = this.now();
    const supervisorInput = this.buildDecisionInput(input);
    this.emitNodeEvent(input, {
      node: 'Supervisor',
      action: 'suggest',
      status: 'started',
      latencyMs: 0,
    });
    const supervisorStartedAt = this.now();

    let suggestion: ConversationOrchestratorV3Suggestion;
    try {
      suggestion = await this.dependencies.supervisor.suggest(supervisorInput);
      this.emitNodeEvent(input, {
        node: 'Supervisor',
        action: 'suggest',
        status: 'completed',
        latencyMs: this.elapsedSince(supervisorStartedAt),
      });
    } catch (error) {
      this.emitNodeEvent(input, {
        node: 'Supervisor',
        action: 'suggest',
        status: 'failed',
        latencyMs: this.elapsedSince(supervisorStartedAt),
        errorCode: 'UNKNOWN',
      });
      throw error;
    }

    this.emitNodeEvent(input, {
      node: 'Orchestrator',
      action: 'decide',
      status: 'started',
      latencyMs: 0,
    });
    const orchestratorStartedAt = this.now();
    let decision: ConversationOrchestratorV3Decision;
    try {
      decision = this.dependencies.orchestrator.decide({
        ...supervisorInput,
        suggestion,
      });
      this.emitNodeEvent(input, {
        node: 'Orchestrator',
        action: 'decide',
        status: 'completed',
        latencyMs: this.elapsedSince(orchestratorStartedAt),
      });
    } catch (error) {
      this.emitNodeEvent(input, {
        node: 'Orchestrator',
        action: 'decide',
        status: 'failed',
        latencyMs: this.elapsedSince(orchestratorStartedAt),
        errorCode: 'UNKNOWN',
      });
      throw error;
    }

    const runtimeDebug = {
      traceId: input.traceId,
      idempotencyKey,
      lastDispatchSource: decision.dispatchSource,
    } satisfies ConversationOrchestratorV3TurnResult['runtimeDebug'];

    if (!decision.dispatchAgent) {
      const result = {
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
      } satisfies ConversationOrchestratorV3TurnResult;
      return this.finalizeTurnResult(input, decision, result, turnStartedAt);
    }

    const agent = this.dependencies.agents[decision.dispatchAgent];
    if (!agent) {
      this.emitNodeEvent(input, {
        node: 'Subagent',
        action: decision.dispatchAgent,
        status: 'failed',
        latencyMs: 0,
        errorCode: 'UPSTREAM_UNAVAILABLE',
      });
      this.emitNodeEvent(input, {
        node: 'Tool',
        action: 'unknown_tool_for_agent',
        status: 'failed',
        latencyMs: 0,
        errorCode: 'UPSTREAM_UNAVAILABLE',
      });
      const degraded = await this.buildDegradedResult({
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
      return this.finalizeTurnResult(input, decision, degraded, turnStartedAt);
    }

    const dispatchAction = buildDispatchAction(input, decision as ConversationOrchestratorV3Decision & {
      dispatchAgent: AgentName;
    }, suggestion);
    this.emitNodeEvent(input, {
      node: 'Subagent',
      action: decision.dispatchAgent,
      status: 'started',
      latencyMs: 0,
    });
    const subagentStartedAt = this.now();
    this.emitNodeEvent(input, {
      node: 'Tool',
      action: dispatchAction.type,
      status: 'started',
      latencyMs: 0,
    });
    const toolStartedAt = this.now();

    try {
      const dispatchResult = await agent.execute(dispatchAction);

      if (dispatchResult.status === 'error') {
        const status = this.mapErrorStatus(dispatchResult.code);
        this.emitNodeEvent(input, {
          node: 'Tool',
          action: dispatchAction.type,
          status,
          latencyMs: this.elapsedSince(toolStartedAt),
          errorCode: dispatchResult.code,
        });
        this.emitNodeEvent(input, {
          node: 'Subagent',
          action: decision.dispatchAgent,
          status,
          latencyMs: this.elapsedSince(subagentStartedAt),
          errorCode: dispatchResult.code,
        });
        const degraded = await this.buildDegradedResult({
          input,
          suggestion,
          decision,
          dispatchResult,
          runtimeDebug,
        });
        return this.finalizeTurnResult(input, decision, degraded, turnStartedAt);
      }

      this.emitNodeEvent(input, {
        node: 'Tool',
        action: dispatchAction.type,
        status: 'completed',
        latencyMs: this.elapsedSince(toolStartedAt),
      });
      this.emitNodeEvent(input, {
        node: 'Subagent',
        action: decision.dispatchAgent,
        status: 'completed',
        latencyMs: this.elapsedSince(subagentStartedAt),
      });

      const result = {
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
      } satisfies ConversationOrchestratorV3TurnResult;
      return this.finalizeTurnResult(input, decision, result, turnStartedAt);
    } catch (error) {
      this.emitNodeEvent(input, {
        node: 'Tool',
        action: dispatchAction.type,
        status: 'failed',
        latencyMs: this.elapsedSince(toolStartedAt),
        errorCode: 'UNKNOWN',
      });
      this.emitNodeEvent(input, {
        node: 'Subagent',
        action: decision.dispatchAgent,
        status: 'failed',
        latencyMs: this.elapsedSince(subagentStartedAt),
        errorCode: 'UNKNOWN',
      });
      const degraded = await this.buildDegradedResult({
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
      return this.finalizeTurnResult(input, decision, degraded, turnStartedAt);
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
    const fallbackStatus = await this.queryStatusFallback(input);

    return {
      suggestion,
      decision,
      journey: cloneStageRef(decision.from),
      dispatchResult,
      fallbackStatus,
      turnOutcome: {
        status: 'degraded',
        recoverableErrorCode: normalizeRecoverableErrorCode(dispatchResult.code),
      },
      runtimeDebug,
    };
  }

  private async queryStatusFallback(
    input: ConversationOrchestratorV3HandleTurnInput,
  ): Promise<ToolResult<StatusQueryOutput>> {
    this.emitNodeEvent(input, {
      node: 'Tool',
      action: 'status.query',
      status: 'started',
      latencyMs: 0,
    });
    const startedAt = this.now();

    try {
      const result = await this.dependencies.gateway.status.query({ sessionId: input.sessionId });
      this.emitNodeEvent(input, {
        node: 'Tool',
        action: 'status.query',
        status: result.status === 'error' ? this.mapErrorStatus(result.code) : 'completed',
        latencyMs: this.elapsedSince(startedAt),
        ...(result.status === 'error' ? { errorCode: result.code } : {}),
      });
      return result;
    } catch (error) {
      this.emitNodeEvent(input, {
        node: 'Tool',
        action: 'status.query',
        status: 'failed',
        latencyMs: this.elapsedSince(startedAt),
        errorCode: 'UNKNOWN',
      });
      return {
        status: 'error',
        code: 'UNKNOWN',
        message: error instanceof Error ? error.message : 'status.query fallback failed',
      };
    }
  }

  private finalizeTurnResult(
    input: ConversationOrchestratorV3HandleTurnInput,
    decision: ConversationOrchestratorV3Decision,
    result: ConversationOrchestratorV3TurnResult,
    turnStartedAt: number,
  ): ConversationOrchestratorV3TurnResult {
    this.emitNodeEvent(input, {
      node: 'Turn',
      action: 'turn_summary',
      status: 'completed',
      latencyMs: this.elapsedSince(turnStartedAt),
      decisionAction: decision.action,
      fromStage: decision.from.stage,
      toStage: decision.to.stage,
      outcomeStatus: result.turnOutcome.status,
      degradedErrorCode: result.turnOutcome.recoverableErrorCode,
    });
    return result;
  }

  private emitNodeEvent(
    input: ConversationOrchestratorV3HandleTurnInput,
    event: Omit<ChatbotV3RuntimeNodeEventInput, 'traceId' | 'sessionId' | 'turnId'>,
  ): void {
    this.dependencies.nodeEventEmitter?.emit({
      traceId: input.traceId,
      sessionId: input.sessionId,
      turnId: input.turnId,
      ...event,
    });
  }

  private elapsedSince(startAt: number): number {
    return Math.max(0, this.now() - startAt);
  }

  private mapErrorStatus(
    code: ToolErrorCode,
  ): Extract<ChatbotV3RuntimeNodeStatus, 'failed' | 'timeout'> {
    return code === 'TIMEOUT' ? 'timeout' : 'failed';
  }
}

const FACTS_SNIPPET_MAX_ENTRIES = 6;

function buildDispatchAction(
  input: ConversationOrchestratorV3HandleTurnInput,
  decision: ConversationOrchestratorV3Decision & {
    dispatchAgent: AgentName;
  },
  suggestion: ConversationOrchestratorV3Suggestion,
): AgentAction {
  const meta = {
    taskPrompt: buildTaskPrompt(input, decision, suggestion),
  } satisfies NonNullable<AgentAction['meta']>;

  switch (decision.dispatchAgent) {
    case 'FaqAgent':
      return {
        type: 'faq.answer',
        input: {
          latestUserMessage: input.message,
          sessionId: input.sessionId,
        },
        meta,
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
          meta,
        };
      }

      return {
        type: 'records.status',
        input: {
          sessionId: input.sessionId,
        },
        meta,
      };
    case 'RecommendationAgent':
      return {
        type: 'recommendation.generate',
        input: {
          sessionId: input.sessionId,
          turnId: input.turnId,
        },
        meta,
      };
    case 'ConsultAgent':
      return {
        type: 'consult.status',
        input: {
          sessionId: input.sessionId,
        },
        meta,
      };
    case 'HandoffAgent':
      return {
        type: 'handoff.create',
        input: {
          sessionId: input.sessionId,
          turnId: input.turnId,
          reason: normalizeReason(suggestion.reason || input.message || 'human handoff requested'),
        },
        meta,
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

function buildTaskPrompt(
  input: ConversationOrchestratorV3HandleTurnInput,
  decision: ConversationOrchestratorV3Decision & { dispatchAgent: AgentName },
  suggestion: ConversationOrchestratorV3Suggestion,
): string {
  const factsSummary = summarizeFacts(input.facts);
  const contextLines = [
    `agent=${decision.dispatchAgent}`,
    `from=${decision.from.stage}`,
    `to=${decision.to.stage}`,
    `intent=${suggestion.intent}`,
    `supervisor_reason=${normalizeReason(suggestion.reason)}`,
    `facts=${factsSummary}`,
    `goal=${buildTaskGoal(decision.dispatchAgent)}`,
    `latest_user_message=${normalizeReason(input.message)}`,
  ].filter((line) => line.length > 0);

  return contextLines.join('\n');
}

function buildTaskGoal(agentName: AgentName): string {
  switch (agentName) {
    case 'FaqAgent':
      return "Answer the user's FAQ using the FAQ toolset only.";
    case 'RecordsAgent':
      return 'Handle the records task using the records toolset only.';
    case 'RecommendationAgent':
      return 'Handle the recommendation task using the recommendation toolset only.';
    case 'ConsultAgent':
      return 'Handle the consult task using the consult toolset only.';
    case 'HandoffAgent':
      return 'Handle the handoff task using the handoff toolset only.';
  }
}

function summarizeFacts(facts: ConversationOrchestratorV3Facts | undefined): string {
  if (!facts) {
    return 'none';
  }

  const entries = Object.entries(facts)
    .slice(0, FACTS_SNIPPET_MAX_ENTRIES)
    .map(([key, value]) => `${key}:${String(value)}`);
  return entries.length > 0 ? entries.join(',') : 'none';
}

function cloneStageRef(
  stageRef: ConversationOrchestratorV3StageRef,
): ConversationOrchestratorV3StageRef {
  return {
    stage: stageRef.stage,
    phase: stageRef.phase,
  };
}
