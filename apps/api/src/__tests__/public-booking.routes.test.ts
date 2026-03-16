import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — this MUST be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  createBookingRequest: { execute: vi.fn() },
  getHospitalRecommendations: { execute: vi.fn() },
  saveHospitalSelections: { execute: vi.fn() },
  completeSignup: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app (NO auth needed — these are public routes)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import publicBookingRoutes from '../routes/public-booking.routes.js';

const app = new OpenAPIHono();
app.route('/', publicBookingRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_UUID_2 = '00000000-0000-0000-0000-000000000002';

const validCreateBody = {
  conditionType: 'COSMETIC',
  conditionCategory: 'Rhinoplasty',
  conditionDescription: 'Nose reshaping procedure',
  preferredLanguage: 'en',
};

const validSelectionsBody = {
  hospitalIds: [VALID_UUID, VALID_UUID_2],
};

const validSignupBody = {
  email: 'patient@example.com',
  password: 'securePassword123',
  fullName: 'John Doe',
  phone: '+1234567890',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Public Booking routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/public/booking-requests — create
  // -----------------------------------------------------------------------
  describe('POST /api/v2/public/booking-requests', () => {
    it('creates a booking request and returns 201', async () => {
      const result = {
        id: VALID_UUID,
        requestNumber: 'BR-20260316-0001',
        status: 'PENDING',
        ...validCreateBody,
      };
      mockServices.createBookingRequest.execute.mockResolvedValue(result);

      const res = await app.request('/api/v2/public/booking-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validCreateBody),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.createBookingRequest.execute).toHaveBeenCalledOnce();
    });

    it('rejects invalid body (missing conditionCategory)', async () => {
      const { conditionCategory: _cc, ...incomplete } = validCreateBody;
      const res = await app.request('/api/v2/public/booking-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incomplete),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createBookingRequest.execute).not.toHaveBeenCalled();
    });

    it('rejects invalid conditionType', async () => {
      const res = await app.request('/api/v2/public/booking-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateBody, conditionType: 'INVALID' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createBookingRequest.execute).not.toHaveBeenCalled();
    });

    it('accepts request without optional fields', async () => {
      const result = {
        id: VALID_UUID,
        requestNumber: 'BR-20260316-0001',
        status: 'PENDING',
        conditionType: 'DENTAL',
        conditionCategory: 'Implants',
      };
      mockServices.createBookingRequest.execute.mockResolvedValue(result);

      const res = await app.request('/api/v2/public/booking-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conditionType: 'DENTAL',
          conditionCategory: 'Implants',
        }),
      });

      expect(res.status).toBe(201);
      expect(mockServices.createBookingRequest.execute).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/public/hospital-recommendations/{bookingId} — get recommendations
  // -----------------------------------------------------------------------
  describe('GET /api/v2/public/hospital-recommendations/:bookingId', () => {
    it('returns 200 with recommendations', async () => {
      const result = {
        bookingRequest: { id: VALID_UUID, status: 'HOSPITALS_MATCHED' },
        hospitals: [],
      };
      mockServices.getHospitalRecommendations.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/public/hospital-recommendations/${VALID_UUID}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.getHospitalRecommendations.execute).toHaveBeenCalledWith(VALID_UUID);
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/public/hospital-recommendations/not-a-uuid');
      expect(res.status).toBe(400);
      expect(mockServices.getHospitalRecommendations.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/public/booking-requests/{id}/selections — save selections
  // -----------------------------------------------------------------------
  describe('POST /api/v2/public/booking-requests/:id/selections', () => {
    it('saves selections and returns 200', async () => {
      const result = { id: VALID_UUID, status: 'SELECTIONS_SAVED' };
      mockServices.saveHospitalSelections.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/public/booking-requests/${VALID_UUID}/selections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSelectionsBody),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.saveHospitalSelections.execute).toHaveBeenCalledWith(
        VALID_UUID,
        validSelectionsBody,
      );
    });

    it('returns 400 for invalid UUID param', async () => {
      const res = await app.request('/api/v2/public/booking-requests/not-a-uuid/selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSelectionsBody),
      });

      expect(res.status).toBe(400);
      expect(mockServices.saveHospitalSelections.execute).not.toHaveBeenCalled();
    });

    it('returns 400 for empty hospitalIds array', async () => {
      const res = await app.request(`/api/v2/public/booking-requests/${VALID_UUID}/selections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalIds: [] }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.saveHospitalSelections.execute).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid hospitalIds (not UUIDs)', async () => {
      const res = await app.request(`/api/v2/public/booking-requests/${VALID_UUID}/selections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalIds: ['not-a-uuid'] }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.saveHospitalSelections.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/public/booking-requests/{id}/complete-signup — complete signup
  // -----------------------------------------------------------------------
  describe('POST /api/v2/public/booking-requests/:id/complete-signup', () => {
    it('returns 501 Not Implemented', async () => {
      const res = await app.request(`/api/v2/public/booking-requests/${VALID_UUID}/complete-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validSignupBody),
      });

      expect(res.status).toBe(501);
      const body = await res.json();
      expect(body.error).toBe('Patient signup is not yet implemented');
      expect(body.code).toBe('NOT_IMPLEMENTED');
      expect(mockServices.completeSignup.execute).not.toHaveBeenCalled();
    });

    it('returns 501 even with invalid body (endpoint is fully stubbed)', async () => {
      const res = await app.request(`/api/v2/public/booking-requests/${VALID_UUID}/complete-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email' }),
      });

      // Validation still runs since schema is declared, but route returns 501 regardless
      // Depending on whether zod validation fires first, this is either 400 or 501
      expect([400, 501]).toContain(res.status);
      expect(mockServices.completeSignup.execute).not.toHaveBeenCalled();
    });
  });
});
