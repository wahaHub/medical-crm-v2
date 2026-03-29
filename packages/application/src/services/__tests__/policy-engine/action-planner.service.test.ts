import { describe, expect, it } from 'vitest';
import { ActionPlannerService } from '../../policy-engine/action-planner.service.js';

describe('ActionPlannerService', () => {
  it('prefers REQUEST_DOC_UPLOAD over SHOW_PACKAGE when reports are missing for a high-intent lead', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'DEEP_WORKFLOW',
      statusSnapshot: {
        docUploadStatus: 'NOT_STARTED',
        packageStatus: 'NOT_SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'ASK_FOR_RECOMMENDATION',
    });

    expect(plan.nextAction).toBe('REQUEST_DOC_UPLOAD');
  });

  it('keeps explicit document-upload intent ahead of package promotion', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'DEEP_WORKFLOW',
      statusSnapshot: {
        docUploadStatus: 'NOT_STARTED',
        packageStatus: 'NOT_SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'REQUEST_DOC_UPLOAD',
    });

    expect(plan.nextAction).toBe('REQUEST_DOC_UPLOAD');
    expect(plan.reasonCodes).toContain('explicit_document_request');
  });

  it('keeps low-signal recommendation curiosity in a lightweight answer path', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'LIGHT_DISCOVERY',
      statusSnapshot: {
        docUploadStatus: 'UPLOADED',
        packageStatus: 'NOT_SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'ASK_FOR_RECOMMENDATION',
    });

    expect(plan.nextAction).toBe('ANSWER_FAQ');
    expect(plan.reasonCodes).toContain('light_discovery_soft_guidance');
  });

  it('allows package exploration once the user is in qualified exploration', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'QUALIFIED_EXPLORATION',
      statusSnapshot: {
        docUploadStatus: 'NONE',
        packageStatus: 'NOT_SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'GENERAL_CONSULT',
    });

    expect(plan.nextAction).toBe('SHOW_PACKAGE');
    expect(plan.reasonCodes).toContain('qualified_package_exploration');
  });
});
