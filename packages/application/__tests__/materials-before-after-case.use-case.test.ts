import { describe, expect, it, vi } from 'vitest';
import type {
  IMaterialsRepository,
  MaterialsBeforeAfterCase,
  MaterialsHospitalInfo,
  MaterialsProcedure,
  MaterialsSurgeon,
} from '@medical-crm/domain';
import { CreateBeforeAfterCaseUseCase } from '../src/use-cases/materials/create-before-after-case.use-case.js';
import { UpdateBeforeAfterCaseUseCase } from '../src/use-cases/materials/update-before-after-case.use-case.js';

function makeRepo(): IMaterialsRepository {
  const savedCase: MaterialsBeforeAfterCase = {
    id: 'case-1',
    hospitalId: 'hospital-1',
    procedureName: '双眼皮修复',
    surgeonName: '王医生',
    description: '案例描述',
    images: [{ url: 'https://example.com/case.png' }],
  };

  return {
    getHospitalInfo: vi.fn<() => Promise<MaterialsHospitalInfo | null>>(),
    updateHospitalInfo: vi.fn<() => Promise<MaterialsHospitalInfo>>(),
    listProcedures: vi.fn<() => Promise<MaterialsProcedure[]>>().mockResolvedValue([]),
    createProcedure: vi.fn<() => Promise<MaterialsProcedure>>(),
    updateProcedure: vi.fn<() => Promise<MaterialsProcedure>>(),
    deleteProcedure: vi.fn<() => Promise<void>>(),
    listSurgeons: vi.fn<() => Promise<MaterialsSurgeon[]>>().mockResolvedValue([]),
    createSurgeon: vi.fn<() => Promise<MaterialsSurgeon>>(),
    updateSurgeon: vi.fn<() => Promise<MaterialsSurgeon>>(),
    deleteSurgeon: vi.fn<() => Promise<void>>(),
    listBeforeAfterCases: vi.fn<() => Promise<MaterialsBeforeAfterCase[]>>().mockResolvedValue([savedCase]),
    createBeforeAfterCase: vi.fn<(data: Omit<MaterialsBeforeAfterCase, 'id'>) => Promise<MaterialsBeforeAfterCase>>()
      .mockImplementation(async (data) => ({
        ...data,
        id: savedCase.id,
      })),
    updateBeforeAfterCase: vi.fn<(id: string, hospitalId: string, data: Partial<MaterialsBeforeAfterCase>) => Promise<MaterialsBeforeAfterCase>>()
      .mockImplementation(async (id, hospitalId, data) => ({
        ...savedCase,
        ...data,
        id,
        hospitalId,
      })),
    deleteBeforeAfterCase: vi.fn<() => Promise<void>>(),
  };
}

describe('before/after case materials translation tasks', () => {
  const actor = { role: 'HOSPITAL' as const, hospitalId: 'hospital-1' };

  it('enqueues procedure_name for case creation', async () => {
    const repo = makeRepo();
    const mockResolveHospitalType = vi.fn().mockResolvedValue('REGULAR');
    const mockTranslationTaskService = { enqueue: vi.fn() };
    const useCase = new CreateBeforeAfterCaseUseCase(repo, mockResolveHospitalType, mockTranslationTaskService as any);

    await useCase.execute('hospital-1', {
      procedureName: '双眼皮修复',
      surgeonName: '王医生',
      description: '案例描述',
      images: [{ url: 'https://example.com/case.png' }],
    }, actor);

    expect(mockTranslationTaskService.enqueue).toHaveBeenCalledWith({
      sourceDb: 'supabase_china',
      entityType: 'procedure_case',
      entityId: 'case-1',
      fieldsToTranslate: {
        procedure_name: '双眼皮修复',
        description: '案例描述',
        provider_name: '王医生',
      },
    });
  });

  it('enqueues updated procedure_name for case updates', async () => {
    const repo = makeRepo();
    const mockResolveHospitalType = vi.fn().mockResolvedValue('REGULAR');
    const mockTranslationTaskService = { enqueue: vi.fn() };
    const useCase = new UpdateBeforeAfterCaseUseCase(repo, mockResolveHospitalType, mockTranslationTaskService as any);

    await useCase.execute('hospital-1', 'case-1', {
      procedureName: '提眉术',
    }, actor);

    expect(mockTranslationTaskService.enqueue).toHaveBeenCalledWith({
      sourceDb: 'supabase_china',
      entityType: 'procedure_case',
      entityId: 'case-1',
      fieldsToTranslate: {
        procedure_name: '提眉术',
      },
    });
  });
});
