import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockServices = {
  publicListHospitals: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

import { OpenAPIHono } from '@hono/zod-openapi';
import publicHospitalRoutes from '../routes/public-hospitals.routes.js';

const app = new OpenAPIHono();
app.route('/', publicHospitalRoutes);

describe('Public hospital routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists active regular hospitals for the requested site without admin auth', async () => {
    mockServices.publicListHospitals.execute.mockResolvedValue({
      data: [{
        id: 'hospital-global',
        name: 'Mongolian Spinal hospital',
        nameEn: 'Mongolian Spinal hospital',
        consumerSlug: null,
        address: null,
        city: 'Mongolia',
        phone: null,
        email: null,
        description: null,
        logoUrl: null,
        specialties: [],
        status: 'ACTIVE',
        type: 'REGULAR',
        site: 'global',
        createdAt: '2026-05-05T00:00:00.000Z',
        updatedAt: '2026-05-05T00:00:00.000Z',
      }],
      total: 1,
      page: 1,
      limit: 24,
      totalPages: 1,
      hasMore: false,
    });

    const res = await app.request('/api/v2/public/hospitals?site=global&limit=24');

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: [{ id: 'hospital-global', site: 'global' }],
      total: 1,
    });
    expect(mockServices.publicListHospitals.execute).toHaveBeenCalledWith({
      site: 'global',
      page: 1,
      limit: 24,
      status: 'ACTIVE',
      type: 'REGULAR',
    });
  });

  it('rejects unknown site filters', async () => {
    const res = await app.request('/api/v2/public/hospitals?site=moon');

    expect(res.status).toBe(400);
    expect(mockServices.publicListHospitals.execute).not.toHaveBeenCalled();
  });
});
