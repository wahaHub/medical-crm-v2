import { describe, expect, it } from 'vitest';
import { OrchestratorV3Service } from '../../chatbot-v3/orchestrator-v3.service.js';

describe('OrchestratorV3Service', () => {
  const service = new OrchestratorV3Service();

  it('denies skip when explain gate is not satisfied', () => {
    const decision = service.decide({
      current: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        reason: 'user asked to jump straight to recommendations',
      },
      facts: {},
    });

    expect(decision.action).toBe('STAY');
    expect(decision.whyNotSkip).toContain('EXPLAIN_PROCESS');
  });

  it('lets handoff hard policy win before explain/prerequisite gates', () => {
    const decision = service.decide({
      current: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'active',
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        reason: 'user also asked for a recommendation',
      },
      facts: {},
      handoff: {
        userRequestedHuman: true,
      },
    });

    expect(decision.action).toBe('HANDOFF');
  });

  it('keeps agent dispatch owned by orchestrator output', () => {
    const decision = service.decide({
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'active',
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        reason: 'records are complete',
      },
      facts: {
        'records.saved': true,
      },
    });

    expect(decision.dispatchAgent).toBe('RecommendationAgent');
    expect(decision.dispatchSource).toBe('orchestrator');
  });
});
