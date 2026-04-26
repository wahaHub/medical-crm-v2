import type {
  AiChatCanonicalTruthPatch,
  AiChatStatusSnapshot,
  ChatJourneyPhase,
  ChatJourneyStage,
  PatientSite,
} from '@medical-crm/domain';
import {
  CHATBOT_V3_CONVERSATION_SUMMARY_CONTRACT,
  type ChatbotV3ConversationSummaryContract,
  type ChatbotV3FaqResolution,
  type ChatbotV3ReplayLineage,
  buildReadPlan,
  type MinimalIntakeSeed,
  normalizeFactsFromStatusSnapshot,
  projectLegacyCompatibilityView,
  reduceJourney,
  resolveNextActionExecution,
  type SupervisorDecisionLineage,
  type SupervisorDomainReadResults,
  type SupervisorEvent,
  type SupervisorReadDomain,
} from '@medical-crm/application';
import type { AgentAction, AgentName } from './agents.js';
import { buildAssistantText, buildEffectiveStatusSnapshot } from './response-composer.js';
import {
  AI_CHAT_STATUS_SNAPSHOT_CANONICAL_TRUTH_MAP,
  deriveCanonicalTruthFlagsFromStatusSnapshot,
  deriveCanonicalTruthTruePatchFromStatusSnapshot,
  normalizeSupportingDocuments,
} from '@medical-crm/domain';
import type {
  FaqWorkerTask,
  RecommendationTask,
  RecommendationWorkerTask,
  RecordsWorkerTask,
  WorkerTask,
} from './worker-task.js';
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
import type { ChatbotV3ChatAction } from '@medical-crm/validation';

const CANONICAL_JOURNEY_ORDER: ChatJourneyStage[] = [
  'COLLECT_MINIMAL_MEDICAL_FACTS',
  'RECOMMENDATION',
  'EXPLAIN_PROCESS',
  'COLLECT_MEDICAL_INPUTS',
  'ONLINE_CONSULT',
  'HUMAN_HANDOFF',
];

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
  current: ConversationOrchestratorV3StageRef;
  currentStage?: ChatJourneyStage;
  journeyCurrentStage?: ChatJourneyStage;
  journeyCurrentPhase?: AiChatStatusSnapshot['journeyCurrentPhase'];
  minimalTriageStatus?: AiChatStatusSnapshot['minimalTriageStatus'];
  minimalTriageAnswersSummary?: string | null;
  minimalTriageComplete?: boolean | null;
  recommendationSelectionStatus?: AiChatStatusSnapshot['recommendationSelectionStatus'];
  recommendationSelectedHospitalIds?: string[] | null;
  supportingDocuments?: AiChatStatusSnapshot['supportingDocuments'];
  conversationSummary?: string;
  latestUserMessage?: string;
  userAction?: ChatbotV3ChatAction;
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
  statusPatch?: Partial<AiChatStatusSnapshot>;
  canonicalTruthPatch?: AiChatCanonicalTruthPatch;
  conversationSummaryPatch: ConversationOrchestratorV3ConversationSummaryPatch;
}

export interface ConversationOrchestratorV3RenderState {
  path:
    | 'PROCESS_OVERVIEW'
    | 'FAQ_ANSWER'
    | 'FAQ_MISS'
    | 'SAFE_MEDICAL_REDIRECT'
    | 'OUT_OF_SCOPE_REDIRECT'
    | 'STAGE_GUIDANCE';
}

export interface ConversationOrchestratorV3Decision {
  action: 'STAY' | 'ADVANCE' | 'SKIP' | 'HANDOFF';
  from: ConversationOrchestratorV3StageRef;
  to: ConversationOrchestratorV3StageRef;
  dispatchAgent?: AgentName | null;
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
  site: PatientSite;
  turnId: string;
  message: string;
  userAction?: ChatbotV3ChatAction;
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
  faqResolution?: ChatbotV3FaqResolution;
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
    replayLineage?: ChatbotV3ReplayLineage;
  };
  render: ConversationOrchestratorV3RenderState;
}

interface ConversationOrchestratorV3SupervisorReadDomainCollection {
  domainReadResults?: SupervisorDomainReadResults;
  replayLineage?: Pick<
    ChatbotV3ReplayLineage,
    'supervisorReadDomainRequests' | 'supervisorReadDomainsResolved'
  >;
}

interface ConversationOrchestratorV3NormalizedTurnInput extends ConversationOrchestratorV3HandleTurnInput {
  message: string;
  statusSnapshot?: Partial<AiChatStatusSnapshot> | null;
  facts?: ConversationOrchestratorV3Facts;
  normalizedActionStatusPatch?: Partial<AiChatStatusSnapshot>;
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
  extractEvent?(input: ConversationOrchestratorV3DecisionInput): Promise<SupervisorEvent>;
  requestDomainReads?(input: ConversationOrchestratorV3DecisionInput): Promise<readonly SupervisorReadDomain[]>;
  deriveDecisionLineage?(input: ConversationOrchestratorV3DecisionInput): SupervisorDecisionLineage | null;
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

export class InvalidChatbotV3ActionError extends Error {
  readonly code = 'INVALID_ACTION_STATE';
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = 'InvalidChatbotV3ActionError';
  }
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
    void turnPromise.then(() => {
      if (this.inflightTurns.get(idempotencyKey) === turnPromise) {
        this.inflightTurns.delete(idempotencyKey);
      }
    }, () => {
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
    const normalizedInput = normalizeStructuredUserAction(input);
    const turnStartedAt = this.now();
    const supervisorInput = this.buildSupervisorInput(normalizedInput);
    const decisionInput = this.buildDecisionInput(normalizedInput);

    if (this.dependencies.supervisor.extractEvent) {
      return this.runReducerTurnPipeline({
        normalizedInput,
        supervisorInput,
        decisionInput,
        idempotencyKey,
        turnStartedAt,
      });
    }

    this.emitNodeEvent(normalizedInput, {
      node: 'Supervisor',
      action: 'suggest',
      status: 'started',
      latencyMs: 0,
    });
    const supervisorStartedAt = this.now();

    let suggestion: ConversationOrchestratorV3Suggestion;
    let supervisorReplayLineage: ChatbotV3ReplayLineage | undefined;
    let supervisorReadDomainCollection: ConversationOrchestratorV3SupervisorReadDomainCollection | undefined;
    let supervisorDecisionLineage: SupervisorDecisionLineage | null | undefined;
    try {
      supervisorReadDomainCollection = await this.collectSupervisorReadDomains(normalizedInput, supervisorInput);
      const supervisorSuggestInput = supervisorReadDomainCollection.domainReadResults
        ? {
            ...supervisorInput,
            domainReadResults: supervisorReadDomainCollection.domainReadResults,
          }
        : supervisorInput;
      supervisorDecisionLineage = this.dependencies.supervisor.deriveDecisionLineage?.(
        supervisorSuggestInput,
      ) ?? null;
      suggestion = await this.dependencies.supervisor.suggest(supervisorSuggestInput);
      supervisorReplayLineage = this.buildSupervisorReplayLineage(
        supervisorReadDomainCollection,
        supervisorDecisionLineage,
      );
      this.emitNodeEvent(normalizedInput, {
        node: 'Supervisor',
        action: 'suggest',
        status: 'completed',
        latencyMs: this.elapsedSince(supervisorStartedAt),
        ...(supervisorReplayLineage ? { replayLineage: supervisorReplayLineage } : {}),
        ...this.resolveLlmNodeMetadata(this.dependencies.supervisor),
      });
    } catch (error) {
      const supervisorFailureReplayLineage = this.buildSupervisorReplayLineage(
        supervisorReadDomainCollection,
        supervisorDecisionLineage,
      );
      this.emitNodeEvent(normalizedInput, {
        node: 'Supervisor',
        action: 'suggest',
        status: 'failed',
        latencyMs: this.elapsedSince(supervisorStartedAt),
        errorCode: 'UNKNOWN',
        ...(supervisorFailureReplayLineage ? { replayLineage: supervisorFailureReplayLineage } : {}),
        ...this.resolveLlmNodeMetadata(this.dependencies.supervisor),
      });
      throw error;
    }

    this.emitNodeEvent(normalizedInput, {
      node: 'JourneyRuntimeAuthority',
      action: 'decide',
      status: 'started',
      latencyMs: 0,
    });
    const orchestratorStartedAt = this.now();
    let decision: ConversationOrchestratorV3Decision;
    try {
      const authorityDecision = this.dependencies.journeyRuntimeAuthority.decide({
        ...decisionInput,
        suggestion,
      });
      decision = preserveLaterStageSidePathDetour(authorityDecision, decisionInput.current, suggestion);
      const authorityReplayLineage = compactReplayLineage({
        ...supervisorReplayLineage,
        ...(decision.matchedRuleId ? { matchedRuleId: decision.matchedRuleId } : {}),
      });
      this.emitNodeEvent(normalizedInput, {
        node: 'JourneyRuntimeAuthority',
        action: 'decide',
        status: 'completed',
        latencyMs: this.elapsedSince(orchestratorStartedAt),
        ...(authorityReplayLineage ? { replayLineage: authorityReplayLineage } : {}),
      });
    } catch (error) {
      const authorityFailureReplayLineage = compactReplayLineage({
        ...(supervisorReplayLineage ?? {}),
      });
      this.emitNodeEvent(normalizedInput, {
        node: 'JourneyRuntimeAuthority',
        action: 'decide',
        status: 'failed',
        latencyMs: this.elapsedSince(orchestratorStartedAt),
        errorCode: 'UNKNOWN',
        ...(authorityFailureReplayLineage ? { replayLineage: authorityFailureReplayLineage } : {}),
      });
      throw error;
    }

    const replayLineage = compactReplayLineage({
      ...supervisorReplayLineage,
      ...(decision.matchedRuleId ? { matchedRuleId: decision.matchedRuleId } : {}),
    });

    const runtimeDebug = {
      traceId: input.traceId,
      idempotencyKey,
      lastDispatchSource: 'journey-runtime-authority',
      ...(replayLineage ? { replayLineage } : {}),
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
          path: decision.dispatchAgent === null && decision.to.stage === 'EXPLAIN_PROCESS'
            ? 'PROCESS_OVERVIEW'
            : 'STAGE_GUIDANCE',
        },
      } satisfies ConversationOrchestratorV3TurnResult;
      return this.finalizeTurnResult(
        normalizedInput,
        decision,
        this.attachWriteIntents(result, normalizedInput, normalizedInput.statusSnapshot),
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
        input: normalizedInput,
        suggestion,
        decision,
        dispatchResult: {
          status: 'error',
          code: 'UPSTREAM_UNAVAILABLE',
          message: `${decision.dispatchAgent} is unavailable`,
        },
        runtimeDebug,
      });
      return this.finalizeTurnResult(normalizedInput, decision, degraded, turnStartedAt);
    }

    const dispatchAction = buildDispatchAction(normalizedInput, decision as ConversationOrchestratorV3Decision & {
      dispatchAgent: AgentName;
    }, suggestion);
    this.emitNodeEvent(normalizedInput, {
      node: 'Subagent',
      action: decision.dispatchAgent,
      status: 'started',
      latencyMs: 0,
    });
    const subagentStartedAt = this.now();
    this.emitNodeEvent(normalizedInput, {
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
        this.emitNodeEvent(normalizedInput, {
          node: 'Tool',
          action: dispatchAction.type,
          status,
          latencyMs: this.elapsedSince(toolStartedAt),
          errorCode: dispatchResult.code,
        });
        this.emitNodeEvent(normalizedInput, {
          node: 'Subagent',
          action: decision.dispatchAgent,
          status,
          latencyMs: this.elapsedSince(subagentStartedAt),
          errorCode: dispatchResult.code,
          ...this.resolveLlmNodeMetadata(agent),
        });
        const degraded = await this.buildDegradedResult({
          input: normalizedInput,
          suggestion,
          decision,
          dispatchResult,
          runtimeDebug,
        });
        return this.finalizeTurnResult(normalizedInput, decision, degraded, turnStartedAt);
      }

      const faqResolution = resolveFaqResolution(decision, dispatchResult);

      this.emitNodeEvent(normalizedInput, {
        node: 'Tool',
        action: dispatchAction.type,
        status: 'completed',
        latencyMs: this.elapsedSince(toolStartedAt),
      });
      this.emitNodeEvent(normalizedInput, {
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
        ...(faqResolution ? { faqResolution } : {}),
        fallbackStatus: null,
        turnOutcome: {
          status: 'ok',
          recoverableErrorCode: null,
        },
        runtimeDebug,
        render: deriveRenderState({
          suggestion,
          decision,
          journey: decision.to,
          dispatchResult,
          ...(faqResolution ? { faqResolution } : {}),
          fallbackStatus: null,
          turnOutcome: {
            status: 'ok',
            recoverableErrorCode: null,
          },
          runtimeDebug,
        } as ConversationOrchestratorV3TurnResult),
      } satisfies ConversationOrchestratorV3TurnResult;
      return this.finalizeTurnResult(
        normalizedInput,
        decision,
        this.attachWriteIntents(result, normalizedInput, normalizedInput.statusSnapshot),
        turnStartedAt,
      );
    } catch (error) {
      this.emitNodeEvent(normalizedInput, {
        node: 'Tool',
        action: dispatchAction.type,
        status: 'failed',
        latencyMs: this.elapsedSince(toolStartedAt),
        errorCode: 'UNKNOWN',
      });
      this.emitNodeEvent(normalizedInput, {
        node: 'Subagent',
        action: decision.dispatchAgent,
        status: 'failed',
        latencyMs: this.elapsedSince(subagentStartedAt),
        errorCode: 'UNKNOWN',
        ...this.resolveLlmNodeMetadata(agent),
      });
      const degraded = await this.buildDegradedResult({
        input: normalizedInput,
        suggestion,
        decision,
        dispatchResult: {
          status: 'error',
          code: 'UNKNOWN',
          message: error instanceof Error ? error.message : 'agent dispatch failed',
        },
        runtimeDebug,
      });
      return this.finalizeTurnResult(normalizedInput, decision, degraded, turnStartedAt);
    }
  }

  private async runReducerTurnPipeline({
    normalizedInput,
    supervisorInput,
    decisionInput,
    idempotencyKey,
    turnStartedAt,
  }: {
    normalizedInput: ConversationOrchestratorV3NormalizedTurnInput;
    supervisorInput: ConversationOrchestratorV3DecisionInput;
    decisionInput: ConversationOrchestratorV3DecisionInput;
    idempotencyKey: string;
    turnStartedAt: number;
  }): Promise<ConversationOrchestratorV3TurnResult> {
    this.emitNodeEvent(normalizedInput, {
      node: 'Supervisor',
      action: 'extractEvent',
      status: 'started',
      latencyMs: 0,
    });
    const supervisorStartedAt = this.now();

    let event: SupervisorEvent;
    try {
      event = await this.dependencies.supervisor.extractEvent!(supervisorInput);
      this.emitNodeEvent(normalizedInput, {
        node: 'Supervisor',
        action: 'extractEvent',
        status: 'completed',
        latencyMs: this.elapsedSince(supervisorStartedAt),
        eventType: event.eventType,
        eventSource: event.source,
        confidence: event.confidence,
        ...this.resolveLlmNodeMetadata(this.dependencies.supervisor),
      });
      this.emitNodeEvent(normalizedInput, {
        node: 'EventExtractionSummary',
        action: 'event_extraction_summary',
        status: 'completed',
        latencyMs: this.elapsedSince(supervisorStartedAt),
        eventType: event.eventType,
        eventSource: event.source,
        confidence: event.confidence,
        ...this.resolveLlmNodeMetadata(this.dependencies.supervisor),
      });
    } catch (error) {
      this.emitNodeEvent(normalizedInput, {
        node: 'Supervisor',
        action: 'extractEvent',
        status: 'failed',
        latencyMs: this.elapsedSince(supervisorStartedAt),
        errorCode: 'UNKNOWN',
        ...this.resolveLlmNodeMetadata(this.dependencies.supervisor),
      });
      throw error;
    }

    this.emitNodeEvent(normalizedInput, {
      node: 'JourneyRuntimeAuthority',
      action: 'reduce',
      status: 'started',
      latencyMs: 0,
    });
    const reducerStartedAt = this.now();
    const reduction = reduceJourney({
      state: {
        primaryStage: decisionInput.current.stage,
      },
      facts: normalizeFactsFromStatusSnapshot(normalizedInput.statusSnapshot, {
        intake: normalizedInput.intake,
      }),
      event,
    });
    const execution = resolveNextActionExecution(reduction.nextAction);
    const readPlan = buildReadPlan(reduction.nextAction);
    const compatibilityView = projectLegacyCompatibilityView({
      currentStage: decisionInput.current.stage,
      reduction,
      execution,
    });
    const stateDiff = {
      beforeStage: decisionInput.current.stage,
      afterStage: reduction.primaryStage,
      factsPatch: reduction.factsPatch,
    };
    const sidePath = classifyReducerSidePath(reduction.nextAction.type);
    this.emitNodeEvent(normalizedInput, {
      node: 'JourneyReducer',
      action: 'state_diff',
      status: 'completed',
      latencyMs: this.elapsedSince(reducerStartedAt),
      eventType: event.eventType,
      eventSource: event.source,
      confidence: event.confidence,
      nextAction: reduction.nextAction.type,
      reasonCode: reduction.reasonCode,
      stateDiff,
      sidePath: sidePath !== 'none',
      sidePathType: sidePath,
      primaryStagePreserved: decisionInput.current.stage === reduction.primaryStage,
      replayLineage: {
        matchedRuleId: reduction.reasonCode,
      },
    });
    this.emitNodeEvent(normalizedInput, {
      node: 'NextActionResolver',
      action: 'resolve',
      status: 'completed',
      latencyMs: this.elapsedSince(reducerStartedAt),
      nextAction: reduction.nextAction.type,
      reasonCode: reduction.reasonCode,
      fromStage: decisionInput.current.stage,
      toStage: reduction.primaryStage,
      readPlan,
    });
    const projectionInvariantStatus = projectionMatchesReducer({
      compatibilityView,
      reduction,
      execution,
    }) ? 'completed' : 'failed';
    this.emitNodeEvent(normalizedInput, {
      node: 'Invariant',
      action: 'projection_matches_reducer',
      status: projectionInvariantStatus,
      latencyMs: this.elapsedSince(reducerStartedAt),
      invariantName: 'projection_matches_reducer',
      nextAction: reduction.nextAction.type,
      reasonCode: reduction.reasonCode,
      fromStage: decisionInput.current.stage,
      toStage: reduction.primaryStage,
      ...(projectionInvariantStatus === 'failed' ? { errorCode: 'UNKNOWN' } : {}),
    });
    const suggestion = {
      intent: compatibilityView.projectedProposal.intent,
      suggestedStage: compatibilityView.projectedProposal.suggestedStage,
      reason: compatibilityView.projectedProposal.reason,
    } satisfies ConversationOrchestratorV3Suggestion;
    const decision = this.buildReducerDecision({
      current: decisionInput.current,
      reduction,
      execution,
    });
    this.emitNodeEvent(normalizedInput, {
      node: 'JourneyRuntimeAuthority',
      action: 'reduce',
      status: 'completed',
      latencyMs: this.elapsedSince(reducerStartedAt),
      eventType: event.eventType,
      eventSource: event.source,
      confidence: event.confidence,
      nextAction: reduction.nextAction.type,
      reasonCode: reduction.reasonCode,
      stateDiff,
      sidePath: sidePath !== 'none',
      sidePathType: sidePath,
      primaryStagePreserved: decisionInput.current.stage === reduction.primaryStage,
      replayLineage: {
        matchedRuleId: reduction.reasonCode,
      },
    });

    const runtimeDebug = {
      traceId: normalizedInput.traceId,
      idempotencyKey,
      lastDispatchSource: 'journey-runtime-authority',
      replayLineage: {
        matchedRuleId: reduction.reasonCode,
      },
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
          path: resolveReducerSystemRenderPath(reduction.nextAction.type, execution.isSystemRendered),
        },
      } satisfies ConversationOrchestratorV3TurnResult;
      return this.finalizeTurnResult(
        normalizedInput,
        decision,
        this.attachWriteIntents(result, normalizedInput, normalizedInput.statusSnapshot),
        turnStartedAt,
      );
    }

    const agent = this.dependencies.agents[decision.dispatchAgent];
    if (!agent) {
      this.emitNodeEvent(normalizedInput, {
        node: 'Subagent',
        action: decision.dispatchAgent,
        status: 'failed',
        latencyMs: 0,
        errorCode: 'UPSTREAM_UNAVAILABLE',
      });
      this.emitNodeEvent(normalizedInput, {
        node: 'Tool',
        action: 'unknown_tool_for_agent',
        status: 'failed',
        latencyMs: 0,
        errorCode: 'UPSTREAM_UNAVAILABLE',
      });
      const degraded = await this.buildDegradedResult({
        input: normalizedInput,
        suggestion,
        decision,
        dispatchResult: {
          status: 'error',
          code: 'UPSTREAM_UNAVAILABLE',
          message: `${decision.dispatchAgent} is unavailable`,
        },
        runtimeDebug,
      });
      return this.finalizeTurnResult(normalizedInput, decision, degraded, turnStartedAt);
    }

    const dispatchAction = buildDispatchAction(normalizedInput, decision as ConversationOrchestratorV3Decision & {
      dispatchAgent: AgentName;
    }, suggestion);
    this.emitNodeEvent(normalizedInput, {
      node: 'Subagent',
      action: decision.dispatchAgent,
      status: 'started',
      latencyMs: 0,
    });
    const subagentStartedAt = this.now();
    this.emitNodeEvent(normalizedInput, {
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
        this.emitNodeEvent(normalizedInput, {
          node: 'Tool',
          action: dispatchAction.type,
          status,
          latencyMs: this.elapsedSince(toolStartedAt),
          errorCode: dispatchResult.code,
        });
        this.emitNodeEvent(normalizedInput, {
          node: 'Subagent',
          action: decision.dispatchAgent,
          status,
          latencyMs: this.elapsedSince(subagentStartedAt),
          errorCode: dispatchResult.code,
          ...this.resolveLlmNodeMetadata(agent),
        });
        const degraded = await this.buildDegradedResult({
          input: normalizedInput,
          suggestion,
          decision,
          dispatchResult,
          runtimeDebug,
        });
        return this.finalizeTurnResult(normalizedInput, decision, degraded, turnStartedAt);
      }

      const faqResolution = resolveFaqResolution(decision, dispatchResult);

      this.emitNodeEvent(normalizedInput, {
        node: 'Tool',
        action: dispatchAction.type,
        status: 'completed',
        latencyMs: this.elapsedSince(toolStartedAt),
      });
      this.emitNodeEvent(normalizedInput, {
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
        ...(faqResolution ? { faqResolution } : {}),
        fallbackStatus: null,
        turnOutcome: {
          status: 'ok',
          recoverableErrorCode: null,
        },
        runtimeDebug,
        render: deriveRenderState({
          suggestion,
          decision,
          journey: decision.to,
          dispatchResult,
          ...(faqResolution ? { faqResolution } : {}),
          fallbackStatus: null,
          turnOutcome: {
            status: 'ok',
            recoverableErrorCode: null,
          },
          runtimeDebug,
        } as ConversationOrchestratorV3TurnResult),
      } satisfies ConversationOrchestratorV3TurnResult;
      return this.finalizeTurnResult(
        normalizedInput,
        decision,
        this.attachWriteIntents(result, normalizedInput, normalizedInput.statusSnapshot),
        turnStartedAt,
      );
    } catch (error) {
      this.emitNodeEvent(normalizedInput, {
        node: 'Tool',
        action: dispatchAction.type,
        status: 'failed',
        latencyMs: this.elapsedSince(toolStartedAt),
        errorCode: 'UNKNOWN',
      });
      this.emitNodeEvent(normalizedInput, {
        node: 'Subagent',
        action: decision.dispatchAgent,
        status: 'failed',
        latencyMs: this.elapsedSince(subagentStartedAt),
        errorCode: 'UNKNOWN',
        ...this.resolveLlmNodeMetadata(agent),
      });
      const degraded = await this.buildDegradedResult({
        input: normalizedInput,
        suggestion,
        decision,
        dispatchResult: {
          status: 'error',
          code: 'UNKNOWN',
          message: error instanceof Error ? error.message : 'agent dispatch failed',
        },
        runtimeDebug,
      });
      return this.finalizeTurnResult(normalizedInput, decision, degraded, turnStartedAt);
    }
  }

  private buildReducerDecision({
    current,
    reduction,
    execution,
  }: {
    current: ConversationOrchestratorV3StageRef;
    reduction: ReturnType<typeof reduceJourney>;
    execution: ReturnType<typeof resolveNextActionExecution>;
  }): ConversationOrchestratorV3Decision {
    const to = {
      stage: reduction.primaryStage,
      phase: 'active' as const,
    };
    const factsPatch = buildReducerRuntimeFactsPatch(reduction, execution.isSystemRendered);

    return {
      action: reduction.nextAction.type === 'CREATE_HANDOFF'
        ? 'HANDOFF'
        : current.stage === to.stage
          ? 'STAY'
          : 'ADVANCE',
      from: cloneStageRef(current),
      to,
      dispatchAgent: execution.agent,
      dispatchSource: 'journey-runtime-authority',
      matchedRuleId: reduction.reasonCode,
      write: {
        authority: 'journey-runtime-authority',
        stage: to,
        factsPatch,
      },
    };
  }

  private buildDecisionInput(
    input: ConversationOrchestratorV3HandleTurnInput,
  ): ConversationOrchestratorV3DecisionInput {
    const current = resolveDecisionInputCurrent(input);
    const structuredState = resolveStructuredState(input);
    return {
      current,
      currentStage: current.stage,
      journeyCurrentStage: structuredState.journeyCurrentStage,
      journeyCurrentPhase: structuredState.journeyCurrentPhase,
      minimalTriageStatus: structuredState.minimalTriageStatus,
      minimalTriageAnswersSummary: structuredState.minimalTriageAnswersSummary,
      recommendationSelectionStatus: structuredState.recommendationSelectionStatus,
      recommendationSelectedHospitalIds: structuredState.recommendationSelectedHospitalIds,
      supportingDocuments: structuredState.supportingDocuments,
      conversationSummary: input.statusSnapshot?.conversationSummary ?? '',
      latestUserMessage: input.message,
      userAction: input.userAction,
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
      bootstrap: normalizeBootstrapSignals(input),
    };
  }

  private buildSupervisorInput(
    input: ConversationOrchestratorV3HandleTurnInput,
  ): ConversationOrchestratorV3DecisionInput {
    return {
      ...this.buildDecisionInput(input),
      facts: mergeSupervisorFacts(input.statusSnapshot, input.facts),
    };
  }

  private attachWriteIntents(
    result: ConversationOrchestratorV3TurnResult,
    input: ConversationOrchestratorV3NormalizedTurnInput,
    statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
  ): ConversationOrchestratorV3TurnResult {
    const render = deriveRenderState(result);
    const stageEntryStatusPatch = deriveStageEntryStatusPatch(result, input, statusSnapshot);
    const effectiveAttachmentStatusPatch = deriveEffectiveAttachmentStatusPatch(result, input, statusSnapshot);
    const recommendationPresentationStatusPatch = deriveRecommendationPresentationStatusPatch(
      result,
      input,
      statusSnapshot,
    );
    const runtimeRenderedStatusPatch = deriveRuntimeRenderedStatusPatch(result);
    const handoffStatusPatch = deriveHandoffStatusPatch(result);
    const journeyStatusPatch = deriveJourneyStatusPatch(input, result);
    const statusPatch = mergeStatusPatches(
      input.normalizedActionStatusPatch,
      stageEntryStatusPatch,
      effectiveAttachmentStatusPatch,
      recommendationPresentationStatusPatch,
      runtimeRenderedStatusPatch,
      handoffStatusPatch,
      journeyStatusPatch,
    );
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
        ...(statusPatch
          ? { statusPatch }
          : {}),
        ...(canonicalTruthPatch ? { canonicalTruthPatch } : {}),
        conversationSummaryPatch: buildConversationSummaryPatch({
          result: renderedResult,
          latestUserMessage: input.message,
          summaryUpdatedAt: new Date(this.now()),
          statusSnapshot: buildEffectiveStatusSnapshot(statusSnapshot, statusPatch),
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

  private async collectSupervisorReadDomains(
    input: ConversationOrchestratorV3HandleTurnInput,
    supervisorInput: ConversationOrchestratorV3DecisionInput,
  ): Promise<ConversationOrchestratorV3SupervisorReadDomainCollection> {
    if (!this.dependencies.supervisor.requestDomainReads) {
      return {};
    }

    let availableReadDomains = [...(supervisorInput.availableReadDomains ?? [])];
    if (availableReadDomains.length === 0) {
      return {};
    }

    const domainReadResults: SupervisorDomainReadResults = {};
    const requestedReadDomains: SupervisorReadDomain[][] = [];
    const resolvedReadDomains: SupervisorReadDomain[] = [];

    for (let pass = 0; pass < 2 && availableReadDomains.length > 0; pass += 1) {
      const requestedDomainsForPass: readonly SupervisorReadDomain[] = await this.dependencies.supervisor
        .requestDomainReads({
          ...supervisorInput,
          availableReadDomains,
          ...(Object.keys(domainReadResults).length > 0 ? { domainReadResults } : {}),
        }) ?? [];
      if (requestedDomainsForPass.length > 0) {
        requestedReadDomains.push([...requestedDomainsForPass]);
      }

      const nextDomain = requestedDomainsForPass.find((domain) => availableReadDomains.includes(domain));
      if (!nextDomain) {
        break;
      }

      availableReadDomains = availableReadDomains.filter((domain) => domain !== nextDomain);

      const data = await this.querySingleSupervisorReadDomain(input, nextDomain);
      if (data) {
        domainReadResults[nextDomain] = data;
        resolvedReadDomains.push(nextDomain);
      }
    }

    return {
      ...(Object.keys(domainReadResults).length > 0 ? { domainReadResults } : {}),
      replayLineage: compactReplayLineage({
        ...(requestedReadDomains.length > 0
          ? { supervisorReadDomainRequests: requestedReadDomains }
          : {}),
        ...(resolvedReadDomains.length > 0
          ? { supervisorReadDomainsResolved: resolvedReadDomains }
          : {}),
      }),
    };
  }

  private buildSupervisorReplayLineage(
    domainReadCollection?: ConversationOrchestratorV3SupervisorReadDomainCollection,
    supervisorDecisionLineage?: SupervisorDecisionLineage | null,
  ): ChatbotV3ReplayLineage | undefined {
    return compactReplayLineage({
      ...(domainReadCollection?.replayLineage ?? {}),
      ...(supervisorDecisionLineage ?? {}),
    });
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
      const result = await this.runSupervisorReadTool(domain, input.sessionId, input.site);
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
    site: PatientSite | undefined,
  ): Promise<ToolResult<Record<string, unknown>>> {
    switch (domain) {
      case 'records.status':
        return this.dependencies.gateway.records.status({ sessionId, site }) as Promise<ToolResult<Record<string, unknown>>>;
      case 'recommendation.status':
        return this.dependencies.gateway.recommendation.status({ sessionId, site }) as Promise<ToolResult<Record<string, unknown>>>;
      case 'consult.status':
        return this.dependencies.gateway.consult.status({ sessionId, site }) as Promise<ToolResult<Record<string, unknown>>>;
      case 'handoff.status':
        return this.dependencies.gateway.handoff.status({ sessionId, site }) as Promise<ToolResult<Record<string, unknown>>>;
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
      const result = await this.dependencies.gateway.status.query({ sessionId: input.sessionId, site: input.site });
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
      ...(finalizedResult.runtimeDebug.replayLineage
        ? { replayLineage: finalizedResult.runtimeDebug.replayLineage }
        : {}),
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

function normalizeBootstrapSignals(
  input: ConversationOrchestratorV3HandleTurnInput,
): ConversationOrchestratorV3BootstrapSignals | undefined {
  const attachments = getTurnAttachments(input);

  if (!input.bootstrap && attachments.length === 0) {
    return undefined;
  }

  return {
    message: input.bootstrap?.message ?? input.message,
    ...(input.bootstrap?.canCreateHandoff !== undefined
      ? { canCreateHandoff: input.bootstrap.canCreateHandoff }
      : {}),
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

function getTurnAttachments(
  input: Pick<ConversationOrchestratorV3HandleTurnInput, 'attachments' | 'bootstrap'>,
): Array<Record<string, unknown>> {
  const topLevelAttachments = input.attachments ?? [];
  return topLevelAttachments.length > 0 ? topLevelAttachments : input.bootstrap?.attachments ?? [];
}

function readSupportingDocumentsFromAttachments(
  attachments: Array<Record<string, unknown>>,
): Array<{ path: string; name: string }> {
  return attachments.flatMap((attachment) => {
    const storageKey = typeof attachment['storageKey'] === 'string'
      ? attachment['storageKey'].trim()
      : '';
    const fileName = typeof attachment['fileName'] === 'string'
      ? attachment['fileName'].trim()
      : '';

    if (!storageKey || !fileName) {
      return [];
    }

    return [{
      path: storageKey,
      name: fileName,
    }];
  });
}

const SUMMARY_STAGE_SNIPPET_MAX_LENGTH = 40;
const SUMMARY_USER_SNIPPET_MAX_LENGTH = 96;
const SUMMARY_ASSISTANT_SNIPPET_MAX_LENGTH = 120;
const SUMMARY_TOTAL_MAX_LENGTH = 280;

export function buildConversationSummaryPatch({
  result,
  latestUserMessage,
  summaryUpdatedAt,
  statusSnapshot,
}: {
  result: ConversationOrchestratorV3TurnResult;
  latestUserMessage: string;
  summaryUpdatedAt: Date;
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined;
}): ConversationOrchestratorV3ConversationSummaryPatch {
  const summaryStage = deriveCurrentStageFromStatusSnapshot(statusSnapshot).stage;
  const conversationSummary = clampConversationSummary([
    `stage=${clampSummaryText(summaryStage, SUMMARY_STAGE_SNIPPET_MAX_LENGTH)}`,
    `user=${clampSummaryText(latestUserMessage, SUMMARY_USER_SNIPPET_MAX_LENGTH)}`,
    `assistant=${clampSummaryText(buildAssistantText(result, statusSnapshot), SUMMARY_ASSISTANT_SNIPPET_MAX_LENGTH)}`,
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

function normalizeStructuredUserAction(
  input: ConversationOrchestratorV3HandleTurnInput,
): ConversationOrchestratorV3NormalizedTurnInput {
  if (!input.userAction) {
    return {
      ...input,
      message: input.message ?? '',
    };
  }

  const currentStatusSnapshot = {
    ...(input.statusSnapshot ?? {}),
  };
  const currentFacts = {
    ...(input.facts ?? {}),
  };
  const normalizedMessage = input.message ?? '';

  switch (input.userAction.type) {
    case 'TRIAGE_SUBMITTED': {
      const minimalTriageAnswersSummary = compactMinimalTriageAnswersSummary(normalizedMessage);
      if (!minimalTriageAnswersSummary) {
        throw new InvalidChatbotV3ActionError(
          'TRIAGE_SUBMITTED requires enough follow-up detail to build a summary.',
        );
      }

      return {
        ...input,
        message: normalizedMessage,
        statusSnapshot: {
          ...currentStatusSnapshot,
          minimalTriageStatus: 'pending',
          minimalTriageAnswersSummary,
          minimalTriageComplete: true,
        },
        facts: {
          ...currentFacts,
          'records.minimal_triage.complete': true,
        },
        normalizedActionStatusPatch: {
          minimalTriageStatus: 'pending',
          minimalTriageAnswersSummary,
          minimalTriageComplete: true,
        },
      };
    }
    case 'TRIAGE_SKIPPED':
      return {
        ...input,
        message: normalizedMessage,
        statusSnapshot: {
          ...currentStatusSnapshot,
          minimalTriageStatus: 'skipped',
          minimalTriageAnswersSummary: null,
          minimalTriageComplete: true,
        },
        facts: {
          ...currentFacts,
          'records.minimal_triage.complete': true,
        },
        normalizedActionStatusPatch: {
          minimalTriageStatus: 'skipped',
          minimalTriageAnswersSummary: null,
          minimalTriageComplete: true,
        },
      };
    case 'RECOMMENDATION_SELECTED': {
      if (!isRecommendationPresented(currentStatusSnapshot)) {
        throw new InvalidChatbotV3ActionError(
          'RECOMMENDATION_SELECTED is invalid before recommendation is presented.',
        );
      }

      return {
        ...input,
        message: normalizedMessage,
        statusSnapshot: {
          ...currentStatusSnapshot,
          recommendationGenerated: true,
          recommendationSelectionStatus: 'selected',
          recommendationSelectedHospitalIds: [input.userAction.hospitalId],
          recommendationSelected: true,
        },
        facts: {
          ...currentFacts,
          'recommendation.selected': true,
          'recommendation.picked': true,
        },
        normalizedActionStatusPatch: {
          recommendationGenerated: true,
          recommendationSelectionStatus: 'selected',
          recommendationSelectedHospitalIds: [input.userAction.hospitalId],
          recommendationSelected: true,
        },
      };
    }
    case 'RECOMMENDATION_SKIPPED':
      if (!isRecommendationPresented(currentStatusSnapshot)) {
        throw new InvalidChatbotV3ActionError(
          'RECOMMENDATION_SKIPPED is invalid before recommendation is presented.',
        );
      }

      return {
        ...input,
        message: normalizedMessage,
        statusSnapshot: {
          ...currentStatusSnapshot,
          recommendationGenerated: true,
          recommendationSelectionStatus: 'skipped',
          recommendationSelectedHospitalIds: [],
          recommendationSelected: false,
        },
        facts: {
          ...currentFacts,
          'recommendation.selected': false,
          'recommendation.picked': false,
        },
        normalizedActionStatusPatch: {
          recommendationGenerated: true,
          recommendationSelectionStatus: 'skipped',
          recommendationSelectedHospitalIds: [],
          recommendationSelected: false,
        },
      };
  }
}

function compactMinimalTriageAnswersSummary(
  message: string,
): string | null {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return null;
  }

  const parts: string[] = [];
  const lower = normalized.toLowerCase();
  const symptomLabel = resolveMinimalTriageSymptomLabel(normalized);
  const duration = resolveMinimalTriageDuration(lower);

  if (symptomLabel && duration) {
    parts.push(`${symptomLabel} ${duration}`.replace(/\s+/g, ' ').trim());
  } else if (symptomLabel) {
    parts.push(symptomLabel);
  }

  const severity = resolveMinimalTriageSeverity(lower);
  if (severity) {
    parts.push(severity);
  }

  const evidence = resolveMinimalTriageExistingEvidence(lower);
  if (evidence) {
    parts.push(evidence);
  }

  if (parts.length === 0) {
    return normalized.length <= 200 ? normalized : `${normalized.slice(0, 197).trimEnd()}...`;
  }

  return `${parts.join('; ')}.`;
}

function resolveMinimalTriageSymptomLabel(
  original: string,
): string | null {
  const knownSymptoms: Array<{ pattern: RegExp; summary: string }> = [
    { pattern: /\bchest pain\b/i, summary: 'Chest pain' },
    { pattern: /\bbreast lump\b/i, summary: 'Breast lump' },
    { pattern: /\bheadache\b/i, summary: 'Headache' },
    { pattern: /\bcough\b/i, summary: 'Cough' },
  ];

  for (const candidate of knownSymptoms) {
    if (candidate.pattern.test(original)) {
      return candidate.summary;
    }
  }

  const leadMatch = /(?:i have|i'm having|i am having|main problem:)\s+([^,.]+?)(?:\s+for\b|,|\.|$)/i.exec(original);
  const lead = leadMatch?.[1]?.trim();
  if (!lead) {
    return null;
  }

  const cleanedLead = lead.replace(/^(a|an|the)\s+/i, '').trim();
  if (cleanedLead.length === 0) {
    return null;
  }

  return cleanedLead.charAt(0).toUpperCase() + cleanedLead.slice(1);
}

function resolveMinimalTriageDuration(
  lower: string,
): string | null {
  const forMatch = /\bfor\s+([^,.]+?)(?:,| and\b| but\b|$)/i.exec(lower);
  if (forMatch?.[1]) {
    return `for ${forMatch[1].trim()}`;
  }

  const sinceMatch = /\bsince\s+([^,.]+?)(?:,| and\b| but\b|$)/i.exec(lower);
  if (sinceMatch?.[1]) {
    return `since ${sinceMatch[1].trim()}`;
  }

  return null;
}

function resolveMinimalTriageSeverity(
  lower: string,
): string | null {
  const severityMatch = /\b(mild|moderate|severe)\b/i.exec(lower);
  if (severityMatch?.[1]) {
    return `${severityMatch[1].trim()} severity`;
  }

  return null;
}

function resolveMinimalTriageExistingEvidence(
  lower: string,
): string | null {
  const evidenceMatchers: Array<[RegExp, string]> = [
    [/\bblood test\b/i, 'blood test already completed'],
    [/\bultrasound\b/i, 'ultrasound already completed'],
    [/\bmri\b/i, 'MRI already completed'],
    [/\bbiopsy\b/i, 'biopsy already completed'],
    [/\bct scan\b/i, 'CT scan already completed'],
    [/\bx-ray\b/i, 'X-ray already completed'],
  ];

  for (const [pattern, summary] of evidenceMatchers) {
    if (pattern.test(lower)) {
      return summary;
    }
  }

  if (/\bnothing yet\b/i.test(lower)) {
    return 'no prior tests or treatment yet';
  }

  return null;
}

function isRecommendationPresented(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): boolean {
  return statusSnapshot?.recommendationSelectionStatus === 'pending'
    || statusSnapshot?.recommendationSelectionStatus === 'selected'
    || statusSnapshot?.recommendationSelectionStatus === 'skipped';
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

function mergeSupervisorFacts(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
  facts: ConversationOrchestratorV3Facts | undefined,
): ConversationOrchestratorV3Facts {
  if (!hasStructuredStatusSnapshot(statusSnapshot)) {
    return {
      ...(facts ?? {}),
    };
  }

  return {
    ...(facts ?? {}),
    ...resolveSupervisorFacts(statusSnapshot),
  };
}

export function deriveCurrentStageFromStatusSnapshot(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): ConversationOrchestratorV3StageRef {
  if (hasActiveHandoffStatus(statusSnapshot) || hasCrisisSafetySignal(statusSnapshot)) {
    return { stage: 'HUMAN_HANDOFF', phase: 'active' };
  }

  if (isStage(statusSnapshot?.journeyCurrentStage)) {
    return {
      stage: statusSnapshot.journeyCurrentStage,
      phase: isPhase(statusSnapshot?.journeyCurrentPhase)
        ? statusSnapshot.journeyCurrentPhase
        : 'active',
    };
  }

  return {
    stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    phase: 'active',
  };
}

function resolveDecisionInputCurrent(
  input: ConversationOrchestratorV3HandleTurnInput,
): ConversationOrchestratorV3StageRef {
  if (hasStructuredStatusSnapshot(input.statusSnapshot)) {
    return deriveCurrentStageFromStatusSnapshot(input.statusSnapshot);
  }

  if (shouldTrustCallerContextWithoutSnapshot(input) && input.current) {
    return input.current;
  }

  return deriveCurrentStageFromStatusSnapshot(input.statusSnapshot);
}

function hasStructuredStatusSnapshot(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): boolean {
  if (!statusSnapshot) {
    return false;
  }

  return hasActiveHandoffStatus(statusSnapshot)
    || hasCrisisSafetySignal(statusSnapshot)
    || isStage(statusSnapshot.journeyCurrentStage)
    || statusSnapshot.minimalTriageStatus !== undefined
    || statusSnapshot.minimalTriageAnswersSummary !== undefined
    || statusSnapshot.recommendationSelectionStatus !== undefined
    || statusSnapshot.recommendationSelectedHospitalIds !== undefined
    || statusSnapshot.supportingDocuments !== undefined
    || statusSnapshot.conversationSummary !== undefined;
}

function shouldTrustCallerContextWithoutSnapshot(
  input: ConversationOrchestratorV3HandleTurnInput,
): boolean {
  return input.suggestion !== undefined
    || input.userAction !== undefined
    || Object.keys(input.facts ?? {}).length > 0;
}

function resolveStructuredState(
  input: ConversationOrchestratorV3HandleTurnInput,
): {
  journeyCurrentStage?: ChatJourneyStage;
  journeyCurrentPhase?: AiChatStatusSnapshot['journeyCurrentPhase'];
  minimalTriageStatus?: AiChatStatusSnapshot['minimalTriageStatus'];
  minimalTriageAnswersSummary?: string | null;
  minimalTriageComplete?: boolean;
  recommendationSelectionStatus?: AiChatStatusSnapshot['recommendationSelectionStatus'];
  recommendationSelectedHospitalIds?: string[];
  supportingDocuments: AiChatStatusSnapshot['supportingDocuments'] | undefined;
} {
  return {
    journeyCurrentStage: input.statusSnapshot?.journeyCurrentStage ?? undefined,
    journeyCurrentPhase: input.statusSnapshot?.journeyCurrentPhase ?? undefined,
    minimalTriageStatus: input.statusSnapshot?.minimalTriageStatus ?? undefined,
    minimalTriageAnswersSummary: input.statusSnapshot?.minimalTriageAnswersSummary ?? null,
    minimalTriageComplete: input.statusSnapshot?.minimalTriageComplete ?? undefined,
    recommendationSelectionStatus: input.statusSnapshot?.recommendationSelectionStatus ?? undefined,
    recommendationSelectedHospitalIds: input.statusSnapshot?.recommendationSelectedHospitalIds ?? undefined,
    supportingDocuments: input.statusSnapshot?.supportingDocuments,
  };
}

function buildDispatchAction(
  input: ConversationOrchestratorV3HandleTurnInput,
  decision: ConversationOrchestratorV3Decision & {
    dispatchAgent: AgentName;
  },
  suggestion: ConversationOrchestratorV3Suggestion,
): AgentAction {
  const turnAttachments = getTurnAttachments(input);

  switch (decision.dispatchAgent) {
    case 'FaqAgent':
      return {
        type: 'faq.answer',
        input: {
          latestUserMessage: input.message,
          sessionId: input.sessionId,
          site: input.site,
          hospitalId: input.pageContext?.type === 'HOSPITAL_DETAIL'
            ? input.pageContext.hospitalId
            : undefined,
        },
        meta: {
          task: buildWorkerTask(input, decision, suggestion),
        },
      };
    case 'RecordsAgent':
      if (
        turnAttachments.length > 0
        && decision.to.stage !== 'COLLECT_MINIMAL_MEDICAL_FACTS'
      ) {
        return {
          type: 'records.upload',
          input: {
            sessionId: input.sessionId,
            site: input.site,
            turnId: input.turnId,
            attachments: turnAttachments,
          },
        };
      }

      return {
        type: 'records.status',
        input: {
          sessionId: input.sessionId,
          site: input.site,
        },
        meta: {
          task: buildWorkerTask(input, decision, suggestion),
        },
      };
    case 'RecommendationAgent':
      return {
        type: 'recommendation.generate',
        input: {
          sessionId: input.sessionId,
          site: input.site,
          turnId: input.turnId,
        },
        meta: {
          task: buildWorkerTask(input, decision, suggestion),
        },
      };
    case 'ConsultAgent':
      return {
        type: 'consult.status',
        input: {
          sessionId: input.sessionId,
          site: input.site,
        },
      };
    case 'HandoffAgent':
      return {
        type: 'handoff.create',
        input: {
          sessionId: input.sessionId,
          site: input.site,
          turnId: input.turnId,
          reason: normalizeReason(suggestion.reason || input.message || 'human handoff requested'),
        },
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

function buildWorkerTask(
  input: ConversationOrchestratorV3HandleTurnInput,
  decision: ConversationOrchestratorV3Decision & { dispatchAgent: AgentName },
  suggestion: ConversationOrchestratorV3Suggestion,
): WorkerTask {
  const baseTask = {
    fromStage: decision.from.stage,
    toStage: decision.to.stage,
    intent: suggestion.intent,
    supervisorReason: normalizeReason(suggestion.reason),
    latestUserMessage: input.message,
  };

  switch (decision.dispatchAgent) {
    case 'FaqAgent':
      return {
        agent: 'FaqAgent',
        ...baseTask,
      } satisfies FaqWorkerTask;
    case 'RecordsAgent':
      return {
        agent: 'RecordsAgent',
        ...baseTask,
        mode: resolveRecordsWorkerMode(decision),
        minimalTriageComplete: resolveRecordsMinimalTriageComplete(input),
      } satisfies RecordsWorkerTask;
    case 'RecommendationAgent':
      return {
        agent: 'RecommendationAgent',
        ...baseTask,
        recommendationTask: resolveRecommendationTask(input.message, decision),
        ...resolveRecommendationBasis(input.statusSnapshot),
      } satisfies RecommendationWorkerTask;
    default:
      return {
        agent: 'FaqAgent',
        ...baseTask,
      } satisfies FaqWorkerTask;
  }
}

function resolveRecordsMinimalTriageComplete(
  input: ConversationOrchestratorV3HandleTurnInput,
): boolean {
  if (input.statusSnapshot) {
    return deriveCanonicalTruthFlagsFromStatusSnapshot(input.statusSnapshot)[
      'records.minimal_triage.complete'
    ];
  }

  return input.facts?.['records.minimal_triage.complete'] === true;
}

function resolveRecommendationBasis(
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): Pick<RecommendationWorkerTask, 'recommendationBasis' | 'minimalTriageAnswersSummary'> {
  const minimalTriageAnswersSummary = statusSnapshot?.minimalTriageAnswersSummary ?? null;
  if (minimalTriageAnswersSummary) {
    return {
      recommendationBasis: 'INTAKE_AND_FOLLOW_UP_SUMMARY',
      minimalTriageAnswersSummary,
    };
  }

  if (statusSnapshot?.minimalTriageStatus === 'skipped') {
    return {
      recommendationBasis: 'INTAKE_ONLY_AFTER_TRIAGE_SKIP',
      minimalTriageAnswersSummary: null,
    };
  }

  return {};
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

function deriveStageEntryStatusPatch(
  result: ConversationOrchestratorV3TurnResult,
  input: ConversationOrchestratorV3NormalizedTurnInput,
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): Partial<AiChatStatusSnapshot> | undefined {
  const isEnteringDiagnosisProofStage = result.decision.to.stage === 'COLLECT_MEDICAL_INPUTS'
    && result.decision.from.stage !== 'COLLECT_MEDICAL_INPUTS';
  const hasFreshUploadOnThisTurn = getTurnAttachments(input).length > 0
    && result.decision.dispatchAgent === 'RecordsAgent';

  if (!isEnteringDiagnosisProofStage || hasFreshUploadOnThisTurn) {
    return undefined;
  }

  if (!hasAnyStatus(statusSnapshot?.docUploadStatus, ['COMPLETED', 'SUBMITTED', 'READY', 'IN_PROGRESS'])) {
    return undefined;
  }

  return {
    docUploadStatus: 'none',
  };
}

function deriveEffectiveAttachmentStatusPatch(
  result: ConversationOrchestratorV3TurnResult,
  input: ConversationOrchestratorV3NormalizedTurnInput,
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): Partial<AiChatStatusSnapshot> | undefined {
  const attachments = getTurnAttachments(input);

  if (
    attachments.length === 0
    || result.decision.dispatchAgent !== 'RecordsAgent'
    || result.journey.stage !== 'COLLECT_MINIMAL_MEDICAL_FACTS'
  ) {
    return undefined;
  }

  return {
    docUploadStatus: 'SUBMITTED',
    supportingDocuments: normalizeSupportingDocuments([
      ...(statusSnapshot?.supportingDocuments ?? []),
      ...readSupportingDocumentsFromAttachments(attachments),
    ]),
  };
}

function deriveRecommendationPresentationStatusPatch(
  result: ConversationOrchestratorV3TurnResult,
  input: ConversationOrchestratorV3NormalizedTurnInput,
  statusSnapshot: Partial<AiChatStatusSnapshot> | null | undefined,
): Partial<AiChatStatusSnapshot> | undefined {
  if (result.turnOutcome.status !== 'ok' || result.journey.stage !== 'RECOMMENDATION') {
    return undefined;
  }

  if (input.userAction?.type === 'RECOMMENDATION_SELECTED' || input.userAction?.type === 'RECOMMENDATION_SKIPPED') {
    return undefined;
  }

  if (statusSnapshot?.recommendationSelectionStatus === 'selected' || statusSnapshot?.recommendationSelectionStatus === 'skipped') {
    return undefined;
  }

  if (result.dispatchResult?.status !== 'ok') {
    return undefined;
  }

  const recommendations = readRenderableRecommendationCandidates(result.dispatchResult);
  if (recommendations.length === 0) {
    return undefined;
  }

  return {
    recommendationGenerated: true,
    recommendationSelectionStatus: 'pending',
    recommendationSelectedHospitalIds: [],
    recommendationSelected: false,
  };
}

function deriveRuntimeRenderedStatusPatch(
  result: ConversationOrchestratorV3TurnResult,
): Partial<AiChatStatusSnapshot> | undefined {
  if (result.turnOutcome.status !== 'ok' || result.render.path !== 'PROCESS_OVERVIEW') {
    return undefined;
  }

  return {
    processExplained: true,
  };
}

function deriveHandoffStatusPatch(
  result: ConversationOrchestratorV3TurnResult,
): Partial<AiChatStatusSnapshot> | undefined {
  if (result.turnOutcome.status !== 'ok' || result.decision.dispatchAgent !== 'HandoffAgent') {
    return undefined;
  }

  if (!hasCreatedHandoff(result)) {
    return undefined;
  }

  return {
    handoffStatus: 'requested',
    handoffActive: true,
  };
}

function deriveJourneyStatusPatch(
  input: ConversationOrchestratorV3NormalizedTurnInput,
  result: ConversationOrchestratorV3TurnResult,
): Partial<AiChatStatusSnapshot> | undefined {
  if (result.turnOutcome.status !== 'ok') {
    return undefined;
  }

  if (result.decision.dispatchAgent === 'FaqAgent') {
    return undefined;
  }

  if (result.decision.dispatchAgent === 'HandoffAgent' && !hasCreatedHandoff(result)) {
    return undefined;
  }

  if (shouldPreservePersistedJourneyStage(input, result)) {
    return undefined;
  }

  const targetStage = result.decision.to.stage;
  const targetPhase = normalizePersistedJourneyPhase(result.decision.to.phase);

  return {
    journeyCurrentStage: targetStage,
    journeyCurrentPhase: targetPhase,
  };
}

function shouldPreservePersistedJourneyStage(
  input: ConversationOrchestratorV3NormalizedTurnInput,
  result: ConversationOrchestratorV3TurnResult,
): boolean {
  const persistedStage = input.statusSnapshot?.journeyCurrentStage;
  if (!isStage(persistedStage)) {
    return false;
  }

  if (input.userAction) {
    return false;
  }

  if (
    result.decision.to.stage === 'EXPLAIN_PROCESS'
    && input.statusSnapshot?.processExplained === true
  ) {
    return true;
  }

  const persistedIndex = CANONICAL_JOURNEY_ORDER.indexOf(persistedStage);
  const targetIndex = CANONICAL_JOURNEY_ORDER.indexOf(result.decision.to.stage);
  if (persistedIndex === -1 || targetIndex === -1) {
    return false;
  }

  return targetIndex < persistedIndex;
}

function normalizePersistedJourneyPhase(
  phase: ChatJourneyPhase,
): AiChatStatusSnapshot['journeyCurrentPhase'] {
  return phase === 'post' ? 'post' : 'active';
}

function readRenderableRecommendationCandidates(
  dispatchResult: ToolResult<unknown> | null,
): Array<{ hospitalId: string; name: string }> {
  if (dispatchResult?.status !== 'ok') {
    return [];
  }

  const recommendations = asArray(asRecord(dispatchResult.data)['recommendations']);
  return recommendations.flatMap((candidate) => {
    const record = asRecord(candidate);
    const hospitalId = asString(record['hospitalId']);
    const name = asString(record['name']);

    if (!hospitalId || !name) {
      return [];
    }

    return [{ hospitalId, name }];
  });
}

function mergeStatusPatches(
  ...patches: Array<Partial<AiChatStatusSnapshot> | null | undefined>
): Partial<AiChatStatusSnapshot> | undefined {
  const merged = Object.assign({}, ...patches.filter(Boolean));
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildReducerRuntimeFactsPatch(
  reduction: ReturnType<typeof reduceJourney>,
  isSystemRendered: boolean,
): Partial<Record<string, boolean>> {
  const factsPatch: Partial<Record<string, boolean>> = {};

  if (reduction.factsPatch.intake?.minimalTriageStatus === 'submitted'
    || reduction.factsPatch.intake?.minimalTriageStatus === 'skipped') {
    factsPatch['records.minimal_triage.complete'] = true;
  }

  if (reduction.factsPatch.recommendation?.status === 'selected') {
    factsPatch['recommendation.selected'] = true;
  }

  if (isSystemRendered && reduction.nextAction.type === 'SHOW_PROCESS_OVERVIEW') {
    factsPatch['process.explained'] = true;
  }

  return factsPatch;
}

function cloneStageRef(
  stageRef: ConversationOrchestratorV3StageRef,
): ConversationOrchestratorV3StageRef {
  return {
    stage: stageRef.stage,
    phase: stageRef.phase,
  };
}

function preserveLaterStageSidePathDetour(
  decision: ConversationOrchestratorV3Decision,
  current: ConversationOrchestratorV3StageRef,
  suggestion: ConversationOrchestratorV3Suggestion,
): ConversationOrchestratorV3Decision {
  if (!shouldPreserveLaterStageSidePathDetour(current, suggestion, decision)) {
    return decision;
  }

  return {
    ...decision,
    action: 'STAY',
    from: cloneStageRef(current),
    to: cloneStageRef(current),
    dispatchAgent: 'FaqAgent',
    write: {
      authority: 'journey-runtime-authority',
      stage: cloneStageRef(current),
      factsPatch: {},
    },
  };
}

function shouldPreserveLaterStageSidePathDetour(
  current: ConversationOrchestratorV3StageRef,
  suggestion: ConversationOrchestratorV3Suggestion,
  decision?: ConversationOrchestratorV3Decision,
): boolean {
  if (decision?.dispatchSource !== 'journey-runtime-authority') {
    return false;
  }

  return (suggestion.intent === 'faq' || suggestion.intent === 'resource')
    && suggestion.suggestedStage === 'EXPLAIN_PROCESS'
    && (current.stage === 'COLLECT_MEDICAL_INPUTS' || current.stage === 'ONLINE_CONSULT');
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

    if (canonicalKey === 'handoff.active' && !hasCreatedHandoff(result)) {
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

function hasCreatedHandoff(result: ConversationOrchestratorV3TurnResult): boolean {
  if (result.dispatchResult?.status !== 'ok') {
    return false;
  }

  return asRecord(result.dispatchResult.data)['created'] === true;
}

function deriveRenderState(
  result: ConversationOrchestratorV3TurnResult,
) {
  if (result.turnOutcome.status !== 'ok') {
    return {
      path: 'STAGE_GUIDANCE',
    } satisfies ConversationOrchestratorV3RenderState;
  }

  if (
    result.decision.dispatchAgent === null
    && (
      result.render.path === 'PROCESS_OVERVIEW'
      || result.render.path === 'SAFE_MEDICAL_REDIRECT'
      || result.render.path === 'OUT_OF_SCOPE_REDIRECT'
    )
  ) {
    return result.render;
  }

  if (result.decision.dispatchAgent === 'FaqAgent') {
    if (result.faqResolution === 'answer' || hasStructuredFaqAnswer(result)) {
      return {
        path: 'FAQ_ANSWER',
      } satisfies ConversationOrchestratorV3RenderState;
    }

    if (result.faqResolution === 'miss' || result.dispatchResult?.status === 'ok') {
      return {
        path: 'FAQ_MISS',
      } satisfies ConversationOrchestratorV3RenderState;
    }
  }

  if (
    result.journey.stage === 'EXPLAIN_PROCESS'
    && !isDeniedSemanticHandoff(result)
    && result.decision.dispatchAgent === null
  ) {
    return {
      path: 'PROCESS_OVERVIEW',
    } satisfies ConversationOrchestratorV3RenderState;
  }

  return {
    path: 'STAGE_GUIDANCE',
  } satisfies ConversationOrchestratorV3RenderState;
}

function compactReplayLineage(
  lineage: ChatbotV3ReplayLineage,
): ChatbotV3ReplayLineage | undefined {
  const compact = {
    ...(lineage.matchedRuleId ? { matchedRuleId: lineage.matchedRuleId } : {}),
    ...(lineage.supervisorReadDomainRequests?.length
      ? {
          supervisorReadDomainRequests: lineage.supervisorReadDomainRequests.map((request) => [...request]),
        }
      : {}),
    ...(lineage.supervisorReadDomainsResolved?.length
      ? { supervisorReadDomainsResolved: [...lineage.supervisorReadDomainsResolved] }
      : {}),
    ...(lineage.bootstrapOverride ? { bootstrapOverride: lineage.bootstrapOverride } : {}),
  } satisfies ChatbotV3ReplayLineage;

  return Object.keys(compact).length > 0 ? compact : undefined;
}

function classifyReducerSidePath(
  nextActionType: string,
): 'faq' | 'safety' | 'out_of_scope' | 'clarification' | 'none' {
  switch (nextActionType) {
    case 'ANSWER_FAQ':
      return 'faq';
    case 'SAFE_MEDICAL_REDIRECT':
      return 'safety';
    case 'OUT_OF_SCOPE_REDIRECT':
      return 'out_of_scope';
    case 'CLARIFY_INTENT':
      return 'clarification';
    default:
      return 'none';
  }
}

function resolveReducerSystemRenderPath(
  nextActionType: string,
  isSystemRendered: boolean,
): ConversationOrchestratorV3RenderState['path'] {
  if (!isSystemRendered) {
    return 'STAGE_GUIDANCE';
  }

  switch (nextActionType) {
    case 'SHOW_PROCESS_OVERVIEW':
      return 'PROCESS_OVERVIEW';
    case 'SAFE_MEDICAL_REDIRECT':
      return 'SAFE_MEDICAL_REDIRECT';
    case 'OUT_OF_SCOPE_REDIRECT':
      return 'OUT_OF_SCOPE_REDIRECT';
    default:
      return 'STAGE_GUIDANCE';
  }
}

function projectionMatchesReducer(input: {
  compatibilityView: ReturnType<typeof projectLegacyCompatibilityView>;
  reduction: ReturnType<typeof reduceJourney>;
  execution: ReturnType<typeof resolveNextActionExecution>;
}): boolean {
  return input.compatibilityView.projectedDecision.toStage === input.reduction.primaryStage
    && input.compatibilityView.projectedDecision.nextAction.type === input.reduction.nextAction.type
    && input.compatibilityView.projectedDecision.dispatchAgent === input.execution.agent
    && input.compatibilityView.projectedDecision.isSystemRendered === input.execution.isSystemRendered
    && input.compatibilityView.projectedProposal.suggestedStage === input.reduction.primaryStage;
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

  return hasStructuredFaqAnswerData(result.dispatchResult);
}

function hasStructuredFaqAnswerData(
  dispatchResult: Extract<ToolResult<unknown>, { status: 'ok' }>,
): boolean {
  const data = asRecord(dispatchResult.data);
  const answer = asString(data['answer']);
  const confidence = asString(data['confidence']);
  const citedFaqIds = asArray(data['citedFaqIds'])
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);

  return Boolean(answer && confidence !== 'low' && citedFaqIds.length > 0);
}

function resolveFaqResolution(
  decision: ConversationOrchestratorV3Decision,
  dispatchResult: Extract<ToolResult<unknown>, { status: 'ok' }>,
): ChatbotV3FaqResolution | undefined {
  if (decision.dispatchAgent !== 'FaqAgent') {
    return undefined;
  }

  return hasStructuredFaqAnswerData(dispatchResult)
    ? 'answer'
    : 'miss';
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

function normalizeStatus(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase();
}

function hasAnyStatus(
  value: string | null | undefined,
  statuses: readonly string[],
): boolean {
  const normalized = normalizeStatus(value);
  return statuses.some((status) => normalized === status);
}

function isStage(value: string | null | undefined): value is ChatJourneyStage {
  return value === 'EXPLAIN_PROCESS'
    || value === 'COLLECT_MINIMAL_MEDICAL_FACTS'
    || value === 'COLLECT_MEDICAL_INPUTS'
    || value === 'RECOMMENDATION'
    || value === 'ONLINE_CONSULT'
    || value === 'HUMAN_HANDOFF';
}

function isPhase(value: string | null | undefined): value is ChatJourneyPhase {
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
