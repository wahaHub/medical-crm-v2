import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockServices = {
  getProfile: { execute: vi.fn() },
  updateProfile: { execute: vi.fn() },
  changePassword: { execute: vi.fn() },
  listAdminEmails: { execute: vi.fn() },
  listHospitalEmails: { execute: vi.fn() },
  generateRegistrationToken: { execute: vi.fn() },
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

  describe('GET /api/v2/hospital/settings/hospital-emails', () => {
    it('returns the emails attached to the current hospital account', async () => {
      currentSession = {
        userId: 'hospital-user-1',
        email: 'owner@hospital.test',
        roles: ['HOSPITAL'],
        hospitalId: '11111111-1111-1111-1111-111111111111',
      };
      mockServices.listHospitalEmails.execute.mockResolvedValue([
        'owner@hospital.test',
        'assistant@hospital.test',
      ]);

      const res = await app.request('/api/v2/hospital/settings/hospital-emails');

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({
        emails: ['owner@hospital.test', 'assistant@hospital.test'],
      });
      expect(mockServices.listHospitalEmails.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          role: 'HOSPITAL',
          hospitalId: '11111111-1111-1111-1111-111111111111',
        }),
      );
    });
  });

  describe('POST /api/v2/hospital/settings/hospital-emails/invitations', () => {
    it('creates a registration invite for the current hospital', async () => {
      currentSession = {
        userId: 'hospital-user-1',
        email: 'owner@hospital.test',
        roles: ['HOSPITAL'],
        hospitalId: '11111111-1111-1111-1111-111111111111',
      };
      mockServices.generateRegistrationToken.execute.mockResolvedValue({
        token: 'token-1',
        expiresAt: '2026-04-06T08:45:30.000Z',
      });

      const res = await app.request('/api/v2/hospital/settings/hospital-emails/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'assistant@hospital.test' }),
      });

      expect(res.status).toBe(201);
      await expect(res.json()).resolves.toEqual({
        token: 'token-1',
        expiresAt: '2026-04-06T08:45:30.000Z',
      });
      expect(mockServices.generateRegistrationToken.execute).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'assistant@hospital.test',
        expect.objectContaining({
          role: 'HOSPITAL',
          hospitalId: '11111111-1111-1111-1111-111111111111',
        }),
      );
    });
  });
});
