import { describe, expect, it } from 'vitest';
import { parsePolicyConfig } from '../../chatbot-v3/policy-config.service.js';

describe('parsePolicyConfig', () => {
  it('loads forceExplainProcessBefore and stagePrerequisites from config', () => {
    const cfg = parsePolicyConfig({
      globalPolicies: {
        forceExplainProcessBefore: ['RECOMMENDATION'],
      },
      stagePrerequisites: {
        ONLINE_CONSULT: {
          requiresAll: ['recommendation.picked'],
        },
      },
    });

    expect(cfg.globalPolicies.forceExplainProcessBefore).toContain('RECOMMENDATION');
    expect(cfg.stagePrerequisites.ONLINE_CONSULT?.requiresAll).toContain('recommendation.picked');
  });

  it('falls back to the default policy bundle for omitted fields', () => {
    const cfg = parsePolicyConfig({});

    expect(cfg.globalPolicies.forceExplainProcessBefore).toEqual(['RECOMMENDATION', 'ONLINE_CONSULT']);
    expect(cfg.globalPolicies.handoffTriggers).toEqual({
      userRequestedHuman: true,
      consecutiveCriticalToolFailures: 2,
      safetyPolicyHit: true,
    });
    expect(cfg.stagePrerequisites.RECOMMENDATION).toEqual({
      requiresAll: ['records.saved'],
    });
    expect(cfg.stagePrerequisites.ONLINE_CONSULT).toEqual({
      requiresAll: ['recommendation.picked'],
    });
    expect(cfg.jumpRules).toEqual([]);
  });

  it('ignores invalid stage entries while keeping valid ones', () => {
    const cfg = parsePolicyConfig({
      globalPolicies: {
        forceExplainProcessBefore: ['RECOMMENDATION', 'INVALID_STAGE'],
      },
      stagePrerequisites: {
        RECOMMENDATION: {
          requiresAll: ['records.saved'],
        },
        INVALID_STAGE: {
          requiresAll: ['ignored.fact'],
        },
      } as never,
    } as never);

    expect(cfg.globalPolicies.forceExplainProcessBefore).toEqual(['RECOMMENDATION']);
    expect(cfg.stagePrerequisites.RECOMMENDATION).toEqual({
      requiresAll: ['records.saved'],
    });
    expect(cfg.stagePrerequisites).not.toHaveProperty('INVALID_STAGE');
  });

  it('merges partial handoffTriggers overrides over defaults', () => {
    const cfg = parsePolicyConfig({
      globalPolicies: {
        handoffTriggers: {
          consecutiveCriticalToolFailures: 4,
        },
      },
    });

    expect(cfg.globalPolicies.handoffTriggers).toEqual({
      userRequestedHuman: true,
      consecutiveCriticalToolFailures: 4,
      safetyPolicyHit: true,
    });
  });

  it('copies jumpRules deeply enough to isolate parsed output from caller mutation', () => {
    const input = {
      jumpRules: [
        {
          id: 'rule-1',
          priority: 10,
          fromStage: 'EXPLAIN_PROCESS',
          toStage: 'RECOMMENDATION',
          requiresAll: ['records.saved'],
          requiresAny: ['facts.ready'],
          denyIfAny: ['facts.blocked'],
        },
      ],
    } as any;

    const cfg = parsePolicyConfig(input);

    input.jumpRules[0].requiresAll?.push('mutated.fact');
    input.jumpRules[0].requiresAny?.splice(0, 1, 'mutated.any');
    input.jumpRules[0].denyIfAny = ['mutated.block'];

    expect(cfg.jumpRules).toHaveLength(1);
    expect(cfg.jumpRules[0]).not.toBe(input.jumpRules[0]);
    expect(cfg.jumpRules[0]).toEqual({
      id: 'rule-1',
      priority: 10,
      fromStage: 'EXPLAIN_PROCESS',
      toStage: 'RECOMMENDATION',
      requiresAll: ['records.saved'],
      requiresAny: ['facts.ready'],
      denyIfAny: ['facts.blocked'],
    });
  });
});
