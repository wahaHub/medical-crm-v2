import { describe, expect, it } from 'vitest';
import { resolveNextActionExecution } from '../../chatbot-v3/next-action-resolver.js';

describe('resolveNextActionExecution', () => {
  it('maps SHOW_PROCESS_OVERVIEW to system-rendered execution', () => {
    const result = resolveNextActionExecution({ type: 'SHOW_PROCESS_OVERVIEW' });

    expect(result.agent).toBeNull();
    expect(result.isSystemRendered).toBe(true);
  });

  it('system-renders safety redirects instead of routing through generic FAQ', () => {
    expect(resolveNextActionExecution({
      type: 'SAFE_MEDICAL_REDIRECT',
      riskType: 'treatment_advice',
    })).toEqual({
      agent: null,
      isSystemRendered: true,
    });
    expect(resolveNextActionExecution({
      type: 'OUT_OF_SCOPE_REDIRECT',
      redirectTarget: 'medical_travel_support',
    })).toEqual({
      agent: null,
      isSystemRendered: true,
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
