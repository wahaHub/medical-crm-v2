import { describe, expect, it } from 'vitest';
import { ActionPlannerService } from '../../policy-engine/action-planner.service.js';

describe('ActionPlannerService', () => {
  it('prefers REQUEST_DOC_UPLOAD over SHOW_PACKAGE when reports are missing for a high-intent lead', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
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
});
