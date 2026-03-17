import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MatchHospitalsUseCase } from '../../src/use-cases/patient-onboarding/match-hospitals.use-case.js';

describe('MatchHospitalsUseCase', () => {
  let useCase: MatchHospitalsUseCase;
  let mockHospitalRepo: any;

  beforeEach(() => {
    mockHospitalRepo = {
      findMatchingHospitals: vi.fn().mockResolvedValue([
        { id: 'h1', name: 'Hospital A', nameEn: 'Hospital A', rating: 4.8, logoUrl: null, tags: ['plastic surgery'], procedureCount: 15 },
        { id: 'h2', name: 'Hospital B', nameEn: 'Hospital B', rating: 4.5, logoUrl: null, tags: ['dermatology'], procedureCount: 8 },
      ]),
    };
    useCase = new MatchHospitalsUseCase(mockHospitalRepo);
  });

  it('returns matched hospitals', async () => {
    const result = await useCase.execute({ destination: 'Seoul' });
    expect(result.hospitals).toHaveLength(2);
    expect(result.hospitals[0].name).toBe('Hospital A');
  });

  it('returns empty array when no match', async () => {
    mockHospitalRepo.findMatchingHospitals.mockResolvedValue([]);
    const result = await useCase.execute({ destination: 'Unknown' });
    expect(result.hospitals).toHaveLength(0);
  });
});
