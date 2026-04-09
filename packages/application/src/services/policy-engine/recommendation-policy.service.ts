import { isMissingDocumentStatus, normalizePolicyState } from './status-normalization.js';

export interface RecommendationCandidate {
  hospitalId: string;
  reasonCodes: string[];
}

export interface RecommendationDecisionInput {
  statusSnapshot: {
    recommendationStatus?: string;
    riskLevel?: string;
    docUploadStatus?: string;
  };
  resolvedIntent: string;
  candidateHospitals?: RecommendationCandidate[];
}

export interface RecommendationDecisionResult {
  eligible: boolean;
  shortlist: RecommendationCandidate[];
  reasonCodes: string[];
}

export class RecommendationPolicyService {
  async decide(input: RecommendationDecisionInput): Promise<RecommendationDecisionResult> {
    const riskLevel = normalizePolicyState(input.statusSnapshot.riskLevel);
    if (riskLevel === 'CRISIS' || riskLevel === 'HIGH_RISK' || riskLevel === 'HIGH') {
      return {
        eligible: false,
        shortlist: [],
        reasonCodes: ['recommendation_blocked_by_risk'],
      };
    }

    if (isMissingDocumentStatus(input.statusSnapshot.docUploadStatus)) {
      return {
        eligible: false,
        shortlist: [],
        reasonCodes: ['insufficient_readiness_missing_documents'],
      };
    }

    if (!isRecommendationIntent(input.resolvedIntent)) {
      return {
        eligible: false,
        shortlist: [],
        reasonCodes: ['recommendation_not_requested'],
      };
    }

    const shortlist = (input.candidateHospitals ?? []).slice(0, 3);
    return {
      eligible: shortlist.length > 0,
      shortlist,
      reasonCodes: shortlist.length > 0 ? ['authoritative_shortlist_ready'] : ['no_candidates_available'],
    };
  }
}

function isRecommendationIntent(resolvedIntent: string): boolean {
  return [
    'ASK_ALTERNATIVE_HOSPITAL_RECOMMENDATIONS',
    'ASK_FOR_DOCTOR_OR_HOSPITAL_DIRECTION',
    'ASK_FOR_HOSPITAL_RECOMMENDATION',
  ].includes(resolvedIntent);
}
