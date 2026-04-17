import { describe, expect, it } from 'vitest';
import { JourneyRuntimeAuthorityService } from '../../chatbot-v3/journey-runtime-authority.service.js';
import { OrchestratorV3Service } from '../../chatbot-v3/orchestrator-v3.service.js';

describe('OrchestratorV3Service', () => {
  const service = new OrchestratorV3Service();
  const authority = new JourneyRuntimeAuthorityService();

  it('keeps the compatibility wrapper aligned with authority-approved recommendation dispatch', () => {
    const input = {
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS' as const,
        phase: 'active' as const,
      },
      suggestion: {
        intent: 'progression' as const,
        suggestedStage: 'RECOMMENDATION' as const,
        dispatchAgent: 'RecommendationAgent' as const,
        reason: 'minimal triage is complete',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
    };

    const decision = service.decide(input);
    const authorityDecision = authority.decide({
      current: input.current,
      proposal: input.suggestion,
      facts: input.facts,
    });

    expect(decision).toMatchObject({
      action: authorityDecision.action,
      from: authorityDecision.from,
      to: authorityDecision.to,
      dispatchAgent: 'RecommendationAgent',
      dispatchSource: 'orchestrator',
    });
  });

  it('returns a deny/stay compatibility shape when authority rejects a proposal', () => {
    const decision = service.decide({
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'RecommendationAgent',
        reason: 'jump ahead',
      },
      facts: {
        'records.minimal_triage.complete': false,
      },
    });

    expect(decision.action).toBe('STAY');
    expect(decision.dispatchAgent).toBeUndefined();
    expect(decision.dispatchSource).toBe('orchestrator');
    expect(decision.whyNotSkip).toContain('records.minimal_triage.complete');
  });

  it('maps escalation decisions to the runtime-shell handoff shape', () => {
    const decision = service.decide({
      current: {
        stage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
        phase: 'active',
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'RecommendationAgent',
        reason: 'continue',
      },
      handoff: {
        userRequestedHuman: true,
      },
    });

    expect(decision).toMatchObject({
      action: 'HANDOFF',
      to: {
        stage: 'HUMAN_HANDOFF',
        phase: 'active',
      },
      dispatchAgent: 'HandoffAgent',
      dispatchSource: 'orchestrator',
    });
  });

  it('preserves the current phase when an authority repeat maps to compatibility stay', () => {
    const decision = service.decide({
      current: {
        stage: 'RECOMMENDATION',
        phase: 'post',
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        dispatchAgent: 'RecommendationAgent',
        reason: 'refresh recommendation in place',
      },
      facts: {
        'records.minimal_triage.complete': true,
      },
    });

    expect(decision).toMatchObject({
      action: 'STAY',
      from: {
        stage: 'RECOMMENDATION',
        phase: 'post',
      },
      to: {
        stage: 'RECOMMENDATION',
        phase: 'post',
      },
      dispatchAgent: 'RecommendationAgent',
      dispatchSource: 'orchestrator',
    });
  });

  it('fails loudly when callers try to pass legacy policy overrides into the compatibility wrapper', () => {
    expect(() => new OrchestratorV3Service({
      jumpRules: [
        {
          id: 'legacy-rule',
          priority: 100,
          fromStage: 'COLLECT_MINIMAL_MEDICAL_FACTS',
          toStage: 'ONLINE_CONSULT',
        },
      ],
    })).toThrow('OrchestratorV3Service no longer accepts policy override config');
  });
});
