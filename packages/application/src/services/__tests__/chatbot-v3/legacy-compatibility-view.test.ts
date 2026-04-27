import { describe, expect, it } from 'vitest';
import { projectLegacyCompatibilityView } from '../../chatbot-v3/legacy-compatibility-view.js';

describe('projectLegacyCompatibilityView', () => {
  it('projects reducer truth without becoming a second control source', () => {
    const projected = projectLegacyCompatibilityView({
      currentStage: 'COLLECT_MEDICAL_INPUTS',
      reduction: {
        state: { primaryStage: 'ONLINE_CONSULT' },
        primaryStage: 'ONLINE_CONSULT',
        facts: {
          language: 'zh',
          intake: { minimalTriageStatus: 'submitted' },
          recommendation: { status: 'selected', selectedHospitalIds: ['h1'] },
          process: { explained: true },
          records: { supportingDocumentsCount: 1, availableDocumentTypes: [], missingDocumentTypes: [] },
          consult: { status: 'not_started' },
          handoff: { active: false },
        },
        factsPatch: {},
        nextAction: { type: 'OFFER_ONLINE_CONSULT' },
        reasonCode: 'ready_for_online_consult',
        isSidePath: false,
        sidePathType: 'none',
        primaryStagePreserved: false,
      },
      execution: {
        agent: 'ConsultAgent',
        isSystemRendered: false,
      },
    });

    expect(projected.projectedDecision.fromStage).toBe('COLLECT_MEDICAL_INPUTS');
    expect(projected.projectedDecision.toStage).toBe('ONLINE_CONSULT');
    expect(projected.projectedProposal.suggestedStage).toBe('ONLINE_CONSULT');
    expect(projected.projectedProposal.dispatchAgent).toBe('ConsultAgent');
  });
});
