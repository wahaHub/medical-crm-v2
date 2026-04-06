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
        request_id: 'req-1',
        hospital_type: 'COSMETIC',
        payload: { user_message: 'hello' },
      }),
    });

    expect(res.status).toBe(401);
    expect(mockServices.evaluateFaqRetrieval.execute).not.toHaveBeenCalled();
  });

  it('returns evaluated routing signals in a stable debug shape', async () => {
    mockServices.evaluateFaqRetrieval.execute.mockResolvedValue({
      hospitalType: 'COSMETIC',
      activeHospitalId: 'hospital-123',
      faqScope: 'HOSPITAL_AWARE',
      categoryListSourceUsed: 'GENERAL_AND_HOSPITAL',
      availableCategories: ['Consultation Process', 'Hospital Review Requirements'],
      resolvedCategories: ['Consultation Process', 'Hospital Review Requirements'],
      evaluation: {
        evaluated: true,
        passed: true,
        matchedExpectedScope: true,
        matchedExpectedCategories: true,
        matchedExpectedHospitalId: true,
        notes: [],
      },
    });

    const res = await app.request('/api/v2/internal/faq-retrieval/evaluate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long',
      },
      body: JSON.stringify({
        version: 'v1',
        request_id: 'req-1',
        hospital_type: 'COSMETIC',
        payload: {
          user_message: 'For this hospital, explain Consultation Process and Hospital Review Requirements.',
          page_context: {
            type: 'HOSPITAL_DETAIL',
            hospitalId: 'hospital-123',
            hospitalName: 'Seoul Aesthetic Center',
          },
          expected_scope: 'HOSPITAL_AWARE',
          expected_categories: ['Consultation Process', 'Hospital Review Requirements'],
          expected_hospital_id: 'hospital-123',
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(mockServices.evaluateFaqRetrieval.execute).toHaveBeenCalledWith({
      hospitalType: 'COSMETIC',
      userMessage: 'For this hospital, explain Consultation Process and Hospital Review Requirements.',
      pageContext: {
        type: 'HOSPITAL_DETAIL',
        hospitalId: 'hospital-123',
        hospitalName: 'Seoul Aesthetic Center',
      },
      expectedScope: 'HOSPITAL_AWARE',
      expectedCategories: ['Consultation Process', 'Hospital Review Requirements'],
      expectedHospitalId: 'hospital-123',
    });
    expect(await res.json()).toEqual({
      ok: true,
      data: {
        hospital_type: 'COSMETIC',
        active_hospital_id: 'hospital-123',
        faq_scope: 'HOSPITAL_AWARE',
        category_list_source_used: 'GENERAL_AND_HOSPITAL',
        available_categories: ['Consultation Process', 'Hospital Review Requirements'],
        resolved_categories: ['Consultation Process', 'Hospital Review Requirements'],
        evaluation: {
          evaluated: true,
          passed: true,
          matched_expected_scope: true,
          matched_expected_categories: true,
          matched_expected_hospital_id: true,
          notes: [],
        },
      },
    });
  });
});
