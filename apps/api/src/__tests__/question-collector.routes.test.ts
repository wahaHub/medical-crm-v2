import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — this MUST be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  createTemplate: { execute: vi.fn() },
  updateTemplate: { execute: vi.fn() },
  deleteTemplate: { execute: vi.fn() },
  listTemplates: { execute: vi.fn() },
  getTemplate: { execute: vi.fn() },
  submitQCResponse: { execute: vi.fn() },
  saveQCResponseDraft: { execute: vi.fn() },
  getQCResponse: { execute: vi.fn() },
  listQCResponses: { execute: vi.fn() },
  customizeQuestions: { execute: vi.fn() },
  getCustomization: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import questionCollectorRoutes from '../routes/question-collector.routes.js';

type SessionData = {
  userId: string;
  email: string;
  roles: string[];
  hospitalId: string | null;
};

let currentSession: SessionData = {
  userId: 'u-1',
  email: 'admin@test.com',
  roles: ['ADMIN'],
  hospitalId: null,
};

const app = new OpenAPIHono();

// Fake auth middleware: injects `currentSession` into the context
app.use('/api/v2/*', async (c, next) => {
  c.set('session', currentSession);
  await next();
});

// Mount the actual routes
app.route('/', questionCollectorRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_UUID_2 = '00000000-0000-0000-0000-000000000002';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QuestionCollector routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSession = {
      userId: 'u-1',
      email: 'admin@test.com',
      roles: ['ADMIN'],
      hospitalId: null,
    };
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/question-templates — CreateTemplate
  // -----------------------------------------------------------------------
  describe('POST /api/v2/question-templates', () => {
    it('returns 201 on success', async () => {
      const template = { id: VALID_UUID, templateName: 'Test', category: 'PRE_OP' };
      mockServices.createTemplate.execute.mockResolvedValue(template);

      const res = await app.request('/api/v2/question-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: 'Test',
          category: 'PRE_OP',
          questions: [{ id: 'q1' }],
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.templateName).toBe('Test');
    });

    it('returns 400 for missing templateName', async () => {
      const res = await app.request('/api/v2/question-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'PRE_OP', questions: [] }),
      });
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/question-templates — ListTemplates
  // -----------------------------------------------------------------------
  describe('GET /api/v2/question-templates', () => {
    it('returns 200 with paginated list', async () => {
      mockServices.listTemplates.execute.mockResolvedValue({ data: [], total: 0 });

      const res = await app.request('/api/v2/question-templates');
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.total).toBe(0);
    });

    it('passes query params', async () => {
      mockServices.listTemplates.execute.mockResolvedValue({ data: [], total: 0 });
      await app.request('/api/v2/question-templates?page=2&limit=10&category=PRE_OP');
      expect(mockServices.listTemplates.execute).toHaveBeenCalled();
      const call = mockServices.listTemplates.execute.mock.calls[0];
      expect(call[0].page).toBe(2);
      expect(call[0].limit).toBe(10);
      expect(call[0].category).toBe('PRE_OP');
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/question-templates/{id} — GetTemplate
  // -----------------------------------------------------------------------
  describe('GET /api/v2/question-templates/{id}', () => {
    it('returns 200 with template', async () => {
      mockServices.getTemplate.execute.mockResolvedValue({
        template: { id: VALID_UUID, templateName: 'T' },
      });

      const res = await app.request(`/api/v2/question-templates/${VALID_UUID}`);
      expect(res.status).toBe(200);
    });

    it('passes caseId query param', async () => {
      mockServices.getTemplate.execute.mockResolvedValue({
        template: { id: VALID_UUID },
      });
      await app.request(`/api/v2/question-templates/${VALID_UUID}?caseId=${VALID_UUID_2}`);
      const call = mockServices.getTemplate.execute.mock.calls[0];
      expect(call[2]).toBe(VALID_UUID_2);
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/question-templates/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v2/question-templates/{id} — UpdateTemplate
  // -----------------------------------------------------------------------
  describe('PUT /api/v2/question-templates/{id}', () => {
    it('returns 200 on success', async () => {
      mockServices.updateTemplate.execute.mockResolvedValue({
        id: VALID_UUID, templateName: 'Updated',
      });

      const res = await app.request(`/api/v2/question-templates/${VALID_UUID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateName: 'Updated' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.templateName).toBe('Updated');
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v2/question-templates/{id} — DeleteTemplate
  // -----------------------------------------------------------------------
  describe('DELETE /api/v2/question-templates/{id}', () => {
    it('returns 204 on success', async () => {
      mockServices.deleteTemplate.execute.mockResolvedValue(undefined);

      const res = await app.request(`/api/v2/question-templates/${VALID_UUID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
      expect(mockServices.deleteTemplate.execute).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/cases/{caseId}/questionnaire — SubmitResponse
  // -----------------------------------------------------------------------
  describe('POST /api/v2/cases/{caseId}/questionnaire', () => {
    it('returns 201 on success', async () => {
      currentSession = {
        userId: 'p-1',
        email: 'p@test.com',
        roles: ['PATIENT'],
        hospitalId: null,
      };
      mockServices.submitQCResponse.execute.mockResolvedValue({
        id: VALID_UUID, completionStatus: 'COMPLETED',
      });

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/questionnaire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: VALID_UUID_2,
          responses: { q1: 'answer' },
        }),
      });

      expect(res.status).toBe(201);
    });

    it('returns 400 for missing templateId', async () => {
      const res = await app.request(`/api/v2/cases/${VALID_UUID}/questionnaire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses: {} }),
      });
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v2/cases/{caseId}/questionnaire — SaveResponseDraft
  // -----------------------------------------------------------------------
  describe('PATCH /api/v2/cases/{caseId}/questionnaire', () => {
    it('returns 200 on success', async () => {
      currentSession = {
        userId: 'p-1',
        email: 'p@test.com',
        roles: ['PATIENT'],
        hospitalId: null,
      };
      mockServices.saveQCResponseDraft.execute.mockResolvedValue({
        id: VALID_UUID, completionStatus: 'IN_PROGRESS',
      });

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/questionnaire`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: VALID_UUID_2,
          responses: { q1: 'partial' },
        }),
      });

      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/cases/{caseId}/questionnaire — GetResponse
  // -----------------------------------------------------------------------
  describe('GET /api/v2/cases/{caseId}/questionnaire', () => {
    it('returns 200 with response', async () => {
      mockServices.getQCResponse.execute.mockResolvedValue({
        id: VALID_UUID, caseId: VALID_UUID,
      });

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/questionnaire`);
      expect(res.status).toBe(200);
    });

    it('returns 200 with null data when no response', async () => {
      mockServices.getQCResponse.execute.mockResolvedValue(null);
      const res = await app.request(`/api/v2/cases/${VALID_UUID}/questionnaire`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/questionnaire-responses — ListResponses
  // -----------------------------------------------------------------------
  describe('GET /api/v2/questionnaire-responses', () => {
    it('returns 200 with paginated list', async () => {
      mockServices.listQCResponses.execute.mockResolvedValue({ data: [], total: 0 });

      const res = await app.request('/api/v2/questionnaire-responses');
      expect(res.status).toBe(200);
    });

    it('passes filters', async () => {
      mockServices.listQCResponses.execute.mockResolvedValue({ data: [], total: 0 });
      await app.request(`/api/v2/questionnaire-responses?hasRiskFlags=true&completionStatus=COMPLETED`);
      const call = mockServices.listQCResponses.execute.mock.calls[0];
      expect(call[0].hasRiskFlags).toBe(true);
      expect(call[0].completionStatus).toBe('COMPLETED');
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/question-templates/{templateId}/customizations — CustomizeQuestions
  // -----------------------------------------------------------------------
  describe('POST /api/v2/question-templates/{templateId}/customizations', () => {
    it('returns 201 on success', async () => {
      currentSession = {
        userId: 'h-1',
        email: 'h@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'hosp-1',
      };
      mockServices.customizeQuestions.execute.mockResolvedValue({
        id: VALID_UUID, templateId: VALID_UUID,
      });

      const res = await app.request(`/api/v2/question-templates/${VALID_UUID}/customizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customizedQuestions: [{ id: 'q1', text: 'Custom' }],
        }),
      });

      expect(res.status).toBe(201);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/question-templates/{templateId}/customizations — GetCustomization
  // -----------------------------------------------------------------------
  describe('GET /api/v2/question-templates/{templateId}/customizations', () => {
    it('returns 200 with customization', async () => {
      currentSession = {
        userId: 'h-1',
        email: 'h@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'hosp-1',
      };
      mockServices.getCustomization.execute.mockResolvedValue({
        id: VALID_UUID, templateId: VALID_UUID,
      });

      const res = await app.request(`/api/v2/question-templates/${VALID_UUID}/customizations`);
      expect(res.status).toBe(200);
    });

    it('returns 200 with null data when no customization', async () => {
      currentSession = {
        userId: 'h-1',
        email: 'h@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'hosp-1',
      };
      mockServices.getCustomization.execute.mockResolvedValue(null);
      const res = await app.request(`/api/v2/question-templates/${VALID_UUID}/customizations`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toBeNull();
    });
  });
});
