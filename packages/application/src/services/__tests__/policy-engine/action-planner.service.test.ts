import { describe, expect, it } from 'vitest';
import { ActionPlannerService } from '../../policy-engine/action-planner.service.js';

describe('ActionPlannerService', () => {
  it('prefers REQUEST_DOC_UPLOAD over SHOW_PACKAGE when reports are missing for a high-intent lead', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'DEEP_WORKFLOW',
      hospitalType: 'COSMETIC',
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
      hospitalType: 'COSMETIC',
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
      hospitalType: 'COSMETIC',
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

  it('keeps explicit document-upload requests on the document-upload path even in light discovery', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'LIGHT_DISCOVERY',
      hospitalType: 'COSMETIC',
      statusSnapshot: {
        docUploadStatus: 'NONE',
        packageStatus: 'NOT_SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'REQUEST_DOC_UPLOAD',
    });

    expect(plan.nextAction).toBe('REQUEST_DOC_UPLOAD');
  });

  it.each([
    'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
    'ASK_FOR_HOSPITAL_RECOMMENDATION',
  ])(
    'keeps canonical recommendation intents on an intent-first path in light discovery (%s)',
    (resolvedIntent) => {
      const planner = new ActionPlannerService();

      const plan = planner.plan({
        engagementMode: 'LIGHT_DISCOVERY',
        hospitalType: 'COSMETIC',
        statusSnapshot: {
          docUploadStatus: 'NOT_STARTED',
          packageStatus: 'NOT_SHOWN',
          recommendationStatus: 'NOT_SHOWN',
          riskLevel: 'LOW',
        },
        resolvedIntent,
      });

      expect(plan.nextAction).toBe('REQUEST_DOC_UPLOAD');
      expect(plan.secondaryAction).toBe('SHOW_HOSPITAL_RECOMMENDATIONS');
    },
  );

  it('advances ACCEPT_DOC_UPLOAD past re-requesting documents when docs are already complete', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'LIGHT_DISCOVERY',
      hospitalType: 'COSMETIC',
      statusSnapshot: {
        docUploadStatus: 'UPLOADED',
        packageStatus: 'NOT_SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'ACCEPT_DOC_UPLOAD',
    });

    expect(plan.nextAction).toBe('SHOW_HOSPITAL_RECOMMENDATIONS');
  });

  it('allows package exploration once the user is in qualified exploration without a consult-style intent', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'QUALIFIED_EXPLORATION',
      hospitalType: 'COSMETIC',
      statusSnapshot: {
        docUploadStatus: 'NONE',
        packageStatus: 'NOT_SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'UNKNOWN',
    });

    expect(plan.nextAction).toBe('SHOW_PACKAGE');
    expect(plan.reasonCodes).toContain('qualified_package_exploration');
  });

  it('allows recommendation exploration in qualified exploration without forcing full shortlist progression', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'QUALIFIED_EXPLORATION',
      hospitalType: 'COSMETIC',
      statusSnapshot: {
        docUploadStatus: 'UPLOADED',
        packageStatus: 'SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'ASK_FOR_RECOMMENDATION',
    });

    expect(plan.nextAction).toBe('EXPLORE_HOSPITAL_RECOMMENDATIONS');
    expect(plan.reasonCodes).toContain('qualified_recommendation_exploration');
  });

  it('keeps explicit document questions in qualified exploration on the document-upload path', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'QUALIFIED_EXPLORATION',
      hospitalType: 'COSMETIC',
      statusSnapshot: {
        docUploadStatus: 'NONE',
        packageStatus: 'SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'REQUEST_DOC_UPLOAD',
    });

    expect(plan.nextAction).toBe('REQUEST_DOC_UPLOAD');
  });

  it('keeps consult-style questions in qualified exploration on an explanation path', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'QUALIFIED_EXPLORATION',
      hospitalType: 'COSMETIC',
      statusSnapshot: {
        docUploadStatus: 'UPLOADED',
        packageStatus: 'SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        consultationStatus: 'NOT_INTRODUCED',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'GENERAL_CONSULT',
    });

    expect(plan.nextAction).toBe('EXPLAIN_CONSULT_PROCESS');
    expect(plan.reasonCodes).toContain('qualified_consult_explanation');
  });

  it('routes broad journey questions to EXPLAIN_MEDICAL_TRAVEL_PROCESS', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'QUALIFIED_EXPLORATION',
      hospitalType: 'REGULAR',
      statusSnapshot: {
        docUploadStatus: 'NONE',
        packageStatus: 'NOT_SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        consultationStatus: 'NOT_INTRODUCED',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'ASK_MEDICAL_TRAVEL_PROCESS',
    });

    expect(plan.nextAction).toBe('EXPLAIN_MEDICAL_TRAVEL_PROCESS');
    expect(plan.reasonCodes).toContain('process_overview_requested');
  });

  it('routes canonical doctor-or-hospital direction requests to doc upload when readiness is insufficient', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'QUALIFIED_EXPLORATION',
      hospitalType: 'COSMETIC',
      statusSnapshot: {
        docUploadStatus: 'NOT_STARTED',
        packageStatus: 'NOT_SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
    });

    expect(plan.nextAction).toBe('REQUEST_DOC_UPLOAD');
    expect(plan.secondaryAction).toBe('SHOW_HOSPITAL_RECOMMENDATIONS');
  });

  it('routes canonical doctor-or-hospital direction requests to hospital recommendations when readiness is sufficient', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'QUALIFIED_EXPLORATION',
      hospitalType: 'COSMETIC',
      statusSnapshot: {
        docUploadStatus: 'UPLOADED',
        packageStatus: 'NOT_SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
    });

    expect(plan.nextAction).toBe('SHOW_HOSPITAL_RECOMMENDATIONS');
  });

  it('routes canonical hospital-recommendation requests to doc upload when readiness is insufficient', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'QUALIFIED_EXPLORATION',
      hospitalType: 'COSMETIC',
      statusSnapshot: {
        docUploadStatus: 'REQUESTED',
        packageStatus: 'NOT_SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
    });

    expect(plan.nextAction).toBe('REQUEST_DOC_UPLOAD');
    expect(plan.secondaryAction).toBe('SHOW_HOSPITAL_RECOMMENDATIONS');
  });

  it('routes canonical hospital-recommendation requests to hospital recommendations when readiness is sufficient', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'QUALIFIED_EXPLORATION',
      hospitalType: 'COSMETIC',
      statusSnapshot: {
        docUploadStatus: 'UPLOADED',
        packageStatus: 'NOT_SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'ASK_FOR_HOSPITAL_RECOMMENDATION',
    });

    expect(plan.nextAction).toBe('SHOW_HOSPITAL_RECOMMENDATIONS');
  });

  it('routes canonical document-upload acceptance onto the document-upload path', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'QUALIFIED_EXPLORATION',
      hospitalType: 'COSMETIC',
      statusSnapshot: {
        docUploadStatus: 'NONE',
        packageStatus: 'SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'ACCEPT_DOC_UPLOAD',
    });

    expect(plan.nextAction).toBe('REQUEST_DOC_UPLOAD');
  });

  it('promotes canonical consult-process requests to an online consult invite when consultation is ready', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'DEEP_WORKFLOW',
      hospitalType: 'REGULAR',
      progressionSignal: 'READY_TO_PROCEED',
      statusSnapshot: {
        docUploadStatus: 'UPLOADED',
        packageStatus: 'SHOWN',
        recommendationStatus: 'PRELIMINARY_SHOWN',
        consultationStatus: 'READY',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'ASK_CONSULT_PROCESS',
    });

    expect(plan.nextAction).toBe('INVITE_ONLINE_CONSULT');
  });

  it('routes canonical human handoff requests directly to HUMAN_HANDOFF outside deep workflow', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'QUALIFIED_EXPLORATION',
      hospitalType: 'REGULAR',
      statusSnapshot: {
        docUploadStatus: 'UPLOADED',
        packageStatus: 'SHOWN',
        recommendationStatus: 'PRELIMINARY_SHOWN',
        consultationStatus: 'READY',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'REQUEST_HUMAN_HANDOFF',
    });

    expect(plan.nextAction).toBe('HUMAN_HANDOFF');
  });

  it('does not default REGULAR qualified exploration into SHOW_PACKAGE', () => {
    const planner = new ActionPlannerService();

    const plan = planner.plan({
      engagementMode: 'QUALIFIED_EXPLORATION',
      hospitalType: 'REGULAR',
      statusSnapshot: {
        docUploadStatus: 'UPLOADED',
        packageStatus: 'NOT_SHOWN',
        recommendationStatus: 'NOT_SHOWN',
        consultationStatus: 'READY',
        riskLevel: 'LOW',
      },
      resolvedIntent: 'GENERAL_CONSULT',
    });

    expect(plan.nextAction).toBe('EXPLAIN_CONSULT_PROCESS');
    expect(plan.reasonCodes).not.toContain('qualified_package_exploration');
  });
});
