import { describe, expect, it } from 'vitest';
import { WritebackPlannerService } from '../../policy-engine/writeback-planner.service.js';

describe('WritebackPlannerService', () => {
  it('marks recommendation exploration without fabricating shortlist audit', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-1',
      sessionDbId: 'db-session-1',
      patientId: null,
      assistantMessageId: 'assistant-1',
      policyDecision: {
        nextAction: 'EXPLORE_HOSPITAL_RECOMMENDATIONS',
        reasonCodes: ['qualified_recommendation_exploration'],
      },
    });

    expect(result.statusPatch.recommendationStatus).toBe('EXPLORED');
    expect(result.statusPatch.lastNextAction).toBe('EXPLORE_HOSPITAL_RECOMMENDATIONS');
    expect(result.timelineEvents).toEqual([]);
    expect(result.followupTrigger).toBeNull();
  });

  it('keeps docs explanation on a guidance-only writeback path', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-1',
      sessionDbId: 'db-session-1',
      patientId: null,
      assistantMessageId: 'assistant-2',
      policyDecision: {
        nextAction: 'EXPLAIN_DOC_UPLOAD',
        reasonCodes: ['qualified_docs_explanation'],
      },
    });

    expect(result.statusPatch).toEqual({
      lastNextAction: 'EXPLAIN_DOC_UPLOAD',
    });
    expect(result.timelineEvents).toEqual([]);
    expect(result.followupTrigger).toBeNull();
  });

  it('keeps consult explanation on a guidance-only writeback path', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-1',
      sessionDbId: 'db-session-1',
      patientId: null,
      assistantMessageId: 'assistant-3',
      policyDecision: {
        nextAction: 'EXPLAIN_CONSULT_PROCESS',
        reasonCodes: ['qualified_consult_explanation'],
      },
    });

    expect(result.statusPatch).toEqual({
      lastNextAction: 'EXPLAIN_CONSULT_PROCESS',
    });
    expect(result.timelineEvents).toEqual([]);
    expect(result.followupTrigger).toBeNull();
  });
});
