import type { AiPolicyEngagementMode } from '../../dtos/ai-policy.dto.js';

export interface ActionPlannerInput {
  engagementMode: AiPolicyEngagementMode;
  statusSnapshot: {
    docUploadStatus?: string;
    packageStatus?: string;
    recommendationStatus?: string;
    formStatus?: string;
    riskLevel?: string;
  };
  resolvedIntent: string;
}

export interface ActionPlan {
  nextAction: string;
  secondaryAction: string | null;
  reasonCodes: string[];
}

export class ActionPlannerService {
  plan(input: ActionPlannerInput): ActionPlan {
    const riskLevel = normalize(input.statusSnapshot.riskLevel);
    if (riskLevel === 'CRISIS' || riskLevel === 'HIGH_RISK' || riskLevel === 'HIGH') {
      return {
        nextAction: 'SAFETY_HANDOFF',
        secondaryAction: null,
        reasonCodes: ['safety_override'],
      };
    }

    if (input.engagementMode === 'LIGHT_DISCOVERY') {
      return planLightDiscovery(input);
    }

    if (input.engagementMode === 'QUALIFIED_EXPLORATION') {
      return planQualifiedExploration(input);
    }

    return planDeepWorkflow(input);
  }
}

function planLightDiscovery(input: ActionPlannerInput): ActionPlan {
  if (input.resolvedIntent === 'REQUEST_DOC_UPLOAD') {
    return {
      nextAction: 'ANSWER_FAQ',
      secondaryAction: null,
      reasonCodes: ['light_discovery_docs_explanation'],
    };
  }

  if (input.resolvedIntent === 'ASK_FOR_RECOMMENDATION') {
    return {
      nextAction: 'ANSWER_FAQ',
      secondaryAction: null,
      reasonCodes: ['light_discovery_soft_guidance'],
    };
  }

  return {
    nextAction: 'ANSWER_FAQ',
    secondaryAction: null,
    reasonCodes: ['light_discovery_soft_guidance'],
  };
}

function planQualifiedExploration(input: ActionPlannerInput): ActionPlan {
  if (input.resolvedIntent === 'REQUEST_DOC_UPLOAD') {
    return {
      nextAction: 'EXPLAIN_DOC_UPLOAD',
      secondaryAction: null,
      reasonCodes: ['qualified_docs_explanation'],
    };
  }

  if (input.resolvedIntent === 'ASK_FOR_RECOMMENDATION' && !isDocsMissing(input.statusSnapshot.docUploadStatus)) {
    return {
      nextAction: 'EXPLORE_HOSPITAL_RECOMMENDATIONS',
      secondaryAction: null,
      reasonCodes: ['qualified_recommendation_exploration'],
    };
  }

  if (
    input.resolvedIntent === 'ASK_FOR_RECOMMENDATION' &&
    isDocsMissing(input.statusSnapshot.docUploadStatus)
  ) {
    return {
      nextAction: 'EXPLAIN_DOC_UPLOAD',
      secondaryAction: null,
      reasonCodes: ['qualified_recommendation_needs_documents_explanation'],
    };
  }

  if (
    input.resolvedIntent === 'GENERAL_CONSULT' &&
    normalize(input.statusSnapshot.packageStatus) !== 'NOT_SHOWN' &&
    normalize(input.statusSnapshot.packageStatus) !== 'NOT_INTRODUCED'
  ) {
    return {
      nextAction: 'EXPLAIN_CONSULT_PROCESS',
      secondaryAction: null,
      reasonCodes: ['qualified_consult_explanation'],
    };
  }

  if (normalize(input.statusSnapshot.packageStatus) === 'NOT_SHOWN' || normalize(input.statusSnapshot.packageStatus) === 'NOT_INTRODUCED') {
    return {
      nextAction: 'SHOW_PACKAGE',
      secondaryAction: null,
      reasonCodes: ['qualified_package_exploration'],
    };
  }

  return {
    nextAction: 'ANSWER_FAQ',
    secondaryAction: null,
    reasonCodes: ['qualified_guidance_path'],
  };
}

function planDeepWorkflow(input: ActionPlannerInput): ActionPlan {
  if (input.resolvedIntent === 'REQUEST_DOC_UPLOAD') {
    return {
      nextAction: 'REQUEST_DOC_UPLOAD',
      secondaryAction: null,
      reasonCodes: ['explicit_document_request'],
    };
  }

  if (
    input.resolvedIntent === 'ASK_FOR_RECOMMENDATION' &&
    isDocsMissing(input.statusSnapshot.docUploadStatus)
  ) {
    return {
      nextAction: 'REQUEST_DOC_UPLOAD',
      secondaryAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      reasonCodes: ['documents_required_before_recommendation'],
    };
  }

  if (normalize(input.statusSnapshot.packageStatus) === 'NOT_SHOWN' || normalize(input.statusSnapshot.packageStatus) === 'NOT_INTRODUCED') {
      return {
        nextAction: 'SHOW_PACKAGE',
        secondaryAction: null,
        reasonCodes: ['deep_workflow_package_promotion'],
      };
  }

  return {
    nextAction: 'ANSWER_FAQ',
    secondaryAction: null,
    reasonCodes: ['deep_workflow_guidance_path'],
  };
}

function isDocsMissing(value: string | undefined): boolean {
  return ['NOT_STARTED', 'NONE', 'NOT_UPLOADED'].includes(normalize(value));
}

function normalize(value: string | undefined): string {
  return (value ?? '').toUpperCase();
}
