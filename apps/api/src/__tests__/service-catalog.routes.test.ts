import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — this MUST be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  createServiceCatalogItem: { execute: vi.fn() },
  listServiceCatalogItems: { execute: vi.fn() },
  getServiceCatalogItem: { execute: vi.fn() },
  updateServiceCatalogItem: { execute: vi.fn() },
  deleteServiceCatalogItem: { execute: vi.fn() },
  listAllServiceCatalogItems: { execute: vi.fn() },
  createQuoteTemplate: { execute: vi.fn() },
  listQuoteTemplates: { execute: vi.fn() },
  getQuoteTemplate: { execute: vi.fn() },
  updateQuoteTemplate: { execute: vi.fn() },
  deleteQuoteTemplate: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import serviceCatalogRoutes from '../routes/service-catalog.routes.js';

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
app.route('/', serviceCatalogRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const HOSPITAL_UUID = '00000000-0000-0000-0000-000000000002';

// ---------------------------------------------------------------------------
// Tests — Service Catalog Items
// ---------------------------------------------------------------------------

describe('Service Catalog routes', () => {
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
  // POST /api/v2/hospitals/{hospitalId}/service-catalog
  // -----------------------------------------------------------------------
  describe('POST /api/v2/hospitals/{hospitalId}/service-catalog', () => {
    it('returns 201 on success', async () => {
      const item = { id: VALID_UUID, nameEn: 'Rhinoplasty', category: 'COSMETIC_SURGERY' };
      mockServices.createServiceCatalogItem.execute.mockResolvedValue(item);

      const res = await app.request(`/api/v2/hospitals/${HOSPITAL_UUID}/service-catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameEn: 'Rhinoplasty',
          category: 'COSMETIC_SURGERY',
          priceMin: '3000.00',
          priceMax: '8000.00',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.nameEn).toBe('Rhinoplasty');
      expect(mockServices.createServiceCatalogItem.execute).toHaveBeenCalledOnce();
    });

    it('returns 400 for missing required fields', async () => {
      const res = await app.request(`/api/v2/hospitals/${HOSPITAL_UUID}/service-catalog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createServiceCatalogItem.execute).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid hospitalId UUID', async () => {
      const res = await app.request('/api/v2/hospitals/not-a-uuid/service-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameEn: 'Test',
          category: 'DENTAL',
          priceMin: '100.00',
          priceMax: '200.00',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/hospitals/{hospitalId}/service-catalog
  // -----------------------------------------------------------------------
  describe('GET /api/v2/hospitals/{hospitalId}/service-catalog', () => {
    it('returns 200 with list', async () => {
      const result = { data: [], total: 0, page: 1, limit: 20 };
      mockServices.listServiceCatalogItems.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/hospitals/${HOSPITAL_UUID}/service-catalog`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/service-catalog — List all (Admin)
  // -----------------------------------------------------------------------
  describe('GET /api/v2/service-catalog', () => {
    it('returns 200 with all items', async () => {
      const result = { data: [], total: 0, page: 1, limit: 20 };
      mockServices.listAllServiceCatalogItems.execute.mockResolvedValue(result);

      const res = await app.request('/api/v2/service-catalog');
      expect(res.status).toBe(200);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/service-catalog/{id}
  // -----------------------------------------------------------------------
  describe('GET /api/v2/service-catalog/{id}', () => {
    it('returns 200 for valid UUID', async () => {
      const item = { id: VALID_UUID, nameEn: 'Rhinoplasty' };
      mockServices.getServiceCatalogItem.execute.mockResolvedValue(item);

      const res = await app.request(`/api/v2/service-catalog/${VALID_UUID}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe(VALID_UUID);
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/service-catalog/not-a-uuid');
      expect(res.status).toBe(400);
      expect(mockServices.getServiceCatalogItem.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v2/service-catalog/{id}
  // -----------------------------------------------------------------------
  describe('PUT /api/v2/service-catalog/{id}', () => {
    it('returns 200 on success', async () => {
      const item = { id: VALID_UUID, nameEn: 'Updated' };
      mockServices.updateServiceCatalogItem.execute.mockResolvedValue(item);

      const res = await app.request(`/api/v2/service-catalog/${VALID_UUID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nameEn: 'Updated' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.nameEn).toBe('Updated');
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v2/service-catalog/{id}
  // -----------------------------------------------------------------------
  describe('DELETE /api/v2/service-catalog/{id}', () => {
    it('returns 204 on success', async () => {
      mockServices.deleteServiceCatalogItem.execute.mockResolvedValue(undefined);

      const res = await app.request(`/api/v2/service-catalog/${VALID_UUID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
      expect(mockServices.deleteServiceCatalogItem.execute).toHaveBeenCalledOnce();
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/service-catalog/bad-uuid', {
        method: 'DELETE',
      });
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // Quote Templates
  // -----------------------------------------------------------------------

  // POST /api/v2/hospitals/{hospitalId}/quote-templates
  describe('POST /api/v2/hospitals/{hospitalId}/quote-templates', () => {
    it('returns 201 on success', async () => {
      const tmpl = { id: VALID_UUID, name: 'Test Template' };
      mockServices.createQuoteTemplate.execute.mockResolvedValue(tmpl);

      const res = await app.request(`/api/v2/hospitals/${HOSPITAL_UUID}/quote-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Template',
          lineItemsTemplate: [{ label: 'Fee', type: 'fixed' }],
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe('Test Template');
    });

    it('returns 400 for missing required fields', async () => {
      const res = await app.request(`/api/v2/hospitals/${HOSPITAL_UUID}/quote-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  // GET /api/v2/hospitals/{hospitalId}/quote-templates
  describe('GET /api/v2/hospitals/{hospitalId}/quote-templates', () => {
    it('returns 200 with list', async () => {
      const result = { data: [], total: 0, page: 1, limit: 20 };
      mockServices.listQuoteTemplates.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/hospitals/${HOSPITAL_UUID}/quote-templates`);
      expect(res.status).toBe(200);
    });
  });

  // GET /api/v2/quote-templates/{id}
  describe('GET /api/v2/quote-templates/{id}', () => {
    it('returns 200 for valid UUID', async () => {
      const tmpl = { id: VALID_UUID, name: 'Test' };
      mockServices.getQuoteTemplate.execute.mockResolvedValue(tmpl);

      const res = await app.request(`/api/v2/quote-templates/${VALID_UUID}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe(VALID_UUID);
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/quote-templates/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  // PUT /api/v2/quote-templates/{id}
  describe('PUT /api/v2/quote-templates/{id}', () => {
    it('returns 200 on success', async () => {
      const tmpl = { id: VALID_UUID, name: 'Updated Template' };
      mockServices.updateQuoteTemplate.execute.mockResolvedValue(tmpl);

      const res = await app.request(`/api/v2/quote-templates/${VALID_UUID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Template' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe('Updated Template');
    });
  });

  // DELETE /api/v2/quote-templates/{id}
  describe('DELETE /api/v2/quote-templates/{id}', () => {
    it('returns 204 on success', async () => {
      mockServices.deleteQuoteTemplate.execute.mockResolvedValue(undefined);

      const res = await app.request(`/api/v2/quote-templates/${VALID_UUID}`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
      expect(mockServices.deleteQuoteTemplate.execute).toHaveBeenCalledOnce();
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/quote-templates/bad-uuid', {
        method: 'DELETE',
      });
      expect(res.status).toBe(400);
    });
  });
});
