import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — this MUST be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  createTicket: { execute: vi.fn() },
  listTickets: { execute: vi.fn() },
  getTicket: { execute: vi.fn() },
  assignTicket: { execute: vi.fn() },
  replyToTicket: { execute: vi.fn() },
  updateTicketStatus: { execute: vi.fn() },
  closeTicket: { execute: vi.fn() },
  notifyAdminsOfNewTicket: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import ticketRoutes from '../routes/tickets.routes.js';

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
app.route('/', ticketRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const VALID_UUID_2 = '00000000-0000-0000-0000-000000000002';

const validCreateBody = {
  type: 'GENERAL_QUESTIONS',
  description: 'I need help with my account',
  subject: 'Account issue',
  priority: 'MEDIUM',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Tickets routes', () => {
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
  // POST /api/v2/tickets — create
  // -----------------------------------------------------------------------
  describe('POST /api/v2/tickets', () => {
    it('creates a ticket and returns 201', async () => {
      const ticket = { id: VALID_UUID, ticketNumber: 'TKT-20260418-0001', patientId: 'u-1', ...validCreateBody, status: 'OPEN' };
      mockServices.createTicket.execute.mockResolvedValue(ticket);

      const res = await app.request('/api/v2/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validCreateBody),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual(ticket);
      expect(mockServices.createTicket.execute).toHaveBeenCalledOnce();
      expect(mockServices.notifyAdminsOfNewTicket.execute).toHaveBeenCalledWith({
        ticketId: VALID_UUID,
        ticketNumber: 'TKT-20260418-0001',
        patientId: 'u-1',
        patientName: null,
        subject: 'Account issue',
        descriptionPreview: 'I need help with my account',
      });
    });

    it('rejects invalid body (missing description)', async () => {
      const { description: _description, ...incomplete } = validCreateBody;
      const res = await app.request('/api/v2/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incomplete),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createTicket.execute).not.toHaveBeenCalled();
    });

    it('rejects invalid type', async () => {
      const res = await app.request('/api/v2/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...validCreateBody, type: 'INVALID_TYPE' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.createTicket.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/tickets — list
  // -----------------------------------------------------------------------
  describe('GET /api/v2/tickets', () => {
    it('returns 200 with paginated results', async () => {
      const payload = { data: [], total: 0, page: 1, limit: 20 };
      mockServices.listTickets.execute.mockResolvedValue(payload);

      const res = await app.request('/api/v2/tickets');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(payload);
      expect(mockServices.listTickets.execute).toHaveBeenCalledOnce();
    });

    it('passes query params to use case', async () => {
      const payload = { data: [], total: 0, page: 2, limit: 10 };
      mockServices.listTickets.execute.mockResolvedValue(payload);

      const res = await app.request('/api/v2/tickets?page=2&limit=10&status=OPEN');
      expect(res.status).toBe(200);

      const [query] = mockServices.listTickets.execute.mock.calls[0]!;
      expect(query).toMatchObject({ page: 2, limit: 10, status: 'OPEN' });
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/tickets/:id — get by id
  // -----------------------------------------------------------------------
  describe('GET /api/v2/tickets/:id', () => {
    it('returns 200 with ticket details and replies', async () => {
      const result = { ticket: { id: VALID_UUID, status: 'OPEN' }, replies: [] };
      mockServices.getTicket.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/tickets/${VALID_UUID}`);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.getTicket.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/tickets/not-a-uuid');
      expect(res.status).toBe(400);
      expect(mockServices.getTicket.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/tickets/:id/assign — assign
  // -----------------------------------------------------------------------
  describe('POST /api/v2/tickets/:id/assign', () => {
    it('assigns a ticket and returns 200', async () => {
      const result = { id: VALID_UUID, status: 'ASSIGNED', assignedTo: VALID_UUID_2 };
      mockServices.assignTicket.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/tickets/${VALID_UUID}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTo: VALID_UUID_2 }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.assignTicket.execute).toHaveBeenCalledWith(
        VALID_UUID,
        VALID_UUID_2,
        expect.anything(),
      );
    });

    it('returns 400 for invalid UUID param', async () => {
      const res = await app.request('/api/v2/tickets/not-a-uuid/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTo: VALID_UUID_2 }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.assignTicket.execute).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid assignedTo', async () => {
      const res = await app.request(`/api/v2/tickets/${VALID_UUID}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTo: 'not-a-uuid' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.assignTicket.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/tickets/:id/reply — reply
  // -----------------------------------------------------------------------
  describe('POST /api/v2/tickets/:id/reply', () => {
    it('creates a reply and returns 201', async () => {
      const result = { id: VALID_UUID_2, content: 'My reply' };
      mockServices.replyToTicket.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/tickets/${VALID_UUID}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'My reply' }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.replyToTicket.execute).toHaveBeenCalledOnce();
    });

    it('returns 400 for empty content', async () => {
      const res = await app.request(`/api/v2/tickets/${VALID_UUID}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: '' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.replyToTicket.execute).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/tickets/not-a-uuid/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'reply' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.replyToTicket.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // PATCH /api/v2/tickets/:id/status — update status
  // -----------------------------------------------------------------------
  describe('PATCH /api/v2/tickets/:id/status', () => {
    it('updates ticket status and returns 200', async () => {
      const result = { id: VALID_UUID, status: 'RESOLVED' };
      mockServices.updateTicketStatus.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/tickets/${VALID_UUID}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RESOLVED' }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.updateTicketStatus.execute).toHaveBeenCalledWith(
        VALID_UUID,
        'RESOLVED',
        expect.anything(),
      );
    });

    it('returns 400 for invalid status', async () => {
      const res = await app.request(`/api/v2/tickets/${VALID_UUID}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'INVALID' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.updateTicketStatus.execute).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/tickets/not-a-uuid/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'RESOLVED' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.updateTicketStatus.execute).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/tickets/:id/close — close
  // -----------------------------------------------------------------------
  describe('POST /api/v2/tickets/:id/close', () => {
    it('closes a ticket and returns 200', async () => {
      const result = { id: VALID_UUID, status: 'CLOSED' };
      mockServices.closeTicket.execute.mockResolvedValue(result);

      const res = await app.request(`/api/v2/tickets/${VALID_UUID}/close`, {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual(result);
      expect(mockServices.closeTicket.execute).toHaveBeenCalledWith(VALID_UUID, expect.anything());
    });

    it('returns 400 for invalid UUID', async () => {
      const res = await app.request('/api/v2/tickets/not-a-uuid/close', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      expect(mockServices.closeTicket.execute).not.toHaveBeenCalled();
    });
  });
});
