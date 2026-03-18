import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — this MUST be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  createPackage: { execute: vi.fn() },
  listPackages: { execute: vi.fn() },
  getPackage: { execute: vi.fn() },
  updatePackage: { execute: vi.fn() },
  publishPackage: { execute: vi.fn() },
  unpublishPackage: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import packageRoutes from '../routes/packages.routes.js';

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
app.route('/', packageRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Packages routes', () => {
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
  // POST /api/v2/packages — CreatePackage
  // -----------------------------------------------------------------------
  describe('POST /api/v2/packages', () => {
    it('returns 201 on success', async () => {
      const pkg = { id: VALID_UUID, nameEn: 'Test', status: 'DRAFT' };
      mockServices.createPackage.execute.mockResolvedValue(pkg);

      const res = await app.request('/api/v2/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nameEn: 'Test',
          type: 'HEALTH_CHECKUP',
          price: '500.00',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.nameEn).toBe('Test');
      expect(mockServices.createPackage.execute).toHaveBeenCalledOnce();
    });

    it('returns 400 for missing required fields', async () => {
      const res = await app.request('/api/v2/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createPackage.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/packages — ListPackages
  // -----------------------------------------------------------------------
  describe('GET /api/v2/packages', () => {
    it('returns 200 with list', async () => {
      const result = { data: [], total: 0, page: 1, limit: 20 };
      mockServices.listPackages.execute.mockResolvedValue(result);

      const res = await app.request('/api/v2/packages');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/packages/{id} — GetPackage
  // -----------------------------------------------------------------------
  describe('GET /api/v2/packages/{id}', () => {
    it('returns 200 for valid UUID', async () => {
      const pkg = { id: VALID_UUID, nameEn: 'Test' };
      mockServices.getPackage.execute.mockResolvedValue(pkg);

      const res = await app.request(`/api/v2/packages/${VALID_UUID}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe(VALID_UUID);
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/packages/not-a-uuid');
      expect(res.status).toBe(400);
      expect(mockServices.getPackage.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v2/packages/{id} — UpdatePackage
  // -----------------------------------------------------------------------
  describe('PUT /api/v2/packages/{id}', () => {
    it('returns 200 on success', async () => {
      const pkg = { id: VALID_UUID, nameEn: 'Updated' };
      mockServices.updatePackage.execute.mockResolvedValue(pkg);

      const res = await app.request(`/api/v2/packages/${VALID_UUID}`, {
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
  // POST /api/v2/packages/{id}/publish — PublishPackage
  // -----------------------------------------------------------------------
  describe('POST /api/v2/packages/{id}/publish', () => {
    it('returns 200 on success', async () => {
      const pkg = { id: VALID_UUID, status: 'PUBLISHED' };
      mockServices.publishPackage.execute.mockResolvedValue(pkg);

      const res = await app.request(`/api/v2/packages/${VALID_UUID}/publish`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('PUBLISHED');
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/packages/not-a-uuid/publish', {
        method: 'POST',
      });
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/packages/{id}/unpublish — UnpublishPackage
  // -----------------------------------------------------------------------
  describe('POST /api/v2/packages/{id}/unpublish', () => {
    it('returns 200 on success', async () => {
      const pkg = { id: VALID_UUID, status: 'DRAFT' };
      mockServices.unpublishPackage.execute.mockResolvedValue(pkg);

      const res = await app.request(`/api/v2/packages/${VALID_UUID}/unpublish`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('DRAFT');
    });
  });
});
