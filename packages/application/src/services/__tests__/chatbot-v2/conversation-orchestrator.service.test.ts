import { describe, expect, it } from 'vitest';
import { ConversationOrchestratorService } from '../../chatbot-v2/conversation-orchestrator.service.js';

describe('ConversationOrchestratorService', () => {
  const service = new ConversationOrchestratorService();

  const defaultTruth = {
    medicalInputsSubmitted: false,
    recommendationConfirmed: false,
    onlineConsultSubmitted: false,
  } as const;

  it('throws when classifier output is missing so local keyword fallback cannot reappear', () => {
    expect(() => service.orchestrate({
      scopeId: 'case-1',
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      truth: defaultTruth,
    } as never)).toThrow('classifier output is required');
  });

  it('uses process explanation as the response intent for pure progression requests in EXPLAIN_PROCESS.active until the initial process explanation has been completed', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'progression_request',
        targetResourceTypes: ['QUESTIONNAIRE', 'MEDICAL_DOC_UPLOAD'],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      truth: defaultTruth,
      hasCompletedInitialProcessExplanation: false,
    });

    expect(result.responseIntent).toBe('process_explanation');
    expect(result.journeyUpdate).toBeUndefined();
    expect(result.allowedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'PROCESS_GUIDE' }),
      expect.objectContaining({ resourceType: 'MEDICAL_INVITATION_STATUS' }),
    ]));
  });

  it('keeps explicit intake resource requests anchored in EXPLAIN_PROCESS.active until the initial process explanation has been completed', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'resource_request',
        targetResourceTypes: ['QUESTIONNAIRE'],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      truth: defaultTruth,
      hasCompletedInitialProcessExplanation: false,
    });

    expect(result.responseIntent).toBe('process_explanation');
    expect(result.journeyUpdate).toBeUndefined();
    expect(result.allowedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'PROCESS_GUIDE' }),
    ]));
    expect(result.allowedResources).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'QUESTIONNAIRE' }),
      expect.objectContaining({ resourceType: 'MEDICAL_DOC_UPLOAD' }),
    ]));
  });

  it('allows pure progression requests to leave EXPLAIN_PROCESS only after the initial process explanation has already been completed', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'progression_request',
        targetResourceTypes: ['QUESTIONNAIRE', 'MEDICAL_DOC_UPLOAD'],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      truth: defaultTruth,
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
  });

  it('moves COLLECT_MEDICAL_INPUTS.pre into active when intake resources are explicitly requested', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'resource_request',
        targetResourceTypes: ['QUESTIONNAIRE'],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'pre',
      },
      truth: defaultTruth,
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'active',
    });
    expect(result.allowedResources).toEqual([
      expect.objectContaining({ resourceType: 'QUESTIONNAIRE' }),
    ]);
  });

  it('moves COLLECT_MEDICAL_INPUTS.active into post when medical inputs have been submitted', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'faq',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      },
      truth: {
        ...defaultTruth,
        medicalInputsSubmitted: true,
      },
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'post',
    });
  });

  it('allows COLLECT_MEDICAL_INPUTS.active to be dismissed so the journey can continue to recommendation', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      },
      truth: defaultTruth,
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'pre',
    });
  });

  it('keeps COLLECT_MEDICAL_INPUTS.active anchored when progression targets still point to current-step intake resources', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'progression_request',
        targetResourceTypes: ['QUESTIONNAIRE', 'MEDICAL_DOC_UPLOAD'],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      },
      truth: defaultTruth,
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toBeUndefined();
    expect(result.allowedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'QUESTIONNAIRE' }),
      expect.objectContaining({ resourceType: 'MEDICAL_DOC_UPLOAD' }),
    ]));
  });

  it('does not let process explanations with progression follow-up jump out of COLLECT_MEDICAL_INPUTS.active', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'process_explanation',
        targetResourceTypes: ['PROCESS_GUIDE'],
        includeProgressionFollowUp: true,
      },
      journeySnapshot: {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      },
      truth: defaultTruth,
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toBeUndefined();
    expect(result.includeProgressionFollowUpAccepted).toBe(true);
    expect(result.allowedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'MEDICAL_DOC_UPLOAD' }),
      expect.objectContaining({ resourceType: 'QUESTIONNAIRE' }),
      expect.objectContaining({ resourceType: 'MEDICAL_INVITATION_STATUS' }),
    ]));
  });

  it('moves COLLECT_MEDICAL_INPUTS.post into RECOMMENDATION.pre on progression', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'post',
      },
      truth: {
        ...defaultTruth,
        medicalInputsSubmitted: true,
      },
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'pre',
    });
    expect(result.allowedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'HOSPITAL_RECOMMENDATION' }),
      expect.objectContaining({ resourceType: 'PACKAGE_RECOMMENDATION' }),
    ]));
  });

  it('moves RECOMMENDATION.pre into active when recommendation resources are explicitly requested', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'resource_request',
        targetResourceTypes: ['HOSPITAL_RECOMMENDATION'],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'pre',
      },
      truth: {
        ...defaultTruth,
        medicalInputsSubmitted: true,
      },
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'active',
    });
    expect(result.allowedResources).toEqual([
      expect.objectContaining({ resourceType: 'HOSPITAL_RECOMMENDATION' }),
    ]);
  });

  it('moves RECOMMENDATION.active into post when recommendation has been confirmed', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'faq',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'active',
      },
      truth: {
        ...defaultTruth,
        recommendationConfirmed: true,
      },
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toEqual({
      currentStage: 'RECOMMENDATION',
      currentPhase: 'post',
    });
  });

  it('allows RECOMMENDATION.active to be dismissed so the journey can continue to online consult', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'active',
      },
      truth: {
        ...defaultTruth,
        medicalInputsSubmitted: true,
      },
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toEqual({
      currentStage: 'ONLINE_CONSULT',
      currentPhase: 'pre',
    });
  });

  it('keeps RECOMMENDATION.active anchored when progression targets still point to recommendation resources', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'progression_request',
        targetResourceTypes: ['HOSPITAL_RECOMMENDATION'],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'active',
      },
      truth: {
        ...defaultTruth,
        medicalInputsSubmitted: true,
      },
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toBeUndefined();
    expect(result.allowedResources).toEqual([
      expect.objectContaining({ resourceType: 'HOSPITAL_RECOMMENDATION' }),
    ]);
  });

  it('moves RECOMMENDATION.post into ONLINE_CONSULT.pre on progression', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'post',
      },
      truth: {
        ...defaultTruth,
        recommendationConfirmed: true,
      },
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toEqual({
      currentStage: 'ONLINE_CONSULT',
      currentPhase: 'pre',
    });
    expect(result.allowedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'ONLINE_CONSULT_BOOKING' }),
    ]));
  });

  it('moves ONLINE_CONSULT.pre into active when booking is explicitly requested', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'resource_request',
        targetResourceTypes: ['ONLINE_CONSULT_BOOKING'],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'ONLINE_CONSULT',
        currentPhase: 'pre',
      },
      truth: {
        ...defaultTruth,
        recommendationConfirmed: true,
      },
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toEqual({
      currentStage: 'ONLINE_CONSULT',
      currentPhase: 'active',
    });
    expect(result.allowedResources).toEqual([
      expect.objectContaining({ resourceType: 'ONLINE_CONSULT_BOOKING' }),
    ]);
  });

  it('moves ONLINE_CONSULT.active into post when booking has been submitted', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'faq',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'ONLINE_CONSULT',
        currentPhase: 'active',
      },
      truth: {
        ...defaultTruth,
        onlineConsultSubmitted: true,
      },
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toEqual({
      currentStage: 'ONLINE_CONSULT',
      currentPhase: 'post',
    });
  });

  it('keeps targeted resource status questions constrained to the requested query resource', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'resource_status_question',
        targetResourceTypes: ['MEDICAL_INVITATION_STATUS'],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'ONLINE_CONSULT',
        currentPhase: 'pre',
      },
      truth: {
        ...defaultTruth,
        recommendationConfirmed: true,
      },
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.responseIntent).toBe('resource_status_question');
    expect(result.allowedResources).toEqual([
      expect.objectContaining({
        resourceType: 'MEDICAL_INVITATION_STATUS',
        resourceId: 'medical-invitation-status:case-1',
      }),
    ]);
    expect(result.journeyUpdate).toBeUndefined();
  });

  it('routes human-help requests to the handoff journey and handoff resource', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'human_help_request',
        targetResourceTypes: ['HUMAN_HANDOFF'],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'active',
      },
      truth: {
        ...defaultTruth,
        medicalInputsSubmitted: true,
      },
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.responseIntent).toBe('human_help_request');
    expect(result.journeyUpdate).toEqual({
      currentStage: 'HUMAN_HANDOFF',
      currentPhase: 'pre',
    });
    expect(result.allowedResources).toEqual([
      expect.objectContaining({
        resourceType: 'HUMAN_HANDOFF',
        resourceId: 'human-handoff:case-1',
      }),
    ]);
  });

  it('moves HUMAN_HANDOFF.pre into active when the user agrees to proceed with the handoff', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'HUMAN_HANDOFF',
        currentPhase: 'pre',
      },
      truth: defaultTruth,
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toEqual({
      currentStage: 'HUMAN_HANDOFF',
      currentPhase: 'active',
    });
    expect(result.allowedResources).toEqual([
      expect.objectContaining({
        resourceType: 'HUMAN_HANDOFF',
      }),
    ]);
  });

  it('keeps HUMAN_HANDOFF.active anchored during pre-turn orchestration until the execution acknowledgement arrives', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'HUMAN_HANDOFF',
        currentPhase: 'active',
      },
      truth: defaultTruth,
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.journeyUpdate).toBeUndefined();
  });

  it('moves HUMAN_HANDOFF.active into post after the handoff execution turn completes', () => {
    const result = service.orchestratePostTurn({
      scopeId: 'case-1',
      journeySnapshot: {
        currentStage: 'HUMAN_HANDOFF',
        currentPhase: 'active',
      },
      truth: defaultTruth,
      assistantInternalNextAction: 'HUMAN_HANDOFF',
    });

    expect(result.journeyUpdate).toEqual({
      currentStage: 'HUMAN_HANDOFF',
      currentPhase: 'post',
    });
  });

  it('uses the process guide for later process explanations without rewinding the journey and treats them as FAQ-like informational turns', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'process_explanation',
        targetResourceTypes: ['PROCESS_GUIDE'],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      },
      truth: defaultTruth,
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.responseIntent).toBe('faq');
    expect(result.allowedResources).toEqual([
      expect.objectContaining({
        resourceType: 'PROCESS_GUIDE',
        resourceId: 'process-guide:case-1',
      }),
    ]);
    expect(result.requiresFaqGrounding).toBe(true);
    expect(result.journeyUpdate).toBeUndefined();
  });

  it('accepts FAQ turns that request a progression follow-up without changing the primary response class', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'faq',
        targetResourceTypes: [],
        includeProgressionFollowUp: true,
      },
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      truth: defaultTruth,
      hasCompletedInitialProcessExplanation: false,
    });

    expect(result.responseIntent).toBe('faq');
    expect(result.includeProgressionFollowUpAccepted).toBe(true);
    expect(result.journeyUpdate).toBeUndefined();
  });

  it('treats repeated process explanations after the initial mandatory explain as FAQ-like informational turns that do not move the journey', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'process_explanation',
        targetResourceTypes: ['PROCESS_GUIDE'],
        includeProgressionFollowUp: true,
      },
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      truth: defaultTruth,
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.responseIntent).toBe('faq');
    expect(result.includeProgressionFollowUpAccepted).toBe(true);
    expect(result.journeyUpdate).toBeUndefined();
    expect(result.allowedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'PROCESS_GUIDE' }),
    ]));
    expect(result.allowedResources).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'MEDICAL_DOC_UPLOAD' }),
      expect.objectContaining({ resourceType: 'QUESTIONNAIRE' }),
    ]));
  });

  it('keeps explicit resource requests ahead of progression follow-up when both signals are present', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'resource_request',
        targetResourceTypes: ['QUESTIONNAIRE'],
        includeProgressionFollowUp: true,
      },
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      truth: defaultTruth,
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.responseIntent).toBe('resource_request');
    expect(result.includeProgressionFollowUpAccepted).toBe(false);
    expect(result.journeyUpdate).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(result.allowedResources).toEqual([
      expect.objectContaining({
        resourceType: 'QUESTIONNAIRE',
      }),
    ]);
  });

  it('does not let process explanations in COLLECT_MEDICAL_INPUTS.active advance into recommendation just because follow-up was accepted', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'process_explanation',
        targetResourceTypes: ['PROCESS_GUIDE'],
        includeProgressionFollowUp: true,
      },
      journeySnapshot: {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      },
      truth: defaultTruth,
      hasCompletedInitialProcessExplanation: true,
    });

    expect(result.includeProgressionFollowUpAccepted).toBe(true);
    expect(result.journeyUpdate).toBeUndefined();
    expect(result.allowedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'PROCESS_GUIDE',
      }),
      expect.objectContaining({
        resourceType: 'MEDICAL_DOC_UPLOAD',
      }),
      expect.objectContaining({
        resourceType: 'QUESTIONNAIRE',
      }),
    ]));
    expect(result.allowedResources).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceType: 'HOSPITAL_RECOMMENDATION' }),
      expect.objectContaining({ resourceType: 'PACKAGE_RECOMMENDATION' }),
    ]));
  });
});
