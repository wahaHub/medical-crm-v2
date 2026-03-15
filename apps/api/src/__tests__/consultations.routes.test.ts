import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root
// ---------------------------------------------------------------------------
const mockServices = {
  createConsultation: { execute: vi.fn() },
  listConsultations: { execute: vi.fn() },
  getConsultation: { execute: vi.fn() },
  updateConsultation: { execute: vi.fn() },
  updateConsultationStatus: { execute: vi.fn() },
  getConsultationTranscript: { execute: vi.fn() },
  getConsultationStats: { execute: vi.fn() },
  listCaseConsultations: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build test app
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import consultationRoutes from '../routes/consultations.routes.js';

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

app.use('/api/v2/*', async (c, next) => {
  c.set('session', currentSession);
  await next();
});

app.route('/', consultationRoutes);

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_UUID_2 = '00000000-0000-0000-0000-000000000002';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Consultation routes', () => {
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
  // POST /api/v2/consultations
  // -----------------------------------------------------------------------
  describe('POST /api/v2/consultations', () => {
    it('creates a consultation and returns 201', async () => {
      const created = { id: VALID_UUID };
      mockServices.createConsultation.execute.mockResolvedValue(created);

      const res = await app.request('/api/v2/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId: VALID_UUID,
          hospitalId: VALID_UUID,
          patientId: VALID_UUID_2,
          scheduledAt: '2026-04-01T10:00:00Z',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual(created);
      expect(mockServices.createConsultation.execute).toHaveBeenCalledOnce();
    });

    it('rejects missing required fields', async () => {
      const res = await app.request('/api/v2/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId: VALID_UUID }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createConsultation.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/consultations
  // -----------------------------------------------------------------------
  describe('GET /api/v2/consultations', () => {
    it('returns 200 with cursor-paginated results', async () => {
      const payload = { data: [], nextCursor: null, hasMore: false };
      mockServices.listConsultations.execute.mockResolvedValue(payload);

      const res = await app.request('/api/v2/consultations');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(payload);
      expect(mockServices.listConsultations.execute).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/consultations/stats
  // -----------------------------------------------------------------------
  describe('GET /api/v2/consultations/stats', () => {
    it('returns 200 with stats', async () => {
      const stats = { total: 5, byStatus: {} };
      mockServices.getConsultationStats.execute.mockResolvedValue(stats);

      const res = await app.request('/api/v2/consultations/stats');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(stats);
      expect(mockServices.getConsultationStats.execute).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/consultations/:id
  // -----------------------------------------------------------------------
  describe('GET /api/v2/consultations/:id', () => {
    it('returns 200 with consultation detail', async () => {
      const detail = { id: VALID_UUID };
      mockServices.getConsultation.execute.mockResolvedValue(detail);

      const res = await app.request(`/api/v2/consultations/${VALID_UUID}`);
      expect(res.status).toBe(200);
      expect(mockServices.getConsultation.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/consultations/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // PUT /api/v2/consultations/:id
  // -----------------------------------------------------------------------
  describe('PUT /api/v2/consultations/:id', () => {
    it('updates a consultation and returns 200', async () => {
      const updated = { id: VALID_UUID, notes: 'Updated notes' };
      mockServices.updateConsultation.execute.mockResolvedValue(updated);

      const res = await app.request(`/api/v2/consultations/${VALID_UUID}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Updated notes' }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.updateConsultation.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.objectContaining({ notes: 'Updated notes' }),
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v2/consultations/:id/status
  // -----------------------------------------------------------------------
  describe('PATCH /api/v2/consultations/:id/status', () => {
    it('maps action to status and returns 200', async () => {
      const result = { id: VALID_UUID, status: 'IN_PROGRESS' };
      mockServices.updateConsultationStatus.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/consultations/${VALID_UUID}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });

      expect(res.status).toBe(200);
      expect(mockServices.updateConsultationStatus.execute).toHaveBeenCalledWith(
        VALID_UUID,
        'IN_PROGRESS',
        expect.anything(),
      );
    });

    it('rejects invalid action', async () => {
      const res = await app.request(`/api/v2/consultations/${VALID_UUID}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'INVALID' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.updateConsultationStatus.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/consultations/:id/transcript
  // -----------------------------------------------------------------------
  describe('GET /api/v2/consultations/:id/transcript', () => {
    it('returns 200 with transcript', async () => {
      const transcript = { consultationId: VALID_UUID, entries: [] };
      mockServices.getConsultationTranscript.execute.mockResolvedValue(transcript);

      const res = await app.request(`/api/v2/consultations/${VALID_UUID}/transcript`);
      expect(res.status).toBe(200);
      expect(mockServices.getConsultationTranscript.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/cases/:caseId/consultations
  // -----------------------------------------------------------------------
  describe('GET /api/v2/cases/:caseId/consultations', () => {
    it('returns 200 with case consultations', async () => {
      const consultations = [{ id: VALID_UUID }];
      mockServices.listCaseConsultations.execute.mockResolvedValue(consultations);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/consultations`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(consultations);
      expect(mockServices.listCaseConsultations.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
    });
  });
});
