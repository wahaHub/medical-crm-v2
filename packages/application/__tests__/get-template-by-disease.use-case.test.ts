import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetTemplateByDiseaseUseCase } from '../src/use-cases/question-collector/get-template-by-disease.use-case.js';
import { QCTemplate } from '@medical-crm/domain';
import type { IQuestionCollectorRepository } from '@medical-crm/domain';

// ——— Factories ———

function makeTemplate(overrides: Partial<ConstructorParameters<typeof QCTemplate>[0]> = {}): QCTemplate {
  return new QCTemplate({
    id: 'tpl-default',
    templateName: 'Default Medical Form',
    category: 'DEFAULT',
    procedureTypes: [],
    questions: [{ id: 'q1', text: 'Current medications?' }],
    version: 1,
    isActive: true,
    createdBy: 'admin-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

// ——— Mock repo ———

function mockQCRepo(): IQuestionCollectorRepository {
  return {
    findTemplateById: vi.fn(),
    findAllTemplates: vi.fn(),
    findActiveTemplateByCategory: vi.fn(),
    saveTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    findResponseById: vi.fn(),
    findResponseByCaseId: vi.fn(),
    findAllResponses: vi.fn(),
    saveResponse: vi.fn(),
    findCustomization: vi.fn(),
    saveCustomization: vi.fn(),
  };
}

// ============================================================================
// GetTemplateByDiseaseUseCase
// ============================================================================

describe('GetTemplateByDiseaseUseCase', () => {
  let qcRepo: ReturnType<typeof mockQCRepo>;
  let uc: GetTemplateByDiseaseUseCase;

  beforeEach(() => {
    qcRepo = mockQCRepo();
    uc = new GetTemplateByDiseaseUseCase(qcRepo);
  });

  // --------------------------------------------------------------------------
  // Disease = DEFAULT resolves the active default template
  // --------------------------------------------------------------------------
  it('Disease=DEFAULT resolves the active default template', async () => {
    const tpl = makeTemplate();
    (qcRepo.findActiveTemplateByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(tpl);

    const result = await uc.execute('DEFAULT');

    expect(qcRepo.findActiveTemplateByCategory).toHaveBeenCalledWith('DEFAULT');
    expect(result.template.id).toBe('tpl-default');
    expect(result.template.category).toBe('DEFAULT');
    expect(result.template.isActive).toBe(true);
  });

  // --------------------------------------------------------------------------
  // Template payload shape is sufficient for patient modal rendering
  // --------------------------------------------------------------------------
  it('returned template contains all fields needed for patient modal rendering', async () => {
    const tpl = makeTemplate({
      questions: [{ id: 'q1', text: 'Medications?' }, { id: 'q2', text: 'Allergies?' }],
      translations: { zh: { q1: '当前药物?' } },
    });
    (qcRepo.findActiveTemplateByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(tpl);

    const result = await uc.execute('DEFAULT');
    const t = result.template;

    // Fields required by the patient form modal
    expect(t.id).toBeDefined();
    expect(t.templateName).toBeDefined();
    expect(t.category).toBe('DEFAULT');
    expect(Array.isArray(t.procedureTypes)).toBe(true);
    expect(t.questions).toBeDefined();
    expect(t.translations).toBeDefined();
    expect(t.isActive).toBe(true);
    expect(t.createdAt).toBeDefined();
    expect(t.updatedAt).toBeDefined();
  });

  // --------------------------------------------------------------------------
  // Admin-only fields must NOT be exposed to patients
  // --------------------------------------------------------------------------
  it('patient-safe DTO does not expose createdBy or version', async () => {
    (qcRepo.findActiveTemplateByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());

    const result = await uc.execute('DEFAULT');
    const t = result.template as Record<string, unknown>;

    expect('createdBy' in t).toBe(false);
    expect('version' in t).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Patient cannot mutate admin templates through this path
  // --------------------------------------------------------------------------
  it('use case has no mutation method — execute returns read-only result', async () => {
    (qcRepo.findActiveTemplateByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(makeTemplate());

    const result = await uc.execute('DEFAULT');

    // Repo write methods must NOT have been called
    expect(qcRepo.saveTemplate).not.toHaveBeenCalled();
    expect(qcRepo.deleteTemplate).not.toHaveBeenCalled();
    expect(qcRepo.saveResponse).not.toHaveBeenCalled();
    expect(qcRepo.saveCustomization).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // NotFoundError when no active template exists for the selector
  // --------------------------------------------------------------------------
  it('throws NotFoundError when no active template found for disease selector', async () => {
    (qcRepo.findActiveTemplateByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(uc.execute('DEFAULT')).rejects.toThrow(
      'No active template found for disease selector "DEFAULT"',
    );
  });

  // --------------------------------------------------------------------------
  // Unknown / custom disease selectors pass through to category lookup
  // --------------------------------------------------------------------------
  it('non-DEFAULT disease selector is forwarded as category to repo', async () => {
    (qcRepo.findActiveTemplateByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(uc.execute('CARDIOLOGY')).rejects.toThrow('"CARDIOLOGY"');
    expect(qcRepo.findActiveTemplateByCategory).toHaveBeenCalledWith('CARDIOLOGY');
  });

  // --------------------------------------------------------------------------
  // Inactive templates are not returned (enforced at repo query level)
  // --------------------------------------------------------------------------
  it('passes isActive=true constraint implicitly via findActiveTemplateByCategory (not findAllTemplates)', async () => {
    (qcRepo.findActiveTemplateByCategory as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(uc.execute('DEFAULT')).rejects.toThrow();

    // Must use the active-only lookup, NOT the generic list query
    expect(qcRepo.findActiveTemplateByCategory).toHaveBeenCalledTimes(1);
    expect(qcRepo.findAllTemplates).not.toHaveBeenCalled();
    expect(qcRepo.findTemplateById).not.toHaveBeenCalled();
  });
});
