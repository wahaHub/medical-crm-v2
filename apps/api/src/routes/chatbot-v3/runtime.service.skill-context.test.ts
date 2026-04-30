import { describe, expect, it, vi } from 'vitest';
import { buildAgentTask, type AgentTask, type ReadPlan } from '@medical-crm/application';
import {
  ConversationOrchestratorV3RuntimeService,
  type ConversationOrchestratorV3Decision,
  type ConversationOrchestratorV3AgentExecutor,
  type ConversationOrchestratorV3HandleTurnInput,
  type ConversationOrchestratorV3RuntimeDependencies,
} from './runtime.service.js';
import type { AgentName } from './agents.js';
import {
  createFallbackFaqWorkerTask,
  createFallbackRecommendationWorkerTask,
  createFallbackRecordsWorkerTask,
} from './worker-task.js';

type BridgeDispatchAgent = 'FaqAgent' | 'RecordsAgent' | 'RecommendationAgent';
type AgentExecute = ConversationOrchestratorV3AgentExecutor['execute'];

const taskByDispatchAgent = {
  FaqAgent: createFaqAgentTask(),
  RecordsAgent: createRecordsAgentTask(),
  RecommendationAgent: createRecommendationAgentTask(),
} satisfies Record<BridgeDispatchAgent, AgentTask>;

describe('runtime worker skill context bridge', () => {
  it.each([
    ['FaqAgent', 'faq.answer'],
    ['RecordsAgent', 'records.status'],
    ['RecommendationAgent', 'recommendation.generate'],
  ] as const)('passes loaded skill context into %s worker tasks', async (dispatchAgent, actionType) => {
    const execute = vi.fn<AgentExecute>(async () => ({
      status: 'ok' as const,
      data: dispatchAgent === 'FaqAgent'
        ? { answer: 'ok', citedFaqIds: [], confidence: 'medium' }
        : dispatchAgent === 'RecordsAgent'
          ? { 'records.minimal_triage.complete': false, questions: [], followUp: 'ok', missing: [] }
          : { recommendations: [] },
    }));
    const agentTask = taskByDispatchAgent[dispatchAgent];
    const service = createRuntimeService(dispatchAgent, agentTask, execute);

    await service.handleTurn(createTurnInput());

    expect(execute).toHaveBeenCalledTimes(1);
    const action = execute.mock.calls[0]?.[0];
    expect(action).toBeDefined();
    expect(action?.type).toBe(actionType);
    expect(action?.meta?.task).toMatchObject({
      selectedDomainSkills: agentTask.loadedSkillSections.map((section) => section.skillId),
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

function createFaqAgentTask(): AgentTask {
  const readPlan: ReadPlan = {
    reasonCode: 'consult_question',
    readIntents: [
      { type: 'GENERAL_FAQ', category: 'consult', reasonCode: 'policy_skill:consult_sources' },
      { type: 'CONSULT_READINESS', reasonCode: 'policy_skill:consult_sources' },
    ],
  };

  return buildAgentTask({
    event: {
      eventType: 'USER_ASKED_QUESTION',
      target: 'consult',
      modifier: 'ask',
      confidence: 0.9,
      source: 'llm',
    },
    turnPlan: {
      primaryAction: { type: 'ANSWER', target: 'consult', mode: 'faq' },
      followUpAction: { type: 'GO_DEEP', target: 'consult', reasonCode: 'user_requested_more_detail' },
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
    recentMessages: recentMessages(),
    knownFacts: knownFacts(),
    loadedSkillSections: [{
      skillId: 'policy_skill',
      role: 'primary',
      reasonCode: 'consult_question',
      sectionIds: ['consult_readiness', 'consult_sources'],
      readIntentTypes: ['GENERAL_FAQ', 'CONSULT_READINESS'],
      policyText: ['Answer consult questions before asking one readiness follow-up.'],
      retrievalGuidance: ['Retrieve consult policy and readiness criteria.'],
      handlingGuidance: ['Invite one next step that preserves the primary stage.'],
    }],
    readPlan,
    retrievedContext: [{
      readIntentId: 'read-consult',
      readIntent: readPlan.readIntents[0]!,
      snippets: [{ text: 'Online consultation is usually arranged after records are ready.', source: 'faq:consult', score: 0.93 }],
    }],
  });
}

function createRecordsAgentTask(): AgentTask {
  const readPlan: ReadPlan = {
    reasonCode: 'collect_records',
    readIntents: [
      { type: 'RECORD_REQUIREMENTS', reasonCode: 'treatment_skill:treatment_requirements' },
    ],
  };

  return buildAgentTask({
    event: {
      eventType: 'USER_PROVIDED_INFORMATION',
      target: 'documents',
      modifier: 'provide',
      confidence: 0.9,
      source: 'llm',
    },
    turnPlan: {
      primaryAction: { type: 'REQUEST_INFO', target: 'treatment' },
      followUpAction: { type: 'NONE' },
      primaryStage: 'COLLECT_MEDICAL_INPUTS',
      factsPatch: {},
      reasonCode: 'medical_collection',
    },
    currentStage: 'COLLECT_MEDICAL_INPUTS',
    resolvedAgent: {
      conceptualRole: 'RecordsAgent',
      physicalAgent: 'RecordsAgent',
      reasonCode: 'records_collection',
    },
    latestUserMessage: 'I can share my records.',
    conversationSummary: 'User is preparing medical records for hospital review.',
    recentMessages: recentMessages(),
    knownFacts: knownFacts(),
    loadedSkillSections: [{
      skillId: 'treatment_skill',
      role: 'primary',
      reasonCode: 'collect_records',
      sectionIds: ['treatment_requirements'],
      readIntentTypes: ['RECORD_REQUIREMENTS'],
      policyText: ['Collect only the record or medical fact needed for the active stage.'],
      retrievalGuidance: ['Use record requirements to name the next useful document.'],
      handlingGuidance: ['Acknowledge what the user shared and ask one focused next step.'],
    }],
    readPlan,
    retrievedContext: [{
      readIntentId: 'read-records',
      readIntent: readPlan.readIntents[0]!,
      snippets: [{ text: 'Diagnosis proof, imaging, pathology, and treatment history help hospital review.', source: 'treatment:requirements', score: 0.91 }],
    }],
  });
}

function createRecommendationAgentTask(): AgentTask {
  const readPlan: ReadPlan = {
    reasonCode: 'recommend_hospitals',
    readIntents: [
      { type: 'HOSPITAL_CANDIDATES', reasonCode: 'hospital_skill:hospital_sources' },
      { type: 'HOSPITAL_FAQ', category: 'hospital', reasonCode: 'hospital_skill:hospital_sources' },
      { type: 'DOCTOR_MATCHING_CONTEXT', reasonCode: 'hospital_skill:hospital_sources' },
    ],
  };

  return buildAgentTask({
    event: {
      eventType: 'USER_EXPRESSED_INTEREST',
      target: 'hospital',
      modifier: 'provide',
      confidence: 0.9,
      source: 'llm',
    },
    turnPlan: {
      primaryAction: { type: 'PRESENT_OPTIONS', target: 'hospital' },
      followUpAction: { type: 'NONE' },
      primaryStage: 'RECOMMENDATION',
      factsPatch: {},
      reasonCode: 'recommend_hospitals',
    },
    currentStage: 'RECOMMENDATION',
    resolvedAgent: {
      conceptualRole: 'RecommendationAgent',
      physicalAgent: 'RecommendationAgent',
      reasonCode: 'recommendation_options',
    },
    latestUserMessage: 'Please recommend hospitals.',
    conversationSummary: 'User needs hospital recommendations for lung cancer care in China.',
    recentMessages: recentMessages(),
    knownFacts: knownFacts(),
    loadedSkillSections: [{
      skillId: 'hospital_skill',
      role: 'primary',
      reasonCode: 'recommend_hospitals',
      sectionIds: ['hospital_sources'],
      readIntentTypes: ['HOSPITAL_CANDIDATES', 'HOSPITAL_FAQ', 'DOCTOR_MATCHING_CONTEXT'],
      policyText: ['Use candidate recommendations, retrieved hospital context, known facts, and user preferences.'],
      retrievalGuidance: ['Use approved recommendation candidates and hospital context before comparing options.'],
      handlingGuidance: ['Connect the expressed need to the current recommendation options.'],
    }],
    readPlan,
    retrievedContext: [{
      readIntentId: 'read-hospitals',
      readIntent: readPlan.readIntents[0]!,
      snippets: [{ text: 'Candidate hospitals should be filtered by department fit, location, and patient preference.', source: 'hospital:candidates', score: 0.95 }],
    }],
  });
}

function recentMessages(): AgentTask['recentMessages'] {
  return [{
    id: 'm-1',
    role: 'USER',
    content: 'I selected hospital-1.',
    createdAt: '2026-04-29T07:00:00.000Z',
  }];
}

function knownFacts(): AgentTask['knownFacts'] {
  return {
    language: 'zh',
    intake: { minimalTriageStatus: 'submitted', condition: 'lung cancer' },
    recommendation: { status: 'selected', selectedHospitalIds: ['hospital-1'] },
    process: { explained: true },
    records: { supportingDocumentsCount: 0, availableDocumentTypes: [], missingDocumentTypes: [] },
    consult: { status: 'not_started' },
    handoff: { active: false },
  };
}

function createRuntimeService(
  dispatchAgent: AgentName,
  task: AgentTask,
  execute: AgentExecute,
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
    resolvedAgent: task.resolvedAgent,
    readPlan: {
      reasonCode: 'test',
      readIntents: task.readIntents,
    },
    agentTask: task,
    skillWarnings: [],
    dispatchAgent,
    dispatchSource: 'journey-runtime-authority',
    matchedRuleId: 'consult_question',
  };
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
