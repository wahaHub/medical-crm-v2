import { describe, expect, it } from 'vitest';
import { RiskResolverService } from '../../policy-engine/risk-resolver.service.js';

describe('RiskResolverService', () => {
  it('overrides planning to SAFETY_HANDOFF when crisis signals are present', async () => {
    const resolver = new RiskResolverService();

    const risk = await resolver.resolve({
      userMessage: 'I want to hurt myself.',
      extractionSignals: { riskLevelHint: 'CRISIS' },
    });

    expect(risk.riskLevel).toBe('CRISIS');
    expect(risk.overrideAction).toBe('SAFETY_HANDOFF');
  });

  it('keeps sensitive turns elevated when extraction flags them without a regex crisis match', async () => {
    const resolver = new RiskResolverService();

    const risk = await resolver.resolve({
      userMessage: 'I feel very embarrassed talking about this issue.',
      extractionSignals: { riskLevelHint: 'SENSITIVE' },
    });

    expect(risk.riskLevel).toBe('SENSITIVE');
    expect(risk.overrideAction).toBeNull();
    expect(risk.reasonCodes).toContain('sensitive_signal_detected');
  });
});
