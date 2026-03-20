import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — must be declared before importing routes
// ---------------------------------------------------------------------------
const mockServices = {
  createTicket: { execute: vi.fn() },
  listTickets: { execute: vi.fn() },
  getTicket: { execute: vi.fn() },
  assignTicket: { execute: vi.fn() },
  replyToTicket: { execute: vi.fn() },
  updateTicketStatus: { execute: vi.fn() },
  closeTicket: { execute: vi.fn() },
  mediaUpload: { createUploadIntent: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import ticketRoutes from '../routes/tickets.routes.js';

const app = new OpenAPIHono();

const adminSession = {
  userId: 'u-1',
  email: 'admin@test.com',
  roles: ['ADMIN'],
  hospitalId: null,
};

app.use('/api/v2/*', async (c, next) => {
  c.set('session', adminSession);
  await next();
});

app.route('/', ticketRoutes);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TICKET_UUID = '00000000-0000-0000-0000-000000000001';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Ticket attachment upload route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServices.getTicket.execute.mockResolvedValue({ id: TICKET_UUID });
  });

  // -----------------------------------------------------------------------
  // POST /api/v2/tickets/:id/attachments/upload
  // -----------------------------------------------------------------------
  describe('POST /api/v2/tickets/:id/attachments/upload', () => {
    const validBody = {
      fileName: 'xray.jpg',
      fileSize: 204800,
      mimeType: 'image/jpeg',
    };

    it('returns 201 with upload URL and asset on success', async () => {
      const uploadIntentResult = {
        uploadUrl: 'https://storage.example.com/upload/xray.jpg',
        storageKey: 'crm/dev/tickets/ticket_reply/ticket-1/asset-1/xray.jpg',
        expiresIn: 600,
        asset: {
          fileName: 'xray.jpg',
          mimeType: 'image/jpeg',
          fileSize: 204800,
          storageKey: 'crm/dev/tickets/ticket_reply/ticket-1/asset-1/xray.jpg',
        },
      };
      mockServices.mediaUpload.createUploadIntent.mockResolvedValue(uploadIntentResult);

      const res = await app.request(`/api/v2/tickets/${TICKET_UUID}/attachments/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(201);
      const json = await res.json() as Record<string, unknown>;
      expect((json.upload as Record<string, unknown>).uploadUrl).toBe('https://storage.example.com/upload/xray.jpg');
      expect((json.upload as Record<string, unknown>).storageKey).toBe(uploadIntentResult.storageKey);
      expect((json.upload as Record<string, unknown>).expiresIn).toBe(600);
      expect(json.asset).toEqual(uploadIntentResult.asset);
    });

    it('calls getTicket to verify access before creating upload intent', async () => {
      mockServices.mediaUpload.createUploadIntent.mockResolvedValue({
        uploadUrl: 'https://storage.example.com/upload/xray.jpg',
        storageKey: 'key',
        expiresIn: 600,
        asset: {},
      });

      await app.request(`/api/v2/tickets/${TICKET_UUID}/attachments/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(mockServices.getTicket.execute).toHaveBeenCalledWith(TICKET_UUID, expect.anything());
      expect(mockServices.mediaUpload.createUploadIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          policyId: 'ticket_reply_attachment',
          ownerType: 'ticket_reply',
          ownerId: TICKET_UUID,
          fileName: 'xray.jpg',
          fileSize: 204800,
          mimeType: 'image/jpeg',
        }),
      );
    });

    it('returns 400 for missing fileName', async () => {
      const res = await app.request(`/api/v2/tickets/${TICKET_UUID}/attachments/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileSize: 1024, mimeType: 'image/jpeg' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
    });

    it('returns 400 for non-positive fileSize', async () => {
      const res = await app.request(`/api/v2/tickets/${TICKET_UUID}/attachments/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: 'xray.jpg', fileSize: -1, mimeType: 'image/jpeg' }),
      });

      expect(res.status).toBe(400);
      expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
    });

    it('returns 400 for invalid ticket UUID param', async () => {
      const res = await app.request('/api/v2/tickets/not-a-uuid/attachments/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(400);
      expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
    });
  });
});
