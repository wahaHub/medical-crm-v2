import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { chatbotV3PublicRoutes } from '../routes/chatbot-v3.routes.js';

const NOW = new Date('2026-04-18T00:00:00.000Z');
const SESSION_SECRET = 'secret-v3-upload';
const SESSION_SECRET_HASH = createHash('sha256').update(SESSION_SECRET).digest('hex');

let currentSession: Record<string, unknown> | null = null;

const mockServices = {
  aiChatSessionRepo: {
    findBySessionId: vi.fn(async () => currentSession),
    save: vi.fn(async (entity: Record<string, unknown>) => {
      currentSession = entity;
      return entity;
    }),
  },
  patientAuthService: {
    verifySessionToken: vi.fn(),
  },
  mediaUpload: {
    createUploadIntent: vi.fn(),
  },
};

vi.mock('../composition-root.js', () => ({
  getServices: () => mockServices,
}));

vi.mock('@medical-crm/infrastructure/auth', () => ({
  authMiddleware: async (c: { json: (body: unknown, status: number) => Response }) =>
    c.json({ error: 'Missing or invalid Authorization header' }, 401),
}));

function withSiteHeaders(headers?: HeadersInit, site = 'beauty') {
  const merged = new Headers(headers);
  if (!merged.has('x-medora-site')) {
    merged.set('x-medora-site', site);
  }
  return merged;
}

const app = new Hono();
app.route('/', chatbotV3PublicRoutes);
const originalAppRequest = app.request.bind(app);
app.request = ((input: string, init?: RequestInit) =>
  originalAppRequest(input, {
    ...init,
    headers: withSiteHeaders(init?.headers),
  })) as typeof app.request;

async function loadRealApp() {
  const { default: realApp } = await import('../index.js');
  const originalRequest = realApp.request.bind(realApp);
  realApp.request = ((input: string, init?: RequestInit) =>
    originalRequest(input, {
      ...init,
      headers: withSiteHeaders(init?.headers),
    })) as typeof realApp.request;
  return realApp;
}

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'db-session-v3-upload-1',
    sessionId: 'session-v3-upload-1',
    site: 'beauty',
    sessionSecretHash: SESSION_SECRET_HASH,
    difyConversationId: null,
    patientId: null,
    hospitalType: 'COSMETIC',
    status: 'ACTIVE',
    statusSnapshot: {
      conditionStatus: 'unknown',
      formStatus: 'not_started',
      docUploadStatus: 'none',
      recommendationStatus: 'not_started',
      consultationStatus: 'not_introduced',
      packageStatus: 'not_introduced',
      handoffStatus: 'not_needed',
      minimalTriageComplete: true,
      riskLevel: 'low',
      trustOrObjection: 'none',
      engagementMode: 'LIGHT_DISCOVERY',
      enteredDeepWorkflowAt: null,
      conversationSummary: '',
      lastPolicyDecisionAt: null,
      lastUserMessageAt: null,
      lastAssistantMessageAt: null,
    },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('chatbot-v3 upload init route', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    currentSession = makeSession();
    mockServices.aiChatSessionRepo.findBySessionId.mockImplementation(async () => currentSession);
    mockServices.aiChatSessionRepo.save.mockImplementation(async (entity: Record<string, unknown>) => {
      currentSession = entity;
      return entity;
    });
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({ userId: 'patient-1' });
    mockServices.mediaUpload.createUploadIntent.mockResolvedValue({
      uploadUrl: 'https://upload.example.com',
      storageKey: 'chatbot-v3/session-v3-upload-1/report.pdf',
      expiresIn: 900,
      asset: {
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'chatbot-v3/session-v3-upload-1/report.pdf',
      },
    });
  });

  it('POST /api/v3/chatbot/uploads/init returns the exact upload and asset contract for an authorized session secret', async () => {
    const res = await app.request('/api/v3/chatbot/uploads/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-upload-1',
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({
      upload: {
        uploadUrl: 'https://upload.example.com',
        storageKey: 'chatbot-v3/session-v3-upload-1/report.pdf',
        expiresIn: 900,
      },
      asset: {
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storageKey: 'chatbot-v3/session-v3-upload-1/report.pdf',
      },
    });
    expect(mockServices.mediaUpload.createUploadIntent).toHaveBeenCalledWith({
      policyId: 'chatbot_request_docs',
      ownerType: 'ai_chat_session',
      ownerId: 'db-session-v3-upload-1',
      fileName: 'report.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
    });
  });

  it('POST /api/v3/chatbot/uploads/init allows a patient-owned widget session with a valid patient session cookie', async () => {
    currentSession = makeSession({
      sessionId: 'widget-chat:patient-1:case-1',
      sessionSecretHash: null,
      patientId: 'patient-1',
    });

    const res = await app.request('/api/v3/chatbot/uploads/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=patient-cookie-1',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-1:case-1',
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(201);
    expect(mockServices.patientAuthService.verifySessionToken).toHaveBeenCalledWith('patient-cookie-1', 'beauty');
    expect(mockServices.mediaUpload.createUploadIntent).toHaveBeenCalledOnce();
  });

  it('POST /api/v3/chatbot/uploads/init bootstraps a chatbot session secret for anonymous sessions without one', async () => {
    currentSession = makeSession({
      sessionSecretHash: null,
      patientId: null,
    });

    const res = await app.request('/api/v3/chatbot/uploads/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-upload-1',
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(201);
    const setCookie = res.headers.get('set-cookie');
    const cookieSecret = setCookie?.match(/chatbot_session_secret=([^;]+)/)?.[1];
    const savedSession = mockServices.aiChatSessionRepo.save.mock.calls[0]?.[0] as {
      sessionId: string;
      sessionSecretHash: string;
    };

    expect(setCookie).toContain('chatbot_session_secret=');
    expect(cookieSecret).toBeDefined();
    expect(mockServices.aiChatSessionRepo.save).toHaveBeenCalledOnce();
    expect(mockServices.aiChatSessionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-v3-upload-1',
      sessionSecretHash: expect.any(String),
    }));
    expect(createHash('sha256').update(cookieSecret ?? '').digest('hex')).toBe(savedSession.sessionSecretHash);
    expect(mockServices.mediaUpload.createUploadIntent).toHaveBeenCalledOnce();
  });

  it('POST /api/v3/chatbot/uploads/init rejects a patient-owned widget session without a matching patient session cookie', async () => {
    currentSession = makeSession({
      sessionId: 'widget-chat:patient-1:case-1',
      sessionSecretHash: null,
      patientId: 'patient-1',
    });

    const res = await app.request('/api/v3/chatbot/uploads/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-1:case-1',
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(401);
    expect(mockServices.patientAuthService.verifySessionToken).not.toHaveBeenCalled();
    expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
  });

  it('POST /api/v3/chatbot/uploads/init prefers a valid patient session over a stale chatbot secret for widget sessions', async () => {
    currentSession = makeSession({
      sessionId: 'widget-chat:patient-1:case-1',
      patientId: 'patient-1',
    });

    const res = await app.request('/api/v3/chatbot/uploads/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'chatbot_session_secret=secret-stale; patient_session=patient-cookie-1',
      },
      body: JSON.stringify({
        sessionId: 'widget-chat:patient-1:case-1',
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(201);
    expect(mockServices.patientAuthService.verifySessionToken).toHaveBeenCalledWith('patient-cookie-1', 'beauty');
    expect(mockServices.mediaUpload.createUploadIntent).toHaveBeenCalledOnce();
  });

  it('POST /api/v3/chatbot/uploads/init rejects access without a matching chatbot session secret', async () => {
    const res = await app.request('/api/v3/chatbot/uploads/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-upload-1',
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(401);
    expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
  });

  it('POST /api/v3/chatbot/uploads/init rejects mismatched patient ownership', async () => {
    currentSession = makeSession({
      patientId: 'patient-1',
    });
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({ userId: 'patient-2' });

    const res = await app.request('/api/v3/chatbot/uploads/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `patient_session=patient-cookie-2; chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-upload-1',
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(403);
    expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
  });

  it('POST /api/v3/chatbot/uploads/init rejects sessions from a different site', async () => {
    const res = await app.request('/api/v3/chatbot/uploads/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
        'x-medora-site': 'china',
      },
      body: JSON.stringify({
        sessionId: 'session-v3-upload-1',
        fileName: 'report.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(403);
    expect(mockServices.mediaUpload.createUploadIntent).not.toHaveBeenCalled();
  });
});

describe('chatbot-v3 upload init app-level error handling', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    currentSession = makeSession();
    mockServices.aiChatSessionRepo.findBySessionId.mockImplementation(async () => currentSession);
    mockServices.aiChatSessionRepo.save.mockImplementation(async (entity: Record<string, unknown>) => {
      currentSession = entity;
      return entity;
    });
    mockServices.patientAuthService.verifySessionToken.mockResolvedValue({ userId: 'patient-1' });
  });

  it('maps upload-policy rejections to the user-facing validation response instead of a 500', async () => {
    const { ValidationError } = await import('@medical-crm/utils');
    mockServices.mediaUpload.createUploadIntent.mockRejectedValue(
      new ValidationError('MIME type image/heic is not allowed for chatbot_request_docs'),
    );
    const realApp = await loadRealApp();

    const res = await realApp.request('/api/v3/chatbot/uploads/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `chatbot_session_secret=${SESSION_SECRET}`,
      },
      body: JSON.stringify({
        sessionId: 'session-v3-upload-1',
        fileName: 'report.heic',
        fileSize: 1024,
        mimeType: 'image/heic',
      }),
    });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: 'MIME type image/heic is not allowed for chatbot_request_docs',
      code: 'VALIDATION_FAILED',
    });
  });
});
