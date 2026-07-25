import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';

const mockServices = {
  listHospitals: { execute: vi.fn() },
  getProcedures: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({ getServices: () => mockServices }));

import guideRoutes from '../routes/guides.routes.js';

const app = new OpenAPIHono();
app.use('/api/v2/*', async (c, next) => {
  c.set('session', { userId: 'admin-1', email: 'admin@medorabeauty.com', roles: ['ADMIN'] });
  await next();
});
app.route('/', guideRoutes);

describe('Guide routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockServices.listHospitals.execute.mockResolvedValue({
      data: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Medora Hospital', nameEn: 'Medora Hospital' }],
      hasMore: false,
    });
    mockServices.getProcedures.execute.mockResolvedValue([
      { id: '22222222-2222-4222-8222-222222222222', procedureName: 'Advanced Consultation' },
    ]);
  });

  it('matches the procedures directory before the dynamic guide id route', async () => {
    const response = await app.request('/api/v2/guides/procedures?page=1');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [{
        procedureId: '22222222-2222-4222-8222-222222222222',
        hospitalId: '11111111-1111-4111-8111-111111111111',
        procedureName: 'Advanced Consultation',
        hospitalName: 'Medora Hospital',
      }],
      page: 1,
      hasMore: false,
    });
  });
});
