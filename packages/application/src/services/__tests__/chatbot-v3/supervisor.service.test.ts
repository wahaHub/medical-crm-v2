import { describe, expect, it } from 'vitest';
import {
  SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT,
  type OrchestratorV3DecisionInput,
  type SupervisorGatewayInput,
} from '../../chatbot-v3/types.js';
import {
  SUPERVISOR_AGENT_REGISTRY,
  renderSupervisorAgentRegistry,
} from '../../chatbot-v3/supervisor-registry.js';
import { SupervisorService } from '../../chatbot-v3/supervisor.service.js';
import {
  SUPERVISOR_EVAL_FIXTURES,
} from './fixtures/supervisor-eval.fixtures.js';

describe('SupervisorService', () => {
  const supervisor = new SupervisorService();

  const minimalInput: OrchestratorV3DecisionInput = {
    currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const,
    conversationSummary: 'The session just started and no recommendation has been shown yet.',
    latestUserMessage: 'Please recommend hospitals for me.',
    intake: {
      condition: 'lung cancer',
      targetDestination: 'Shanghai',
      language: 'en',
      gender: 'female',
    },
    current: {
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const,
      phase: 'active' as const,
    },
    suggestion: {
      intent: 'progression' as const,
      suggestedStage: 'RECOMMENDATION' as const,
      reason: 'minimal triage is complete',
    },
    facts: {
      'records.minimal_triage.complete': true,
    },
    statusSnapshot: {
      journeyCurrentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      journeyCurrentPhase: 'active',
      minimalTriageStatus: 'skipped',
      minimalTriageAnswersSummary: null,
      minimalTriageComplete: true,
      recommendationSelectionStatus: 'pending',
      recommendationSelectedHospitalIds: [],
      supportingDocuments: [],
    },
    availableReadDomains: ['records.status', 'recommendation.status'] as const,
  };

  it('returns the full main-agent contract with dispatchAgent and task', async () => {
    const result = await supervisor.suggest(minimalInput);

    expect(result).toEqual({
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      dispatchAgent: 'RecommendationAgent',
      reason: 'minimal triage is complete and recommendation should begin',
      task: {
        goal: 'Generate hospital recommendations for this user.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'intake.condition': 'lung cancer',
          'intake.target_destination': 'Shanghai',
          'intake.language': 'en',
          'intake.gender': 'female',
          'recommendation.generated': true,
          'recommendation.selected': false,
          'records.minimal_triage.complete': true,
        },
      },
    });
  });

  it('treats pending minimal triage with an answers summary as recommendation-ready even when the proposal starts on minimal facts', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      suggestion: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        reason: 'summary-backed triage is complete',
      },
      facts: {
        'records.minimal_triage.complete': false,
      },
      statusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
        minimalTriageComplete: false,
      },
    });

    expect(result).toEqual({
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      dispatchAgent: 'RecommendationAgent',
      reason: 'minimal triage is complete and recommendation should begin',
      task: {
        goal: 'Generate hospital recommendations for this user.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'intake.condition': 'lung cancer',
          'intake.target_destination': 'Shanghai',
          'intake.language': 'en',
          'intake.gender': 'female',
          'recommendation.generated': true,
          'recommendation.selected': false,
          'records.minimal_triage.complete': true,
        },
      },
    });
  });

  it('treats skipped minimal triage as recommendation-ready even when the proposal starts on minimal facts', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      suggestion: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        reason: 'skipped triage should still allow recommendation',
      },
      facts: {
        'records.minimal_triage.complete': false,
      },
      statusSnapshot: {
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: false,
      },
    });

    expect(result).toEqual({
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      dispatchAgent: 'RecommendationAgent',
      reason: 'minimal triage is complete and recommendation should begin',
      task: {
        goal: 'Generate hospital recommendations for this user.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'intake.condition': 'lung cancer',
          'intake.target_destination': 'Shanghai',
          'intake.language': 'en',
          'intake.gender': 'female',
          'recommendation.generated': true,
          'recommendation.selected': false,
          'records.minimal_triage.complete': true,
        },
      },
    });
  });

  it('keeps pending minimal triage without an answers summary blocked from recommendation even when stale facts say complete', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      facts: {
        'records.minimal_triage.complete': true,
      },
      statusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: false,
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        reason: 'triage is still incomplete',
      },
    });

    expect(result.suggestedStage).toBe('COLLECT_MINIMAL_MEDICAL_FACTS');
    expect(result.dispatchAgent).toBe('RecordsAgent');
    expect(result.reason).toBe('triage is still incomplete');
  });

  it('keeps empty structured snapshots blocked from recommendation even when legacy facts claim completion', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      suggestion: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        reason: 'empty structured snapshots should stay on minimal triage',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
      statusSnapshot: {},
    });

    expect(result.suggestedStage).toBe('COLLECT_MINIMAL_MEDICAL_FACTS');
    expect(result.dispatchAgent).toBe('RecordsAgent');
    expect(result.reason).toBe('empty structured snapshots should stay on minimal triage');
  });

  it('honors raw legacy minimalTriageComplete truth when structured triage status is absent', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      suggestion: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        reason: 'legacy completion truth should allow recommendation',
      },
      facts: {
        'records.minimal_triage.complete': false,
      },
      statusSnapshot: {
        minimalTriageComplete: true,
      },
    });

    expect(result.suggestedStage).toBe('RECOMMENDATION');
    expect(result.dispatchAgent).toBe('RecommendationAgent');
    expect(result.reason).toBe('minimal triage is complete and recommendation should begin');
    expect(result.task?.necessaryFacts['records.minimal_triage.complete']).toBe(true);
  });

  it.each([
    'What are your hours?',
    'do you guys even work on sundays lol',
    'if i already got scans done elsewhere is that okay or annoying for you',
    'how long are people usually stuck in china for this, roughly',
  ])('routes early-stage faq-like input to FAQ handling: %s', async (latestUserMessage) => {
    const result = await supervisor.suggest({
      ...minimalInput,
      latestUserMessage,
      suggestion: {
        intent: 'unknown',
        suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        reason: 'upstream classifier did not recognize the FAQ turn',
      },
    });

    expect(result).toEqual({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'clear faq-style question should detour through FAQ handling without rewriting the primary stage',
      task: {
        goal: 'Answer the user\'s question using FAQ knowledge only.',
        latestUserMessage,
        necessaryFacts: {
          'current.stage': 'COLLECT_MINIMAL_MEDICAL_FACTS',
          'intake.target_destination': 'Shanghai',
        },
      },
    });
  });

  it('does not misclassify a progression question as FAQ when progression is already suggested', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      latestUserMessage: 'What should I do next?',
      suggestion: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        reason: 'continue the workflow',
      },
    });

    expect(result.intent).toBe('progression');
    expect(result.suggestedStage).toBe('RECOMMENDATION');
    expect(result.dispatchAgent).toBe('RecommendationAgent');
  });

  it('normalizes progression EXPLAIN_PROCESS to null dispatch even when the gateway names FaqAgent', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v2',
      run: async () => ({
        intent: 'progression',
        suggestedStage: 'EXPLAIN_PROCESS',
        dispatchAgent: 'FaqAgent',
        reason: 'present the process overview',
      }),
    });

    await expect(supervisorWithGateway.suggest({
      ...minimalInput,
      latestUserMessage: 'What is next?',
      currentStage: 'RECOMMENDATION',
      current: {
        stage: 'RECOMMENDATION',
        phase: 'post',
      },
      statusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'post',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [],
      },
      facts: {
        'recommendation.selected': true,
        'process.explained': false,
      },
    })).resolves.toEqual({
      intent: 'progression',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: null,
      reason: 'present the process overview',
    });
  });

  it('recovers a clear FAQ question from early-stage progression input even when upstream intent is not unknown', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      latestUserMessage: 'What are your office hours?',
      suggestion: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        reason: 'upstream classifier missed the FAQ turn',
      },
      facts: {
        'records.minimal_triage.complete': false,
      },
    });

    expect(result).toEqual({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'clear faq-style question should detour through FAQ handling without rewriting the primary stage',
      task: {
        goal: 'Answer the user\'s question using FAQ knowledge only.',
        latestUserMessage: 'What are your office hours?',
        necessaryFacts: {
          'current.stage': 'COLLECT_MINIMAL_MEDICAL_FACTS',
          'intake.target_destination': 'Shanghai',
        },
      },
    });
  });

  it('preserves a resource detour from EXPLAIN_PROCESS even when upstream intent is progression', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      currentStage: 'EXPLAIN_PROCESS',
      current: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'EXPLAIN_PROCESS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [],
      },
      latestUserMessage: 'Send me the address.',
      suggestion: {
        intent: 'progression',
        suggestedStage: 'ONLINE_CONSULT',
        reason: 'upstream classifier missed the resource request',
      },
      facts: {
        'recommendation.selected': true,
        'process.explained': true,
      },
    });

    expect(result).toEqual({
      intent: 'resource',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'clear resource request should detour through FAQ handling without rewriting the primary stage',
      task: {
        goal: 'Answer the user\'s question using FAQ knowledge only.',
        latestUserMessage: 'Send me the address.',
        necessaryFacts: {
          'current.stage': 'EXPLAIN_PROCESS',
          'intake.target_destination': 'Shanghai',
        },
      },
    });
  });

  it('routes a workflow question into a null-dispatch process explanation instead of FAQ handling', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      currentStage: 'RECOMMENDATION',
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [],
      },
      latestUserMessage: 'What should I do next?',
      suggestion: {
        intent: 'unknown',
        suggestedStage: 'EXPLAIN_PROCESS',
        dispatchAgent: null,
        reason: 'upstream classifier missed the workflow question',
      },
    });

    expect(result.intent).toBe('progression');
    expect(result.suggestedStage).toBe('EXPLAIN_PROCESS');
    expect(result.dispatchAgent).toBeNull();
    expect(result).not.toHaveProperty('task');
  });

  it('does not misclassify a records upload question as FAQ when the turn continues medical input collection', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [],
      },
      latestUserMessage: 'Can I upload the scan now?',
      suggestion: {
        intent: 'progression',
        suggestedStage: 'ONLINE_CONSULT',
        reason: 'continue collecting supporting documents',
      },
    });

    expect(result).toEqual({
      intent: 'progression',
      suggestedStage: 'COLLECT_MEDICAL_INPUTS',
      dispatchAgent: 'RecordsAgent',
      reason: 'clear records-sharing follow-up should stay on medical input collection',
      task: {
        goal: 'Collect the medical inputs needed to support online consultation for this user.',
        latestUserMessage: 'Can I upload the scan now?',
        necessaryFacts: {
          'intake.condition': 'lung cancer',
          'intake.target_destination': 'Shanghai',
          'recommendation.selected': true,
          'records.minimal_triage.complete': true,
        },
      },
    });
  });

  it('does not detour an unknown upload question into FAQ handling', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [],
      },
      latestUserMessage: 'Can I upload the scan now?',
      suggestion: {
        intent: 'unknown',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: 'upstream classifier missed the records-follow-up question',
      },
    });

    expect(result).toEqual({
      intent: 'progression',
      suggestedStage: 'COLLECT_MEDICAL_INPUTS',
      dispatchAgent: 'RecordsAgent',
      reason: 'clear records-sharing follow-up should stay on medical input collection',
      task: {
        goal: 'Collect the medical inputs needed to support online consultation for this user.',
        latestUserMessage: 'Can I upload the scan now?',
        necessaryFacts: {
          'intake.condition': 'lung cancer',
          'intake.target_destination': 'Shanghai',
          'recommendation.selected': true,
          'records.minimal_triage.complete': true,
        },
      },
    });
  });

  it('keeps later-stage resource detours available even for question-shaped address requests', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [],
      },
      latestUserMessage: 'Can you send me the address?',
      suggestion: {
        intent: 'unknown',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: 'upstream classifier did not recognize the resource request',
      },
    });

    expect(result).toEqual({
      intent: 'resource',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'clear later-stage faq request should detour without advancing the journey',
      task: {
        goal: 'Answer the user\'s question using FAQ knowledge only.',
        latestUserMessage: 'Can you send me the address?',
        necessaryFacts: {
          'current.stage': 'COLLECT_MEDICAL_INPUTS',
          'intake.target_destination': 'Shanghai',
        },
      },
    });
  });

  it('prefers process explanation after recommendation selection when the process has not been explained', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      currentStage: 'RECOMMENDATION',
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [],
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'ONLINE_CONSULT',
        reason: 'recommendation was selected',
      },
      facts: {
        'recommendation.selected': true,
        'process.explained': false,
      },
    });

    expect(result).toEqual({
      intent: 'progression',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: null,
      reason: 'recommendation selected and process explanation should follow',
    });
    expect(result).not.toHaveProperty('task');
  });

  it('prefers supporting-document collection after process explanation when no documents exist yet', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      currentStage: 'EXPLAIN_PROCESS',
      current: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'EXPLAIN_PROCESS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [],
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'ONLINE_CONSULT',
        reason: 'recommendation was selected and process was explained',
      },
      facts: {
        'recommendation.selected': true,
        'process.explained': true,
      },
    });

    expect(result).toEqual({
      intent: 'progression',
      suggestedStage: 'COLLECT_MEDICAL_INPUTS',
      dispatchAgent: 'RecordsAgent',
      reason: 'supporting documents should be collected before online consult',
      task: {
        goal: 'Collect the medical inputs needed to support online consultation for this user.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'intake.condition': 'lung cancer',
          'intake.target_destination': 'Shanghai',
          'recommendation.selected': true,
          'records.minimal_triage.complete': true,
        },
      },
    });
  });

  it('prefers online consult only after process explanation and supporting documents are both present', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [{ path: '/docs/report.pdf', name: 'report.pdf' }],
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'ONLINE_CONSULT',
        reason: 'recommendation was selected and process was explained',
      },
      facts: {
        'recommendation.selected': true,
        'process.explained': true,
      },
    });

    expect(result).toEqual({
      intent: 'progression',
      suggestedStage: 'ONLINE_CONSULT',
      dispatchAgent: 'ConsultAgent',
      reason: 'recommendation has been selected',
      task: {
        goal: 'Advance the online consultation workflow for this user.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'recommendation.selected': true,
        },
      },
    });
  });

  it('repairs stale gateway collect-medical-inputs suggestions into online consult after documents exist', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v2',
      run: async () => ({
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: 'keep asking for uploads',
      }),
    });

    await expect(supervisorWithGateway.suggest({
      ...minimalInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [{ path: '/docs/report.pdf', name: 'report.pdf' }],
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'ONLINE_CONSULT',
        reason: 'recommendation was selected and process was explained',
      },
      facts: {
        'recommendation.selected': true,
        'process.explained': true,
      },
    })).resolves.toEqual({
      intent: 'progression',
      suggestedStage: 'ONLINE_CONSULT',
      dispatchAgent: 'ConsultAgent',
      reason: 'recommendation has been selected',
      task: {
        goal: 'Advance the online consultation workflow for this user.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'recommendation.selected': true,
        },
      },
    });
  });

  it('still lets the gateway control other schema-valid cases outside the repaired doc-upload stall', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v2',
      run: async () => ({
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: 'user is asking about the process',
      }),
    });

    await expect(supervisorWithGateway.suggest(minimalInput)).resolves.toEqual({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'user is asking about the process',
      task: {
        goal: 'Answer the user\'s question using FAQ knowledge only.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'current.stage': 'COLLECT_MINIMAL_MEDICAL_FACTS',
          'intake.target_destination': 'Shanghai',
        },
      },
    });
  });

  it('does not repair collect-medical-inputs when no supporting documents exist yet', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v2',
      run: async () => ({
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: 'keep asking for uploads',
      }),
    });

    await expect(supervisorWithGateway.suggest({
      ...minimalInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [],
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'ONLINE_CONSULT',
        reason: 'recommendation was selected and process was explained',
      },
      facts: {
        'recommendation.selected': true,
        'process.explained': true,
      },
    })).resolves.toEqual({
      intent: 'progression',
      suggestedStage: 'COLLECT_MEDICAL_INPUTS',
      dispatchAgent: 'RecordsAgent',
      reason: 'keep asking for uploads',
      task: {
        goal: 'Collect the medical inputs needed to support online consultation for this user.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'intake.condition': 'lung cancer',
          'intake.target_destination': 'Shanghai',
          'recommendation.selected': true,
          'records.minimal_triage.complete': true,
        },
      },
    });
  });

  it('surfaces the post-recommendation structured state to the gateway prompt input', async () => {
    let capturedInput: SupervisorGatewayInput | undefined;
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v2',
      run: async (input) => {
        capturedInput = input;
        return {
          intent: 'progression',
          suggestedStage: 'ONLINE_CONSULT',
          reason: 'gateway suggestion',
        };
      },
    });

    await supervisorWithGateway.suggest({
      ...minimalInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [
          {
            path: 'uploads/report-a.pdf',
            name: 'report-a.pdf',
          },
          {
            path: 'uploads/report-b.pdf',
            name: 'report-b.pdf',
          },
        ],
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'ONLINE_CONSULT',
        reason: 'recommendation was selected and process was explained',
      },
      facts: {
        'recommendation.selected': true,
        'process.explained': true,
      },
    });

    expect(capturedInput).toEqual(expect.objectContaining({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      recommendationSelectionStatus: 'selected',
      recommendationSelectedHospitalIds: ['hospital-1'],
      processExplained: true,
      supportingDocuments: [
        {
          path: 'uploads/report-a.pdf',
          name: 'report-a.pdf',
        },
        {
          path: 'uploads/report-b.pdf',
          name: 'report-b.pdf',
        },
      ],
      statusSnapshot: expect.objectContaining({
        processExplained: true,
        supportingDocuments: [
          {
            path: 'uploads/report-a.pdf',
            name: 'report-a.pdf',
          },
          {
            path: 'uploads/report-b.pdf',
            name: 'report-b.pdf',
          },
        ],
      }),
    }));
  });

  it('sends minimal context plus read-domain hints to the supervisor gateway', async () => {
    let capturedInput: SupervisorGatewayInput | undefined;
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v2',
      run: async (input) => {
        capturedInput = input;
        return {
          intent: 'faq',
          suggestedStage: 'EXPLAIN_PROCESS',
          reason: 'user is asking an faq',
        };
      },
    });

    await supervisorWithGateway.suggest({
      ...minimalInput,
      facts: {
        'records.minimal_triage.complete': true,
        'recommendation.generated': true,
        'recommendation.selected': false,
        'process.explained': false,
        noisy_blob: 'should-not-be-forwarded',
      },
    });

    expect(capturedInput).toEqual({
      currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      journeyCurrentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      journeyCurrentPhase: 'active',
      minimalTriageStatus: 'skipped',
      minimalTriageAnswersSummary: null,
      processExplained: false,
      recommendationSelectionStatus: 'pending',
      recommendationSelectedHospitalIds: [],
      supportingDocuments: [],
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        processExplained: false,
        recommendationSelectionStatus: 'pending',
        recommendationSelectedHospitalIds: [],
        supportingDocuments: [],
      },
      conversationSummary: 'The session just started and no recommendation has been shown yet.',
      latestUserMessage: 'Please recommend hospitals for me.',
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
      availableReadDomains: ['records.status', 'recommendation.status'],
      conversationSummaryContract: SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT,
    });
  });

  it('lets the gateway request up to two allowed read domains before the final proposal', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v2',
      run: async () => ({
        requestedReadDomains: [
          'records.status',
          'recommendation.status',
          'consult.status',
          'not.allowed',
        ],
      }),
    });

    await expect(supervisorWithGateway.requestDomainReads(minimalInput)).resolves.toEqual([
      'records.status',
      'recommendation.status',
    ]);
  });

  it('upgrades schema-valid gateway output into the full supervisor contract', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v2',
      run: async () => ({
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: 'user is asking about the process',
      }),
    });

    await expect(supervisorWithGateway.suggest(minimalInput)).resolves.toEqual({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'user is asking about the process',
      task: {
        goal: 'Answer the user\'s question using FAQ knowledge only.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'current.stage': 'COLLECT_MINIMAL_MEDICAL_FACTS',
          'intake.target_destination': 'Shanghai',
        },
      },
    });
  });

  it('normalizes schema-valid but mismatched dispatch agents back to the canonical stage mapping', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v2',
      run: async () => ({
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'FaqAgent',
        reason: 'llm returned the wrong worker',
      }),
    });

    await expect(supervisorWithGateway.suggest(minimalInput)).resolves.toEqual({
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      dispatchAgent: 'RecommendationAgent',
      reason: 'llm returned the wrong worker',
      task: {
        goal: 'Generate hospital recommendations for this user.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'intake.condition': 'lung cancer',
          'intake.target_destination': 'Shanghai',
          'intake.language': 'en',
          'intake.gender': 'female',
          'recommendation.generated': true,
          'recommendation.selected': false,
          'records.minimal_triage.complete': true,
        },
      },
    });
  });

  it('uses bootstrap direct human requests to produce the handoff contract', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      latestUserMessage: 'I need a human now',
      bootstrap: {
        message: 'I need a human now',
        canCreateHandoff: true,
      },
    });

    expect(result).toEqual({
      intent: 'handoff',
      suggestedStage: 'HUMAN_HANDOFF',
      dispatchAgent: 'HandoffAgent',
      reason: 'direct user request for a human',
      task: {
        goal: 'Initiate a human handoff for this user.',
        latestUserMessage: 'I need a human now',
        necessaryFacts: {
          'current.stage': 'COLLECT_MINIMAL_MEDICAL_FACTS',
          'handoff.active': false,
        },
      },
    });

    expect(supervisor.deriveDecisionLineage({
      ...minimalInput,
      latestUserMessage: 'I need a human now',
      bootstrap: {
        message: 'I need a human now',
        canCreateHandoff: true,
      },
    })).toEqual({
      bootstrapOverride: 'direct_human_request_handoff',
    });
  });

  it('keeps an explicit human request on the handoff path instead of letting FAQ recognition win', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      latestUserMessage: 'I want a human.',
      bootstrap: {
        message: 'I want a human.',
        canCreateHandoff: true,
      },
    });

    expect(result).toEqual({
      intent: 'handoff',
      suggestedStage: 'HUMAN_HANDOFF',
      dispatchAgent: 'HandoffAgent',
      reason: 'direct user request for a human',
      task: {
        goal: 'Initiate a human handoff for this user.',
        latestUserMessage: 'I want a human.',
        necessaryFacts: {
          'current.stage': 'COLLECT_MINIMAL_MEDICAL_FACTS',
          'handoff.active': false,
        },
      },
    });
  });

  it('routes denied direct human requests into an explicit faq explanation path instead of a normal worker', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      latestUserMessage: 'I need a human now',
      bootstrap: {
        message: 'I need a human now',
        canCreateHandoff: false,
      },
    });

    expect(result).toEqual({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'direct human request cannot create handoff ticket for this session',
      task: {
        goal: 'Answer the user\'s question using FAQ knowledge only.',
        latestUserMessage: 'I need a human now',
        necessaryFacts: {
          'current.stage': 'COLLECT_MINIMAL_MEDICAL_FACTS',
          'intake.target_destination': 'Shanghai',
        },
      },
    });

    expect(supervisor.deriveDecisionLineage({
      ...minimalInput,
      latestUserMessage: 'I need a human now',
      bootstrap: {
        message: 'I need a human now',
        canCreateHandoff: false,
      },
    })).toEqual({
      bootstrapOverride: 'direct_human_request_faq_fallback',
    });
  });

  it('treats recommendation skip as a real branch that should continue into process explanation', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      currentStage: 'RECOMMENDATION',
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'RECOMMENDATION',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'skipped',
        recommendationSelectedHospitalIds: [],
        supportingDocuments: [],
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        reason: 'recommendation skip should continue into process explanation',
      },
      facts: {
        'process.explained': false,
      },
    });

    expect(result).toEqual({
      intent: 'progression',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: null,
      reason: 'recommendation skip should continue into process explanation',
    });
    expect(result).not.toHaveProperty('task');
  });

  it('preserves faq detours from COLLECT_MEDICAL_INPUTS even when the turn includes attachments', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'pending',
        recommendationSelectedHospitalIds: [],
        supportingDocuments: [],
      },
      latestUserMessage: 'Here are my documents',
      bootstrap: {
        message: 'Here are my documents',
        attachments: [{ fileName: 'report.pdf' }],
      },
      suggestion: {
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: 'user asked a faq-style follow-up while sharing a document',
      },
      facts: {
        'process.explained': true,
      },
    });

    expect(result).toEqual({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'user asked a faq-style follow-up while sharing a document',
      task: {
        goal: 'Answer the user\'s question using FAQ knowledge only.',
        latestUserMessage: 'Here are my documents',
        necessaryFacts: {
          'intake.target_destination': 'Shanghai',
          'current.stage': 'COLLECT_MEDICAL_INPUTS',
        },
      },
    });
  });

  it('recovers a clear later-stage FAQ question even when upstream suggestion weakens to progression', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      statusSnapshot: {
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: true,
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [],
      },
      latestUserMessage: 'What are your office hours?',
      bootstrap: {
        message: 'What are your office hours?',
        attachments: [{ fileName: 'report.pdf' }],
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: 'continue collecting supporting documents',
      },
      facts: {
        'process.explained': true,
      },
    });

    expect(result).toEqual({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'clear later-stage faq request should detour without advancing the journey',
      task: {
        goal: 'Answer the user\'s question using FAQ knowledge only.',
        latestUserMessage: 'What are your office hours?',
        necessaryFacts: {
          'current.stage': 'COLLECT_MEDICAL_INPUTS',
          'intake.target_destination': 'Shanghai',
        },
      },
    });
  });

  it('preserves bootstrap override semantics when the supervisor gateway throws', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v2',
      run: async () => {
        throw new Error('gateway unavailable');
      },
    });

    await expect(supervisorWithGateway.suggest({
      ...minimalInput,
      latestUserMessage: 'I need a human now',
      bootstrap: {
        message: 'I need a human now',
        canCreateHandoff: true,
      },
    })).resolves.toEqual({
      intent: 'handoff',
      suggestedStage: 'HUMAN_HANDOFF',
      dispatchAgent: 'HandoffAgent',
      reason: 'direct user request for a human',
      task: {
        goal: 'Initiate a human handoff for this user.',
        latestUserMessage: 'I need a human now',
        necessaryFacts: {
          'current.stage': 'COLLECT_MINIMAL_MEDICAL_FACTS',
          'handoff.active': false,
        },
      },
    });

    expect(supervisorWithGateway.deriveDecisionLineage({
      ...minimalInput,
      latestUserMessage: 'I need a human now',
      bootstrap: {
        message: 'I need a human now',
        canCreateHandoff: true,
      },
    })).toEqual({
      bootstrapOverride: 'direct_human_request_handoff',
    });
  });

  it('returns null bootstrap lineage for normal non-bootstrap paths', async () => {
    await supervisor.suggest(minimalInput);

    expect(supervisor.deriveDecisionLineage(minimalInput)).toBeNull();
  });

  it('changes the records goal when the supervisor is collecting consult-supporting medical inputs', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v2',
      run: async () => ({
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: 'collect medical inputs required for consult readiness',
      }),
    });

    const result = await supervisorWithGateway.suggest({
      ...minimalInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
    });

    expect(result).toEqual({
      intent: 'progression',
      suggestedStage: 'COLLECT_MEDICAL_INPUTS',
      dispatchAgent: 'RecordsAgent',
      reason: 'collect medical inputs required for consult readiness',
      task: {
        goal: 'Collect the medical inputs needed to support online consultation for this user.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'intake.condition': 'lung cancer',
          'intake.target_destination': 'Shanghai',
          'recommendation.selected': false,
          'records.minimal_triage.complete': true,
        },
      },
    });
  });

  it('recovers a clear later-stage faq intent from the raw message even when upstream suggestion weakens to progression on an attachment turn', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      latestUserMessage: 'What are your office hours?',
      suggestion: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: 'continue collecting records',
      },
      bootstrap: {
        message: 'What are your office hours?',
        attachments: [{ fileName: 'report.pdf' }],
      },
      facts: {
        'records.minimal_triage.complete': true,
        'recommendation.selected': true,
        'process.explained': true,
      },
    });

    expect(result).toEqual({
      intent: 'faq',
      suggestedStage: 'EXPLAIN_PROCESS',
      dispatchAgent: 'FaqAgent',
      reason: 'clear later-stage faq request should detour without advancing the journey',
      task: {
        goal: 'Answer the user\'s question using FAQ knowledge only.',
        latestUserMessage: 'What are your office hours?',
        necessaryFacts: {
          'current.stage': 'COLLECT_MEDICAL_INPUTS',
          'intake.target_destination': 'Shanghai',
        },
      },
    });
  });

  it('keeps COLLECT_MEDICAL_INPUTS active when the follow-up clearly continues records sharing', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      latestUserMessage: 'I can share more medical records now.',
      suggestion: {
        intent: 'progression',
        suggestedStage: 'ONLINE_CONSULT',
        reason: 'move on to consult',
      },
      facts: {
        'records.minimal_triage.complete': true,
        'recommendation.selected': true,
        'process.explained': true,
      },
    });

    expect(result).toEqual({
      intent: 'progression',
      suggestedStage: 'COLLECT_MEDICAL_INPUTS',
      dispatchAgent: 'RecordsAgent',
      reason: 'clear records-sharing follow-up should stay on medical input collection',
      task: {
        goal: 'Collect the medical inputs needed to support online consultation for this user.',
        latestUserMessage: 'I can share more medical records now.',
        necessaryFacts: {
          'intake.condition': 'lung cancer',
          'intake.target_destination': 'Shanghai',
          'records.minimal_triage.complete': true,
          'recommendation.selected': true,
        },
      },
    });
  });

  it('works from minimal context without requiring a large facts bundle', async () => {
    const result = await supervisor.suggest({
      currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      conversationSummary: '',
      latestUserMessage: 'Can you explain the process?',
      intake: {
        condition: 'lung cancer',
        targetDestination: 'Shanghai',
        language: 'en',
        gender: 'female',
      },
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      suggestion: {
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        reason: 'user asked a process question',
      },
    });

    expect(result.dispatchAgent).toBe('FaqAgent');
    expect(result.task).toBeDefined();
    expect(result.task?.latestUserMessage).toBe('Can you explain the process?');
  });

  it('keeps supervisor output free of authority-owned mutation fields', async () => {
    const result = await supervisor.suggest(minimalInput);
    const record = result as unknown as Record<string, unknown>;

    expect(record.from).toBeUndefined();
    expect(record.to).toBeUndefined();
    expect(record.factsPatch).toBeUndefined();
    expect(record.write).toBeUndefined();
    expect(record.requestedByUser).toBeUndefined();
  });

  it('falls back to the derived contract when gateway output is invalid', async () => {
    const gateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v2',
      run: async () => ({
        intent: 'not-a-real-intent',
        suggestedStage: 'NOT_A_STAGE',
        reason: 'gateway output is invalid',
      }),
    });

    await expect(gateway.suggest(minimalInput)).resolves.toEqual({
      intent: 'progression',
      suggestedStage: 'RECOMMENDATION',
      dispatchAgent: 'RecommendationAgent',
      reason: 'minimal triage is complete and recommendation should begin',
      task: {
        goal: 'Generate hospital recommendations for this user.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'intake.condition': 'lung cancer',
          'intake.target_destination': 'Shanghai',
          'intake.language': 'en',
          'intake.gender': 'female',
          'recommendation.generated': true,
          'recommendation.selected': false,
          'records.minimal_triage.complete': true,
        },
      },
    });
  });

  it('keeps the fixed supervisor eval fixture set complete', () => {
    expect(SUPERVISOR_EVAL_FIXTURES.map((fixture) => fixture.id)).toEqual([
      'ambiguous-short-confirmation-before-process',
      'mixed-handoff-process-request-denied-to-explain',
      'repeat-recommendation-in-place',
      'revisit-recommendation-from-later-stage',
      'late-process-explanation-request',
    ]);
  });

  it.each(SUPERVISOR_EVAL_FIXTURES)('$id', async (fixture) => {
    const fixtureSupervisor = fixture.mode === 'gateway'
      ? new SupervisorService({
        promptVersion: `supervisor-fixture:${fixture.id}`,
        run: async () => fixture.gatewayOutput,
      })
      : supervisor;

    await expect(fixtureSupervisor.suggest(fixture.input)).resolves.toEqual(fixture.expected);
  });

  it('exports an explicit conversation summary contract', () => {
    expect(SUPERVISOR_CONVERSATION_SUMMARY_CONTRACT).toEqual({
      owner: 'runtime',
      refreshTrigger: 'after_final_assistant_response',
      sizeDiscipline: 'compact',
      freshness: 'latest_committed_turn',
      persistenceStrategy: 'persisted_with_session',
    });
  });

  it('exports a supervisor-facing registry with the required three-line template only', () => {
    expect(Object.keys(SUPERVISOR_AGENT_REGISTRY)).toEqual([
      'FaqAgent',
      'RecommendationAgent',
      'RecordsAgent',
      'ConsultAgent',
      'HandoffAgent',
    ]);

    for (const entry of Object.values(SUPERVISOR_AGENT_REGISTRY)) {
      expect(entry).toContain('When to use:');
      expect(entry).toContain('Task style:');
      expect(entry).toContain('Send these facts:');
      expect(entry).not.toContain('Tool:');
      expect(entry).not.toContain('API:');
    }

    const rendered = renderSupervisorAgentRegistry();
    expect(rendered).toContain('Agent: FaqAgent');
    expect(rendered).toContain('Agent: HandoffAgent');
  });
});

describe('SupervisorService event extraction', () => {
  const eventInput: OrchestratorV3DecisionInput = {
    currentStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
    conversationSummary: 'The user just started.',
    latestUserMessage: 'How much does treatment cost?',
    intake: {
      condition: 'lung cancer',
      targetDestination: 'Shanghai',
      language: 'en',
      gender: 'female',
    },
    current: {
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'active',
    },
    suggestion: {
      intent: 'unknown',
      suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      reason: 'event extraction test input',
    },
    availableReadDomains: ['records.status'],
  };

  it('extracts deterministic events before calling the semantic gateway', async () => {
    let gatewayCalled = false;
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v3-events',
      run: async () => {
        gatewayCalled = true;
        return {
          eventType: 'USER_MESSAGE_UNCLEAR',
          confidence: 0.1,
          target: 'unknown',
          modifier: 'unknown',
        };
      },
    });

    await expect(supervisorWithGateway.extractEvent({
      ...eventInput,
      latestUserMessage: 'Please connect me with a human advisor.',
    })).resolves.toMatchObject({
      eventType: 'USER_REQUESTED_HUMAN',
      confidence: 1,
      source: 'deterministic',
      target: 'human',
      modifier: 'ask',
      metadata: {
        rawText: 'Please connect me with a human advisor.',
      },
    });
    expect(gatewayCalled).toBe(false);
  });

  it('keeps explicit human requests ahead of attachment extraction', async () => {
    const supervisor = new SupervisorService();

    await expect(supervisor.extractEvent({
      ...eventInput,
      latestUserMessage: 'I attached my report and want to talk to a human.',
      bootstrap: {
        message: 'I attached my report and want to talk to a human.',
        attachments: [{ fileName: 'report.pdf' }],
      },
    })).resolves.toMatchObject({
      eventType: 'USER_REQUESTED_HUMAN',
      confidence: 1,
      source: 'deterministic',
      target: 'human',
      modifier: 'ask',
      metadata: {
        rawText: 'I attached my report and want to talk to a human.',
      },
    });
  });

  it('extracts attachments before heuristic FAQ fallback when the semantic gateway is disabled', async () => {
    const supervisor = new SupervisorService();

    await expect(supervisor.extractEvent({
      ...eventInput,
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      latestUserMessage: 'What are your office hours? I attached the report.',
      bootstrap: {
        message: 'What are your office hours? I attached the report.',
        attachments: [{ fileName: 'report.pdf' }],
      },
      suggestion: {
        intent: 'unknown',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: 'attachment should win over faq heuristic',
      },
    })).resolves.toMatchObject({
      eventType: 'DOCUMENTS_UPLOADED',
      confidence: 1,
      source: 'deterministic',
      target: 'documents',
      modifier: 'provide',
      metadata: {
        documentCount: 1,
      },
    });
  });

  it('keeps risky medical advice ahead of attachment extraction', async () => {
    const supervisor = new SupervisorService();

    await expect(supervisor.extractEvent({
      ...eventInput,
      latestUserMessage: 'I attached labs, should I stop chemo?',
      bootstrap: {
        message: 'I attached labs, should I stop chemo?',
        attachments: [{ fileName: 'labs.pdf' }],
      },
    })).resolves.toMatchObject({
      eventType: 'USER_ASKED_RISKY_MEDICAL_ADVICE',
      source: 'deterministic',
      metadata: {
        rawText: 'I attached labs, should I stop chemo?',
        riskType: 'medical_advice',
      },
    });
  });

  it('keeps restricted medical promises ahead of attachment extraction', async () => {
    const supervisor = new SupervisorService();

    await expect(supervisor.extractEvent({
      ...eventInput,
      latestUserMessage: 'I attached records, can you guarantee she will be cured?',
      bootstrap: {
        message: 'I attached records, can you guarantee she will be cured?',
        attachments: [{ fileName: 'records.pdf' }],
      },
    })).resolves.toMatchObject({
      eventType: 'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE',
      source: 'deterministic',
      metadata: {
        rawText: 'I attached records, can you guarantee she will be cured?',
        redirectTarget: 'medical_travel_support',
      },
    });
  });

  it('classifies clear risky medical advice as a safety redirect when the semantic gateway is disabled', async () => {
    const supervisor = new SupervisorService();

    await expect(supervisor.extractEvent({
      ...eventInput,
      latestUserMessage: 'Should my wife start chemotherapy now?',
    })).resolves.toMatchObject({
      eventType: 'USER_ASKED_RISKY_MEDICAL_ADVICE',
      confidence: 0.9,
      source: 'deterministic',
      target: 'medical_facts',
      modifier: 'ask',
      metadata: {
        rawText: 'Should my wife start chemotherapy now?',
        riskType: 'medical_advice',
      },
    });
  });

  it.each([
    'Should my wife get chemotherapy now?',
    'Should she undergo surgery now?',
  ])('classifies risky treatment-decision wording as safety redirect: %s', async (latestUserMessage) => {
    const supervisor = new SupervisorService();

    await expect(supervisor.extractEvent({
      ...eventInput,
      latestUserMessage,
    })).resolves.toMatchObject({
      eventType: 'USER_ASKED_RISKY_MEDICAL_ADVICE',
      source: 'deterministic',
      metadata: {
        rawText: latestUserMessage,
        riskType: 'medical_advice',
      },
    });
  });

  it('uses the semantic gateway when deterministic extraction has no event', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v3-events',
      run: async () => ({
        eventType: 'USER_ASKED_QUESTION',
        target: 'pricing',
        modifier: 'ask',
        confidence: 0.76,
      }),
    });

    await expect(supervisorWithGateway.extractEvent(eventInput)).resolves.toEqual({
      eventType: 'USER_ASKED_QUESTION',
      target: 'pricing',
      modifier: 'ask',
      confidence: 0.76,
      source: 'llm',
    });
  });

  it('short-circuits clear safety heuristics before the semantic gateway', async () => {
    let gatewayCalled = false;
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v3-events',
      run: async () => {
        gatewayCalled = true;
        return {
          eventType: 'USER_ASKED_QUESTION',
          target: 'pricing',
          modifier: 'ask',
          confidence: 0.99,
        };
      },
    });

    await expect(supervisorWithGateway.extractEvent({
      ...eventInput,
      latestUserMessage: 'Should my wife get chemotherapy now?',
    })).resolves.toMatchObject({
      eventType: 'USER_ASKED_RISKY_MEDICAL_ADVICE',
      source: 'deterministic',
      metadata: {
        rawText: 'Should my wife get chemotherapy now?',
        riskType: 'medical_advice',
      },
    });
    expect(gatewayCalled).toBe(false);
  });

  it('short-circuits clear restricted-service heuristics before the semantic gateway', async () => {
    let gatewayCalled = false;
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v3-events',
      run: async () => {
        gatewayCalled = true;
        return {
          eventType: 'USER_ASKED_QUESTION',
          target: 'pricing',
          modifier: 'ask',
          confidence: 0.99,
        };
      },
    });

    await expect(supervisorWithGateway.extractEvent({
      ...eventInput,
      latestUserMessage: 'Can you guarantee my wife will be cured?',
    })).resolves.toMatchObject({
      eventType: 'USER_ASKED_OUT_OF_SCOPE_OR_RESTRICTED_SERVICE',
      source: 'deterministic',
      metadata: {
        rawText: 'Can you guarantee my wife will be cured?',
        redirectTarget: 'medical_travel_support',
      },
    });
    expect(gatewayCalled).toBe(false);
  });

  it('falls back to USER_MESSAGE_UNCLEAR when semantic output is invalid', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v3-events',
      run: async () => ({
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'RecommendationAgent',
      }),
    });

    await expect(supervisorWithGateway.extractEvent(eventInput)).resolves.toEqual({
      eventType: 'USER_MESSAGE_UNCLEAR',
      confidence: 0,
      source: 'fallback_unknown',
      target: 'unknown',
      modifier: 'unknown',
      metadata: {
        rawText: 'supervisor semantic event extraction failed',
      },
    });
  });

  it('preserves gateway LLM failure metadata when semantic extraction falls back', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v3-events',
      model: 'gpt-4.1-mini',
      run: async () => ({
        eventType: 'USER_MESSAGE_UNCLEAR',
        target: 'unknown',
        modifier: 'unknown',
        confidence: 0,
        source: 'fallback_unknown',
        metadata: {
          rawText: 'supervisor route llm returned invalid SupervisorEvent schema',
        },
      }),
      getLastLlmRunMetadata: () => ({
        llmFailurePhase: 'response_content',
        llmErrorName: 'NonJsonContentError',
        llmErrorMessage: 'supervisor route llm returned non-json content',
        llmResponseContentLength: 12,
        llmResponseContentStartsWithBrace: false,
      }),
    });

    await expect(supervisorWithGateway.extractEvent(eventInput)).resolves.toMatchObject({
      eventType: 'USER_MESSAGE_UNCLEAR',
      source: 'fallback_unknown',
    });
    expect(supervisorWithGateway.getLastLlmRunMetadata()).toEqual(expect.objectContaining({
      nodePromptVersion: 'supervisor-prompt-v3-events',
      nodeModel: 'gpt-4.1-mini',
      fallbackUsed: true,
      schemaValidationFailed: true,
      llmFailurePhase: 'response_content',
      llmErrorName: 'NonJsonContentError',
      llmErrorMessage: 'supervisor route llm returned non-json content',
      llmResponseContentLength: 12,
      llmResponseContentStartsWithBrace: false,
    }));
  });

  it('rejects deterministic-only events returned by the semantic gateway', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v3-events',
      run: async () => ({
        eventType: 'RECOMMENDATION_SELECTED',
        confidence: 0.8,
        source: 'llm',
      }),
    });

    await expect(supervisorWithGateway.extractEvent({
      ...eventInput,
      currentStage: 'RECOMMENDATION',
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
    })).resolves.toEqual({
      eventType: 'USER_MESSAGE_UNCLEAR',
      confidence: 0,
      source: 'fallback_unknown',
      target: 'unknown',
      modifier: 'unknown',
      metadata: {
        rawText: 'supervisor semantic event extraction failed',
      },
    });
  });

  it('accepts human handoff events returned by the semantic gateway when allowed', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v3-events',
      run: async () => ({
        eventType: 'USER_REQUESTED_HUMAN',
        target: 'human',
        modifier: 'ask',
        confidence: 0.8,
      }),
    });

    await expect(supervisorWithGateway.extractEvent(eventInput)).resolves.toEqual({
      eventType: 'USER_REQUESTED_HUMAN',
      target: 'human',
      modifier: 'ask',
      confidence: 0.8,
      source: 'llm',
    });
  });

  it('rejects non-llm sources returned by the semantic gateway', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v3-events',
      run: async () => ({
        eventType: 'USER_ASKED_QUESTION',
        target: 'pricing',
        modifier: 'ask',
        confidence: 1,
        source: 'deterministic',
      }),
    });

    await expect(supervisorWithGateway.extractEvent(eventInput)).resolves.toEqual({
      eventType: 'USER_MESSAGE_UNCLEAR',
      confidence: 0,
      source: 'fallback_unknown',
      target: 'unknown',
      modifier: 'unknown',
      metadata: {
        rawText: 'supervisor semantic event extraction failed',
      },
    });
  });

  it('rejects invalid semantic target and modifier values', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v3-events',
      run: async () => ({
        eventType: 'USER_EXPRESSED_NEED',
        target: 'budget',
        modifier: 'refine',
        confidence: 0.8,
      }),
    });

    await expect(supervisorWithGateway.extractEvent(eventInput)).resolves.toEqual({
      eventType: 'USER_MESSAGE_UNCLEAR',
      confidence: 0,
      source: 'fallback_unknown',
      target: 'unknown',
      modifier: 'unknown',
      metadata: {
        rawText: 'supervisor semantic event extraction failed',
      },
    });
  });

  it('rejects semantic events outside the current stage allowed set', async () => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v3-events',
      run: async () => ({
        eventType: 'USER_EXPRESSED_NEED',
        target: 'consult',
        modifier: 'ask',
        confidence: 0.8,
      }),
    });

    await expect(supervisorWithGateway.extractEvent({
      ...eventInput,
      currentStage: 'HUMAN_HANDOFF',
      current: {
        stage: 'HUMAN_HANDOFF',
        phase: 'active',
      },
    })).resolves.toEqual({
      eventType: 'USER_MESSAGE_UNCLEAR',
      confidence: 0,
      source: 'fallback_unknown',
      target: 'unknown',
      modifier: 'unknown',
      metadata: {
        rawText: 'supervisor semantic event extraction failed',
      },
    });
  });

  it.each([2, -0.1])('rejects semantic confidence outside [0,1]: %s', async (confidence) => {
    const supervisorWithGateway = new SupervisorService({
      promptVersion: 'supervisor-prompt-v3-events',
      run: async () => ({
        eventType: 'USER_ASKED_QUESTION',
        target: 'pricing',
        modifier: 'ask',
        confidence,
      }),
    });

    await expect(supervisorWithGateway.extractEvent(eventInput)).resolves.toEqual({
      eventType: 'USER_MESSAGE_UNCLEAR',
      confidence: 0,
      source: 'fallback_unknown',
      target: 'unknown',
      modifier: 'unknown',
      metadata: {
        rawText: 'supervisor semantic event extraction failed',
      },
    });
  });
});
