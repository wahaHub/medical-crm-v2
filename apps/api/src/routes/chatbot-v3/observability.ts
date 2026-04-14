export interface ChatbotV3CorrelationContext {
  traceId: string;
  sessionId: string;
  turnId: string;
  childRunId?: string | null;
}

export type ChatbotV3M0EventName =
  | 'supervisor_suggestion_created'
  | 'orchestrator_decision_finalized'
  | 'journey_transition_committed'
  | 'subagent_dispatched'
  | 'subagent_started'
  | 'subagent_completed'
  | 'subagent_failed'
  | 'subagent_timeout'
  | 'subagent_cancelled'
  | 'tool_call_started'
  | 'tool_call_completed'
  | 'tool_call_failed';

export interface ChatbotV3SupervisorSuggestionEventData {
  suggestedStage: string;
  reason: string;
  intent?: string;
}

export interface ChatbotV3DecisionEventData {
  suggestedStage: string;
  finalStage: string;
  decisionType: 'STAY' | 'ADVANCE' | 'SKIP' | 'HANDOFF';
  matchedRuleId?: string | null;
  reason: string;
  whyNotSkip?: string;
}

export interface ChatbotV3JourneyTransitionEventData {
  fromStage: string;
  toStage: string;
}

export interface ChatbotV3SubagentEventData {
  agentName: string;
  errorDetail?: string;
}

export interface ChatbotV3ToolCallEventData {
  toolName: string;
  errorDetail?: string;
}

export type ChatbotV3EventInput =
  | {
      name: 'supervisor_suggestion_created';
      context: ChatbotV3CorrelationContext;
      data: ChatbotV3SupervisorSuggestionEventData;
    }
  | {
      name: 'orchestrator_decision_finalized';
      context: ChatbotV3CorrelationContext;
      data: ChatbotV3DecisionEventData;
    }
  | {
      name: 'journey_transition_committed';
      context: ChatbotV3CorrelationContext;
      data: ChatbotV3JourneyTransitionEventData;
    }
  | {
      name:
        | 'subagent_dispatched'
        | 'subagent_started'
        | 'subagent_completed'
        | 'subagent_failed'
        | 'subagent_timeout'
        | 'subagent_cancelled';
      context: ChatbotV3CorrelationContext;
      data: ChatbotV3SubagentEventData;
    }
  | {
      name: 'tool_call_started' | 'tool_call_completed' | 'tool_call_failed';
      context: ChatbotV3CorrelationContext;
      data: ChatbotV3ToolCallEventData;
    };

export interface ChatbotV3EmittedEvent extends ChatbotV3CorrelationContext {
  name: ChatbotV3M0EventName;
  occurredAt: string;
  suggestedStage?: string;
  finalStage?: string;
  decisionType?: 'STAY' | 'ADVANCE' | 'SKIP' | 'HANDOFF';
  matchedRuleId?: string | null;
  reason?: string;
  whyNotSkip?: string;
  fromStage?: string;
  toStage?: string;
  intent?: string;
  agentName?: string;
  toolName?: string;
  errorDetail?: string;
}

export interface ChatbotV3EventEmitterOptions {
  emit: (event: ChatbotV3EmittedEvent) => void;
  now?: () => Date;
}

export interface ChatbotV3EventEmitter {
  emit(input: ChatbotV3EventInput): ChatbotV3EmittedEvent;
}

export interface ChatbotV3ToolMetricWindow {
  windowMinutes: number;
  total: number;
  failures: number;
}

export interface ChatbotV3SubagentMetricWindow {
  windowMinutes: number;
  total: number;
  timeouts: number;
}

export interface ChatbotV3HandoffMetricWindow {
  windowMinutes: number;
  totalTurns: number;
  handoffs: number;
  trailingSevenDayBaselineRate: number;
}

export interface ChatbotV3MetricWindows {
  toolCalls: Partial<Record<string, ChatbotV3ToolMetricWindow>>;
  subagents: ChatbotV3SubagentMetricWindow;
  handoffs: ChatbotV3HandoffMetricWindow;
}

export interface ChatbotV3AlertEvaluation {
  rule:
    | 'consult.schedule_failure_rate'
    | 'recommendation.generate_failure_rate'
    | 'subagent_timeout_rate'
    | 'handoff_rate_spike';
  triggered: boolean;
  windowMinutes: number;
  observedValue: number;
  threshold: string;
}

const REASON_MAX_LENGTH = 240;
const ERROR_DETAIL_MAX_LENGTH = 512;

export function createChatbotV3EventEmitter(
  options: ChatbotV3EventEmitterOptions,
): ChatbotV3EventEmitter {
  const now = options.now ?? (() => new Date());

  return {
    emit(input) {
      const event = normalizeEvent(input, now);
      options.emit(event);
      return event;
    },
  };
}

export function evaluateM0AlertThresholds(
  windows: ChatbotV3MetricWindows,
): ChatbotV3AlertEvaluation[] {
  const alerts: ChatbotV3AlertEvaluation[] = [];

  const consultScheduleWindow = windows.toolCalls['consult.schedule'];
  if (consultScheduleWindow) {
    const consultFailureRate = ratio(
      consultScheduleWindow.failures,
      consultScheduleWindow.total,
    );
    alerts.push({
      rule: 'consult.schedule_failure_rate',
      triggered:
        consultScheduleWindow.windowMinutes === 5 &&
        consultScheduleWindow.total >= 20 &&
        consultFailureRate > 0.15,
      windowMinutes: consultScheduleWindow.windowMinutes,
      observedValue: consultFailureRate,
      threshold: 'failure_rate > 15% over 5m with min 20 calls',
    });
  }

  const recommendationGenerateWindow = windows.toolCalls['recommendation.generate'];
  if (recommendationGenerateWindow) {
    const recommendationFailureRate = ratio(
      recommendationGenerateWindow.failures,
      recommendationGenerateWindow.total,
    );
    alerts.push({
      rule: 'recommendation.generate_failure_rate',
      triggered:
        recommendationGenerateWindow.windowMinutes === 5 &&
        recommendationGenerateWindow.total >= 20 &&
        recommendationFailureRate > 0.2,
      windowMinutes: recommendationGenerateWindow.windowMinutes,
      observedValue: recommendationFailureRate,
      threshold: 'failure_rate > 20% over 5m with min 20 calls',
    });
  }

  const subagentTimeoutRate = ratio(
    windows.subagents.timeouts,
    windows.subagents.total,
  );
  alerts.push({
    rule: 'subagent_timeout_rate',
    triggered:
      windows.subagents.windowMinutes === 10 &&
      (windows.subagents.timeouts > 10 || subagentTimeoutRate > 0.08),
    windowMinutes: windows.subagents.windowMinutes,
    observedValue: subagentTimeoutRate,
    threshold: 'timeouts > 10 over 10m OR timeout_ratio > 8%',
  });

  const handoffRate = ratio(
    windows.handoffs.handoffs,
    windows.handoffs.totalTurns,
  );
  alerts.push({
    rule: 'handoff_rate_spike',
    triggered:
      windows.handoffs.windowMinutes === 30 &&
      handoffRate > 0.35 &&
      handoffRate > windows.handoffs.trailingSevenDayBaselineRate * 2,
    windowMinutes: windows.handoffs.windowMinutes,
    observedValue: handoffRate,
    threshold: 'handoff_rate > 35% over 30m and > 2x trailing 7-day baseline',
  });

  return alerts;
}

export function truncateReason(reason: string): string {
  return truncate(reason, REASON_MAX_LENGTH);
}

export function redactAndTruncateErrorDetail(errorDetail: string): string {
  return truncate(redactSensitiveValues(errorDetail), ERROR_DETAIL_MAX_LENGTH);
}

function normalizeEvent(
  input: ChatbotV3EventInput,
  now: () => Date,
): ChatbotV3EmittedEvent {
  const baseEvent = {
    name: input.name,
    traceId: input.context.traceId,
    sessionId: input.context.sessionId,
    turnId: input.context.turnId,
    childRunId: input.context.childRunId ?? null,
    occurredAt: now().toISOString(),
  } satisfies ChatbotV3EmittedEvent;

  if (input.name === 'supervisor_suggestion_created') {
    return {
      ...baseEvent,
      suggestedStage: input.data.suggestedStage,
      intent: input.data.intent,
      reason: truncateReason(input.data.reason),
    };
  }

  if (input.name === 'orchestrator_decision_finalized') {
    return {
      ...baseEvent,
      suggestedStage: input.data.suggestedStage,
      finalStage: input.data.finalStage,
      decisionType: input.data.decisionType,
      matchedRuleId: input.data.matchedRuleId ?? null,
      reason: truncateReason(input.data.reason),
      whyNotSkip:
        input.data.decisionType === 'STAY' && input.data.whyNotSkip
          ? truncateReason(input.data.whyNotSkip)
          : undefined,
    };
  }

  if (input.name === 'journey_transition_committed') {
    return {
      ...baseEvent,
      fromStage: input.data.fromStage,
      toStage: input.data.toStage,
    };
  }

  if (isSubagentEventInput(input)) {
    return {
      ...baseEvent,
      agentName: input.data.agentName,
      errorDetail: input.data.errorDetail
        ? redactAndTruncateErrorDetail(input.data.errorDetail)
        : undefined,
    };
  }

  return {
    ...baseEvent,
    toolName: input.data.toolName,
    errorDetail: input.data.errorDetail
      ? redactAndTruncateErrorDetail(input.data.errorDetail)
      : undefined,
  };
}

function redactSensitiveValues(value: string): string {
  return value
    .replace(
      /\b(password|token|secret)\s*=\s*([^\s]+)/gi,
      '$1=[REDACTED]',
    )
    .replace(
      /(authorization\s*:\s*bearer\s+)([^\s,;]+)/gi,
      '$1[REDACTED]',
    )
    .replace(
      /("(token|password|secret)"\s*:\s*)"([^"]*)"/gi,
      '$1"[REDACTED]"',
    );
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

function isSubagentEventInput(
  input: ChatbotV3EventInput,
): input is Extract<
  ChatbotV3EventInput,
  {
    name:
      | 'subagent_dispatched'
      | 'subagent_started'
      | 'subagent_completed'
      | 'subagent_failed'
      | 'subagent_timeout'
      | 'subagent_cancelled';
  }
> {
  return input.name.startsWith('subagent_');
}
