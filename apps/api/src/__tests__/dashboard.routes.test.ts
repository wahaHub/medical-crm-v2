import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock the composition root — this MUST be declared before importing routes
// ---------------------------------------------------------------------------

const mockServices = {
  patientDashboard: { execute: vi.fn() },
  adminDashboard: { execute: vi.fn() },
  hospitalDashboard: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

// ---------------------------------------------------------------------------
// Build a lightweight test app with session injection (no real auth)
// ---------------------------------------------------------------------------
import { OpenAPIHono } from '@hono/zod-openapi';
import dashboardRoutes from '../routes/dashboard.routes.js';

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
app.route('/', dashboardRoutes);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dashboard routes', () => {
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
  // GET /api/v2/patient/dashboard
  // -----------------------------------------------------------------------
  describe('GET /api/v2/patient/dashboard', () => {
    it('returns 200 with patient dashboard data', async () => {
      currentSession = {
        userId: 'patient-1',
        email: 'patient@test.com',
        roles: ['PATIENT'],
        hospitalId: null,
      };

      const payload = {
        cases: [],
        upcomingMilestones: [],
        ordersSummary: { pendingPayment: 0, inProgress: 0, completed: 0 },
        unreadMessageCount: 0,
      };
      mockServices.patientDashboard.execute.mockResolvedValue(payload);

      const res = await app.request('/api/v2/patient/dashboard');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(payload);
      expect(mockServices.patientDashboard.execute).toHaveBeenCalledOnce();
    });

    it('passes actor to use case', async () => {
      currentSession = {
        userId: 'patient-1',
        email: 'patient@test.com',
        roles: ['PATIENT'],
        hospitalId: null,
      };

      mockServices.patientDashboard.execute.mockResolvedValue({
        cases: [],
        upcomingMilestones: [],
        ordersSummary: { pendingPayment: 0, inProgress: 0, completed: 0 },
        unreadMessageCount: 0,
      });

      await app.request('/api/v2/patient/dashboard');

      const [actor] = mockServices.patientDashboard.execute.mock.calls[0]!;
      expect(actor).toMatchObject({
        userId: 'patient-1',
        role: 'PATIENT',
      });
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/admin/dashboard
  // -----------------------------------------------------------------------
  describe('GET /api/v2/admin/dashboard', () => {
    it('returns 200 with admin dashboard data', async () => {
      const payload = {
        stats: {
          totalCases: 50,
          unassignedCases: 10,
          assignedCases: 20,
          openTickets: 5,
          pendingOrders: 3,
        },
        recentCases: [],
      };
      mockServices.adminDashboard.execute.mockResolvedValue(payload);

      const res = await app.request('/api/v2/admin/dashboard');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(payload);
      expect(mockServices.adminDashboard.execute).toHaveBeenCalledOnce();
    });

    it('passes actor to use case', async () => {
      mockServices.adminDashboard.execute.mockResolvedValue({
        stats: { totalCases: 0, unassignedCases: 0, assignedCases: 0, openTickets: 0, pendingOrders: 0 },
        recentCases: [],
      });

      await app.request('/api/v2/admin/dashboard');

      const [actor] = mockServices.adminDashboard.execute.mock.calls[0]!;
      expect(actor).toMatchObject({
        userId: 'u-1',
        role: 'ADMIN',
      });
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/v2/hospital/dashboard
  // -----------------------------------------------------------------------
  describe('GET /api/v2/hospital/dashboard', () => {
    it('returns 200 with hospital dashboard data', async () => {
      currentSession = {
        userId: 'hospital-user-1',
        email: 'hospital@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'hospital-1',
      };

      const payload = {
        stats: {
          assignedCases: 15,
          pendingQuotes: 4,
          todayConsultations: 3,
          activeOrders: 0,
        },
        recentCases: [],
      };
      mockServices.hospitalDashboard.execute.mockResolvedValue(payload);

      const res = await app.request('/api/v2/hospital/dashboard');
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body).toEqual(payload);
      expect(mockServices.hospitalDashboard.execute).toHaveBeenCalledOnce();
    });

    it('passes actor with hospitalId to use case', async () => {
      currentSession = {
        userId: 'hospital-user-1',
        email: 'hospital@test.com',
        roles: ['HOSPITAL'],
        hospitalId: 'hospital-1',
      };

      mockServices.hospitalDashboard.execute.mockResolvedValue({
        stats: { assignedCases: 0, pendingQuotes: 0, todayConsultations: 0, activeOrders: 0 },
        recentCases: [],
      });

      await app.request('/api/v2/hospital/dashboard');

      const [actor] = mockServices.hospitalDashboard.execute.mock.calls[0]!;
      expect(actor).toMatchObject({
        userId: 'hospital-user-1',
        role: 'HOSPITAL',
        hospitalId: 'hospital-1',
      });
    });
  });
});
