import { describe, expect, it } from 'vitest';
import { ResourceRegistryService } from '../../chatbot-v2/resource-registry.service.js';

describe('ResourceRegistryService', () => {
  const service = new ResourceRegistryService();

  it('returns the process guide resource during EXPLAIN_PROCESS.active', () => {
    const resources = service.listResources({
      scopeId: 'case-1',
      journeySnapshot: {
        currentStage: 'EXPLAIN_PROCESS',
        currentPhase: 'active',
      },
      truth: {
        medicalInputsSubmitted: false,
        recommendationConfirmed: false,
        onlineConsultSubmitted: false,
      },
    });

    expect(resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'PROCESS_GUIDE',
        resourceId: 'process-guide:case-1',
        status: 'available',
      }),
    ]));
  });

  it('returns medical input resources during COLLECT_MEDICAL_INPUTS.active', () => {
    const resources = service.listResources({
      scopeId: 'case-1',
      journeySnapshot: {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      },
      truth: {
        medicalInputsSubmitted: false,
        recommendationConfirmed: false,
        onlineConsultSubmitted: false,
      },
    });

    expect(resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'MEDICAL_DOC_UPLOAD',
        resourceId: 'medical-doc-upload:case-1',
      }),
      expect.objectContaining({
        resourceType: 'QUESTIONNAIRE',
        resourceId: 'questionnaire:case-1',
      }),
    ]));
  });

  it('keeps query resources globally available even inside HUMAN_HANDOFF', () => {
    const resources = service.listResources({
      scopeId: 'case-1',
      journeySnapshot: {
        currentStage: 'HUMAN_HANDOFF',
        currentPhase: 'active',
      },
      truth: {
        medicalInputsSubmitted: true,
        recommendationConfirmed: true,
        onlineConsultSubmitted: false,
      },
    });

    expect(resources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        resourceType: 'MEDICAL_INVITATION_STATUS',
        resourceId: 'medical-invitation-status:case-1',
        status: 'available',
      }),
    ]));
  });

  it('treats already-submitted questionnaire resources as submitted instead of failing duplicate actions', () => {
    const resource = service.resolveResource({
      resourceType: 'QUESTIONNAIRE',
      scopeId: 'case-1',
      journeySnapshot: {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      },
      truth: {
        medicalInputsSubmitted: true,
        recommendationConfirmed: false,
        onlineConsultSubmitted: false,
      },
    });

    expect(resource.status).toBe('submitted');
  });

  it('resolves stale recommendation cards to the current recommendation resource snapshot', () => {
    const resource = service.resolveResource({
      resourceType: 'HOSPITAL_RECOMMENDATION',
      scopeId: 'case-1',
      journeySnapshot: {
        currentStage: 'RECOMMENDATION',
        currentPhase: 'active',
      },
      truth: {
        medicalInputsSubmitted: true,
        recommendationConfirmed: false,
        onlineConsultSubmitted: false,
      },
    });

    expect(resource).toMatchObject({
      resourceType: 'HOSPITAL_RECOMMENDATION',
      resourceId: 'hospital-recommendation:case-1',
      status: 'available',
      stageBinding: {
        stage: 'RECOMMENDATION',
        phase: 'active',
      },
    });
  });

  it('uses scope-specific resource ids so stale cards can be resolved per case', () => {
    const caseOneResource = service.resolveResource({
      resourceType: 'QUESTIONNAIRE',
      scopeId: 'case-1',
      journeySnapshot: {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      },
      truth: {
        medicalInputsSubmitted: false,
        recommendationConfirmed: false,
        onlineConsultSubmitted: false,
      },
    });
    const caseTwoResource = service.resolveResource({
      resourceType: 'QUESTIONNAIRE',
      scopeId: 'case-2',
      journeySnapshot: {
        currentStage: 'COLLECT_MEDICAL_INPUTS',
        currentPhase: 'active',
      },
      truth: {
        medicalInputsSubmitted: false,
        recommendationConfirmed: false,
        onlineConsultSubmitted: false,
      },
    });

    expect(caseOneResource.resourceId).toBe('questionnaire:case-1');
    expect(caseTwoResource.resourceId).toBe('questionnaire:case-2');
    expect(caseOneResource.resourceId).not.toBe(caseTwoResource.resourceId);
  });
});
