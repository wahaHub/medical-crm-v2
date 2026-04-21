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

  it('does not advance recommendation progression from minimalTriageComplete alone when structured triage status is absent', async () => {
    const result = await supervisor.suggest({
      ...minimalInput,
      suggestion: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        reason: 'minimal triage still needs structured state',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
      statusSnapshot: {
        minimalTriageComplete: true,
      },
    });

    expect(result.suggestedStage).toBe('COLLECT_MINIMAL_MEDICAL_FACTS');
    expect(result.dispatchAgent).toBe('RecordsAgent');
    expect(result.reason).toBe('minimal triage still needs structured state');
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
      dispatchAgent: 'FaqAgent',
      reason: 'recommendation selected and process explanation should follow',
      task: {
        goal: 'Answer the user\'s question using FAQ knowledge only.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'current.stage': 'RECOMMENDATION',
          'intake.target_destination': 'Shanghai',
        },
      },
    });
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
      recommendationSelectionStatus: 'pending',
      recommendationSelectedHospitalIds: [],
      supportingDocuments: [],
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
      dispatchAgent: 'FaqAgent',
      reason: 'recommendation skip should continue into process explanation',
      task: {
        goal: 'Answer the user\'s question using FAQ knowledge only.',
        latestUserMessage: 'Please recommend hospitals for me.',
        necessaryFacts: {
          'current.stage': 'RECOMMENDATION',
          'intake.target_destination': 'Shanghai',
        },
      },
    });
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
      reason: 'clear faq-style question should detour through FAQ handling without rewriting the primary stage',
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
    expect(result.task.latestUserMessage).toBe('Can you explain the process?');
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
