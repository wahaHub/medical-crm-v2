import { describe, expect, it } from 'vitest';
import { RiskResolverService } from '../../policy-engine/risk-resolver.service.js';

describe('RiskResolverService', () => {
  it('overrides planning to SAFETY_HANDOFF when crisis signals are present', async () => {
    const resolver = new RiskResolverService();

    const risk = await resolver.resolve({
      userMessage: 'I want to hurt myself.',
      candidateSignals: { possibleRisk: 'CRISIS' },
    });

    expect(risk.riskLevel).toBe('CRISIS');
    expect(risk.overrideAction).toBe('SAFETY_HANDOFF');
  });
});
