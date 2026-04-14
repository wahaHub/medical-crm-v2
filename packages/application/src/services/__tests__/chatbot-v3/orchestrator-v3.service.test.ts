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

  it('does not let explain gate block progression once explain process is already in post', () => {
    const serviceWithJumpRule = new OrchestratorV3Service({
      jumpRules: [
        {
          id: 'explain-post-to-recommendation',
          priority: 100,
          fromStage: 'EXPLAIN_PROCESS',
          toStage: 'RECOMMENDATION',
          requiresAll: ['records.saved'],
        },
      ],
    });

    const decision = serviceWithJumpRule.decide({
      current: {
        stage: 'EXPLAIN_PROCESS',
        phase: 'post',
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'RECOMMENDATION',
        reason: 'explain stage is already complete',
      },
      facts: {
        'records.saved': true,
      },
    });

    expect(decision.action).toBe('SKIP');
    expect(decision.matchedRuleId).toBe('explain-post-to-recommendation');
    expect(decision.whyNotSkip).toBeUndefined();
  });

  it('does not classify backward transitions as ADVANCE when no jump rule matches', () => {
    const decision = service.decide({
      current: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
      suggestion: {
        intent: 'progression',
        suggestedStage: 'COLLECT_MEDICAL_INPUTS',
        reason: 'revisit uploads',
      },
      facts: {
        'records.saved': true,
      },
    });

    expect(decision.action).toBe('STAY');
    expect(decision.whyNotSkip).toContain('No jump rule matched');
  });

  it('requires a matching jump rule for skip transitions and returns the matched rule id', () => {
    const serviceWithJumpRule = new OrchestratorV3Service({
      jumpRules: [
        {
          id: 'collect-to-consult',
          priority: 200,
          fromStage: 'COLLECT_MEDICAL_INPUTS',
          toStage: 'ONLINE_CONSULT',
          requiresAll: ['recommendation.picked'],
        },
      ],
    });

    const decision = serviceWithJumpRule.decide({
      current: {
        stage: 'COLLECT_MEDICAL_INPUTS',
        phase: 'post',
      },
      suggestion: {
        intent: 'consult',
        suggestedStage: 'ONLINE_CONSULT',
        reason: 'user is ready to book consult',
      },
      facts: {
        'recommendation.picked': true,
      },
    });

    expect(decision.action).toBe('SKIP');
    expect(decision.matchedRuleId).toBe('collect-to-consult');
  });
});
