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
    const riskLevel = normalize(input.statusSnapshot.riskLevel);
    if (riskLevel === 'CRISIS' || riskLevel === 'HIGH_RISK' || riskLevel === 'HIGH') {
      return {
        eligible: false,
        shortlist: [],
        reasonCodes: ['recommendation_blocked_by_risk'],
      };
    }

    if (normalize(input.statusSnapshot.docUploadStatus) === 'NOT_STARTED') {
      return {
        eligible: false,
        shortlist: [],
        reasonCodes: ['insufficient_readiness_missing_documents'],
      };
    }

    if (input.resolvedIntent !== 'ASK_FOR_RECOMMENDATION') {
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

function normalize(value: string | undefined): string {
  return (value ?? '').toUpperCase();
}
