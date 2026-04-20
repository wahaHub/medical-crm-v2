import { describe, expect, it } from 'vitest';
import { JourneyRuntimeAuthorityService } from '../../chatbot-v3/journey-runtime-authority.service.js';
import {
  CHATBOT_V3_JOURNEY_STAGES,
  type JourneyRuntimeAuthorityInput,
} from '../../chatbot-v3/types.js';

describe('JourneyRuntimeAuthorityService', () => {
  const service = new JourneyRuntimeAuthorityService();

  function createInput(
    overrides: Partial<JourneyRuntimeAuthorityInput> = {},
  ): JourneyRuntimeAuthorityInput {
    return {
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      proposal: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        dispatchAgent: 'RecordsAgent',
        reason: 'start the primary journey',
      },
      facts: {},
      ...overrides,
    };
  }

  it('starts the canonical journey order with minimal medical triage', () => {
    expect(CHATBOT_V3_JOURNEY_STAGES[0]).toBe('COLLECT_MINIMAL_MEDICAL_FACTS');
  });

  it('allows recommendation after minimal triage is complete', () => {
    const decision = service.decide(createInput({
      proposal: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'RecommendationAgent',
        reason: 'minimal triage is complete',
      },
      statusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
        minimalTriageComplete: false,
      },
    }));

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.action).toBe('ADVANCE');
    expect(decision.dispatch).toEqual({
      outcome: 'ALLOW',
      agent: 'RecommendationAgent',
    });
    expect(decision.write).toEqual({
      authority: 'journey-runtime-authority',
      stage: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      journeyCurrentStage: 'RECOMMENDATION',
      journeyCurrentPhase: 'active',
      factsPatch: {},
    });
  });

  it('treats pending minimal triage with an answers summary as complete for recommendation eligibility', () => {
    const decision = service.decide(createInput({
      proposal: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'RecommendationAgent',
        reason: 'summary-backed triage is complete',
      },
      statusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
        minimalTriageComplete: false,
      },
      facts: {
        'records.minimal_triage.complete': false,
      },
    }));

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.action).toBe('ADVANCE');
    expect(decision.dispatch).toEqual({
      outcome: 'ALLOW',
      agent: 'RecommendationAgent',
    });
  });

  it('treats skipped minimal triage as complete for recommendation eligibility', () => {
    const decision = service.decide(createInput({
      proposal: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'RecommendationAgent',
        reason: 'skipped triage should still allow recommendation',
      },
      statusSnapshot: {
        minimalTriageStatus: 'skipped',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: false,
      },
      facts: {
        'records.minimal_triage.complete': false,
      },
    }));

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.action).toBe('ADVANCE');
    expect(decision.dispatch).toEqual({
      outcome: 'ALLOW',
      agent: 'RecommendationAgent',
    });
  });

  it('normalizes mismatched proposal workers back to the canonical stage dispatch agent', () => {
    const decision = service.decide(createInput({
      proposal: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'FaqAgent',
        reason: 'minimal triage is complete',
      },
      statusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
        minimalTriageComplete: false,
      },
    }));

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.dispatch).toEqual({
      outcome: 'ALLOW',
      agent: 'RecommendationAgent',
    });
  });

  it('denies recommendation when a pending status snapshot has no summary, even if stale facts say complete', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      proposal: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'RecommendationAgent',
        reason: 'jump ahead to recommendation',
      },
      statusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: false,
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
    }));

    expect(decision.outcome).toBe('DENY');
    expect(decision.dispatch).toEqual({
      outcome: 'DENY',
    });
    expect(decision.write.stage).toEqual({
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'active',
    });
    expect(decision.reason).toContain('records.minimal_triage.complete');
  });

  it('keeps pending minimal triage with no answers summary blocked from recommendation', () => {
    const decision = service.decide(createInput({
      proposal: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'RecommendationAgent',
        reason: 'pending triage without summary is still incomplete',
      },
      statusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: null,
        minimalTriageComplete: false,
      },
      facts: {
        'records.minimal_triage.complete': false,
      },
    }));

    expect(decision.outcome).toBe('DENY');
    expect(decision.dispatch).toEqual({
      outcome: 'DENY',
    });
    expect(decision.reason).toContain('records.minimal_triage.complete');
  });

  it('keeps recommendation blocked when the status snapshot has no structured minimal triage fields', () => {
    const decision = service.decide(createInput({
      proposal: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'RecommendationAgent',
        reason: 'empty snapshots should not advance repaired progression',
      },
      statusSnapshot: {},
      facts: {
        'records.minimal_triage.complete': true,
      },
    }));

    expect(decision.outcome).toBe('DENY');
    expect(decision.dispatch).toEqual({
      outcome: 'DENY',
    });
    expect(decision.write.stage).toEqual({
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'active',
    });
  });

  it('treats the authority result as the final journey writer when process explanation is shown', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'RECOMMENDATION',
        phase: 'post',
      },
      proposal: {
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        dispatchAgent: 'FaqAgent',
        reason: 'explain what happens next',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
    }));

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.dispatch).toEqual({
      outcome: 'ALLOW',
      agent: 'FaqAgent',
    });
    expect(decision.write).toEqual({
      authority: 'journey-runtime-authority',
      stage: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
      journeyCurrentStage: 'EXPLAIN_PROCESS',
      journeyCurrentPhase: 'active',
      factsPatch: {
        'process.explained': true,
      },
    });
  });

  it('allows later-stage faq detours to reuse EXPLAIN_PROCESS as a dispatch anchor without rewriting the primary stage contract', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      proposal: {
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        dispatchAgent: 'FaqAgent',
        reason: 'clear faq-style question should detour without changing the primary stage',
      },
      statusSnapshot: {
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        processExplained: true,
        supportingDocuments: [],
      },
      facts: {
        'process.explained': true,
      },
      bootstrap: {
        message: 'What are your office hours?',
      },
    }));

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.dispatch).toEqual({
      outcome: 'ALLOW',
      agent: 'FaqAgent',
    });
    expect(decision.write.stage).toEqual({
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
    });
  });

  it('allows recommendation to repeat in place', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      proposal: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'RecommendationAgent',
        reason: 'refresh the recommendation',
      },
      statusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
        minimalTriageComplete: false,
      },
    }));

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.action).toBe('REPEAT');
    expect(decision.write.stage).toEqual({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
  });

  it('denies a direct jump from minimal triage to collect medical inputs', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'post',
      },
      proposal: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        dispatchAgent: 'RecordsAgent',
        reason: 'skip ahead to medical inputs',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
    }));

    expect(decision.outcome).toBe('DENY');
    expect(decision.dispatch).toEqual({
      outcome: 'DENY',
    });
    expect(decision.write.stage).toEqual({
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'post',
    });
    expect(decision.reason).toContain('COLLECT_MEDICAL_INPUTS');
    expect(decision.reason).toContain('RECOMMENDATION');
  });

  it('does not treat string-backed facts as true prerequisites', () => {
    const decision = service.decide(createInput({
      proposal: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'RecommendationAgent',
        reason: 'attempt to use a string-backed fact',
      },
      facts: {
        'records.minimal_triage.complete': 'false',
      },
    }));

    expect(decision.outcome).toBe('DENY');
    expect(decision.dispatch).toEqual({
      outcome: 'DENY',
    });
    expect(decision.reason).toContain('records.minimal_triage.complete');
  });

  it('allows explicit faq explain-process proposals before recommendation', () => {
    const allowed = service.decide(createInput({
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'post',
      },
      proposal: {
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        dispatchAgent: 'FaqAgent',
        reason: 'user explicitly asked for the process',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
    }));

    expect(allowed.outcome).toBe('ALLOW');
    expect(allowed.dispatch).toEqual({
      outcome: 'ALLOW',
      agent: 'FaqAgent',
    });
  });

  it('allows a resource explain-process proposal on the first pass', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'post',
      },
      proposal: {
        intent: 'resource',
        suggestedStage: 'EXPLAIN_PROCESS',
        dispatchAgent: 'FaqAgent',
        reason: 'resource-only explanation before progression',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
    }));

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.dispatch).toEqual({
      outcome: 'ALLOW',
      agent: 'FaqAgent',
    });
    expect(decision.write.stage).toEqual({
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
    });
  });

  it('denies a repeated faq explanation without an explicit repeat request', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'RECOMMENDATION',
        phase: 'post',
      },
      proposal: {
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        dispatchAgent: 'FaqAgent',
        reason: 'repeat the explanation without asking again',
      },
      facts: {
        'records.minimal_triage.complete': true,
        'process.explained': true,
      },
    }));

    expect(decision.outcome).toBe('DENY');
    expect(decision.action).toBe('STAY');
    expect(decision.dispatch).toEqual({
      outcome: 'DENY',
    });
    expect(decision.reason).toContain('explicitly requested');
  });

  it('allows a repeated faq explanation when the user explicitly asks again', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'RECOMMENDATION',
        phase: 'post',
      },
      proposal: {
        intent: 'faq',
        suggestedStage: 'EXPLAIN_PROCESS',
        dispatchAgent: 'FaqAgent',
        reason: 'repeat the explanation because the user asked again',
      },
      bootstrap: {
        message: 'Can you explain that again?',
      },
      facts: {
        'records.minimal_triage.complete': true,
        'process.explained': true,
      },
    }));

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.dispatch).toEqual({
      outcome: 'ALLOW',
      agent: 'FaqAgent',
    });
    expect(decision.write.stage).toEqual({
      stage: 'EXPLAIN_PROCESS',
      phase: 'active',
    });
  });

  it('denies faq proposals that try to advance into the recommendation stage', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'post',
      },
      proposal: {
        intent: 'faq',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'FaqAgent',
        reason: 'FAQ turn should not drive primary progression',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
    }));

    expect(decision.outcome).toBe('DENY');
    expect(decision.action).toBe('STAY');
    expect(decision.dispatch).toEqual({
      outcome: 'DENY',
    });
    expect(decision.to).toEqual({
      stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
      phase: 'post',
    });
  });

  it('denies resource proposals that try to advance into online consult', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'post',
      },
      proposal: {
        intent: 'resource',
        suggestedStage: 'ONLINE_CONSULT',
        dispatchAgent: 'ConsultAgent',
        reason: 'resource-only turn should not advance the primary journey',
      },
      statusSnapshot: {
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [
          {
            path: 'uploads/supporting-doc-a.pdf',
            name: 'supporting-doc-a.pdf',
          },
        ],
      },
      facts: {
        'records.minimal_triage.complete': true,
        'process.explained': true,
      },
    }));

    expect(decision.outcome).toBe('DENY');
    expect(decision.action).toBe('STAY');
    expect(decision.dispatch).toEqual({
      outcome: 'DENY',
    });
    expect(decision.to).toEqual({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'post',
    });
  });

  it('allows recommendation to be revisited from a later stage', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'post',
      },
      proposal: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'RecommendationAgent',
        reason: 'revisit the recommendation later in the journey',
      },
      statusSnapshot: {
        minimalTriageStatus: 'pending',
        minimalTriageAnswersSummary: 'Chest pain for three days; moderate severity; blood test already completed.',
        minimalTriageComplete: false,
      },
    }));

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.action).toBe('ADVANCE');
    expect(decision.dispatch).toEqual({
      outcome: 'ALLOW',
      agent: 'RecommendationAgent',
    });
    expect(decision.write.stage).toEqual({
      stage: 'RECOMMENDATION',
      phase: 'active',
    });
  });

  it('denies collect medical inputs after a faq explanation before recommendation', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
      proposal: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        dispatchAgent: 'RecordsAgent',
        reason: 'move on to medical inputs after a faq detour',
      },
      facts: {
        'process.explained': true,
      },
    }));

    expect(decision.outcome).toBe('DENY');
    expect(decision.dispatch).toEqual({
      outcome: 'DENY',
    });
    expect(decision.reason).toContain('RECOMMENDATION');
  });

  it('allows collect medical inputs after recommendation and process explanation', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'RECOMMENDATION',
        phase: 'post',
      },
      proposal: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        dispatchAgent: 'RecordsAgent',
        reason: 'collect the remaining medical inputs',
      },
      statusSnapshot: {
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [
          {
            path: 'uploads/supporting-doc-a.pdf',
            name: 'supporting-doc-a.pdf',
          },
        ],
      },
      facts: {
        'records.minimal_triage.complete': true,
        'process.explained': true,
      },
    }));

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.action).toBe('ADVANCE');
    expect(decision.dispatch).toEqual({
      outcome: 'ALLOW',
      agent: 'RecordsAgent',
    });
    expect(decision.write.stage).toEqual({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
  });

  it('allows collect medical inputs to repeat in place', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      proposal: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        dispatchAgent: 'RecordsAgent',
        reason: 'gather a little more context',
      },
      statusSnapshot: {
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
      },
      supportingDocuments: [{ path: '/docs/labs.pdf', name: 'labs.pdf' }],
      facts: {
        'records.minimal_triage.complete': true,
        'process.explained': true,
      },
    }));

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.action).toBe('REPEAT');
    expect(decision.write.stage).toEqual({
      stage: 'COLLECT_MEDICAL_INPUTS',
      phase: 'active',
    });
  });

  it('writes the repaired journey snapshot when recommendation is skipped into process explanation', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'RECOMMENDATION',
        phase: 'post',
      },
      proposal: {
        intent: 'progression',
        suggestedStage: 'EXPLAIN_PROCESS',
        dispatchAgent: 'FaqAgent',
        reason: 'continue into the process explanation after skipping recommendation',
      },
      statusSnapshot: {
        recommendationSelectionStatus: 'skipped',
        recommendationSelectedHospitalIds: [],
        supportingDocuments: [],
      },
      facts: {
        'process.explained': false,
      },
    }));

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.action).toBe('ADVANCE');
    expect((decision.write as any)).toMatchObject({
      stage: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
      journeyCurrentStage: 'EXPLAIN_PROCESS',
      journeyCurrentPhase: 'active',
    });
  });

  it('denies online consult until supporting documents exist after the repaired post-recommendation sequence', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      proposal: {
        intent: 'consult',
        suggestedStage: 'ONLINE_CONSULT',
        dispatchAgent: 'ConsultAgent',
        reason: 'schedule the consult',
      },
      statusSnapshot: {
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
        supportingDocuments: [],
      },
      facts: {
        'process.explained': true,
      },
    }));

    expect(decision.outcome).toBe('DENY');
    expect(decision.dispatch).toEqual({
      outcome: 'DENY',
    });
    expect(decision.reason).toContain('supporting document');
  });

  it('denies a second progression explanation after it has already been shown', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'RECOMMENDATION',
        phase: 'post',
      },
      proposal: {
        intent: 'progression',
        suggestedStage: 'EXPLAIN_PROCESS',
        dispatchAgent: 'FaqAgent',
        reason: 'show the process again without a fresh request',
      },
      facts: {
        'records.minimal_triage.complete': true,
        'process.explained': true,
      },
    }));

    expect(decision.outcome).toBe('DENY');
    expect(decision.dispatch).toEqual({
      outcome: 'DENY',
    });
    expect(decision.reason).toContain('explicitly requested');
  });

  it('requires recommendation selection and process explanation before online consult', () => {
    const denied = service.decide(createInput({
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'post',
      },
      proposal: {
        intent: 'consult',
        suggestedStage: 'ONLINE_CONSULT',
        dispatchAgent: 'ConsultAgent',
        reason: 'schedule the consult',
      },
      statusSnapshot: {
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
      },
      facts: {
        'records.minimal_triage.complete': true,
        'process.explained': false,
      },
    }));

    expect(denied.outcome).toBe('DENY');
    expect(denied.dispatch).toEqual({
      outcome: 'DENY',
    });
    expect(denied.reason).toContain('supporting document');

    const allowed = service.decide(createInput({
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'post',
      },
      proposal: {
        intent: 'consult',
        suggestedStage: 'ONLINE_CONSULT',
        dispatchAgent: 'ConsultAgent',
        reason: 'schedule the consult',
      },
      statusSnapshot: {
        recommendationSelectionStatus: 'selected',
        recommendationSelectedHospitalIds: ['hospital-1'],
      },
      supportingDocuments: [{ path: '/docs/labs.pdf', name: 'labs.pdf' }],
      facts: {
        'records.minimal_triage.complete': true,
        'process.explained': true,
      },
    }));

    expect(allowed.outcome).toBe('ALLOW');
    expect(allowed.dispatch).toEqual({
      outcome: 'ALLOW',
      agent: 'ConsultAgent',
    });
    expect(allowed.write.stage).toEqual({
      stage: 'ONLINE_CONSULT',
      phase: 'active',
    });
  });

  it('lets handoff escalation override other journey prerequisites', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      proposal: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'RecommendationAgent',
        reason: 'continue',
      },
      handoff: {
        userRequestedHuman: true,
      },
      facts: {
        'records.minimal_triage.complete': false,
      },
    }));

    expect(decision.outcome).toBe('ALLOW');
    expect(decision.action).toBe('ESCALATE');
    expect(decision.dispatch).toEqual({
      outcome: 'ALLOW',
      agent: 'HandoffAgent',
    });
    expect(decision.write).toEqual({
      authority: 'journey-runtime-authority',
      stage: {
        stage: 'HUMAN_HANDOFF',
        phase: 'active',
      },
      journeyCurrentStage: 'HUMAN_HANDOFF',
      journeyCurrentPhase: 'active',
      factsPatch: {
        'handoff.active': true,
      },
    });
  });

  it('denies duplicate handoff redispatch when handoff is already active', () => {
    const decision = service.decide(createInput({
      current: {
        stage: 'HUMAN_HANDOFF',
        phase: 'active',
      },
      proposal: {
        intent: 'handoff',
        suggestedStage: 'HUMAN_HANDOFF',
        dispatchAgent: 'HandoffAgent',
        reason: 'do not reopen an active handoff',
      },
      facts: {
        'handoff.active': true,
      },
    }));

    expect(decision.outcome).toBe('DENY');
    expect(decision.action).toBe('STAY');
    expect(decision.dispatch).toEqual({
      outcome: 'DENY',
    });
    expect(decision.to).toEqual({
      stage: 'HUMAN_HANDOFF',
      phase: 'active',
    });
  });
});
