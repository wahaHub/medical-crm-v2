import { describe, expect, it } from 'vitest';
import { RecommendationPolicyService } from '../../policy-engine/recommendation-policy.service.js';

describe('RecommendationPolicyService', () => {
  it('returns a short authoritative shortlist with reason codes when eligibility is satisfied', async () => {
    const service = new RecommendationPolicyService();

    const result = await service.decide({
      statusSnapshot: {
        recommendationStatus: 'NOT_SHOWN',
        riskLevel: 'LOW',
        docUploadStatus: 'UPLOADED',
      },
      resolvedIntent: 'ASK_FOR_RECOMMENDATION',
      candidateHospitals: [
        { hospitalId: 'hospital-1', reasonCodes: ['condition_fit', 'language_supported'] },
        { hospitalId: 'hospital-2', reasonCodes: ['destination_match'] },
        { hospitalId: 'hospital-3', reasonCodes: ['budget_match'] },
        { hospitalId: 'hospital-4', reasonCodes: ['fallback'] },
      ],
    });

    expect(result.shortlist.length).toBeLessThanOrEqual(3);
    expect(result.shortlist[0]?.reasonCodes.length).toBeGreaterThan(0);
  });
});
