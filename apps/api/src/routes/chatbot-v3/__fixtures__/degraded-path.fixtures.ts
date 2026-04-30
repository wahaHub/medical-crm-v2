import type {
  AiChatStatusSnapshot,
} from '@medical-crm/domain';
import type {
  ChatbotV3ChatRequest,
} from '@medical-crm/validation';
import type {
  ConversationOrchestratorV3TurnResult,
} from '../runtime.service.js';
import type {
  FaqAnswerResult,
} from '../faq-llm-adapter.js';
import type {
  FaqItemRecord,
} from '../tool-gateway.js';

export interface FaqAnswerEvalFixture {
  id: string;
  bucket: string;
  latestUserMessage: string;
  matches: FaqItemRecord[];
  details: FaqItemRecord[];
  rawAnswer: unknown;
  expected: FaqAnswerResult;
  expectedMetadata: {
    fallbackUsed: boolean;
    schemaValidationFailed: boolean;
  };
}

export interface DegradedPathFixture {
  id: string;
  family: string;
  body: ChatbotV3ChatRequest;
  result: ConversationOrchestratorV3TurnResult;
  sessionStatusSnapshot: Partial<AiChatStatusSnapshot> | null;
  expected: {
    assistantTextContains: string;
    assistantTextOmits?: string[];
    cardType: string;
    handoffRequired: boolean;
    turnOutcomeStatus: 'ok' | 'degraded';
  };
}

function createRequest(
  message: string,
): ChatbotV3ChatRequest {
  return {
    sessionId: 'session-1',
    message,
  };
}

function createResult(
  overrides: Partial<ConversationOrchestratorV3TurnResult>,
): ConversationOrchestratorV3TurnResult {
  return {
    suggestion: {
      intent: 'progression',
      suggestedStage: 'EXPLAIN_PROCESS',
      reason: 'baseline suggestion',
    },
    decision: {
      action: 'STAY',
      from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
      dispatchSource: 'journey-runtime-authority',
    },
    journey: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
    dispatchResult: null,
    fallbackStatus: null,
    turnOutcome: {
      status: 'ok',
      recoverableErrorCode: null,
    },
    runtimeDebug: {
      traceId: 'trace-1',
      idempotencyKey: 'session-1:turn-1:chatbot-v3-turn',
    },
    render: {
      path: 'STAGE_GUIDANCE',
    },
    ...overrides,
  };
}

const FAQ_ITEM: FaqItemRecord = {
  id: 'faq-1',
  question: 'How long does online consultation take?',
  answer: 'Online consultations are usually arranged within 24 hours.',
  category: 'Online Consultation',
};

export const FAQ_ANSWER_EVAL_FIXTURES: FaqAnswerEvalFixture[] = [
  {
    id: 'faq-degraded-fallback-no-grounding',
    bucket: 'FAQ degraded fallback',
    latestUserMessage: 'Can you tell me about transfer timing?',
    matches: [],
    details: [],
    rawAnswer: {
      answer: '',
      citedFaqIds: [],
      confidence: 'extreme',
    },
    expected: {
      answer: 'I can help with that, but I could not find an exact FAQ answer yet for "Can you tell me about transfer timing?".',
      citedFaqIds: [],
      confidence: 'low',
    },
    expectedMetadata: {
      fallbackUsed: true,
      schemaValidationFailed: true,
    },
  },
  {
    id: 'faq-low-confidence-grounded-answer',
    bucket: 'FAQ low confidence',
    latestUserMessage: 'How long does online consultation take to arrange?',
    matches: [FAQ_ITEM],
    details: [FAQ_ITEM],
    rawAnswer: {
      answer: 'Online consultations are usually arranged within 24 hours.',
      citedFaqIds: ['faq-1'],
      confidence: 'low',
    },
    expected: {
      answer: 'Online consultations are usually arranged within 24 hours.',
      citedFaqIds: ['faq-1'],
      confidence: 'low',
    },
    expectedMetadata: {
      fallbackUsed: false,
      schemaValidationFailed: false,
    },
  },
];

export const DEGRADED_PATH_FIXTURES: DegradedPathFixture[] = [
  {
    id: 'faq-degraded-timeout',
    family: 'faq_degraded',
    body: createRequest('Can you explain the process?'),
    result: createResult({
      suggestion: {
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: 'faq lookup timed out',
      },
      decision: {
        action: 'STAY',
        from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
        to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
        dispatchAgent: 'FaqAgent',
        dispatchSource: 'journey-runtime-authority',
      },
      dispatchResult: {
        status: 'error',
        code: 'TIMEOUT',
        message: 'faq.search timed out',
      },
      turnOutcome: {
        status: 'degraded',
        recoverableErrorCode: 'TIMEOUT',
      },
    }),
    sessionStatusSnapshot: null,
    expected: {
      assistantTextContains: 'I could not load that answer just now, but your current stage is still saved. Please try asking again.',
      cardType: 'PROCESS_GUIDE',
      handoffRequired: false,
      turnOutcomeStatus: 'degraded',
    },
  },
  {
    id: 'faq-low-confidence-answer',
    family: 'faq_low_confidence',
    body: createRequest('Please explain the process.'),
    result: createResult({
      suggestion: {
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: 'grounded faq answer is low confidence',
      },
      decision: {
        action: 'STAY',
        from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
        to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
        dispatchAgent: 'FaqAgent',
        dispatchSource: 'journey-runtime-authority',
      },
      dispatchResult: {
        status: 'ok',
        data: {
          answer: 'Online consultations are usually arranged within 24 hours.',
          citedFaqIds: ['faq-1'],
          confidence: 'low',
        },
      },
      render: {
        path: 'PROCESS_OVERVIEW',
      },
    }),
    sessionStatusSnapshot: null,
    expected: {
      assistantTextContains: 'Here is the process',
      assistantTextOmits: ['Online consultations are usually arranged within 24 hours.'],
      cardType: 'PROCESS_GUIDE',
      handoffRequired: false,
      turnOutcomeStatus: 'ok',
    },
  },
  {
    id: 'recommendation-degraded-timeout',
    family: 'recommendation_degraded',
    body: createRequest('Show me more hospitals.'),
    result: createResult({
      suggestion: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        reason: 'refresh recommendation options',
      },
      decision: {
        action: 'STAY',
        from: { stage: 'RECOMMENDATION', phase: 'active' },
        to: { stage: 'RECOMMENDATION', phase: 'active' },
        dispatchAgent: 'RecommendationAgent',
        dispatchSource: 'journey-runtime-authority',
      },
      journey: { stage: 'RECOMMENDATION', phase: 'active' },
      dispatchResult: {
        status: 'error',
        code: 'TIMEOUT',
        message: 'recommendation.generate timed out',
      },
      turnOutcome: {
        status: 'degraded',
        recoverableErrorCode: 'TIMEOUT',
      },
    }),
    sessionStatusSnapshot: null,
    expected: {
      assistantTextContains: 'I could not refresh the hospital recommendations just now, but your current stage is still saved. Please try again in this chat.',
      cardType: 'RECOMMENDATION_LIST',
      handoffRequired: false,
      turnOutcomeStatus: 'degraded',
    },
  },
  {
    id: 'consult-degraded-upstream',
    family: 'consult_degraded',
    body: createRequest('Please schedule the consultation.'),
    result: createResult({
      suggestion: {
        intent: 'consult',
        suggestedStage: 'ONLINE_CONSULT',
        reason: 'continue with consult scheduling',
      },
      decision: {
        action: 'ADVANCE',
        from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'post' },
        to: { stage: 'ONLINE_CONSULT', phase: 'active' },
        dispatchAgent: 'ConsultAgent',
        dispatchSource: 'journey-runtime-authority',
      },
      journey: { stage: 'ONLINE_CONSULT', phase: 'active' },
      dispatchResult: {
        status: 'error',
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'consult.schedule upstream unavailable',
      },
      turnOutcome: {
        status: 'degraded',
        recoverableErrorCode: 'UPSTREAM_UNAVAILABLE',
      },
    }),
    sessionStatusSnapshot: null,
    expected: {
      assistantTextContains: 'I could not complete the consultation step just now, but your current stage is still saved. Please try again in this chat.',
      cardType: 'CONSULT_BOOKING',
      handoffRequired: false,
      turnOutcomeStatus: 'degraded',
    },
  },
  {
    id: 'handoff-denied-prerequisites',
    family: 'handoff_denied',
    body: createRequest('I want a human now.'),
    result: createResult({
      suggestion: {
        intent: 'handoff',
        suggestedStage: 'HUMAN_HANDOFF',
        reason: 'user requested a human',
      },
      decision: {
        action: 'STAY',
        from: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
        to: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
        dispatchSource: 'journey-runtime-authority',
      },
      journey: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
    }),
    sessionStatusSnapshot: {
      docUploadStatus: 'none',
    },
    expected: {
      assistantTextContains: 'Before we connect you with a human',
      cardType: 'UPLOAD_RECORDS',
      handoffRequired: false,
      turnOutcomeStatus: 'ok',
    },
  },
];
