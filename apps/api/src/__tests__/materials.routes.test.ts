import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import materialsRoutes from '../routes/materials.routes.js';

const mockServices = {
  getHospitalInfo: { execute: vi.fn() },
  updateHospitalInfo: { execute: vi.fn() },
  getProcedures: { execute: vi.fn() },
  createProcedure: { execute: vi.fn() },
  updateProcedure: { execute: vi.fn() },
  deleteProcedure: { execute: vi.fn() },
  getSurgeons: { execute: vi.fn() },
  createSurgeon: { execute: vi.fn() },
  updateSurgeon: { execute: vi.fn() },
  deleteSurgeon: { execute: vi.fn() },
  getBeforeAfterCases: { execute: vi.fn() },
  createBeforeAfterCase: { execute: vi.fn() },
  updateBeforeAfterCase: { execute: vi.fn() },
  deleteBeforeAfterCase: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

type SessionData = {
  userId: string;
  email: string;
  roles: string[];
  hospitalId: string | null;
};

let currentSession: SessionData = {
  userId: 'hospital-user-1',
  email: 'hospital@test.com',
  roles: ['HOSPITAL'],
  hospitalId: '00000000-0000-0000-0000-000000000001',
};

const app = new OpenAPIHono();
app.use('/api/v2/*', async (c, next) => {
  c.set('session', currentSession);
  await next();
});
app.route('/', materialsRoutes);

const VALID_HOSPITAL_ID = '00000000-0000-0000-0000-000000000001';
const VALID_SURGEON_ID = '00000000-0000-0000-0000-000000000002';

describe('Materials routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts extended surgeon fields on create', async () => {
    mockServices.createSurgeon.execute.mockResolvedValue({ id: VALID_SURGEON_ID });

    const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/surgeons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Dr. Kim',
        title: 'Chief Surgeon',
        education: ['Yonsei University'],
        certifications: ['Board Certified'],
        intro: 'Intro',
        expertise: 'Expertise',
        philosophy: 'Philosophy',
        achievements: ['Achievement'],
      }),
    });

    expect(res.status).toBe(201);
    expect(mockServices.createSurgeon.execute).toHaveBeenCalledWith(
      VALID_HOSPITAL_ID,
      expect.objectContaining({
        education: ['Yonsei University'],
        certifications: ['Board Certified'],
        intro: 'Intro',
        expertise: 'Expertise',
        philosophy: 'Philosophy',
        achievements: ['Achievement'],
      }),
      expect.anything(),
    );
  });

  it('accepts extended surgeon fields on update', async () => {
    mockServices.updateSurgeon.execute.mockResolvedValue({ id: VALID_SURGEON_ID });

    const res = await app.request(`/api/v2/hospitals/${VALID_HOSPITAL_ID}/materials/surgeons/${VALID_SURGEON_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        education: ['Harvard Medical School'],
        achievements: ['Award winner'],
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.updateSurgeon.execute).toHaveBeenCalledWith(
      VALID_HOSPITAL_ID,
      VALID_SURGEON_ID,
      expect.objectContaining({
        education: ['Harvard Medical School'],
        achievements: ['Award winner'],
      }),
      expect.anything(),
    );
  });
});
