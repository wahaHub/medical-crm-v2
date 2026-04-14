import { describe, expect, it, vi } from 'vitest';
import { RecordsAgent } from '../routes/chatbot-v3/agents.js';
import { createToolGateway } from '../routes/chatbot-v3/tool-gateway.js';

describe('chatbot-v3 ToolGateway', () => {
  it('normalizes timeouts into TIMEOUT tool results', async () => {
    const gateway = createToolGateway({
      readTimeoutMs: 5,
      handlers: {
        records: {
          status: vi.fn(async () => {
            await new Promise((resolve) => setTimeout(resolve, 25));
            return { state: 'processing' };
          }),
        },
      },
    });

    const result = await gateway.records.status({ sessionId: 'session-1' });

    expect(result).toEqual({
      status: 'error',
      code: 'TIMEOUT',
      message: expect.any(String),
    });
  });

  it('exposes required tool capability matrix', () => {
    const gateway = createToolGateway({ handlers: {} });

    expect(gateway.records).toHaveProperty('upload');
    expect(gateway.records).toHaveProperty('save');
    expect(gateway.records).toHaveProperty('status');
    expect(gateway.recommendation).toHaveProperty('generate');
    expect(gateway.recommendation).toHaveProperty('pick');
    expect(gateway.recommendation).toHaveProperty('status');
    expect(gateway.consult).toHaveProperty('schedule');
    expect(gateway.consult).toHaveProperty('status');
    expect(gateway.status).toHaveProperty('query');
  });
});

describe('chatbot-v3 agents', () => {
  it('rejects actions outside the agent allowlist', async () => {
    const gateway = createToolGateway({ handlers: {} });
    const agent = new RecordsAgent(gateway);

    const result = await agent.execute({
      type: 'status.query',
      input: { sessionId: 'session-1' },
    });

    expect(result).toEqual({
      status: 'error',
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('status.query'),
    });
  });
});
