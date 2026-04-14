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

  it('merges stage prerequisite overrides without dropping default requirements', () => {
    const cfg = parsePolicyConfig({
      stagePrerequisites: {
        RECOMMENDATION: {
          requiresAny: ['records.saved'],
        },
      },
    });

    expect(cfg.stagePrerequisites.RECOMMENDATION).toEqual({
      requiresAll: ['records.saved'],
      requiresAny: ['records.saved'],
    });
  });
});
