import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — this MUST be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  getCaseJourney: { execute: vi.fn() },
  updateCaseJourney: { execute: vi.fn() },
  listMilestones: { execute: vi.fn() },
  createMilestone: { execute: vi.fn() },
  updateMilestone: { execute: vi.fn() },
  deleteMilestone: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import journeyRoutes from '../routes/journey.routes.js';

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
app.route('/', journeyRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_CASE_ID = '00000000-0000-0000-0000-000000000001';
const VALID_MILESTONE_ID = '00000000-0000-0000-0000-000000000002';

const validJourneyBody = {
  visa: { status: 'approved' },
  insurance: { provider: 'AIG' },
};

const validCreateMilestone = {
  eventType: 'SURGERY_DATE',
  eventDate: '2026-04-15T00:00:00.000Z',
  note: 'Main procedure',
  isVisibleToPatient: true,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Journey routes', () => {
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
  // GET /api/v2/cases/{caseId}/journey
  // -----------------------------------------------------------------------
  describe('GET /api/v2/cases/{caseId}/journey', () => {
    it('returns 200 with journey data', async () => {
      const journey = { id: 'j-1', caseId: VALID_CASE_ID, visa: null };
      mockServices.getCaseJourney.execute.mockResolvedValue(journey);

      const res = await app.request(`/api/v2/cases/${VALID_CASE_ID}/journey`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(journey);
      expect(mockServices.getCaseJourney.execute).toHaveBeenCalledOnce();
    });

    it('returns 200 with null when no journey exists', async () => {
      mockServices.getCaseJourney.execute.mockResolvedValue(null);

      const res = await app.request(`/api/v2/cases/${VALID_CASE_ID}/journey`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toBeNull();
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/cases/not-a-uuid/journey');
      expect(res.status).toBe(400);
      expect(mockServices.getCaseJourney.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v2/cases/{caseId}/journey
  // -----------------------------------------------------------------------
  describe('PUT /api/v2/cases/{caseId}/journey', () => {
    it('updates journey and returns 200', async () => {
      const result = { id: 'j-1', caseId: VALID_CASE_ID, ...validJourneyBody };
      mockServices.updateCaseJourney.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/cases/${VALID_CASE_ID}/journey`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validJourneyBody),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.updateCaseJourney.execute).toHaveBeenCalledOnce();
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/cases/not-a-uuid/journey', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validJourneyBody),
      });
      expect(res.status).toBe(400);
      expect(mockServices.updateCaseJourney.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/cases/{caseId}/milestones
  // -----------------------------------------------------------------------
  describe('GET /api/v2/cases/{caseId}/milestones', () => {
    it('returns 200 with list of milestones', async () => {
      const milestones = [{ id: 'm-1', eventType: 'SURGERY_DATE' }];
      mockServices.listMilestones.execute.mockResolvedValue(milestones);

      const res = await app.request(`/api/v2/cases/${VALID_CASE_ID}/milestones`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(milestones);
      expect(mockServices.listMilestones.execute).toHaveBeenCalledOnce();
    });

    it('passes visibleOnly query param', async () => {
      mockServices.listMilestones.execute.mockResolvedValue([]);

      await app.request(`/api/v2/cases/${VALID_CASE_ID}/milestones?visibleOnly=true`);
      const [_caseId, _actor, options] = mockServices.listMilestones.execute.mock.calls[0]!;
      expect(options).toEqual({ visibleOnly: true });
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/cases/not-a-uuid/milestones');
      expect(res.status).toBe(400);
      expect(mockServices.listMilestones.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/cases/{caseId}/milestones
  // -----------------------------------------------------------------------
  describe('POST /api/v2/cases/{caseId}/milestones', () => {
    it('creates a milestone and returns 201', async () => {
      const result = { id: VALID_MILESTONE_ID, ...validCreateMilestone };
      mockServices.createMilestone.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/cases/${VALID_CASE_ID}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validCreateMilestone),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.createMilestone.execute).toHaveBeenCalledOnce();
    });

    it('rejects missing eventType', async () => {
      const { eventType: _et, ...incomplete } = validCreateMilestone;
      const res = await app.request(`/api/v2/cases/${VALID_CASE_ID}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incomplete),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMilestone.execute).not.toHaveBeenCalled();
    });

    it('rejects invalid eventType', async () => {
      const res = await app.request(`/api/v2/cases/${VALID_CASE_ID}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateMilestone, eventType: 'INVALID_TYPE' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMilestone.execute).not.toHaveBeenCalled();
    });

    it('rejects missing eventDate', async () => {
      const { eventDate: _ed, ...incomplete } = validCreateMilestone;
      const res = await app.request(`/api/v2/cases/${VALID_CASE_ID}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incomplete),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createMilestone.execute).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/cases/not-a-uuid/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validCreateMilestone),
      });
      expect(res.status).toBe(400);
      expect(mockServices.createMilestone.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v2/cases/{caseId}/milestones/{id}
  // -----------------------------------------------------------------------
  describe('PATCH /api/v2/cases/{caseId}/milestones/{id}', () => {
    it('updates a milestone and returns 200', async () => {
      const result = { id: VALID_MILESTONE_ID, note: 'Updated' };
      mockServices.updateMilestone.execute.mockResolvedValue(result);

      const res = await app.request(
        `/api/v2/cases/${VALID_CASE_ID}/milestones/${VALID_MILESTONE_ID}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: 'Updated' }),
        },
      );

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.updateMilestone.execute).toHaveBeenCalledWith(
        VALID_MILESTONE_ID,
        { note: 'Updated' },
        expect.anything(),
      );
    });

    it('returns 400 for invalid milestone UUID', async () => {
      const res = await app.request(
        `/api/v2/cases/${VALID_CASE_ID}/milestones/not-a-uuid`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: 'Updated' }),
        },
      );
      expect(res.status).toBe(400);
      expect(mockServices.updateMilestone.execute).not.toHaveBeenCalled();
    });

    it('rejects invalid eventType in update', async () => {
      const res = await app.request(
        `/api/v2/cases/${VALID_CASE_ID}/milestones/${VALID_MILESTONE_ID}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventType: 'INVALID' }),
        },
      );
      expect(res.status).toBe(400);
      expect(mockServices.updateMilestone.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /api/v2/cases/{caseId}/milestones/{id}
  // -----------------------------------------------------------------------
  describe('DELETE /api/v2/cases/{caseId}/milestones/{id}', () => {
    it('deletes a milestone and returns 204', async () => {
      mockServices.deleteMilestone.execute.mockResolvedValue(undefined);

      const res = await app.request(
        `/api/v2/cases/${VALID_CASE_ID}/milestones/${VALID_MILESTONE_ID}`,
        { method: 'DELETE' },
      );

      expect(res.status).toBe(204);
      expect(mockServices.deleteMilestone.execute).toHaveBeenCalledWith(
        VALID_MILESTONE_ID,
        expect.anything(),
      );
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request(
        `/api/v2/cases/${VALID_CASE_ID}/milestones/not-a-uuid`,
        { method: 'DELETE' },
      );
      expect(res.status).toBe(400);
      expect(mockServices.deleteMilestone.execute).not.toHaveBeenCalled();
    });
  });
});
