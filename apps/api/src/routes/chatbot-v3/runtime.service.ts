import type {
  AiChatCanonicalTruthPatch,
  AiChatStatusSnapshot,
  ChatJourneyPhase,
  ChatJourneyStage,
} from '@medical-crm/domain';
import {
  CHATBOT_V3_CONVERSATION_SUMMARY_CONTRACT,
  type ChatbotV3ConversationSummaryContract,
  type SupervisorDomainReadResults,
  type MinimalIntakeSeed,
  type SupervisorReadDomain,
} from '@medical-crm/application';
import type { AgentAction, AgentName } from './agents.js';
import { buildRecordsMinimalTriagePrompt } from './records-prompts.js';
import { buildAssistantText } from './response-composer.js';
import {
  AI_CHAT_STATUS_SNAPSHOT_CANONICAL_TRUTH_MAP,
  deriveCanonicalTruthFlagsFromStatusSnapshot,
  deriveCanonicalTruthTruePatchFromStatusSnapshot,
} from '@medical-crm/domain';
import type { RecommendationTask } from './recommendation-prompts.js';
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

export interface ConversationOrchestratorV3BootstrapSignals {
  message: string;
  attachments?: Array<Record<string, unknown>>;
  canCreateHandoff?: boolean;
}

export interface ConversationOrchestratorV3DecisionInput {
  current?: ConversationOrchestratorV3StageRef;
  currentStage?: ChatJourneyStage;
  conversationSummary?: string;
  latestUserMessage?: string;
  intake?: MinimalIntakeSeed;
  availableReadDomains?: readonly SupervisorReadDomain[];
  domainReadResults?: SupervisorDomainReadResults;
  suggestion: ConversationOrchestratorV3Suggestion;
  statusSnapshot?: Partial<AiChatStatusSnapshot> | null;
  facts?: ConversationOrchestratorV3Facts;
  handoff?: ConversationOrchestratorV3HandoffSignals;
  bootstrap?: ConversationOrchestratorV3BootstrapSignals;
}

export interface ConversationOrchestratorV3ConversationSummaryPatch {
  contract: ChatbotV3ConversationSummaryContract;
  statusPatch: Pick<
    AiChatStatusSnapshot,
    'conversationSummary' | 'lastUserMessageAt' | 'lastAssistantMessageAt'
  >;
}

export interface ConversationOrchestratorV3WriteIntents {
  canonicalTruthPatch?: AiChatCanonicalTruthPatch;
  conversationSummaryPatch: ConversationOrchestratorV3ConversationSummaryPatch;
}

export interface ConversationOrchestratorV3RenderState {
  path: 'PROCESS_OVERVIEW' | 'FAQ_ANSWER' | 'STAGE_GUIDANCE';
}

export interface ConversationOrchestratorV3Decision {
  action: 'STAY' | 'ADVANCE' | 'SKIP' | 'HANDOFF';
  from: ConversationOrchestratorV3StageRef;
  to: ConversationOrchestratorV3StageRef;
  dispatchAgent?: AgentName;
  dispatchSource: 'journey-runtime-authority';
  matchedRuleId?: string;
  whyNotSkip?: string;
  write?: {
    authority: 'journey-runtime-authority';
    stage: ConversationOrchestratorV3StageRef;
    factsPatch: Partial<Record<string, boolean>>;
  };
}

export interface ConversationOrchestratorV3HandleTurnInput {
  traceId: string;
  sessionId: string;
  turnId: string;
  message: string;
  attachments?: Array<Record<string, unknown>>;
  pageContext?: {
    type: 'HOSPITAL_DETAIL';
    hospitalId: string;
  };
  current?: ConversationOrchestratorV3StageRef;
  statusSnapshot?: Partial<AiChatStatusSnapshot> | null;
  facts?: ConversationOrchestratorV3Facts;
  intake?: MinimalIntakeSeed;
  handoff?: ConversationOrchestratorV3HandoffSignals;
  bootstrap?: ConversationOrchestratorV3BootstrapSignals;
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
  writeIntents?: ConversationOrchestratorV3WriteIntents;
  runtimeDebug: {
    traceId: string;
    idempotencyKey: string;
    lastDispatchSource?: 'journey-runtime-authority';
  };
  render: ConversationOrchestratorV3RenderState;
}

export interface ConversationOrchestratorV3LlmNodeRunMetadata {
  nodePromptVersion?: string;
  nodeModel?: string;
  fallbackUsed?: boolean;
  schemaValidationFailed?: boolean;
}

export interface ConversationOrchestratorV3IdempotencyExecutor {
  execute<T>(key: string, operation: string, fn: () => Promise<T>): Promise<T>;
}

export interface ConversationOrchestratorV3Supervisor {
  suggest(input: ConversationOrchestratorV3DecisionInput): Promise<ConversationOrchestratorV3Suggestion>;
  requestDomainReads?(input: ConversationOrchestratorV3DecisionInput): Promise<readonly SupervisorReadDomain[]>;
  getLastLlmRunMetadata?(): ConversationOrchestratorV3LlmNodeRunMetadata | null;
}

export interface ConversationOrchestratorV3Orchestrator {
  decide(input: ConversationOrchestratorV3DecisionInput): ConversationOrchestratorV3Decision;
}

export interface ConversationOrchestratorV3AgentExecutor {
  execute(action: AgentAction): Promise<ToolResult<unknown>>;
  getLastLlmRunMetadata?(): ConversationOrchestratorV3LlmNodeRunMetadata | null;
}

export interface ConversationOrchestratorV3RuntimeDependencies {
  idempotency: ConversationOrchestratorV3IdempotencyExecutor;
  supervisor: ConversationOrchestratorV3Supervisor;
  journeyRuntimeAuthority: ConversationOrchestratorV3Orchestrator;
  gateway: Pick<ToolGateway, 'status' | 'records' | 'recommendation' | 'consult' | 'handoff'>;
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
    const supervisorInput = this.buildSupervisorInput(input);
    const decisionInput = this.buildDecisionInput(input);
    this.emitNodeEvent(input, {
      node: 'Supervisor',
      action: 'suggest',
      status: 'started',
      latencyMs: 0,
    });
    const supervisorStartedAt = this.now();

    let suggestion: ConversationOrchestratorV3Suggestion;
    try {
      suggestion = await this.resolveSupervisorSuggestion(input, supervisorInput);
      this.emitNodeEvent(input, {
        node: 'Supervisor',
        action: 'suggest',
        status: 'completed',
        latencyMs: this.elapsedSince(supervisorStartedAt),
        ...this.resolveLlmNodeMetadata(this.dependencies.supervisor),
      });
    } catch (error) {
      this.emitNodeEvent(input, {
        node: 'Supervisor',
        action: 'suggest',
        status: 'failed',
        latencyMs: this.elapsedSince(supervisorStartedAt),
        errorCode: 'UNKNOWN',
        ...this.resolveLlmNodeMetadata(this.dependencies.supervisor),
      });
      throw error;
    }

    this.emitNodeEvent(input, {
      node: 'JourneyRuntimeAuthority',
      action: 'decide',
      status: 'started',
      latencyMs: 0,
    });
    const orchestratorStartedAt = this.now();
    let decision: ConversationOrchestratorV3Decision;
    try {
      decision = this.dependencies.journeyRuntimeAuthority.decide({
        ...decisionInput,
        suggestion,
      });
      this.emitNodeEvent(input, {
        node: 'JourneyRuntimeAuthority',
        action: 'decide',
        status: 'completed',
        latencyMs: this.elapsedSince(orchestratorStartedAt),
      });
    } catch (error) {
      this.emitNodeEvent(input, {
        node: 'JourneyRuntimeAuthority',
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
      lastDispatchSource: 'journey-runtime-authority',
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
        render: {
          path: 'STAGE_GUIDANCE',
        },
      } satisfies ConversationOrchestratorV3TurnResult;
      return this.finalizeTurnResult(
        input,
        decision,
        this.attachWriteIntents(result, input, input.statusSnapshot),
        turnStartedAt,
      );
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
          ...this.resolveLlmNodeMetadata(agent),
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
        ...this.resolveLlmNodeMetadata(agent),
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
        render: {
          path: 'STAGE_GUIDANCE',
        },
      } satisfies ConversationOrchestratorV3TurnResult;
      return this.finalizeTurnResult(
        input,
        decision,
        this.attachWriteIntents(result, input, input.statusSnapshot),
        turnStartedAt,
      );
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
        ...this.resolveLlmNodeMetadata(agent),
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
    const current = input.statusSnapshot
      ? deriveCurrentStageFromStatusSnapshot(input.statusSnapshot)
      : input.current ?? deriveCurrentStageFromStatusSnapshot(input.statusSnapshot);
    return {
      current,
      currentStage: current.stage,
      conversationSummary: input.statusSnapshot?.conversationSummary ?? '',
      latestUserMessage: input.message,
      intake: input.intake,
      availableReadDomains: deriveSupervisorReadDomains(current.stage, input.facts),
      suggestion: input.suggestion ?? {
        intent: 'unknown',
        suggestedStage: current.stage,
        reason: normalizeReason(input.message),
      },
      statusSnapshot: input.statusSnapshot,
      facts: input.facts,
      handoff: input.handoff,
      bootstrap: input.bootstrap,
    };
  }

  private buildSupervisorInput(
    input: ConversationOrchestratorV3HandleTurnInput,
  ): ConversationOrchestratorV3DecisionInput {
    return {
      ...this.buildDecisionInput(input),
      facts: resolveSupervisorFacts(input.statusSnapshot),
    };
  }

  private attachWriteIntents(
    result: ConversationOrchestratorV3TurnResult,
    input: ConversationOrchestratorV3HandleTurnInput,
    statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
  ): ConversationOrchestratorV3TurnResult {
    const render = deriveRenderState(result);
    const renderedResult = {
      ...result,
      render,
    };
    const canonicalTruthPatch = result.turnOutcome.status === 'ok'
      ? deriveCanonicalTruthPatch(statusSnapshot, renderedResult)
      : undefined;

    return {
      ...renderedResult,
      writeIntents: {
        ...(canonicalTruthPatch ? { canonicalTruthPatch } : {}),
        conversationSummaryPatch: buildConversationSummaryPatch({
          result: renderedResult,
          latestUserMessage: input.message,
          summaryUpdatedAt: new Date(this.now()),
        }),
      },
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
      render: {
        path: 'STAGE_GUIDANCE',
      },
    };
  }

  private async resolveSupervisorSuggestion(
    input: ConversationOrchestratorV3HandleTurnInput,
    supervisorInput: ConversationOrchestratorV3DecisionInput,
  ): Promise<ConversationOrchestratorV3Suggestion> {
    const domainReadResults = await this.collectSupervisorReadDomains(input, supervisorInput);
    if (!domainReadResults) {
      return this.dependencies.supervisor.suggest(supervisorInput);
    }

    return this.dependencies.supervisor.suggest({
      ...supervisorInput,
      domainReadResults,
    });
  }

  private async collectSupervisorReadDomains(
    input: ConversationOrchestratorV3HandleTurnInput,
    supervisorInput: ConversationOrchestratorV3DecisionInput,
  ): Promise<SupervisorDomainReadResults | undefined> {
    if (!this.dependencies.supervisor.requestDomainReads) {
      return undefined;
    }

    let availableReadDomains = [...(supervisorInput.availableReadDomains ?? [])];
    if (availableReadDomains.length === 0) {
      return undefined;
    }

    const domainReadResults: SupervisorDomainReadResults = {};

    for (let pass = 0; pass < 2 && availableReadDomains.length > 0; pass += 1) {
      const requestedReadDomains: readonly SupervisorReadDomain[] = await this.dependencies.supervisor
        .requestDomainReads({
          ...supervisorInput,
          availableReadDomains,
          ...(Object.keys(domainReadResults).length > 0 ? { domainReadResults } : {}),
        });
      const nextDomain = requestedReadDomains.find((domain) => availableReadDomains.includes(domain));
      if (!nextDomain) {
        break;
      }

      availableReadDomains = availableReadDomains.filter((domain) => domain !== nextDomain);

      const data = await this.querySingleSupervisorReadDomain(input, nextDomain);
      if (data) {
        domainReadResults[nextDomain] = data;
      }
    }

    return Object.keys(domainReadResults).length > 0 ? domainReadResults : undefined;
  }

  private async querySingleSupervisorReadDomain(
    input: ConversationOrchestratorV3HandleTurnInput,
    domain: SupervisorReadDomain,
  ): Promise<Record<string, unknown> | null> {
    this.emitNodeEvent(input, {
      node: 'Tool',
      action: domain,
      status: 'started',
      latencyMs: 0,
    });
    const startedAt = this.now();

    try {
      const result = await this.runSupervisorReadTool(domain, input.sessionId);
      this.emitNodeEvent(input, {
        node: 'Tool',
        action: domain,
        status: result.status === 'error' ? this.mapErrorStatus(result.code) : 'completed',
        latencyMs: this.elapsedSince(startedAt),
        ...(result.status === 'error' ? { errorCode: result.code } : {}),
      });

      if (result.status === 'error') {
        return null;
      }

      return result.data as Record<string, unknown>;
    } catch {
      this.emitNodeEvent(input, {
        node: 'Tool',
        action: domain,
        status: 'failed',
        latencyMs: this.elapsedSince(startedAt),
        errorCode: 'UNKNOWN',
      });
      return null;
    }
  }

  private runSupervisorReadTool(
    domain: SupervisorReadDomain,
    sessionId: string,
  ): Promise<ToolResult<Record<string, unknown>>> {
    switch (domain) {
      case 'records.status':
        return this.dependencies.gateway.records.status({ sessionId }) as Promise<ToolResult<Record<string, unknown>>>;
      case 'recommendation.status':
        return this.dependencies.gateway.recommendation.status({ sessionId }) as Promise<ToolResult<Record<string, unknown>>>;
      case 'consult.status':
        return this.dependencies.gateway.consult.status({ sessionId }) as Promise<ToolResult<Record<string, unknown>>>;
      case 'handoff.status':
        return this.dependencies.gateway.handoff.status({ sessionId }) as Promise<ToolResult<Record<string, unknown>>>;
    }
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
    const finalizedResult = {
      ...result,
      render: result.render ?? deriveRenderState(result),
    };
    this.emitNodeEvent(input, {
      node: 'Turn',
      action: 'turn_summary',
      status: 'completed',
      latencyMs: this.elapsedSince(turnStartedAt),
      decisionAction: decision.action,
      fromStage: decision.from.stage,
      toStage: decision.to.stage,
      outcomeStatus: finalizedResult.turnOutcome.status,
      degradedErrorCode: finalizedResult.turnOutcome.recoverableErrorCode,
    });
    return finalizedResult;
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

  private resolveLlmNodeMetadata(
    node:
      | ConversationOrchestratorV3Supervisor
      | ConversationOrchestratorV3AgentExecutor,
  ): ConversationOrchestratorV3LlmNodeRunMetadata {
    const metadata = node.getLastLlmRunMetadata?.();
    if (!metadata) {
      return {};
    }

    return {
      ...(metadata.nodePromptVersion ? { nodePromptVersion: metadata.nodePromptVersion } : {}),
      ...(metadata.nodeModel ? { nodeModel: metadata.nodeModel } : {}),
      ...(typeof metadata.fallbackUsed === 'boolean'
        ? { fallbackUsed: metadata.fallbackUsed }
        : {}),
      ...(typeof metadata.schemaValidationFailed === 'boolean'
        ? { schemaValidationFailed: metadata.schemaValidationFailed }
        : {}),
    };
  }

  private mapErrorStatus(
    code: ToolErrorCode,
  ): Extract<ChatbotV3RuntimeNodeStatus, 'failed' | 'timeout'> {
    return code === 'TIMEOUT' ? 'timeout' : 'failed';
  }
}

const SUMMARY_STAGE_SNIPPET_MAX_LENGTH = 40;
const SUMMARY_USER_SNIPPET_MAX_LENGTH = 96;
const SUMMARY_ASSISTANT_SNIPPET_MAX_LENGTH = 120;
const SUMMARY_TOTAL_MAX_LENGTH = 280;

function buildConversationSummaryPatch({
  result,
  latestUserMessage,
  summaryUpdatedAt,
}: {
  result: ConversationOrchestratorV3TurnResult;
  latestUserMessage: string;
  summaryUpdatedAt: Date;
}): ConversationOrchestratorV3ConversationSummaryPatch {
  const conversationSummary = clampConversationSummary([
    `stage=${clampSummaryText(result.journey.stage, SUMMARY_STAGE_SNIPPET_MAX_LENGTH)}`,
    `user=${clampSummaryText(latestUserMessage, SUMMARY_USER_SNIPPET_MAX_LENGTH)}`,
    `assistant=${clampSummaryText(buildAssistantText(result), SUMMARY_ASSISTANT_SNIPPET_MAX_LENGTH)}`,
  ].join(' | '));

  return {
    contract: CHATBOT_V3_CONVERSATION_SUMMARY_CONTRACT,
    statusPatch: {
      conversationSummary,
      lastUserMessageAt: summaryUpdatedAt,
      lastAssistantMessageAt: summaryUpdatedAt,
    },
  };
}

function clampConversationSummary(value: string): string {
  return value.length <= SUMMARY_TOTAL_MAX_LENGTH
    ? value
    : `${value.slice(0, SUMMARY_TOTAL_MAX_LENGTH - 3).trimEnd()}...`;
}

function clampSummaryText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function deriveSupervisorReadDomains(
  currentStage: ChatJourneyStage,
  facts: ConversationOrchestratorV3Facts | undefined,
): readonly SupervisorReadDomain[] {
  if (currentStage === 'HUMAN_HANDOFF' || facts?.['handoff.active'] === true) {
    return ['handoff.status'];
  }

  if (
    currentStage === 'ONLINE_CONSULT'
    || facts?.['consult.completed'] === true
    || facts?.['consult.scheduled'] === true
  ) {
    return ['consult.status'];
  }

  if (currentStage === 'RECOMMENDATION') {
    return facts?.['recommendation.selected'] === true
      ? ['recommendation.status', 'consult.status']
      : ['recommendation.status'];
  }

  if (currentStage === 'COLLECT_MEDICAL_INPUTS') {
    return ['records.status', 'consult.status'];
  }

  if (
    currentStage === 'COLLECT_MINIMAL_MEDICAL_FACTS'
    && facts?.['records.minimal_triage.complete'] === true
  ) {
    return ['records.status', 'recommendation.status'];
  }

  return ['records.status'];
}

function resolveSupervisorFacts(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): ConversationOrchestratorV3Facts {
  const truthFlags = deriveCanonicalTruthFlagsFromStatusSnapshot(statusSnapshot);

  return {
    'records.minimal_triage.complete': truthFlags['records.minimal_triage.complete'],
    'process.explained': truthFlags['process.explained'],
    'recommendation.generated': truthFlags['recommendation.generated'],
    'recommendation.selected': truthFlags['recommendation.selected'],
    'consult.completed': truthFlags['consult.completed'],
    'handoff.active': truthFlags['handoff.active'],
  };
}

export function deriveCurrentStageFromStatusSnapshot(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): ConversationOrchestratorV3StageRef {
  if (hasActiveHandoffStatus(statusSnapshot) || hasCrisisSafetySignal(statusSnapshot)) {
    return { stage: 'HUMAN_HANDOFF', phase: 'active' };
  }

  const canonicalTruthFlags = deriveCanonicalTruthFlagsFromStatusSnapshot(statusSnapshot);
  if (!canonicalTruthFlags['records.minimal_triage.complete']) {
    return {
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'active',
    };
  }

  const storedJourney = readStoredJourneySnapshot(statusSnapshot);
  if (storedJourney) {
    return storedJourney;
  }

  return {
    stage: 'RECOMMENDATION',
    phase: 'active',
  };
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
          hospitalId: input.pageContext?.type === 'HOSPITAL_DETAIL'
            ? input.pageContext.hospitalId
            : undefined,
        },
        meta,
      };
    case 'RecordsAgent':
      if (
        (input.attachments?.length ?? 0) > 0
        && decision.to.stage !== 'COLLECT_MINIMAL_MEDICAL_FACTS'
      ) {
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
  const recommendationTask = decision.dispatchAgent === 'RecommendationAgent'
    ? resolveRecommendationTask(input.message, decision)
    : null;
  const contextLines = [
    `agent=${decision.dispatchAgent}`,
    `from=${decision.from.stage}`,
    `to=${decision.to.stage}`,
    `intent=${suggestion.intent}`,
    `supervisor_reason=${normalizeReason(suggestion.reason)}`,
    `facts=${factsSummary}`,
    recommendationTask ? `recommendation_task=${recommendationTask}` : '',
    `goal=${buildTaskGoal(decision.dispatchAgent, decision, recommendationTask ?? undefined)}`,
    `latest_user_message=${normalizeReason(input.message)}`,
  ].filter((line) => line.length > 0);

  const taskPrompt = contextLines.join('\n');

  if (decision.dispatchAgent === 'RecordsAgent' && resolveRecordsWorkerMode(decision) === 'minimal_triage') {
    return buildRecordsMinimalTriagePrompt(taskPrompt);
  }

  return taskPrompt;
}

function buildTaskGoal(
  agentName: AgentName,
  decision?: ConversationOrchestratorV3Decision & { dispatchAgent: AgentName },
  recommendationTask?: RecommendationTask,
): string {
  switch (agentName) {
    case 'FaqAgent':
      return "Answer the user's FAQ using the FAQ toolset only.";
    case 'RecordsAgent':
      return resolveRecordsWorkerMode(decision) === 'medical_collection'
        ? 'Continue medical records collection by asking for existing reports, scans, pathology, medications, and treatment history while preserving records.minimal_triage.complete.'
        : 'Complete minimal medical triage by asking the 3 key medical questions, continuing with records-stage follow-up when answers are incomplete or insufficient, and only exposing records.minimal_triage.complete to the supervisor.';
    case 'RecommendationAgent':
      switch (recommendationTask) {
        case 'refresh':
          return 'Refresh grounded hospital recommendations, keep the output small, explain or compare only when requested, and do not mutate records, consult, or handoff state.';
        case 'revisit':
          return 'Revisit grounded hospital recommendations from a later stage, keep the output small, explain or compare only when requested, and do not mutate records, consult, or handoff state.';
        case 'compare':
          return 'Compare the current grounded hospital recommendations briefly, keep the output small, and do not mutate records, consult, or handoff state.';
        case 'explain':
          return 'Explain the current grounded hospital recommendations briefly, keep the output small, and do not mutate records, consult, or handoff state.';
        case 'generate':
        default:
          return 'Generate grounded hospital recommendations now that minimal triage is complete, keep the output small, explain or compare only when requested, and do not mutate records, consult, or handoff state.';
      }
    case 'ConsultAgent':
      return 'Handle the consult task using the consult toolset only.';
    case 'HandoffAgent':
      return 'Handle the handoff task using the handoff toolset only.';
  }
}

function resolveRecommendationTask(
  latestUserMessage: string,
  decision: ConversationOrchestratorV3Decision & { dispatchAgent: AgentName },
): RecommendationTask {
  const normalized = latestUserMessage.toLowerCase();
  const isRecommendationConversation = decision.from.stage === 'RECOMMENDATION' || decision.to.stage === 'RECOMMENDATION';
  const explicitRecommendationContext = /\b(hospital|hospitals|recommendation|recommendations|option|options|clinic|clinics|suitable|fit|choice|choices)\b/.test(normalized);
  const deicticRecommendationReference = /\b(this|these|them|those|which|best|better|one|ones|two)\b/.test(normalized);
  const recommendationContextRequested = explicitRecommendationContext
    || (isRecommendationConversation && deicticRecommendationReference);

  if (/\b(compare|comparison|versus|vs)\b/.test(normalized) && recommendationContextRequested) {
    return 'compare';
  }

  if (isRecommendationConversation && /\b(which|best|better)\b/.test(normalized) && recommendationContextRequested) {
    return 'compare';
  }

  if (/\b(explain|why|reason)\b/.test(normalized) && recommendationContextRequested) {
    return 'explain';
  }

  if (decision.from.stage === 'RECOMMENDATION' && decision.to.stage === 'RECOMMENDATION') {
    return 'refresh';
  }

  if (
    decision.to.stage === 'RECOMMENDATION'
    && !['COLLECT_MINIMAL_MEDICAL_FACTS', 'COLLECT_MEDICAL_INPUTS'].includes(decision.from.stage)
  ) {
    return 'revisit';
  }

  return 'generate';
}

function resolveRecordsWorkerMode(
  decision: ConversationOrchestratorV3Decision & { dispatchAgent: AgentName } | undefined,
): 'minimal_triage' | 'medical_collection' {
  if (!decision) {
    return 'minimal_triage';
  }

  return decision.to.stage === 'COLLECT_MEDICAL_INPUTS' || decision.from.stage === 'COLLECT_MEDICAL_INPUTS'
    ? 'medical_collection'
    : 'minimal_triage';
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

function deriveCanonicalTruthPatch(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
  result: ConversationOrchestratorV3TurnResult,
) {
  const patch: AiChatCanonicalTruthPatch = deriveCanonicalTruthTruePatchFromStatusSnapshot(statusSnapshot);
  const currentTruthByField = asRecord(statusSnapshot);

  const authorityFactsPatch = result.decision.write?.factsPatch ?? {};
  for (const [canonicalKey, value] of Object.entries(authorityFactsPatch)) {
    if (value !== true) {
      continue;
    }

    if (canonicalKey === 'process.explained' && result.render.path !== 'PROCESS_OVERVIEW') {
      continue;
    }

    const fieldName = AI_CHAT_STATUS_SNAPSHOT_CANONICAL_TRUTH_MAP[
      canonicalKey as keyof typeof AI_CHAT_STATUS_SNAPSHOT_CANONICAL_TRUTH_MAP
    ];
    if (!fieldName || currentTruthByField[fieldName] === true) {
      continue;
    }

    patch[fieldName] = true;
  }

  if (result.dispatchResult?.status !== 'ok') {
    return patch;
  }

  const dispatchData = asRecord(result.dispatchResult.data);
  for (const [canonicalKey, fieldName] of Object.entries(AI_CHAT_STATUS_SNAPSHOT_CANONICAL_TRUTH_MAP)) {
    if (canonicalKey === 'process.explained') {
      continue;
    }
    if (dispatchData[canonicalKey] !== true || currentTruthByField[fieldName] === true) {
      continue;
    }

    patch[fieldName] = true;
  }

  return patch;
}

function deriveRenderState(
  result: ConversationOrchestratorV3TurnResult,
) {
  if (result.turnOutcome.status !== 'ok') {
    return {
      path: 'STAGE_GUIDANCE',
    } satisfies ConversationOrchestratorV3RenderState;
  }

  if (hasStructuredFaqAnswer(result)) {
    return {
      path: 'FAQ_ANSWER',
    } satisfies ConversationOrchestratorV3RenderState;
  }

  if (
    result.journey.stage === 'EXPLAIN_PROCESS'
    && !isDeniedSemanticHandoff(result)
  ) {
    return {
      path: 'PROCESS_OVERVIEW',
    } satisfies ConversationOrchestratorV3RenderState;
  }

  return {
    path: 'STAGE_GUIDANCE',
  } satisfies ConversationOrchestratorV3RenderState;
}

function isDeniedSemanticHandoff(
  result: ConversationOrchestratorV3TurnResult,
): boolean {
  return result.suggestion.intent === 'handoff'
    && result.decision.action !== 'HANDOFF'
    && result.journey.stage !== 'HUMAN_HANDOFF';
}

function hasStructuredFaqAnswer(
  result: ConversationOrchestratorV3TurnResult,
): boolean {
  if (result.decision.dispatchAgent !== 'FaqAgent') {
    return false;
  }

  if (result.dispatchResult?.status !== 'ok') {
    return false;
  }

  const data = asRecord(result.dispatchResult.data);
  const answer = asString(data['answer']);
  const confidence = asString(data['confidence']);
  const citedFaqIds = asArray(data['citedFaqIds'])
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);

  return Boolean(answer && confidence !== 'low' && citedFaqIds.length > 0);
}

function hasActiveHandoffStatus(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): boolean {
  return deriveCanonicalTruthFlagsFromStatusSnapshot(statusSnapshot)['handoff.active'];
}

function hasCrisisSafetySignal(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): boolean {
  return normalizeStatus(statusSnapshot?.riskLevel) === 'CRISIS';
}

function readStoredJourneySnapshot(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): ConversationOrchestratorV3StageRef | null {
  const record = asRecord(statusSnapshot);
  const chatbotV2 = asRecord(record['chatbot_v2'] ?? record['chatbotV2']);
  const journey = asRecord(
    chatbotV2['journey_snapshot']
      ?? chatbotV2['journeySnapshot']
      ?? record['journey_snapshot']
      ?? record['journeySnapshot'],
  );

  const stage = asString(journey['current_stage'] ?? journey['currentStage']);
  const phase = asString(journey['current_phase'] ?? journey['currentPhase']);

  if (!isStage(stage) || !isPhase(phase)) {
    return null;
  }

  return { stage, phase };
}

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function isStage(value: string | null): value is ChatJourneyStage {
  return value === 'EXPLAIN_PROCESS'
    || value === 'COLLECT_MINIMAL_MEDICAL_FACTS'
    || value === 'COLLECT_MEDICAL_INPUTS'
    || value === 'RECOMMENDATION'
    || value === 'ONLINE_CONSULT'
    || value === 'HUMAN_HANDOFF';
}

function isPhase(value: string | null): value is ChatJourneyPhase {
  return value === 'pre' || value === 'active' || value === 'post';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
