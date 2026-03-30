import { describe, expect, it } from 'vitest';
import { IntentResolverService } from '../../policy-engine/intent-resolver.service.js';

describe('IntentResolverService', () => {
  it('resolves a follow-up yes to the active pending hospital recommendation offer', async () => {
    const resolver = new IntentResolverService();

    const decision = await resolver.resolve({
      userMessage: 'Yes, show me that option.',
      pendingOffer: {
        type: 'HOSPITAL_RECOMMENDATION',
        payload: { shortlistId: 'rec-1' },
      },
      recentMessages: [
        {
          role: 'ASSISTANT',
          content: 'I can show you a Korea shortlist if you want.',
          nextAction: 'CONSULT_CONVERSION',
        },
      ],
      candidateSignals: {},
    });

    expect(decision.resolvedIntent).toBe('ACCEPT_HOSPITAL_RECOMMENDATION');
  });
});
