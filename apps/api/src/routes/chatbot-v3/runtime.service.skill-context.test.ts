import { describe, expect, it, vi } from 'vitest';
import { buildAgentTask, type AgentTask, type PhysicalAgent, type ReadPlan } from '@medical-crm/application';
import {
  ConversationOrchestratorV3RuntimeService,
  type ConversationOrchestratorV3Decision,
  type ConversationOrchestratorV3HandleTurnInput,
  type ConversationOrchestratorV3RuntimeDependencies,
} from './runtime.service.js';
import type { AgentAction, AgentName } from './agents.js';
import {
  createFallbackFaqWorkerTask,
  createFallbackRecommendationWorkerTask,
  createFallbackRecordsWorkerTask,
} from './worker-task.js';

const readPlan: ReadPlan = {
  reasonCode: 'consult_question',
  readIntents: [
    { type: 'GENERAL_FAQ', category: 'consult', reasonCode: 'consult_skill:faq' },
    { type: 'CONSULT_READINESS', reasonCode: 'consult_skill:readiness' },
  ],
};

const agentTask = buildAgentTask({
  event: {
    eventType: 'USER_ASKED_QUESTION',
    target: 'consult',
    modifier: 'ask',
    confidence: 0.9,
    source: 'llm',
  },
  turnPlan: {
    primaryAction: { type: 'ANSWER', target: 'consult', mode: 'faq' },
    followUpAction: { type: 'GO_DEEP', target: 'consult', reasonCode: 'consult_readiness_next' },
    primaryStage: 'EXPLAIN_PROCESS',
    factsPatch: {},
    reasonCode: 'consult_question',
    sidePath: { type: 'faq', primaryStagePreserved: true },
  },
  currentStage: 'EXPLAIN_PROCESS',
  resolvedAgent: {
    conceptualRole: 'GeneralResponseAgent',
    physicalAgent: 'FaqAgent',
    reasonCode: 'general_response_default',
  },
  latestUserMessage: 'How long does online consultation take?',
  conversationSummary: 'User selected a hospital and asked about consultation.',
  recentMessages: [{
    id: 'm-1',
    role: 'USER',
    content: 'I selected hospital-1.',
    createdAt: '2026-04-29T07:00:00.000Z',
  }],
  knownFacts: {
    language: 'zh',
    intake: { minimalTriageStatus: 'submitted', condition: 'lung cancer' },
    recommendation: { status: 'selected', selectedHospitalIds: ['hospital-1'] },
    process: { explained: true },
    records: { supportingDocumentsCount: 0, availableDocumentTypes: [], missingDocumentTypes: [] },
    consult: { status: 'not_started' },
    handoff: { active: false },
  },
  loadedSkillSections: [{
    skillId: 'consult_skill',
    role: 'primary',
    reasonCode: 'consult_question',
    sectionIds: ['consult_policy', 'consult_readiness'],
    readIntentTypes: ['GENERAL_FAQ', 'CONSULT_READINESS'],
    policyText: ['Answer consult questions before asking one readiness follow-up.'],
    retrievalGuidance: ['Retrieve consult FAQ and readiness criteria.'],
    handlingGuidance: ['Invite one next step that preserves the primary stage.'],
  }],
  readPlan,
  retrievedContext: [{
    readIntentId: 'read-consult',
    readIntent: readPlan.readIntents[0]!,
    snippets: [{ text: 'Online consultation is usually arranged after records are ready.', source: 'faq:consult', score: 0.93 }],
  }],
});

describe('runtime worker skill context bridge', () => {
  it.each([
    ['FaqAgent', 'faq.answer'],
    ['RecordsAgent', 'records.status'],
    ['RecommendationAgent', 'recommendation.generate'],
  ] as const)('passes loaded skill context into %s worker tasks', async (dispatchAgent, actionType) => {
    const execute = vi.fn(async () => ({
      status: 'ok' as const,
      data: dispatchAgent === 'FaqAgent'
        ? { answer: 'ok', citedFaqIds: [], confidence: 'medium' }
        : dispatchAgent === 'RecordsAgent'
          ? { 'records.minimal_triage.complete': false, questions: [], followUp: 'ok', missing: [] }
          : { recommendations: [] },
    }));
    const service = createRuntimeService(dispatchAgent, agentTask, execute);

    await service.handleTurn(createTurnInput());

    expect(execute).toHaveBeenCalledTimes(1);
    const action = execute.mock.calls[0]![0] as AgentAction;
    expect(action.type).toBe(actionType);
    expect(action.meta?.task).toMatchObject({
      selectedDomainSkills: ['consult_skill'],
      loadedSkillSections: agentTask.loadedSkillSections,
      readIntents: agentTask.readIntents,
      retrievedContext: agentTask.retrievedContext,
      responseContract: agentTask.responseContract,
    });
  });

  it('keeps fallback worker tasks initialized with empty guidance arrays', () => {
    expect(createFallbackFaqWorkerTask('faq')).toMatchObject({
      loadedSkillSections: [],
      readIntents: [],
      retrievedContext: [],
    });
    expect(createFallbackRecordsWorkerTask('records')).toMatchObject({
      loadedSkillSections: [],
      readIntents: [],
      retrievedContext: [],
    });
    expect(createFallbackRecommendationWorkerTask('recommend')).toMatchObject({
      loadedSkillSections: [],
      readIntents: [],
      retrievedContext: [],
    });
  });
});

function createRuntimeService(
  dispatchAgent: AgentName,
  task: AgentTask,
  execute: ConversationOrchestratorV3RuntimeDependencies['agents'][AgentName]['execute'],
): ConversationOrchestratorV3RuntimeService {
  return new ConversationOrchestratorV3RuntimeService({
    idempotency: {
      execute: async (_key, _operation, fn) => fn(),
    },
    supervisor: {
      suggest: async () => ({
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: 'consult question',
      }),
    },
    journeyRuntimeAuthority: {
      decide: () => createDecision(dispatchAgent, task),
    },
    gateway: {} as ConversationOrchestratorV3RuntimeDependencies['gateway'],
    agents: {
      [dispatchAgent]: { execute },
    },
  });
}

function createDecision(
  dispatchAgent: AgentName,
  task: AgentTask,
): ConversationOrchestratorV3Decision {
  return {
    action: 'STAY',
    from: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
    to: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
    primaryAction: task.primaryAction,
    resolvedAgent: {
      conceptualRole: dispatchAgentToConceptualRole(dispatchAgent),
      physicalAgent: dispatchAgent as PhysicalAgent,
      reasonCode: 'test',
    },
    readPlan,
    agentTask: task,
    skillWarnings: [],
    dispatchAgent,
    dispatchSource: 'journey-runtime-authority',
    matchedRuleId: 'consult_question',
  };
}

function dispatchAgentToConceptualRole(
  dispatchAgent: AgentName,
): AgentTask['resolvedAgent']['conceptualRole'] {
  if (dispatchAgent === 'FaqAgent') {
    return 'GeneralResponseAgent';
  }

  return dispatchAgent;
}

function createTurnInput(): ConversationOrchestratorV3HandleTurnInput {
  return {
    traceId: 'trace-1',
    sessionId: 'session-1',
    site: 'china',
    turnId: 'turn-1',
    message: 'How long does online consultation take?',
    current: { stage: 'EXPLAIN_PROCESS', phase: 'active' },
    statusSnapshot: {
      journeyCurrentStage: 'EXPLAIN_PROCESS',
      journeyCurrentPhase: 'active',
      conversationSummary: 'User selected a hospital and asked about consultation.',
    },
  };
}
