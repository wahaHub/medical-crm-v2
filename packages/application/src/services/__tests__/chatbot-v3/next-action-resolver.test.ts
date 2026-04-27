import { describe, expect, it } from 'vitest';
import { resolveNextActionExecution } from '../../chatbot-v3/next-action-resolver.js';

describe('resolveNextActionExecution', () => {
  it('maps SHOW_PROCESS_OVERVIEW to system-rendered execution', () => {
    const result = resolveNextActionExecution({ type: 'SHOW_PROCESS_OVERVIEW' });

    expect(result.agent).toBeNull();
    expect(result.isSystemRendered).toBe(true);
  });

  it('routes safety and out-of-scope redirects through FAQ-style responders with reducer authority preserved', () => {
    expect(resolveNextActionExecution({
      type: 'SAFE_MEDICAL_REDIRECT',
      riskType: 'treatment_advice',
    })).toEqual({
      agent: 'FaqAgent',
      isSystemRendered: false,
    });
    expect(resolveNextActionExecution({
      type: 'OUT_OF_SCOPE_REDIRECT',
      redirectTarget: 'medical_travel_support',
    })).toEqual({
      agent: 'FaqAgent',
      isSystemRendered: false,
    });
  });

  it('maps next actions to deterministic agents', () => {
    expect(resolveNextActionExecution({ type: 'ANSWER_FAQ', topic: 'pricing' }).agent).toBe('FaqAgent');
    expect(resolveNextActionExecution({ type: 'COLLECT_MINIMAL_TRIAGE' }).agent).toBe('RecordsAgent');
    expect(resolveNextActionExecution({ type: 'REQUEST_MEDICAL_DOCUMENTS' }).agent).toBe('RecordsAgent');
    expect(resolveNextActionExecution({ type: 'GENERATE_RECOMMENDATION' }).agent).toBe('RecommendationAgent');
    expect(resolveNextActionExecution({ type: 'ASK_RECOMMENDATION_SELECTION' }).agent).toBe('RecommendationAgent');
    expect(resolveNextActionExecution({ type: 'OFFER_ONLINE_CONSULT' }).agent).toBe('ConsultAgent');
    expect(resolveNextActionExecution({ type: 'CREATE_HANDOFF' }).agent).toBe('HandoffAgent');
  });
});
