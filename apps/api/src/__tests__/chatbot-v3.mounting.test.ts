import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chatbotV3ChatResponseSchema } from '@medical-crm/validation';

const mockServices = {
  idempotencyExecutor: {
    execute: vi.fn(async (_key: string, _operation: string, fn: () => Promise<unknown>) => fn()),
  },
  registerHospitalUser: {
    execute: vi.fn(),
  },
  validateRegistrationToken: {
    execute: vi.fn(),
  },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

vi.mock('@medical-crm/infrastructure/auth', () => ({
  authMiddleware: async (c: { json: (body: unknown, status: number) => Response }) =>
    c.json({ error: 'Missing or invalid Authorization header' }, 401),
}));

describe('Chatbot v3 public route mounting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps POST /api/v3/chatbot/chat public and returns v3-only fields', async () => {
    const { default: app } = await import('../index.js');

    const res = await app.request('/api/v3/chatbot/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-v3-1',
        message: 'Please explain the process.',
      }),
    });

    const body = res.headers.get('content-type')?.includes('application/json')
      ? await res.json()
      : undefined;

    expect(res.status).toBe(200);
    expect(body.nextAction).toBeUndefined();
    expect(body.turnOutcome).toBeDefined();
    expect(chatbotV3ChatResponseSchema.parse(body)).toBeDefined();
    expect(mockServices.idempotencyExecutor.execute).toHaveBeenCalledOnce();
  });
});
