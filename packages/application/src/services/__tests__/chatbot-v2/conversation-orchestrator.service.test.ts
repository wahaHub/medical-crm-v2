import { describe, expect, it } from 'vitest';
import { ConversationOrchestratorService } from '../../chatbot-v2/conversation-orchestrator.service.js';

describe('ConversationOrchestratorService', () => {
  const service = new ConversationOrchestratorService();

  it('advances progression requests with v2 journey state and returns the next-stage resources', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'progression_request',
        targetResourceTypes: [],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      truth: {
        medicalInputsStarted: false,
        medicalInputsSubmitted: false,
        recommendationAvailable: false,
        recommendationConfirmed: false,
        onlineConsultRequired: false,
        onlineConsultStarted: false,
        onlineConsultSubmitted: false,
        humanHandoffActive: false,
        humanHandoffSubmitted: false,
      },
    });

    expect(result.responseIntent).toBe('progression_request');
    expect(result.journeyUpdate).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(result.allowedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'MEDICAL_DOC_UPLOAD',
      }),
      expect.objectContaining({
        resourceType: 'QUESTIONNAIRE',
      }),
      expect.objectContaining({
        resourceType: 'MEDICAL_INVITATION_STATUS',
      }),
    ]));
    expect(result.resourceUpdates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'MEDICAL_DOC_UPLOAD',
      }),
      expect.objectContaining({
        resourceType: 'QUESTIONNAIRE',
      }),
    ]));
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
        currentStage: 'HUMAN_HANDOFF',
        currentPhase: 'active',
      },
      truth: {
        medicalInputsStarted: true,
        medicalInputsSubmitted: true,
        recommendationAvailable: true,
        recommendationConfirmed: true,
        onlineConsultRequired: true,
        onlineConsultStarted: true,
        onlineConsultSubmitted: false,
        humanHandoffActive: true,
        humanHandoffSubmitted: true,
      },
    });

    expect(result).toMatchObject({
      responseIntent: 'resource_status_question',
      allowedResources: [
        expect.objectContaining({
          resourceType: 'MEDICAL_INVITATION_STATUS',
          resourceId: 'medical-invitation-status:case-1',
        }),
      ],
    });
    expect(result.allowedResources).toHaveLength(1);
    expect(result.journeyUpdate).toBeUndefined();
  });

  it('routes human-help requests to the handoff journey and handoff resource without old widget heuristics', () => {
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
        medicalInputsStarted: true,
        medicalInputsSubmitted: true,
        recommendationAvailable: true,
        recommendationConfirmed: false,
        onlineConsultRequired: false,
        onlineConsultStarted: false,
        onlineConsultSubmitted: false,
        humanHandoffActive: false,
        humanHandoffSubmitted: false,
      },
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
    expect(result.resourceUpdates).toEqual([
      expect.objectContaining({
        resourceType: 'HUMAN_HANDOFF',
      }),
    ]);
  });

  it('uses the v2 process guide resource for process explanations even outside the explain stage without rewinding the journey', () => {
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
      truth: {
        medicalInputsStarted: true,
        medicalInputsSubmitted: false,
        recommendationAvailable: false,
        recommendationConfirmed: false,
        onlineConsultRequired: false,
        onlineConsultStarted: false,
        onlineConsultSubmitted: false,
        humanHandoffActive: false,
        humanHandoffSubmitted: false,
      },
    });

    expect(result).toMatchObject({
      responseIntent: 'process_explanation',
      allowedResources: [
        expect.objectContaining({
          resourceType: 'PROCESS_GUIDE',
          resourceId: 'process-guide:case-1',
        }),
      ],
    });
    expect(result.journeyUpdate).toBeUndefined();
  });

  it('routes early recommendation requests into medical-input collection instead of exposing later-stage resources directly', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'resource_request',
        targetResourceTypes: ['HOSPITAL_RECOMMENDATION'],
        includeProgressionFollowUp: false,
      },
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      truth: {
        medicalInputsStarted: false,
        medicalInputsSubmitted: false,
        recommendationAvailable: false,
        recommendationConfirmed: false,
        onlineConsultRequired: false,
        onlineConsultStarted: false,
        onlineConsultSubmitted: false,
        humanHandoffActive: false,
        humanHandoffSubmitted: false,
      },
    });

    expect(result.responseIntent).toBe('resource_request');
    expect(result.journeyUpdate).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(result.allowedResources.map((resource) => resource.resourceType)).not.toContain('HOSPITAL_RECOMMENDATION');
    expect(result.allowedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'MEDICAL_DOC_UPLOAD',
      }),
      expect.objectContaining({
        resourceType: 'QUESTIONNAIRE',
      }),
      expect.objectContaining({
        resourceType: 'MEDICAL_INVITATION_STATUS',
      }),
    ]));
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
      truth: {
        medicalInputsStarted: false,
        medicalInputsSubmitted: false,
        recommendationAvailable: false,
        recommendationConfirmed: false,
        onlineConsultRequired: false,
        onlineConsultStarted: false,
        onlineConsultSubmitted: false,
        humanHandoffActive: false,
        humanHandoffSubmitted: false,
      },
    });

    expect(result.responseIntent).toBe('faq');
    expect(result.includeProgressionFollowUpAccepted).toBe(true);
    expect(result.journeyUpdate).toEqual({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      currentPhase: 'pre',
    });
    expect(result.allowedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'MEDICAL_DOC_UPLOAD',
      }),
      expect.objectContaining({
        resourceType: 'QUESTIONNAIRE',
      }),
    ]));
  });

  it('accepts progression follow-up in later stages without rewinding the journey', () => {
    const result = service.orchestrate({
      scopeId: 'case-1',
      classification: {
        requestClass: 'faq',
        targetResourceTypes: [],
        includeProgressionFollowUp: true,
      },
      journeySnapshot: {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'active',
      },
      truth: {
        medicalInputsStarted: true,
        medicalInputsSubmitted: true,
        recommendationAvailable: true,
        recommendationConfirmed: false,
        onlineConsultRequired: false,
        onlineConsultStarted: false,
        onlineConsultSubmitted: false,
        humanHandoffActive: false,
        humanHandoffSubmitted: false,
      },
    });

    expect(result.responseIntent).toBe('faq');
    expect(result.includeProgressionFollowUpAccepted).toBe(true);
    expect(result.journeyUpdate).toBeUndefined();
    expect(result.allowedResources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'PROCESS_GUIDE',
      }),
      expect.objectContaining({
        resourceType: 'HOSPITAL_RECOMMENDATION',
      }),
    ]));
  });

  it('requires classifier output instead of reviving local classification fallback', () => {
    expect(() => service.orchestrate({
      scopeId: 'case-1',
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      truth: {
        medicalInputsStarted: false,
        medicalInputsSubmitted: false,
        recommendationAvailable: false,
        recommendationConfirmed: false,
        onlineConsultRequired: false,
        onlineConsultStarted: false,
        onlineConsultSubmitted: false,
        humanHandoffActive: false,
        humanHandoffSubmitted: false,
      },
    } as any)).toThrow('classifier output is required');
  });
});
