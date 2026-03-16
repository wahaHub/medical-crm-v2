import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — this MUST be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  addHospitalToCase: { execute: vi.fn() },
  removeHospitalFromCase: { execute: vi.fn() },
  sendReminder: { execute: vi.fn() },
  listCaseHospitalContacts: { execute: vi.fn() },
  adminResetAssignment: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import hospitalContactRoutes from '../routes/hospital-contacts.routes.js';

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
app.route('/', hospitalContactRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_UUID_2 = '00000000-0000-0000-0000-000000000002';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Hospital Contacts routes', () => {
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
  // POST /api/v2/cases/:caseId/hospital-contacts — add hospital
  // -----------------------------------------------------------------------
  describe('POST /api/v2/cases/:caseId/hospital-contacts', () => {
    it('adds a hospital to a case and returns 201', async () => {
      const chc = { id: VALID_UUID, caseId: VALID_UUID, hospitalId: VALID_UUID_2 };
      mockServices.addHospitalToCase.execute.mockResolvedValue(chc);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/hospital-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: VALID_UUID_2 }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual(chc);
      expect(mockServices.addHospitalToCase.execute).toHaveBeenCalledWith(
        VALID_UUID,
        VALID_UUID_2,
        expect.anything(),
      );
    });

    it('rejects non-UUID hospitalId', async () => {
      const res = await app.request(`/api/v2/cases/${VALID_UUID}/hospital-contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: 'not-a-uuid' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.addHospitalToCase.execute).not.toHaveBeenCalled();
    });

    it('rejects non-UUID caseId param', async () => {
      const res = await app.request('/api/v2/cases/bad-id/hospital-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: VALID_UUID }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.addHospitalToCase.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/cases/:caseId/hospital-contacts — list
  // -----------------------------------------------------------------------
  describe('GET /api/v2/cases/:caseId/hospital-contacts', () => {
    it('returns 200 with list of contacts', async () => {
      const payload = { data: [], total: 0, page: 1, limit: 20 };
      mockServices.listCaseHospitalContacts.execute.mockResolvedValue(payload);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/hospital-contacts`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(payload);
      expect(mockServices.listCaseHospitalContacts.execute).toHaveBeenCalledOnce();

      // Verify the caseId is passed through the query
      const [query] = mockServices.listCaseHospitalContacts.execute.mock.calls[0]!;
      expect(query.caseId).toBe(VALID_UUID);
    });

    it('rejects non-UUID caseId param', async () => {
      const res = await app.request('/api/v2/cases/bad-id/hospital-contacts');
      expect(res.status).toBe(400);
      expect(mockServices.listCaseHospitalContacts.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v2/hospital-contacts/:id/remove — remove
  // -----------------------------------------------------------------------
  describe('PATCH /api/v2/hospital-contacts/:id/remove', () => {
    it('removes a hospital contact and returns 200', async () => {
      const result = { id: VALID_UUID, removedAt: new Date().toISOString() };
      mockServices.removeHospitalFromCase.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/hospital-contacts/${VALID_UUID}/remove`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'No longer needed' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.removeHospitalFromCase.execute).toHaveBeenCalledWith(
        VALID_UUID,
        'No longer needed',
        expect.anything(),
      );
    });

    it('allows removal without reason', async () => {
      const result = { id: VALID_UUID };
      mockServices.removeHospitalFromCase.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/hospital-contacts/${VALID_UUID}/remove`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(200);
      expect(mockServices.removeHospitalFromCase.execute).toHaveBeenCalledWith(
        VALID_UUID,
        undefined,
        expect.anything(),
      );
    });

    it('rejects non-UUID id param', async () => {
      const res = await app.request('/api/v2/hospital-contacts/bad-id/remove', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      expect(mockServices.removeHospitalFromCase.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/hospital-contacts/:id/remind — send reminder
  // -----------------------------------------------------------------------
  describe('POST /api/v2/hospital-contacts/:id/remind', () => {
    it('sends a reminder and returns 200', async () => {
      const result = { id: VALID_UUID, reminderSentAt: new Date().toISOString() };
      mockServices.sendReminder.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/hospital-contacts/${VALID_UUID}/remind`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.sendReminder.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.anything(),
      );
    });

    it('rejects non-UUID id param', async () => {
      const res = await app.request('/api/v2/hospital-contacts/bad-id/remind', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      expect(mockServices.sendReminder.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/cases/:caseId/reset-assignment — admin reset
  // -----------------------------------------------------------------------
  describe('POST /api/v2/cases/:caseId/reset-assignment', () => {
    it('resets assignment and returns 204', async () => {
      mockServices.adminResetAssignment.execute.mockResolvedValue(undefined);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/reset-assignment`, {
        method: 'POST',
      });

      expect(res.status).toBe(204);
      expect(mockServices.adminResetAssignment.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.anything(),
      );
    });

    it('rejects non-UUID caseId param', async () => {
      const res = await app.request('/api/v2/cases/bad-id/reset-assignment', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      expect(mockServices.adminResetAssignment.execute).not.toHaveBeenCalled();
    });
  });
});
