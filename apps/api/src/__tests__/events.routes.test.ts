import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — this MUST be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  listCaseEvents: { execute: vi.fn() },
  getCaseTimeline: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import eventRoutes from '../routes/events.routes.js';

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
app.route('/', eventRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Events routes', () => {
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
  // GET /api/v2/cases/:caseId/events — list events
  // -----------------------------------------------------------------------
  describe('GET /api/v2/cases/:caseId/events', () => {
    it('returns 200 with event list', async () => {
      const events = [
        { id: 'evt-1', caseId: VALID_UUID, eventType: 'CASE_CREATED' },
        { id: 'evt-2', caseId: VALID_UUID, eventType: 'CASE_DISTRIBUTED' },
      ];
      mockServices.listCaseEvents.execute.mockResolvedValue(events);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/events`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(events);
      expect(mockServices.listCaseEvents.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.anything(),
      );
    });

    it('returns 200 with empty array when no events', async () => {
      mockServices.listCaseEvents.execute.mockResolvedValue([]);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/events`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/cases/not-a-uuid/events');
      expect(res.status).toBe(400);
      expect(mockServices.listCaseEvents.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/cases/:caseId/timeline — get timeline
  // -----------------------------------------------------------------------
  describe('GET /api/v2/cases/:caseId/timeline', () => {
    it('returns 200 with timeline items', async () => {
      const timeline = [
        { id: 'evt-1', source: 'event', type: 'CASE_CREATED', timestamp: '2026-01-15T10:00:00.000Z', data: {} },
        { id: 'evt-2', source: 'event', type: 'QUOTE_SENT', timestamp: '2026-01-10T10:00:00.000Z', data: {} },
      ];
      mockServices.getCaseTimeline.execute.mockResolvedValue(timeline);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/timeline`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(timeline);
      expect(mockServices.getCaseTimeline.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.anything(),
      );
    });

    it('returns 200 with empty array when no timeline items', async () => {
      mockServices.getCaseTimeline.execute.mockResolvedValue([]);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/timeline`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual([]);
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/cases/not-a-uuid/timeline');
      expect(res.status).toBe(400);
      expect(mockServices.getCaseTimeline.execute).not.toHaveBeenCalled();
    });
  });
});
