import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAPIHono } from '@hono/zod-openapi';
import internalRoutes from '../routes/internal.routes.js';

const mockServices = {
  listFaqCategoriesForChatbot: { execute: vi.fn() },
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

describe('GET /api/v2/internal/mcp/faq-categories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires the internal secret', async () => {
    const res = await app.request('/api/v2/internal/mcp/faq-categories?hospitalType=COSMETIC');

    expect(res.status).toBe(401);
    expect(mockServices.listFaqCategoriesForChatbot.execute).not.toHaveBeenCalled();
  });

  it('requires hospitalType', async () => {
    const res = await app.request('/api/v2/internal/mcp/faq-categories', {
      headers: { 'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long' },
    });

    expect(res.status).toBe(400);
    expect(mockServices.listFaqCategoriesForChatbot.execute).not.toHaveBeenCalled();
  });

  it('returns compact category data for Dify and forwards hospitalId when present', async () => {
    mockServices.listFaqCategoriesForChatbot.execute.mockResolvedValue({
      hospitalType: 'COSMETIC',
      hospitalId: 'hospital-123',
      categories: [
        { name: 'Consultation Process', sortOrder: 10 },
        { name: 'Documents', sortOrder: 20 },
      ],
    });

    const res = await app.request('/api/v2/internal/mcp/faq-categories?hospitalType=COSMETIC&hospitalId=hospital-123', {
      headers: { 'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      hospitalType: 'COSMETIC',
      hospitalId: 'hospital-123',
      categories: [
        { name: 'Consultation Process', sortOrder: 10 },
        { name: 'Documents', sortOrder: 20 },
      ],
    });
    expect(mockServices.listFaqCategoriesForChatbot.execute).toHaveBeenCalledWith({
      hospitalType: 'COSMETIC',
      hospitalId: 'hospital-123',
    });
  });

  it('normalizes an empty hospitalId query param to undefined for general FAQ turns', async () => {
    mockServices.listFaqCategoriesForChatbot.execute.mockResolvedValue({
      hospitalType: 'COSMETIC',
      hospitalId: null,
      categories: [
        { name: 'Consultation Process', sortOrder: 10 },
      ],
    });

    const res = await app.request('/api/v2/internal/mcp/faq-categories?hospitalType=COSMETIC&hospitalId=', {
      headers: { 'X-Internal-Secret': 'test-secret-must-be-at-least-32-characters-long' },
    });

    expect(res.status).toBe(200);
    expect(mockServices.listFaqCategoriesForChatbot.execute).toHaveBeenCalledWith({
      hospitalType: 'COSMETIC',
      hospitalId: undefined,
    });
  });
});
