import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCookie } from 'hono/cookie';
import { registerPatientWs } from '../ws/patient-ws.js';

vi.mock('hono/cookie', () => ({
  getCookie: vi.fn(),
}));

vi.mock('../composition-root.js', () => ({
  getServices: vi.fn(() => ({
    getPatientConversations: {
      execute: vi.fn(),
    },
  })),
}));

function makeContext(url: string, headers: Record<string, string> = {}, params: Record<string, string> = {}) {
  return {
    req: {
      url,
      header(name: string) {
        return headers[name] ?? headers[name.toLowerCase()] ?? null;
      },
      param(name: string) {
        return params[name] ?? undefined;
      },
    },
  } as const;
}

describe('patient websocket routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['/ws/conversations/:id', 'https://crm.medora.com/ws/conversations/conv-1', { id: 'conv-1' }],
    ['/ws/patient/notifications', 'https://crm.medora.com/ws/patient/notifications', {}],
  ])('closes %s when site context is missing', async (routePath, url, params) => {
    const routes = new Map<string, any>();
    const app = {
      get: vi.fn((path: string, handler: any) => {
        routes.set(path, handler);
      }),
    } as any;
    const upgradeWebSocket = vi.fn((factory: (c: any) => unknown) => factory);
    const authService = {
      verifySessionToken: vi.fn(),
    } as any;

    registerPatientWs(app, upgradeWebSocket, authService);

    vi.mocked(getCookie).mockReturnValue('session-token');

    const handler = routes.get(routePath);
    expect(handler).toBeTypeOf('function');

    const wsHooks = handler?.(makeContext(url, {
      cookie: 'patient_session=session-token',
    }, params)) as {
      onOpen: (event: any, ws: any) => Promise<void>;
      onClose: (event: any, ws: any) => void;
    } | undefined;
    const ws = { close: vi.fn() };

    await wsHooks?.onOpen({}, ws);

    expect(ws.close).toHaveBeenCalledOnce();
    expect(ws.close).toHaveBeenCalledWith(4001, 'Invalid site context');
    expect(authService.verifySessionToken).not.toHaveBeenCalled();
  });
});
