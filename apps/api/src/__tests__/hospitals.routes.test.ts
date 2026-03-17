import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — this MUST be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  createCase: { execute: vi.fn() },
  listCases: { execute: vi.fn() },
  getCase: { execute: vi.fn() },
  getHospitalCaseDetail: { execute: vi.fn() },
  updateCase: { execute: vi.fn() },
  assignCase: { execute: vi.fn() },
  updateCaseStatus: { execute: vi.fn() },
  advanceCaseStage: { execute: vi.fn() },
  getCaseStats: { execute: vi.fn() },
  uploadDocument: { execute: vi.fn() },
  listDocuments: { execute: vi.fn() },
  deleteDocument: { execute: vi.fn() },
  getCaseProgress: { execute: vi.fn() },
  addCaseProgress: { execute: vi.fn() },
  // Hospital services
  createHospital: { execute: vi.fn() },
  listHospitals: { execute: vi.fn() },
  getHospital: { execute: vi.fn() },
  updateHospital: { execute: vi.fn() },
  updateHospitalStatus: { execute: vi.fn() },
  getHospitalCases: { execute: vi.fn() },
  generateRegistrationToken: { execute: vi.fn() },
  registerHospitalUser: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import hospitalRoutes from '../routes/hospitals.routes.js';

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

// Fake auth middleware for all routes EXCEPT the public register route
app.use('/api/v2/hospitals/*', async (c, next) => {
  c.set('session', currentSession);
  await next();
});
app.use('/api/v2/auth/*', async (c, next) => {
  // Public route - still set session for consistency but not required
  c.set('session', currentSession);
  await next();
});

app.route('/', hospitalRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hospital routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSession = { userId: 'u-1', email: 'admin@test.com', roles: ['ADMIN'], hospitalId: null };
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/hospitals — create
  // -----------------------------------------------------------------------
  describe('POST /api/v2/hospitals', () => {
    it('creates a hospital and returns 201', async () => {
      const created = { id: VALID_UUID };
      mockServices.createHospital.execute.mockResolvedValue(created);

      const body = {
        name: 'Test Hospital',
        type: 'COSMETIC',
        contactEmail: 'hospital@test.com',
        specialties: ['Cosmetic Surgery'],
      };

      const res = await app.request('/api/v2/hospitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toEqual(created);
      expect(mockServices.createHospital.execute).toHaveBeenCalledOnce();
    });

    it('rejects invalid body (missing name)', async () => {
      const res = await app.request('/api/v2/hospitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'COSMETIC', contactEmail: 'hospital@test.com' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createHospital.execute).not.toHaveBeenCalled();
    });

    it('rejects invalid body (invalid email)', async () => {
      const res = await app.request('/api/v2/hospitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Hospital', type: 'COSMETIC', contactEmail: 'not-an-email' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createHospital.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/hospitals — list
  // -----------------------------------------------------------------------
  describe('GET /api/v2/hospitals', () => {
    it('returns 200 with paginated results', async () => {
      const payload = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasMore: false,
      };
      mockServices.listHospitals.execute.mockResolvedValue(payload);

      const res = await app.request('/api/v2/hospitals');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(payload);
      expect(mockServices.listHospitals.execute).toHaveBeenCalledOnce();
    });

    it('passes query params to use case', async () => {
      const payload = { data: [], total: 0, page: 2, limit: 10, totalPages: 0, hasMore: false };
      mockServices.listHospitals.execute.mockResolvedValue(payload);

      const res = await app.request('/api/v2/hospitals?page=2&limit=10&status=ACTIVE');
      expect(res.status).toBe(200);

      const [query] = mockServices.listHospitals.execute.mock.calls[0]!;
      expect(query).toMatchObject({ page: 2, limit: 10, status: 'ACTIVE' });
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/hospitals/:id — get by id
  // -----------------------------------------------------------------------
  describe('GET /api/v2/hospitals/:id', () => {
    it('returns 200 with hospital detail', async () => {
      const detail = { id: VALID_UUID, name: 'Test Hospital' };
      mockServices.getHospital.execute.mockResolvedValue(detail);

      const res = await app.request(`/api/v2/hospitals/${VALID_UUID}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(detail);
      expect(mockServices.getHospital.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/hospitals/not-a-uuid');
      expect(res.status).toBe(400);
      expect(mockServices.getHospital.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v2/hospitals/:id — update
  // -----------------------------------------------------------------------
  describe('PUT /api/v2/hospitals/:id', () => {
    it('updates a hospital and returns 200', async () => {
      const updated = { id: VALID_UUID, name: 'Updated Hospital' };
      mockServices.updateHospital.execute.mockResolvedValue(updated);

      const res = await app.request(`/api/v2/hospitals/${VALID_UUID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Hospital' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(updated);
      expect(mockServices.updateHospital.execute).toHaveBeenCalledWith(
        expect.objectContaining({ id: VALID_UUID, name: 'Updated Hospital' }),
        expect.anything(),
      );
    });

    it('returns 400 for invalid UUID in params', async () => {
      const res = await app.request('/api/v2/hospitals/not-a-uuid', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Updated Hospital' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.updateHospital.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v2/hospitals/:id/status — update status
  // -----------------------------------------------------------------------
  describe('PATCH /api/v2/hospitals/:id/status', () => {
    it('updates hospital status and returns 200', async () => {
      const result = { id: VALID_UUID, status: 'ACTIVE' };
      mockServices.updateHospitalStatus.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/hospitals/${VALID_UUID}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'ACTIVE' }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.updateHospitalStatus.execute).toHaveBeenCalledWith(
        { id: VALID_UUID, status: 'ACTIVE' },
        expect.anything(),
      );
    });

    it('rejects invalid status value', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_UUID}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'INVALID_STATUS' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.updateHospitalStatus.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/hospitals/:id/cases — get hospital cases
  // -----------------------------------------------------------------------
  describe('GET /api/v2/hospitals/:id/cases', () => {
    it('returns 200 with paginated cases for a hospital', async () => {
      const payload = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
        hasMore: false,
      };
      mockServices.getHospitalCases.execute.mockResolvedValue(payload);

      const res = await app.request(`/api/v2/hospitals/${VALID_UUID}/cases`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(payload);
      expect(mockServices.getHospitalCases.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.anything(),
        expect.anything(),
      );
    });

    it('returns 400 for invalid UUID in params', async () => {
      const res = await app.request('/api/v2/hospitals/not-a-uuid/cases');
      expect(res.status).toBe(400);
      expect(mockServices.getHospitalCases.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/hospitals/:id/registration-token — generate token
  // -----------------------------------------------------------------------
  describe('POST /api/v2/hospitals/:id/registration-token', () => {
    it('generates a registration token and returns 201', async () => {
      const result = { token: 'abc123', expiresAt: '2026-03-20T00:00:00.000Z' };
      mockServices.generateRegistrationToken.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/hospitals/${VALID_UUID}/registration-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'staff@hospital.com' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.generateRegistrationToken.execute).toHaveBeenCalledWith(
        VALID_UUID,
        'staff@hospital.com',
        expect.anything(),
      );
    });

    it('rejects invalid email', async () => {
      const res = await app.request(`/api/v2/hospitals/${VALID_UUID}/registration-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.generateRegistrationToken.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/auth/hospital/register — register hospital user (PUBLIC)
  // -----------------------------------------------------------------------
  describe('POST /api/v2/auth/hospital/register', () => {
    it('registers a hospital user and returns 201', async () => {
      const result = { id: VALID_UUID, username: 'newuser' };
      mockServices.registerHospitalUser.execute.mockResolvedValue(result);

      const res = await app.request('/api/v2/auth/hospital/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'valid-token', username: 'newuser', password: 'password123' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual(result);

      // Verify it calls execute WITHOUT an actor parameter
      expect(mockServices.registerHospitalUser.execute).toHaveBeenCalledOnce();
      expect(mockServices.registerHospitalUser.execute).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'valid-token', username: 'newuser', password: 'password123' }),
      );
      // Ensure no second argument (actor) was passed
      const callArgs = mockServices.registerHospitalUser.execute.mock.calls[0]!;
      expect(callArgs).toHaveLength(1);
    });

    it('rejects missing token', async () => {
      const res = await app.request('/api/v2/auth/hospital/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'newuser', password: 'password123' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.registerHospitalUser.execute).not.toHaveBeenCalled();
    });

    it('rejects short password', async () => {
      const res = await app.request('/api/v2/auth/hospital/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'valid-token', username: 'newuser', password: 'short' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.registerHospitalUser.execute).not.toHaveBeenCalled();
    });
  });
});
