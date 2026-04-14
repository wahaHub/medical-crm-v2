import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import {
  chatbotV3ChatRequestSchema,
  chatbotV3ChatResponseSchema,
  type ChatbotV3Card,
  type ChatbotV3ChatRequest,
  type ChatbotV3ChatResponse,
} from '@medical-crm/validation';
import type { ChatJourneyStage } from '@medical-crm/domain';
import type { ToolResult } from './chatbot-v3/tool-gateway.js';
import { getServices } from '../composition-root.js';
import {
  ConsultAgent,
  FaqAgent,
  HandoffAgent,
  RecommendationAgent,
  RecordsAgent,
} from './chatbot-v3/agents.js';
import {
  ConversationOrchestratorV3RuntimeService,
  type ConversationOrchestratorV3TurnResult,
} from './chatbot-v3/runtime.service.js';
import { createToolGateway } from './chatbot-v3/tool-gateway.js';

export const chatbotV3PublicRoutes = new Hono();

chatbotV3PublicRoutes.post('/api/v3/chatbot/chat', async (c) => {
  const body = chatbotV3ChatRequestSchema.parse(await c.req.json());
  const services = getServices();
  const runtime = createRuntime(services.idempotencyExecutor);
  const result = await runtime.handleTurn({
    sessionId: body.sessionId,
    turnId: randomUUID(),
    message: body.message,
    attachments: body.attachments,
    current: {
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
    },
    suggestion: inferSuggestion(body),
    facts: {
      'records.saved': (body.attachments?.length ?? 0) > 0,
    },
  });
  const response = chatbotV3ChatResponseSchema.parse(buildResponse(body, result));

  return c.json(response);
});

function createRuntime(idempotency: { execute: <T>(key: string, operation: string, fn: () => Promise<T>) => Promise<T> }) {
  const gateway = createToolGateway({
    handlers: {
      faq: {
        search: async ({ query, sessionId }) => ({
          hits: [{
            kind: 'faq',
            query,
            sessionId,
          }],
        }),
      },
      records: {
        upload: async ({ attachments }) => ({
          accepted: true,
          uploadId: attachments?.length ? 'upload-records' : undefined,
        }),
        status: async () => ({
          state: 'idle',
        }),
      },
      recommendation: {
        generate: async () => ({
          recommendations: [{
            hospitalId: 'hospital-demo',
            name: 'Coastal Care Center',
            reason: 'Initial fit based on your request',
          }],
        }),
        status: async () => ({
          state: 'idle',
        }),
      },
      consult: {
        status: async () => ({
          state: 'idle',
        }),
      },
      status: {
        query: async () => ({
          snapshot: {},
        }),
      },
      handoff: {
        create: async () => ({
          created: true,
          handoffId: 'handoff-requested',
        }),
      },
    },
  });

  return new ConversationOrchestratorV3RuntimeService({
    idempotency,
    supervisor: {
      suggest: async (input) => input.suggestion,
    },
    orchestrator: {
      decide: ({ current, suggestion }) => ({
        action: current.stage === suggestion.suggestedStage ? 'STAY' : 'ADVANCE',
        from: current,
        to: {
          stage: suggestion.suggestedStage,
          phase: 'active',
        },
        dispatchAgent: resolveAgent(suggestion.suggestedStage),
        dispatchSource: 'orchestrator',
      }),
    },
    gateway: {
      status: gateway.status,
    },
    agents: {
      FaqAgent: new FaqAgent(gateway),
      RecordsAgent: new RecordsAgent(gateway),
      RecommendationAgent: new RecommendationAgent(gateway),
      ConsultAgent: new ConsultAgent(gateway),
      HandoffAgent: new HandoffAgent(gateway),
    },
  });
}

function inferSuggestion(body: ChatbotV3ChatRequest) {
  const message = body.message.trim().toLowerCase();

  if (message.includes('human') || message.includes('agent')) {
    return {
      intent: 'handoff' as const,
      suggestedStage: 'HUMAN_HANDOFF' as const,
      reason: 'user requested a human follow-up',
    };
  }

  if (message.includes('consult')) {
    return {
      intent: 'consult' as const,
      suggestedStage: 'ONLINE_CONSULT' as const,
      reason: 'user is asking about consultation',
    };
  }

  if (message.includes('recommend')) {
    return {
      intent: 'progression' as const,
      suggestedStage: 'RECOMMENDATION' as const,
      reason: 'user is asking for a recommendation',
    };
  }

  if ((body.attachments?.length ?? 0) > 0) {
    return {
      intent: 'resource' as const,
      suggestedStage: 'COLLECT_MEDICAL_INPUTS' as const,
      reason: 'attachments are available for review',
    };
  }

  return {
    intent: 'faq' as const,
    suggestedStage: 'EXPLAIN_PROCESS' as const,
    reason: 'provide the process overview first',
  };
}

function resolveAgent(stage: ChatJourneyStage) {
  switch (stage) {
    case 'EXPLAIN_PROCESS':
      return 'FaqAgent' as const;
    case 'COLLECT_MEDICAL_INPUTS':
      return 'RecordsAgent' as const;
    case 'RECOMMENDATION':
      return 'RecommendationAgent' as const;
    case 'ONLINE_CONSULT':
      return 'ConsultAgent' as const;
    case 'HUMAN_HANDOFF':
      return 'HandoffAgent' as const;
  }
}

function buildResponse(
  body: ChatbotV3ChatRequest,
  result: ConversationOrchestratorV3TurnResult,
): ChatbotV3ChatResponse {
  const stage = result.journey.stage;
  const handoffId = readHandoffId(result.dispatchResult);

  return {
    messages: [{
      role: 'assistant',
      text: buildAssistantText(body, result),
    }],
    turnOutcome: result.turnOutcome,
    cards: buildCards(stage, body, result),
    journey: result.journey,
    handoff: {
      required: stage === 'HUMAN_HANDOFF',
      ticketId: handoffId,
    },
  };
}

function buildAssistantText(
  body: ChatbotV3ChatRequest,
  result: ConversationOrchestratorV3TurnResult,
): string {
  if (result.turnOutcome.status === 'degraded') {
    return 'I hit a temporary issue, but I kept your journey state and can continue from here.';
  }

  switch (result.journey.stage) {
    case 'EXPLAIN_PROCESS':
      return 'Here is a quick overview of how the medical travel process works.';
    case 'COLLECT_MEDICAL_INPUTS':
      return (body.attachments?.length ?? 0) > 0
        ? 'I received your records and the next step is reviewing them.'
        : 'Please upload your medical records so I can guide the next step.';
    case 'RECOMMENDATION':
      return 'I am ready to organize recommendation options for you.';
    case 'ONLINE_CONSULT':
      return 'The next step is scheduling an online consultation.';
    case 'HUMAN_HANDOFF':
      return 'I am connecting you with a human care coordinator.';
  }
}

function buildCards(
  stage: ChatJourneyStage,
  body: ChatbotV3ChatRequest,
  result: ConversationOrchestratorV3TurnResult,
): ChatbotV3Card[] {
  switch (stage) {
    case 'EXPLAIN_PROCESS':
      return [{
        cardId: 'card-process-guide',
        cardType: 'PROCESS_GUIDE',
        payload: {
          guideId: 'medical-travel-process',
          title: 'Medical travel process',
        },
        actions: [{
          actionType: 'OPEN_MODAL',
          label: 'View process',
          params: {
            modalKey: 'MEDICAL_TRAVEL_PROCESS',
          },
        }],
      }];
    case 'COLLECT_MEDICAL_INPUTS':
      return [{
        cardId: 'card-upload-records',
        cardType: 'UPLOAD_RECORDS',
        payload: {
          required: true,
          uploadedCount: body.attachments?.length ?? 0,
        },
        actions: [{
          actionType: 'SUBMIT',
          label: 'Upload records',
          params: {
            actionKey: 'UPLOAD_RECORDS',
          },
        }],
      }];
    case 'RECOMMENDATION':
      return [{
        cardId: 'card-recommendations',
        cardType: 'RECOMMENDATION_LIST',
        payload: {
          candidates: readRecommendations(result.dispatchResult),
        },
        actions: [{
          actionType: 'SUBMIT',
          label: 'Select hospital',
          params: {
            hospitalId: 'hospital-demo',
          },
        }],
      }];
    case 'ONLINE_CONSULT':
      return [{
        cardId: 'card-consult-booking',
        cardType: 'CONSULT_BOOKING',
        payload: {
          status: 'idle',
        },
        actions: [{
          actionType: 'SUBMIT',
          label: 'Book consult',
          params: {
            actionKey: 'CONSULT_BOOKING',
          },
        }],
      }];
    case 'HUMAN_HANDOFF':
      return [{
        cardId: 'card-handoff-status',
        cardType: 'HANDOFF_STATUS',
        payload: {
          required: true,
          ...(readHandoffId(result.dispatchResult) ? { ticketId: readHandoffId(result.dispatchResult) ?? undefined } : {}),
        },
        actions: [{
          actionType: 'OPEN_URL',
          label: 'Open handoff portal',
          params: {
            actionKey: 'HANDOFF_PORTAL',
          },
        }],
      }];
  }
}

function readRecommendations(dispatchResult: ToolResult<unknown> | null) {
  if (dispatchResult?.status !== 'ok') {
    return [{
      hospitalId: 'hospital-demo',
      name: 'Coastal Care Center',
      reason: 'Initial fit based on your request',
    }];
  }

  const recommendations = asRecord(dispatchResult.data)['recommendations'];
  if (!Array.isArray(recommendations)) {
    return [{
      hospitalId: 'hospital-demo',
      name: 'Coastal Care Center',
      reason: 'Initial fit based on your request',
    }];
  }

  return recommendations.map((candidate, index) => {
    const record = asRecord(candidate);

    return {
      hospitalId: asString(record['hospitalId']) ?? `hospital-${index + 1}`,
      name: asString(record['name']) ?? `Recommendation ${index + 1}`,
      ...(asString(record['reason']) ? { reason: asString(record['reason']) ?? undefined } : {}),
    };
  });
}

function readHandoffId(dispatchResult: ToolResult<unknown> | null): string | null {
  if (dispatchResult?.status !== 'ok') {
    return null;
  }

  const handoffId = asString(asRecord(dispatchResult.data)['handoffId']);
  return handoffId ?? null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
