import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import internalRoutes from '../routes/internal.routes.js';

const mockServices = {
  evaluateFaqRetrieval: { execute: vi.fn() },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

vi.mock('@medical-crm/config', () => ({
  getServerEnv: () => ({
    INTERNAL_API_SECRET: 'test-secret-must-be-at-least-32-characters-long',
  }),
}));

const app = new OpenAPIHono();
app.route('/', internalRoutes);

describe('POST /api/v2/internal/faq-retrieval/evaluate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires the internal secret', async () => {
    const res = await app.request('/api/v2/internal/faq-retrieval/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 'v1',
        request_id: 'eval-1',
        session_id: 'faq-eval-1',
        actor: 'OPERATOR',
        source_channel: 'seed_eval',
        hospital_type: 'COSMETIC',
        payload: {
          query: 'What documents do I need?',
        },
      }),
    });

    expect(res.status).toBe(401);
    expect(mockServices.evaluateFaqRetrieval.execute).not.toHaveBeenCalled();
  });

  it('returns the shared envelope with evaluation details', async () => {
    mockServices.evaluateFaqRetrieval.execute.mockResolvedValue({
      queryId: 'eval-1',
      query: 'What documents do I need?',
      hospitalType: 'COSMETIC',
      expectedScope: 'GENERAL_ONLY',
      expectedCategories: ['Medical Documents'],
      expectedHospitalId: null,
      actualScope: 'GENERAL_ONLY',
      actualCategories: ['Medical Documents'],
      activeHospitalId: null,
      categoryListSourceUsed: 'GENERAL_ONLY',
      availableCategories: [{ name: 'Medical Documents', sortOrder: 10 }],
      pass: true,
      notes: ['available_categories=12'],
    });

    const res = await app.request('/api/v2/internal/faq-retrieval/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long',
      },
      body: JSON.stringify({
        version: 'v1',
        request_id: 'eval-1',
        session_id: 'faq-eval-1',
        actor: 'OPERATOR',
        source_channel: 'seed_eval',
        hospital_type: 'COSMETIC',
        payload: {
          query_id: 'eval-1',
          query: 'What documents do I need?',
          expected_scope: 'GENERAL_ONLY',
          expected_categories: ['Medical Documents'],
          expected_hospital_id: null,
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        queryId: 'eval-1',
        query: 'What documents do I need?',
        hospitalType: 'COSMETIC',
        expectedScope: 'GENERAL_ONLY',
        expectedCategories: ['Medical Documents'],
        expectedHospitalId: null,
        actualScope: 'GENERAL_ONLY',
        actualCategories: ['Medical Documents'],
        activeHospitalId: null,
        categoryListSourceUsed: 'GENERAL_ONLY',
        availableCategories: [{ name: 'Medical Documents', sortOrder: 10 }],
        pass: true,
        notes: ['available_categories=12'],
      },
    });

    expect(mockServices.evaluateFaqRetrieval.execute).toHaveBeenCalledWith({
      queryId: 'eval-1',
      hospitalType: 'COSMETIC',
      query: 'What documents do I need?',
      expectedScope: 'GENERAL_ONLY',
      expectedCategories: ['Medical Documents'],
      expectedHospitalId: null,
      notes: undefined,
      pageContext: null,
    });
  });
});
