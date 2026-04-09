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
      },
    });

    expect(result.statusPatch).toEqual({
      engagementMode: 'LIGHT_DISCOVERY',
    });
    expect(result.timelineEvents).toEqual([]);
    expect(result.followupTrigger).toBeNull();
    expect(result.messageMetadata).toMatchObject({
      engagementMode: 'LIGHT_DISCOVERY',
      writebackDepth: 'minimal',
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
      },
    });

    expect(result.statusPatch).toEqual({
      engagementMode: 'LIGHT_DISCOVERY',
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
      },
    });

    expect(result.statusPatch).toEqual({
      engagementMode: 'LIGHT_DISCOVERY',
    });
    expect(result.timelineEvents).toEqual([]);
    expect(result.followupTrigger).toBeNull();
    expect(result.messageMetadata).toMatchObject({
      engagementMode: 'LIGHT_DISCOVERY',
      writebackDepth: 'minimal',
      reasonCodes: ['documents_requested'],
    });
  });

  it('keeps light discovery writeback free of deleted prequalification fields', () => {
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
      },
    });

    expect(result.statusPatch).toEqual({
      engagementMode: 'LIGHT_DISCOVERY',
    });
    expect(result.messageMetadata).toMatchObject({
      engagementMode: 'LIGHT_DISCOVERY',
      writebackDepth: 'minimal',
      reasonCodes: ['light_discovery_soft_guidance'],
    });
  });

  it('marks recommendation display without fabricating shortlist audit', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-1',
      sessionDbId: 'db-session-1',
      patientId: null,
      assistantMessageId: 'assistant-1',
      policyDecision: {
        engagementMode: 'QUALIFIED_EXPLORATION',
        writebackDepth: 'moderate',
        nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        reasonCodes: ['authoritative_shortlist_ready'],
      },
    });

    expect(result.statusPatch.recommendationStatus).toBe('PRELIMINARY_SHOWN');
    expect(result.statusPatch.engagementMode).toBe('QUALIFIED_EXPLORATION');
    expect(result.statusPatch).not.toHaveProperty('lastNextAction');
    expect(result.timelineEvents).toEqual([]);
    expect(result.followupTrigger).toBeNull();
  });

  it('persists the qualified document-upload path when the final action is REQUEST_DOC_UPLOAD', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-1',
      sessionDbId: 'db-session-1',
      patientId: null,
      assistantMessageId: 'assistant-2',
      policyDecision: {
        engagementMode: 'QUALIFIED_EXPLORATION',
        writebackDepth: 'moderate',
        nextAction: 'REQUEST_DOC_UPLOAD',
        reasonCodes: ['documents_required_before_recommendation'],
      },
    });

    expect(result.statusPatch).toEqual({
      engagementMode: 'QUALIFIED_EXPLORATION',
      docUploadStatus: 'REQUESTED',
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
      },
    });

    expect(result.statusPatch).toEqual({
      engagementMode: 'QUALIFIED_EXPLORATION',
    });
    expect(result.timelineEvents).toEqual([]);
    expect(result.followupTrigger).toBeNull();
  });

  it('keeps consult invites on a final-action writeback path without fabricating extra side effects', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-invite-1',
      sessionDbId: 'db-session-invite-1',
      patientId: null,
      assistantMessageId: 'assistant-invite-1',
      policyDecision: {
        engagementMode: 'DEEP_WORKFLOW',
        writebackDepth: 'complete',
        nextAction: 'INVITE_ONLINE_CONSULT',
        reasonCodes: ['consult_invite_ready'],
      },
    });

    expect(result.statusPatch).toMatchObject({
      engagementMode: 'DEEP_WORKFLOW',
    });
    expect(result.timelineEvents).toEqual([]);
    expect(result.followupTrigger).toBeNull();
  });

  it('keeps human handoff writeback aligned to the final action and leaves handoff creation to the executor', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-handoff-1',
      sessionDbId: 'db-session-handoff-1',
      patientId: null,
      assistantMessageId: 'assistant-handoff-1',
      policyDecision: {
        engagementMode: 'QUALIFIED_EXPLORATION',
        writebackDepth: 'moderate',
        nextAction: 'HUMAN_HANDOFF',
        reasonCodes: ['human_handoff_requested'],
      },
    });

    expect(result.statusPatch).toEqual({
      engagementMode: 'QUALIFIED_EXPLORATION',
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
      },
    });

    expect(result.statusPatch).toMatchObject({
      engagementMode: 'DEEP_WORKFLOW',
      docUploadStatus: 'REQUESTED',
    });
    expect(result.timelineEvents[0]?.eventType).toBe('DOC_UPLOAD_REQUESTED');
    expect(result.followupTrigger?.triggerType).toBe('DOC_UPLOAD_PENDING');
    expect(result.messageMetadata).toMatchObject({
      engagementMode: 'DEEP_WORKFLOW',
      writebackDepth: 'complete',
    });
  });

  it('does not persist selectedHospitalId after state truth consolidation', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-selected-1',
      sessionDbId: 'db-session-selected-1',
      patientId: null,
      assistantMessageId: 'assistant-selected-1',
      policyDecision: {
        engagementMode: 'DEEP_WORKFLOW',
        writebackDepth: 'complete',
        nextAction: 'ANSWER_FAQ',
        reasonCodes: ['pending_offer_confirmed'],
      },
    });

    expect(result.statusPatch).toEqual({
      engagementMode: 'DEEP_WORKFLOW',
    });
    expect(result.messageMetadata).toMatchObject({
      reasonCodes: ['pending_offer_confirmed'],
    });
  });

  it('forces complete writeback depth for deep workflow even if caller sends a lighter depth', () => {
    const planner = new WritebackPlannerService();

    const result = planner.plan({
      sessionId: 'session-1',
      sessionDbId: 'db-session-1',
      patientId: null,
      assistantMessageId: 'assistant-deep-unsafe',
      policyDecision: {
        engagementMode: 'DEEP_WORKFLOW',
        writebackDepth: 'minimal',
        nextAction: 'REQUEST_DOC_UPLOAD',
        reasonCodes: ['documents_required_before_recommendation'],
      },
    });

    expect(result.statusPatch).toMatchObject({
      engagementMode: 'DEEP_WORKFLOW',
      docUploadStatus: 'REQUESTED',
    });
    expect(result.timelineEvents[0]?.eventType).toBe('DOC_UPLOAD_REQUESTED');
    expect(result.followupTrigger?.triggerType).toBe('DOC_UPLOAD_PENDING');
    expect(result.messageMetadata).toMatchObject({
      engagementMode: 'DEEP_WORKFLOW',
      writebackDepth: 'complete',
    });
  });
});
