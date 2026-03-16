import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — this MUST be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  createOrder: { execute: vi.fn() },
  listOrders: { execute: vi.fn() },
  getOrder: { execute: vi.fn() },
  updateOrderStatus: { execute: vi.fn() },
  createPaymentIntent: { execute: vi.fn() },
  requestRefund: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import orderRoutes from '../routes/orders.routes.js';

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
app.route('/', orderRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '00000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Orders routes', () => {
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
  // POST /api/v2/orders — CreateOrder
  // -----------------------------------------------------------------------
  describe('POST /api/v2/orders', () => {
    it('returns 201 on success', async () => {
      const order = { id: VALID_UUID, orderNumber: 'ORD-20260316-0001', status: 'PENDING_PAYMENT' };
      mockServices.createOrder.execute.mockResolvedValue(order);

      const res = await app.request('/api/v2/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'PACKAGE',
          amount: '1000.00',
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.status).toBe('PENDING_PAYMENT');
      expect(mockServices.createOrder.execute).toHaveBeenCalledOnce();
    });

    it('returns 400 for missing required fields', async () => {
      const res = await app.request('/api/v2/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createOrder.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/orders — ListOrders
  // -----------------------------------------------------------------------
  describe('GET /api/v2/orders', () => {
    it('returns 200 with list', async () => {
      const result = { data: [], total: 0, page: 1, limit: 20 };
      mockServices.listOrders.execute.mockResolvedValue(result);

      const res = await app.request('/api/v2/orders');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/orders/{id} — GetOrder
  // -----------------------------------------------------------------------
  describe('GET /api/v2/orders/{id}', () => {
    it('returns 200 for valid UUID', async () => {
      const order = { id: VALID_UUID, orderNumber: 'ORD-20260316-0001' };
      mockServices.getOrder.execute.mockResolvedValue(order);

      const res = await app.request(`/api/v2/orders/${VALID_UUID}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe(VALID_UUID);
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/orders/not-a-uuid');
      expect(res.status).toBe(400);
      expect(mockServices.getOrder.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v2/orders/{id}/status — UpdateOrderStatus
  // -----------------------------------------------------------------------
  describe('PATCH /api/v2/orders/{id}/status', () => {
    it('returns 200 on success', async () => {
      const order = { id: VALID_UUID, status: 'PAID' };
      mockServices.updateOrderStatus.execute.mockResolvedValue(order);

      const res = await app.request(`/api/v2/orders/${VALID_UUID}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PAID' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('PAID');
    });

    it('returns 400 for invalid status', async () => {
      const res = await app.request(`/api/v2/orders/${VALID_UUID}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'INVALID_STATUS' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.updateOrderStatus.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/orders/{id}/payment-intents — CreatePaymentIntent
  // -----------------------------------------------------------------------
  describe('POST /api/v2/orders/{id}/payment-intents', () => {
    it('returns 200 on success', async () => {
      const intent = { clientSecret: 'pi_mock_xxx', orderId: VALID_UUID };
      mockServices.createPaymentIntent.execute.mockResolvedValue(intent);

      const res = await app.request(`/api/v2/orders/${VALID_UUID}/payment-intents`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.clientSecret).toBe('pi_mock_xxx');
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/orders/not-a-uuid/payment-intents', {
        method: 'POST',
      });
      expect(res.status).toBe(400);
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/orders/{id}/refunds — RequestRefund
  // -----------------------------------------------------------------------
  describe('POST /api/v2/orders/{id}/refunds', () => {
    it('returns 200 on success', async () => {
      const order = { id: VALID_UUID, status: 'REFUNDED' };
      mockServices.requestRefund.execute.mockResolvedValue(order);

      const res = await app.request(`/api/v2/orders/${VALID_UUID}/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: '500.00',
          reason: 'Customer request',
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('REFUNDED');
    });

    it('returns 400 for missing fields', async () => {
      const res = await app.request(`/api/v2/orders/${VALID_UUID}/refunds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
      expect(mockServices.requestRefund.execute).not.toHaveBeenCalled();
    });
  });
});
