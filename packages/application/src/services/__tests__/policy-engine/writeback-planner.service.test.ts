import { describe, expect, it } from 'vitest';
import { WritebackPlannerService } from '../../policy-engine/writeback-planner.service.js';

describe('WritebackPlannerService', () => {
  it('keeps light discovery writeback minimal while persisting engagement truth', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-1',
      sessionDbId: 'db-session-1',
      patientId: null,
      assistantMessageId: 'assistant-light-1',
      policyDecision: {
        engagementMode: 'LIGHT_DISCOVERY',
        writebackDepth: 'minimal',
        nextAction: 'ANSWER_FAQ',
        reasonCodes: ['light_discovery_soft_guidance'],
        prequalificationReasonCodes: ['greeting_detected'],
      },
    });

    expect(result.statusPatch).toEqual({
      engagementMode: 'LIGHT_DISCOVERY',
      prequalificationReasonCodes: ['greeting_detected'],
      lastNextAction: 'ANSWER_FAQ',
    });
    expect(result.timelineEvents).toEqual([]);
    expect(result.followupTrigger).toBeNull();
    expect(result.messageMetadata).toMatchObject({
      engagementMode: 'LIGHT_DISCOVERY',
      writebackDepth: 'minimal',
      prequalificationReasonCodes: ['greeting_detected'],
      reasonCodes: ['light_discovery_soft_guidance'],
    });
  });

  it('suppresses heavy side effects when writeback depth is minimal even for progression actions', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-1',
      sessionDbId: 'db-session-1',
      patientId: null,
      assistantMessageId: 'assistant-light-2',
      policyDecision: {
        engagementMode: 'LIGHT_DISCOVERY',
        writebackDepth: 'minimal',
        nextAction: 'REQUEST_DOC_UPLOAD',
        reasonCodes: ['documents_requested'],
        prequalificationReasonCodes: ['low_signal_docs_question'],
      },
    });

    expect(result.statusPatch).toEqual({
      engagementMode: 'LIGHT_DISCOVERY',
      prequalificationReasonCodes: ['low_signal_docs_question'],
      lastNextAction: 'REQUEST_DOC_UPLOAD',
    });
    expect(result.timelineEvents).toEqual([]);
    expect(result.followupTrigger).toBeNull();
  });

  it('downgrades mismatched light discovery writeback depth before planning side effects', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-1',
      sessionDbId: 'db-session-1',
      patientId: null,
      assistantMessageId: 'assistant-light-unsafe',
      policyDecision: {
        engagementMode: 'LIGHT_DISCOVERY',
        writebackDepth: 'complete',
        nextAction: 'REQUEST_DOC_UPLOAD',
        reasonCodes: ['documents_requested'],
        prequalificationReasonCodes: ['low_signal_docs_question'],
      },
    });

    expect(result.statusPatch).toEqual({
      engagementMode: 'LIGHT_DISCOVERY',
      prequalificationReasonCodes: ['low_signal_docs_question'],
      lastNextAction: 'REQUEST_DOC_UPLOAD',
    });
    expect(result.timelineEvents).toEqual([]);
    expect(result.followupTrigger).toBeNull();
    expect(result.messageMetadata).toMatchObject({
      engagementMode: 'LIGHT_DISCOVERY',
      writebackDepth: 'minimal',
      prequalificationReasonCodes: ['low_signal_docs_question'],
      reasonCodes: ['documents_requested'],
    });
  });

  it('clears prequalification reason codes when latest truth is empty', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-1',
      sessionDbId: 'db-session-1',
      patientId: null,
      assistantMessageId: 'assistant-light-3',
      policyDecision: {
        engagementMode: 'LIGHT_DISCOVERY',
        writebackDepth: 'minimal',
        nextAction: 'ANSWER_FAQ',
        reasonCodes: ['light_discovery_soft_guidance'],
        prequalificationReasonCodes: [],
      },
    });

    expect(result.statusPatch).toEqual({
      engagementMode: 'LIGHT_DISCOVERY',
      prequalificationReasonCodes: [],
      lastNextAction: 'ANSWER_FAQ',
    });
    expect(result.messageMetadata).toMatchObject({
      engagementMode: 'LIGHT_DISCOVERY',
      writebackDepth: 'minimal',
      prequalificationReasonCodes: [],
      reasonCodes: ['light_discovery_soft_guidance'],
    });
  });

  it('marks recommendation exploration without fabricating shortlist audit', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-1',
      sessionDbId: 'db-session-1',
      patientId: null,
      assistantMessageId: 'assistant-1',
      policyDecision: {
        engagementMode: 'QUALIFIED_EXPLORATION',
        writebackDepth: 'moderate',
        nextAction: 'EXPLORE_HOSPITAL_RECOMMENDATIONS',
        reasonCodes: ['qualified_recommendation_exploration'],
        prequalificationReasonCodes: ['trust_building_question'],
      },
    });

    expect(result.statusPatch.recommendationStatus).toBe('EXPLORED');
    expect(result.statusPatch.engagementMode).toBe('QUALIFIED_EXPLORATION');
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
        engagementMode: 'QUALIFIED_EXPLORATION',
        writebackDepth: 'moderate',
        nextAction: 'EXPLAIN_DOC_UPLOAD',
        reasonCodes: ['qualified_docs_explanation'],
        prequalificationReasonCodes: ['trust_building_question'],
      },
    });

    expect(result.statusPatch).toEqual({
      engagementMode: 'QUALIFIED_EXPLORATION',
      prequalificationReasonCodes: ['trust_building_question'],
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
        engagementMode: 'QUALIFIED_EXPLORATION',
        writebackDepth: 'moderate',
        nextAction: 'EXPLAIN_CONSULT_PROCESS',
        reasonCodes: ['qualified_consult_explanation'],
        prequalificationReasonCodes: ['trust_building_question'],
      },
    });

    expect(result.statusPatch).toEqual({
      engagementMode: 'QUALIFIED_EXPLORATION',
      prequalificationReasonCodes: ['trust_building_question'],
      lastNextAction: 'EXPLAIN_CONSULT_PROCESS',
    });
    expect(result.timelineEvents).toEqual([]);
    expect(result.followupTrigger).toBeNull();
  });

  it('keeps deep workflow side effects while latching deep entry metadata', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-1',
      sessionDbId: 'db-session-1',
      patientId: null,
      assistantMessageId: 'assistant-deep-1',
      policyDecision: {
        engagementMode: 'DEEP_WORKFLOW',
        writebackDepth: 'complete',
        nextAction: 'REQUEST_DOC_UPLOAD',
        reasonCodes: ['documents_required_before_recommendation'],
        prequalificationReasonCodes: ['form_completed', 'documents_missing'],
      },
    });

    expect(result.statusPatch).toMatchObject({
      engagementMode: 'DEEP_WORKFLOW',
      prequalificationReasonCodes: ['form_completed', 'documents_missing'],
      docUploadStatus: 'REQUESTED',
      lastNextAction: 'REQUEST_DOC_UPLOAD',
    });
    expect(result.timelineEvents[0]?.eventType).toBe('DOC_UPLOAD_REQUESTED');
    expect(result.followupTrigger?.triggerType).toBe('DOC_UPLOAD_PENDING');
    expect(result.messageMetadata).toMatchObject({
      engagementMode: 'DEEP_WORKFLOW',
      writebackDepth: 'complete',
    });
  });
});
