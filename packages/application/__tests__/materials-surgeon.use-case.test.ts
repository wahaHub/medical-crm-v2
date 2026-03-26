import { describe, expect, it, vi } from 'vitest';
import type { IMaterialsRepository, MaterialsBeforeAfterCase, MaterialsHospitalInfo, MaterialsProcedure, MaterialsSurgeon } from '@medical-crm/domain';
import { CreateSurgeonUseCase } from '../src/use-cases/materials/create-surgeon.use-case.js';
import { UpdateSurgeonUseCase } from '../src/use-cases/materials/update-surgeon.use-case.js';

function makeRepo(): IMaterialsRepository {
  const surgeon: MaterialsSurgeon = {
    id: 'surgeon-1',
    hospitalId: 'hospital-1',
    name: 'Dr. Lin',
    title: 'Chief Surgeon',
    imageUrl: 'https://example.com/hero.jpg',
    experienceYears: 12,
    specialties: ['Facelift'],
    languages: ['English'],
    education: ['Peking Union Medical College'],
    certifications: ['Board Certified'],
    intro: 'Intro',
    expertise: 'Expertise',
    philosophy: 'Philosophy',
    achievements: ['Achievement'],
  };

  return {
    getHospitalInfo: vi.fn<() => Promise<MaterialsHospitalInfo | null>>(),
    updateHospitalInfo: vi.fn<() => Promise<MaterialsHospitalInfo>>(),
    listProcedures: vi.fn<() => Promise<MaterialsProcedure[]>>().mockResolvedValue([]),
    createProcedure: vi.fn<() => Promise<MaterialsProcedure>>(),
    updateProcedure: vi.fn<() => Promise<MaterialsProcedure>>(),
    deleteProcedure: vi.fn<() => Promise<void>>(),
    listSurgeons: vi.fn<() => Promise<MaterialsSurgeon[]>>().mockResolvedValue([surgeon]),
    createSurgeon: vi.fn<(data: Omit<MaterialsSurgeon, 'id'>) => Promise<MaterialsSurgeon>>().mockImplementation(async (data) => ({
      ...data,
      id: surgeon.id,
    })),
    updateSurgeon: vi.fn<(id: string, hospitalId: string, data: Partial<MaterialsSurgeon>) => Promise<MaterialsSurgeon>>().mockImplementation(async (id, hospitalId, data) => ({
      ...surgeon,
      ...data,
      id,
      hospitalId,
    })),
    deleteSurgeon: vi.fn<() => Promise<void>>(),
    listBeforeAfterCases: vi.fn<() => Promise<MaterialsBeforeAfterCase[]>>().mockResolvedValue([]),
    createBeforeAfterCase: vi.fn<() => Promise<MaterialsBeforeAfterCase>>(),
    updateBeforeAfterCase: vi.fn<() => Promise<MaterialsBeforeAfterCase>>(),
    deleteBeforeAfterCase: vi.fn<() => Promise<void>>(),
  };
}

describe('surgeon materials use cases', () => {
  const actor = { role: 'HOSPITAL' as const, hospitalId: 'hospital-1' };

  it('passes v1 surgeon profile fields through create surgeon', async () => {
    const repo = makeRepo();
    const mockResolveHospitalType = vi.fn().mockResolvedValue('COSMETIC');
    const mockTranslationTaskService = { enqueue: vi.fn() };
    const useCase = new CreateSurgeonUseCase(repo, mockResolveHospitalType, mockTranslationTaskService as any);

    await useCase.execute('hospital-1', {
      name: 'Dr. Lin',
      title: 'Chief Surgeon',
      imageUrl: 'https://example.com/hero.jpg',
      experienceYears: 12,
      specialties: ['Facelift'],
      languages: ['English', 'Chinese'],
      education: ['Peking Union Medical College'],
      certifications: ['Board Certified'],
      intro: 'Warm intro',
      expertise: 'Deep expertise',
      philosophy: 'Patient-first',
      achievements: ['Published 50 papers'],
    }, actor);

    expect(repo.createSurgeon).toHaveBeenCalledWith(expect.objectContaining({
      hospitalId: 'hospital-1',
      education: ['Peking Union Medical College'],
      certifications: ['Board Certified'],
      intro: 'Warm intro',
      expertise: 'Deep expertise',
      philosophy: 'Patient-first',
      achievements: ['Published 50 papers'],
    }));
  });

  it('passes v1 surgeon profile fields through update surgeon', async () => {
    const repo = makeRepo();
    const mockResolveHospitalType = vi.fn().mockResolvedValue('COSMETIC');
    const mockTranslationTaskService = { enqueue: vi.fn() };
    const useCase = new UpdateSurgeonUseCase(repo, mockResolveHospitalType, mockTranslationTaskService as any);

    await useCase.execute('hospital-1', 'surgeon-1', {
      education: ['Harvard Medical School'],
      certifications: ['AACS'],
      intro: 'Updated intro',
      expertise: 'Updated expertise',
      philosophy: 'Updated philosophy',
      achievements: ['Award winner'],
      imageUrl: 'https://example.com/new-hero.jpg',
    }, actor);

    expect(repo.updateSurgeon).toHaveBeenCalledWith(
      'surgeon-1',
      'hospital-1',
      expect.objectContaining({
        education: ['Harvard Medical School'],
        certifications: ['AACS'],
        intro: 'Updated intro',
        expertise: 'Updated expertise',
        philosophy: 'Updated philosophy',
        achievements: ['Award winner'],
        imageUrl: 'https://example.com/new-hero.jpg',
      }),
    );
  });
});
