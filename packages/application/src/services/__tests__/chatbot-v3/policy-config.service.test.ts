import { describe, expect, it } from 'vitest';
import { parsePolicyConfig as parsePolicyConfigFromIndex } from '../../../index.js';
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
    expect(cfg.globalPolicies.handoffPrerequisites).toEqual({
      denyIfAny: ['handoff.active'],
    });
    expect(cfg.stagePrerequisites.RECOMMENDATION).toEqual({
      requiresAll: ['process.explained', 'records.saved'],
    });
    expect(cfg.stagePrerequisites.ONLINE_CONSULT).toEqual({
      requiresAll: ['process.explained', 'recommendation.picked'],
    });
    expect(cfg.jumpRules).toEqual([]);
  });

  it('throws when global forceExplainProcessBefore contains an unknown stage', () => {
    expect(() => parsePolicyConfig({
      globalPolicies: {
        forceExplainProcessBefore: ['RECOMMENDATION', 'INVALID_STAGE'],
      },
    } as never)).toThrow('globalPolicies.forceExplainProcessBefore contains unknown stage "INVALID_STAGE"');
  });

  it('throws when stagePrerequisites contains an unknown stage key', () => {
    expect(() => parsePolicyConfig({
      stagePrerequisites: {
        INVALID_STAGE: {
          requiresAll: ['ignored.fact'],
        },
      } as never,
    } as never)).toThrow('stagePrerequisites contains unknown stage key "INVALID_STAGE"');
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

  it('loads handoffPrerequisites from config', () => {
    const cfg = parsePolicyConfig({
      globalPolicies: {
        handoffPrerequisites: { denyIfAny: ['handoff.active'] },
      },
    } as never);

    expect(cfg.globalPolicies.handoffPrerequisites).toEqual({
      denyIfAny: ['handoff.active'],
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
          requiresAll: ['legacy.fact'],
        },
      ],
    } as any;

    const cfg = parsePolicyConfig(input);

    input.jumpRules[0].priority = 20;
    input.jumpRules[0].toStage = 'ONLINE_CONSULT';

    expect(cfg.jumpRules).toHaveLength(1);
    expect(cfg.jumpRules[0]).not.toBe(input.jumpRules[0]);
    expect(cfg.jumpRules[0]).toEqual({
      id: 'rule-1',
      priority: 10,
      fromStage: 'EXPLAIN_PROCESS',
      toStage: 'RECOMMENDATION',
    });
    expect(cfg.jumpRules[0]).not.toHaveProperty('requiresAll');
  });

  it('is re-exported from the package index', () => {
    expect(parsePolicyConfigFromIndex).toBe(parsePolicyConfig);
  });
});
