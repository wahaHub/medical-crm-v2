import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockServices = {
  getProfile: { execute: vi.fn() },
  updateProfile: { execute: vi.fn() },
  changePassword: { execute: vi.fn() },
  listAdminEmails: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

import { OpenAPIHono } from '@hono/zod-openapi';
import userSettingsRoutes from '../routes/user-settings.routes.js';

type SessionData = {
  userId: string;
  email: string;
  roles: string[];
  hospitalId: string | null;
};

let currentSession: SessionData = {
  userId: 'admin-1',
  email: 'admin@test.com',
  roles: ['ADMIN'],
  hospitalId: null,
};

const app = new OpenAPIHono();

app.use('/api/v2/*', async (c, next) => {
  c.set('session', currentSession);
  await next();
});

app.route('/', userSettingsRoutes);

describe('user settings routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSession = {
      userId: 'admin-1',
      email: 'admin@test.com',
      roles: ['ADMIN'],
      hospitalId: null,
    };
  });

  describe('GET /api/v2/admin/settings/admin-emails', () => {
    it('returns 200 with the admin email list', async () => {
      mockServices.listAdminEmails.execute.mockResolvedValue([
        'alpha@medicaltourismchina.health',
        'zeta@medicaltourismchina.health',
      ]);

      const res = await app.request('/api/v2/admin/settings/admin-emails');

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        emails: [
          'alpha@medicaltourismchina.health',
          'zeta@medicaltourismchina.health',
        ],
      });
    });

    it('passes the actor to the use case', async () => {
      mockServices.listAdminEmails.execute.mockResolvedValue([]);

      await app.request('/api/v2/admin/settings/admin-emails');

      expect(mockServices.listAdminEmails.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'admin-1',
          role: 'ADMIN',
        }),
      );
    });
  });
});
