import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — this MUST be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  createQuote: { execute: vi.fn() },
  updateQuote: { execute: vi.fn() },
  sendQuote: { execute: vi.fn() },
  listQuotes: { execute: vi.fn() },
  getQuote: { execute: vi.fn() },
  compareQuotes: { execute: vi.fn() },
  resendQuote: { execute: vi.fn() },
  acceptQuote: { execute: vi.fn() },
  rejectQuote: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import quoteRoutes from '../routes/quotes.routes.js';

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
app.route('/', quoteRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_UUID_2 = '00000000-0000-0000-0000-000000000002';

const validCreateBody = {
  caseId: VALID_UUID,
  hospitalId: VALID_UUID_2,
  totalAmount: '5000.00',
  currency: 'USD',
  validUntil: '2026-12-31T00:00:00.000Z',
  treatmentPlan: 'Standard plan',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Quotes routes', () => {
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
  // POST /api/v2/quotes — create
  // -----------------------------------------------------------------------
  describe('POST /api/v2/quotes', () => {
    it('creates a quote and returns 201', async () => {
      const quote = { id: VALID_UUID, ...validCreateBody, status: 'PENDING' };
      mockServices.createQuote.execute.mockResolvedValue(quote);

      const res = await app.request('/api/v2/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validCreateBody),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual(quote);
      expect(mockServices.createQuote.execute).toHaveBeenCalledOnce();
    });

    it('rejects invalid body (missing totalAmount)', async () => {
      const { totalAmount, ...incomplete } = validCreateBody;
      const res = await app.request('/api/v2/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incomplete),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createQuote.execute).not.toHaveBeenCalled();
    });

    it('rejects invalid totalAmount format', async () => {
      const res = await app.request('/api/v2/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateBody, totalAmount: 'abc' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createQuote.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/quotes — list
  // -----------------------------------------------------------------------
  describe('GET /api/v2/quotes', () => {
    it('returns 200 with paginated results', async () => {
      const payload = { data: [], total: 0, page: 1, limit: 20 };
      mockServices.listQuotes.execute.mockResolvedValue(payload);

      const res = await app.request('/api/v2/quotes');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(payload);
      expect(mockServices.listQuotes.execute).toHaveBeenCalledOnce();
    });

    it('passes query params to use case', async () => {
      const payload = { data: [], total: 0, page: 2, limit: 10 };
      mockServices.listQuotes.execute.mockResolvedValue(payload);

      const res = await app.request('/api/v2/quotes?page=2&limit=10&status=PENDING');
      expect(res.status).toBe(200);

      const [query] = mockServices.listQuotes.execute.mock.calls[0]!;
      expect(query).toMatchObject({ page: 2, limit: 10, status: 'PENDING' });
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/quotes/:id — get by id
  // -----------------------------------------------------------------------
  describe('GET /api/v2/quotes/:id', () => {
    it('returns 200 with quote details', async () => {
      const quote = { id: VALID_UUID, status: 'PENDING' };
      mockServices.getQuote.execute.mockResolvedValue(quote);

      const res = await app.request(`/api/v2/quotes/${VALID_UUID}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(quote);
      expect(mockServices.getQuote.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/quotes/not-a-uuid');
      expect(res.status).toBe(400);
      expect(mockServices.getQuote.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v2/quotes/:id — update
  // -----------------------------------------------------------------------
  describe('PATCH /api/v2/quotes/:id', () => {
    it('updates a quote and returns 200', async () => {
      const updated = { id: VALID_UUID, totalAmount: '6000.00' };
      mockServices.updateQuote.execute.mockResolvedValue(updated);

      const res = await app.request(`/api/v2/quotes/${VALID_UUID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalAmount: '6000.00' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(updated);
      expect(mockServices.updateQuote.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.objectContaining({ totalAmount: '6000.00' }),
        expect.anything(),
      );
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/quotes/not-a-uuid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalAmount: '6000.00' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.updateQuote.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/quotes/:id/send — send
  // -----------------------------------------------------------------------
  describe('POST /api/v2/quotes/:id/send', () => {
    it('sends a quote and returns 200', async () => {
      const result = { id: VALID_UUID, isDraft: false };
      mockServices.sendQuote.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/quotes/${VALID_UUID}/send`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.sendQuote.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/quotes/not-a-uuid/send', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      expect(mockServices.sendQuote.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/quotes/:id/accept — accept
  // -----------------------------------------------------------------------
  describe('POST /api/v2/quotes/:id/accept', () => {
    it('accepts a quote and returns 200', async () => {
      const result = { id: VALID_UUID, status: 'ACCEPTED' };
      mockServices.acceptQuote.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/quotes/${VALID_UUID}/accept`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.acceptQuote.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/quotes/not-a-uuid/accept', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      expect(mockServices.acceptQuote.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/quotes/:id/reject — reject
  // -----------------------------------------------------------------------
  describe('POST /api/v2/quotes/:id/reject', () => {
    it('rejects a quote and returns 200', async () => {
      const result = { id: VALID_UUID, status: 'REJECTED' };
      mockServices.rejectQuote.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/quotes/${VALID_UUID}/reject`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.rejectQuote.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/quotes/not-a-uuid/reject', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      expect(mockServices.rejectQuote.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/quotes/:id/resend — resend
  // -----------------------------------------------------------------------
  describe('POST /api/v2/quotes/:id/resend', () => {
    it('resends a quote and returns 200', async () => {
      const result = { id: VALID_UUID, status: 'PENDING' };
      mockServices.resendQuote.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/quotes/${VALID_UUID}/resend`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.resendQuote.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/quotes/not-a-uuid/resend', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      expect(mockServices.resendQuote.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/cases/:caseId/quotes/compare — compare quotes
  // -----------------------------------------------------------------------
  describe('GET /api/v2/cases/:caseId/quotes/compare', () => {
    it('returns 200 with comparison data', async () => {
      const result = [{ id: VALID_UUID }, { id: VALID_UUID_2 }];
      mockServices.compareQuotes.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/cases/${VALID_UUID}/quotes/compare`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.compareQuotes.execute).toHaveBeenCalledWith(
        VALID_UUID,
        expect.anything(),
      );
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/cases/bad-id/quotes/compare');
      expect(res.status).toBe(400);
      expect(mockServices.compareQuotes.execute).not.toHaveBeenCalled();
    });
  });
});
