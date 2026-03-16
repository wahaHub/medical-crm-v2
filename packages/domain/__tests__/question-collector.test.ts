import { describe, it, expect } from 'vitest';
import { QCTemplate } from '../src/entities/qc-template.entity.js';
import { QCResponse } from '../src/entities/qc-response.entity.js';
import { QCCustomization } from '../src/entities/qc-customization.entity.js';

// ——— Factories ———
function createTestTemplate(overrides: Partial<ConstructorParameters<typeof QCTemplate>[0]> = {}) {
  return new QCTemplate({
    id: 'tpl-1',
    templateName: 'Pre-Op Questionnaire',
    category: 'PRE_OP',
    procedureTypes: ['rhinoplasty', 'facelift'],
    questions: [{ id: 'q1', text: 'Any allergies?', type: 'text' }],
    version: 1,
    isActive: true,
    createdBy: 'admin-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function createTestResponse(overrides: Partial<ConstructorParameters<typeof QCResponse>[0]> = {}) {
  return new QCResponse({
    id: 'resp-1',
    caseId: 'case-1',
    templateId: 'tpl-1',
    userId: 'patient-1',
    responses: {},
    extractedData: null,
    riskFlags: [],
    completionStatus: 'NOT_STARTED',
    submittedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

function createTestCustomization(overrides: Partial<ConstructorParameters<typeof QCCustomization>[0]> = {}) {
  return new QCCustomization({
    id: 'cust-1',
    templateId: 'tpl-1',
    hospitalId: 'hosp-1',
    customizedQuestions: [{ id: 'q1', text: 'Custom question' }],
    customizedBy: null,
    customizedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  });
}

// ============================================================================
// QCTemplate entity
// ============================================================================
describe('QCTemplate entity', () => {
  describe('constructor', () => {
    it('creates a template with all fields', () => {
      const t = createTestTemplate();
      expect(t.id).toBe('tpl-1');
      expect(t.templateName).toBe('Pre-Op Questionnaire');
      expect(t.category).toBe('PRE_OP');
      expect(t.procedureTypes).toEqual(['rhinoplasty', 'facelift']);
      expect(t.questions).toEqual([{ id: 'q1', text: 'Any allergies?', type: 'text' }]);
      expect(t.version).toBe(1);
      expect(t.isActive).toBe(true);
      expect(t.createdBy).toBe('admin-1');
    });
  });

  describe('update', () => {
    it('updates templateName', () => {
      const t = createTestTemplate();
      const before = t.updatedAt;
      t.update({ templateName: 'Updated Name' });
      expect(t.templateName).toBe('Updated Name');
      expect(t.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('updates category', () => {
      const t = createTestTemplate();
      t.update({ category: 'POST_OP' });
      expect(t.category).toBe('POST_OP');
    });

    it('updates procedureTypes', () => {
      const t = createTestTemplate();
      t.update({ procedureTypes: ['liposuction'] });
      expect(t.procedureTypes).toEqual(['liposuction']);
    });

    it('updates questions', () => {
      const t = createTestTemplate();
      const newQuestions = [{ id: 'q2', text: 'Blood type?' }];
      t.update({ questions: newQuestions });
      expect(t.questions).toEqual(newQuestions);
    });

    it('updates isActive', () => {
      const t = createTestTemplate();
      t.update({ isActive: false });
      expect(t.isActive).toBe(false);
    });

    it('updates multiple fields at once', () => {
      const t = createTestTemplate();
      t.update({ templateName: 'New', category: 'GENERAL', isActive: false });
      expect(t.templateName).toBe('New');
      expect(t.category).toBe('GENERAL');
      expect(t.isActive).toBe(false);
    });

    it('does not change fields not included in update', () => {
      const t = createTestTemplate();
      t.update({ templateName: 'Changed' });
      expect(t.category).toBe('PRE_OP');
      expect(t.procedureTypes).toEqual(['rhinoplasty', 'facelift']);
    });
  });

  describe('deactivate', () => {
    it('sets isActive to false', () => {
      const t = createTestTemplate({ isActive: true });
      t.deactivate();
      expect(t.isActive).toBe(false);
    });

    it('updates updatedAt', () => {
      const t = createTestTemplate();
      const before = t.updatedAt;
      t.deactivate();
      expect(t.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });
});

// ============================================================================
// QCResponse entity
// ============================================================================
describe('QCResponse entity', () => {
  describe('constructor', () => {
    it('creates a response with all fields', () => {
      const r = createTestResponse();
      expect(r.id).toBe('resp-1');
      expect(r.caseId).toBe('case-1');
      expect(r.templateId).toBe('tpl-1');
      expect(r.userId).toBe('patient-1');
      expect(r.responses).toEqual({});
      expect(r.extractedData).toBeNull();
      expect(r.riskFlags).toEqual([]);
      expect(r.completionStatus).toBe('NOT_STARTED');
      expect(r.submittedAt).toBeNull();
    });
  });

  describe('saveDraft', () => {
    it('updates responses and sets status to IN_PROGRESS', () => {
      const r = createTestResponse();
      const draft = { q1: 'answer1' };
      r.saveDraft(draft);
      expect(r.responses).toEqual(draft);
      expect(r.completionStatus).toBe('IN_PROGRESS');
    });

    it('updates updatedAt', () => {
      const r = createTestResponse();
      const before = r.updatedAt;
      r.saveDraft({ q1: 'answer1' });
      expect(r.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('does not set submittedAt', () => {
      const r = createTestResponse();
      r.saveDraft({ q1: 'answer1' });
      expect(r.submittedAt).toBeNull();
    });
  });

  describe('submit', () => {
    it('sets status to COMPLETED and submittedAt', () => {
      const r = createTestResponse();
      const answers = { q1: 'final answer' };
      r.submit(answers);
      expect(r.responses).toEqual(answers);
      expect(r.completionStatus).toBe('COMPLETED');
      expect(r.submittedAt).toBeInstanceOf(Date);
    });

    it('sets riskFlags when provided', () => {
      const r = createTestResponse();
      r.submit({ q1: 'yes' }, ['ALLERGY_RISK', 'BLOOD_THINNER']);
      expect(r.riskFlags).toEqual(['ALLERGY_RISK', 'BLOOD_THINNER']);
    });

    it('sets extractedData when provided', () => {
      const r = createTestResponse();
      const extracted = { bloodType: 'O+', allergies: ['penicillin'] };
      r.submit({ q1: 'yes' }, undefined, extracted);
      expect(r.extractedData).toEqual(extracted);
    });

    it('does not modify riskFlags if not provided', () => {
      const r = createTestResponse({ riskFlags: ['EXISTING'] });
      r.submit({ q1: 'answer' });
      expect(r.riskFlags).toEqual(['EXISTING']);
    });

    it('does not modify extractedData if not provided', () => {
      const r = createTestResponse({ extractedData: { old: true } });
      r.submit({ q1: 'answer' });
      expect(r.extractedData).toEqual({ old: true });
    });

    it('updates updatedAt', () => {
      const r = createTestResponse();
      const before = r.updatedAt;
      r.submit({ q1: 'answer' });
      expect(r.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });
});

// ============================================================================
// QCCustomization entity
// ============================================================================
describe('QCCustomization entity', () => {
  describe('constructor', () => {
    it('creates a customization with all fields', () => {
      const c = createTestCustomization();
      expect(c.id).toBe('cust-1');
      expect(c.templateId).toBe('tpl-1');
      expect(c.hospitalId).toBe('hosp-1');
      expect(c.customizedQuestions).toEqual([{ id: 'q1', text: 'Custom question' }]);
      expect(c.customizedBy).toBeNull();
      expect(c.customizedAt).toBeNull();
    });
  });

  describe('update', () => {
    it('updates customizedQuestions and sets customizedBy', () => {
      const c = createTestCustomization();
      const newQuestions = [{ id: 'q2', text: 'New custom' }];
      c.update(newQuestions, 'hospital-user-1');
      expect(c.customizedQuestions).toEqual(newQuestions);
      expect(c.customizedBy).toBe('hospital-user-1');
    });

    it('sets customizedAt', () => {
      const c = createTestCustomization();
      c.update([{ id: 'q1' }], 'hospital-user-1');
      expect(c.customizedAt).toBeInstanceOf(Date);
    });

    it('updates updatedAt', () => {
      const c = createTestCustomization();
      const before = c.updatedAt;
      c.update([{ id: 'q1' }], 'hospital-user-1');
      expect(c.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });
});
