import type {
  AiPolicyBackendNextAction,
  AiPolicyEngagementMode,
} from '../../dtos/ai-policy.dto.js';
import type { HospitalType } from '@medical-crm/domain';
import { isMissingDocumentStatus, normalizePolicyState } from './status-normalization.js';

export interface ActionPlannerInput {
  engagementMode: AiPolicyEngagementMode;
  hospitalType: HospitalType;
  statusSnapshot: {
    docUploadStatus?: string;
    packageStatus?: string;
    recommendationStatus?: string;
    selectedHospitalId?: string | null;
    consultationStatus?: string;
    formStatus?: string;
    riskLevel?: string;
  };
  resolvedIntent: string;
}

export interface ActionPlan {
  nextAction: AiPolicyBackendNextAction;
  secondaryAction: AiPolicyBackendNextAction | null;
  reasonCodes: string[];
}

export class ActionPlannerService {
  plan(input: ActionPlannerInput): ActionPlan {
    const riskLevel = normalizePolicyState(input.statusSnapshot.riskLevel);
    if (riskLevel === 'CRISIS' || riskLevel === 'HIGH_RISK' || riskLevel === 'HIGH') {
      return {
        nextAction: 'SAFETY_HANDOFF',
        secondaryAction: null,
        reasonCodes: ['safety_override'],
      };
    }

    if (isHumanHandoffIntent(input.resolvedIntent)) {
      return {
        nextAction: 'HUMAN_HANDOFF',
        secondaryAction: null,
        reasonCodes: ['human_handoff_requested'],
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
  if (input.resolvedIntent === 'ASK_MEDICAL_TRAVEL_PROCESS') {
    return {
      nextAction: 'EXPLAIN_MEDICAL_TRAVEL_PROCESS',
      secondaryAction: null,
      reasonCodes: ['process_overview_requested'],
    };
  }

  if (input.resolvedIntent === 'ASK_CONSULT_PROCESS') {
    return {
      nextAction: 'EXPLAIN_CONSULT_PROCESS',
      secondaryAction: null,
      reasonCodes: ['consult_process_requested'],
    };
  }

  if (isDocumentUploadPathIntent(input.resolvedIntent)) {
    return {
      nextAction: 'REQUEST_DOC_UPLOAD',
      secondaryAction: null,
      reasonCodes: ['document_upload_path_requested'],
    };
  }

  if (
    isCanonicalRecommendationIntent(input.resolvedIntent)
    && isMissingDocumentStatus(input.statusSnapshot.docUploadStatus)
  ) {
    return {
      nextAction: 'REQUEST_DOC_UPLOAD',
      secondaryAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      reasonCodes: ['documents_required_before_recommendation'],
    };
  }

  if (
    isCanonicalRecommendationIntent(input.resolvedIntent)
    && !isMissingDocumentStatus(input.statusSnapshot.docUploadStatus)
  ) {
    return {
      nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      secondaryAction: null,
      reasonCodes: ['canonical_recommendation_ready'],
    };
  }

  if (input.resolvedIntent === 'ASK_FOR_RECOMMENDATION' && !isMissingDocumentStatus(input.statusSnapshot.docUploadStatus)) {
    return {
      nextAction: 'EXPLORE_HOSPITAL_RECOMMENDATIONS',
      secondaryAction: null,
      reasonCodes: ['qualified_recommendation_exploration'],
    };
  }

  if (
    input.resolvedIntent === 'ASK_FOR_RECOMMENDATION' &&
    isMissingDocumentStatus(input.statusSnapshot.docUploadStatus)
  ) {
    return {
      nextAction: 'EXPLAIN_DOC_UPLOAD',
      secondaryAction: null,
      reasonCodes: ['qualified_recommendation_needs_documents_explanation'],
    };
  }

  if (
    input.resolvedIntent === 'GENERAL_CONSULT' &&
    consultationCanBeInvited(input.statusSnapshot.consultationStatus)
  ) {
    return {
      nextAction: 'EXPLAIN_CONSULT_PROCESS',
      secondaryAction: null,
      reasonCodes: ['qualified_consult_explanation'],
    };
  }

  if (
    input.hospitalType === 'COSMETIC'
    && (normalizePolicyState(input.statusSnapshot.packageStatus) === 'NOT_SHOWN' || normalizePolicyState(input.statusSnapshot.packageStatus) === 'NOT_INTRODUCED')
  ) {
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
  if (input.resolvedIntent === 'ASK_MEDICAL_TRAVEL_PROCESS') {
    return {
      nextAction: 'EXPLAIN_MEDICAL_TRAVEL_PROCESS',
      secondaryAction: null,
      reasonCodes: ['process_overview_requested'],
    };
  }

  if (input.resolvedIntent === 'ASK_CONSULT_PROCESS') {
    if (consultationReadyForInvite(input.statusSnapshot.consultationStatus)) {
      return {
        nextAction: 'INVITE_ONLINE_CONSULT',
        secondaryAction: null,
        reasonCodes: ['consult_invite_ready'],
      };
    }

    return {
      nextAction: 'EXPLAIN_CONSULT_PROCESS',
      secondaryAction: null,
      reasonCodes: ['consult_process_requested'],
    };
  }

  if (
    input.resolvedIntent === 'ACCEPT_ONLINE_CONSULT_INVITE'
    && consultationCanBeInvited(input.statusSnapshot.consultationStatus)
  ) {
    return {
      nextAction: 'INVITE_ONLINE_CONSULT',
      secondaryAction: null,
      reasonCodes: ['consult_invite_confirmed'],
    };
  }

  if (isDocumentUploadPathIntent(input.resolvedIntent)) {
    return {
      nextAction: 'REQUEST_DOC_UPLOAD',
      secondaryAction: null,
      reasonCodes: ['explicit_document_request'],
    };
  }

  if (
    isCanonicalRecommendationIntent(input.resolvedIntent)
    && isMissingDocumentStatus(input.statusSnapshot.docUploadStatus)
  ) {
    return {
      nextAction: 'REQUEST_DOC_UPLOAD',
      secondaryAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      reasonCodes: ['documents_required_before_recommendation'],
    };
  }

  if (
    isCanonicalRecommendationIntent(input.resolvedIntent)
    && !isMissingDocumentStatus(input.statusSnapshot.docUploadStatus)
  ) {
    return {
      nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      secondaryAction: null,
      reasonCodes: ['canonical_recommendation_ready'],
    };
  }

  if (
    input.resolvedIntent === 'ASK_FOR_RECOMMENDATION' &&
    isMissingDocumentStatus(input.statusSnapshot.docUploadStatus)
  ) {
    return {
      nextAction: 'REQUEST_DOC_UPLOAD',
      secondaryAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      reasonCodes: ['documents_required_before_recommendation'],
      };
  }

  if (
    input.hospitalType === 'COSMETIC'
    && (normalizePolicyState(input.statusSnapshot.packageStatus) === 'NOT_SHOWN' || normalizePolicyState(input.statusSnapshot.packageStatus) === 'NOT_INTRODUCED')
  ) {
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

function consultationCanBeInvited(value: string | undefined): boolean {
  const normalized = normalizePolicyState(value);
  return !['SCHEDULED', 'BOOKED', 'COMPLETED', 'CANCELLED'].includes(normalized);
}

function consultationReadyForInvite(value: string | undefined): boolean {
  return normalizePolicyState(value) === 'READY';
}

function isCanonicalRecommendationIntent(resolvedIntent: string): boolean {
  return [
    'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
    'ASK_FOR_HOSPITAL_RECOMMENDATION',
  ].includes(resolvedIntent);
}

function isDocumentUploadPathIntent(resolvedIntent: string): boolean {
  return ['REQUEST_DOC_UPLOAD', 'ACCEPT_DOC_UPLOAD'].includes(resolvedIntent);
}

function isHumanHandoffIntent(resolvedIntent: string): boolean {
  return resolvedIntent === 'REQUEST_HUMAN_HANDOFF';
}
