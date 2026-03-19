import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — this MUST be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  createEmailTemplate: { execute: vi.fn() },
  listEmailTemplates: { execute: vi.fn() },
  getEmailTemplate: { execute: vi.fn() },
  updateEmailTemplate: { execute: vi.fn() },
  deleteEmailTemplate: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import emailTemplateRoutes from '../routes/email-template.routes.js';

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
app.route('/', emailTemplateRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const HOSPITAL_UUID = '00000000-0000-0000-0000-000000000002';

const VALID_CREATE_BODY = {
  name: 'Welcome Email',
  type: 'intro',
  subject: 'Welcome to our clinic!',
  body: 'Dear patient, welcome to our clinic.',
};

// ---------------------------------------------------------------------------
// Tests — Email Template routes
// ---------------------------------------------------------------------------

describe('Email Template routes', () => {
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
  // POST /api/v2/hospitals/{hospitalId}/email-templates
  // -----------------------------------------------------------------------
  describe('POST /api/v2/hospitals/{hospitalId}/email-templates', () => {
    it('returns 201 on success', async () => {
      const template = { id: VALID_UUID, name: 'Welcome Email', type: 'intro' };
      mockServices.createEmailTemplate.execute.mockResolvedValue(template);

      const res = await app.request(`/api/v2/hospitals/${HOSPITAL_UUID}/email-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_CREATE_BODY),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe('Welcome Email');
      expect(mockServices.createEmailTemplate.execute).toHaveBeenCalledOnce();
      expect(mockServices.createEmailTemplate.execute).toHaveBeenCalledWith(
        HOSPITAL_UUID,
        expect.objectContaining({ name: 'Welcome Email', type: 'intro' }),
        expect.anything(),
      );
    });

    it('returns 400 for missing required fields', async () => {
      const res = await app.request(`/api/v2/hospitals/${HOSPITAL_UUID}/email-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createEmailTemplate.execute).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid hospitalId UUID', async () => {
      const res = await app.request('/api/v2/hospitals/not-a-uuid/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(VALID_CREATE_BODY),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createEmailTemplate.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/hospitals/{hospitalId}/email-templates
  // -----------------------------------------------------------------------
  describe('GET /api/v2/hospitals/{hospitalId}/email-templates', () => {
    it('returns 200 with list data', async () => {
      const result = { data: [], total: 0, page: 1, limit: 20 };
      mockServices.listEmailTemplates.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/hospitals/${HOSPITAL_UUID}/email-templates`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
      expect(mockServices.listEmailTemplates.execute).toHaveBeenCalledOnce();
      expect(mockServices.listEmailTemplates.execute).toHaveBeenCalledWith(
        HOSPITAL_UUID,
        expect.anything(),
        expect.anything(),
      );
    });

    it('returns 200 with filtered list', async () => {
      const template = { id: VALID_UUID, name: 'Intro Email', type: 'intro', status: 'active' };
      const result = { data: [template], total: 1, page: 1, limit: 20 };
      mockServices.listEmailTemplates.execute.mockResolvedValue(result);

      const res = await app.request(
        `/api/v2/hospitals/${HOSPITAL_UUID}/email-templates?type=intro&status=active`,
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/email-templates/{id}
  // -----------------------------------------------------------------------
  describe('GET /api/v2/email-templates/{id}', () => {
    it('returns 200 with single template', async () => {
      const template = { id: VALID_UUID, name: 'Welcome Email', type: 'intro' };
      mockServices.getEmailTemplate.execute.mockResolvedValue(template);

      const res = await app.request(`/api/v2/email-templates/${VALID_UUID}`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(VALID_UUID);
      expect(mockServices.getEmailTemplate.execute).toHaveBeenCalledOnce();
      expect(mockServices.getEmailTemplate.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.anything(),
      );
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/email-templates/not-a-uuid');

      expect(res.status).toBe(400);
      expect(mockServices.getEmailTemplate.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v2/email-templates/{id}
  // -----------------------------------------------------------------------
  describe('PUT /api/v2/email-templates/{id}', () => {
    it('returns 200 on update', async () => {
      const updated = { id: VALID_UUID, name: 'Updated Email', type: 'intro' };
      mockServices.updateEmailTemplate.execute.mockResolvedValue(updated);

      const res = await app.request(`/api/v2/email-templates/${VALID_UUID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Email' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Updated Email');
      expect(mockServices.updateEmailTemplate.execute).toHaveBeenCalledOnce();
      expect(mockServices.updateEmailTemplate.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.objectContaining({ name: 'Updated Email' }),
        expect.anything(),
      );
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/email-templates/not-a-uuid', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.updateEmailTemplate.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v2/email-templates/{id}
  // -----------------------------------------------------------------------
  describe('DELETE /api/v2/email-templates/{id}', () => {
    it('returns 204 on delete', async () => {
      mockServices.deleteEmailTemplate.execute.mockResolvedValue(undefined);

      const res = await app.request(`/api/v2/email-templates/${VALID_UUID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
      expect(mockServices.deleteEmailTemplate.execute).toHaveBeenCalledOnce();
      expect(mockServices.deleteEmailTemplate.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.anything(),
      );
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/email-templates/bad-uuid', {
        method: 'DELETE',
      });

      expect(res.status).toBe(400);
      expect(mockServices.deleteEmailTemplate.execute).not.toHaveBeenCalled();
    });
  });
});
