import { beforeEach, describe, expect, it, vi } from 'vitest';
import patientProtectedRoutes from '../routes/patient-protected.routes.js';

const { mockGetServices } = vi.hoisted(() => ({
  mockGetServices: vi.fn(),
}));

vi.mock('../composition-root.js', () => ({
  getServices: mockGetServices,
}));

vi.mock('../middleware/patient-auth.middleware.js', () => ({
  patientAuthMiddleware: () => async (c: any, next: () => Promise<void>) => {
    c.set('patientSession', { userId: 'patient-1' });
    await next();
  },
}));

describe('patientProtectedRoutes', () => {
  beforeEach(() => {
    mockGetServices.mockReset();
  });

  it('returns a thin patient session state from /me', async () => {
    const execute = vi.fn().mockResolvedValue({
      id: 'patient-1',
      patientId: 'patient-1',
      name: 'Hao Wang',
      email: 'hao@example.com',
      patientCode: 'P001',
      preferredLanguage: 'en',
      caseId: 'case-1',
      nextStep: 'messages-ready',
      selectedHospitalIds: ['hospital-1', 'hospital-2'],
      profileSubmitted: true,
      chatUnlocked: true,
    });
    mockGetServices.mockReturnValue({ getPatientSessionState: { execute } });

    const res = await patientProtectedRoutes.request('/me');

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledWith({ patientId: 'patient-1' });
    expect(await res.json()).toEqual({
      id: 'patient-1',
      patientId: 'patient-1',
      name: 'Hao Wang',
      email: 'hao@example.com',
      patientCode: 'P001',
      preferredLanguage: 'en',
      caseId: 'case-1',
      nextStep: 'messages-ready',
      selectedHospitalIds: ['hospital-1', 'hospital-2'],
      profileSubmitted: true,
      chatUnlocked: true,
    });
  });

  it('backfills widget starter messages through Dify on /me when restore returns an unseeded select-hospitals session', async () => {
    const execute = vi.fn().mockResolvedValue({
      id: 'patient-1',
      patientId: 'patient-1',
      name: 'Hao Wang',
      email: 'hao@example.com',
      patientCode: 'P001',
      preferredLanguage: 'en',
      caseId: '11111111-1111-4111-8111-111111111111',
      destination: 'Shenzhen',
      nextStep: 'select-hospitals',
      selectedHospitalIds: [],
      profileSubmitted: true,
      chatUnlocked: true,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      },
    });
    const findBySessionId = vi.fn().mockResolvedValue({
      id: 'db-session-1',
      sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      difyConversationId: null,
      hospitalType: 'REGULAR',
      statusSnapshot: {},
    });
    const listBySession = vi.fn().mockResolvedValue([]);
    const create = vi.fn().mockResolvedValue({});
    const updateMessage = vi.fn().mockResolvedValue({});
    const save = vi.fn().mockImplementation(async (entity) => entity);
    const createChatMessage = vi.fn().mockResolvedValue({
      conversation_id: 'dify-conversation-restore-1',
      answer: JSON.stringify({
        answer: 'To keep your case moving, choosing a few preferred hospitals will help us coordinate the next step.',
        nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        internalNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        shortlist: [
          {
            hospitalId: '24872781-f62f-49b5-8ff7-b97a78d6bc1d',
            name: 'Shenzhen People\'s Hospital',
          },
        ],
      }),
      metadata: { retriever_resources: [] },
    });
    mockGetServices.mockReturnValue({
      getPatientSessionState: { execute },
      aiChatSessionRepo: { findBySessionId, save },
      aiChatMessageRepo: { listBySession, create, updateMessage },
      difyApi: { createChatMessage },
      matchHospitals: { execute: vi.fn() },
    });

    const res = await patientProtectedRoutes.request('/me');

    expect(res.status).toBe(200);
    expect(findBySessionId).toHaveBeenCalledWith('widget-chat:patient-1:11111111-1111-4111-8111-111111111111');
    expect(createChatMessage).toHaveBeenCalledOnce();
    expect(updateMessage).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      metadata: expect.objectContaining({
        widgetStarterSeed: true,
        widgetStarterVersion: 'ai-v1',
        internalNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      }),
    }));
    expect(save).toHaveBeenCalledOnce();
  });

  it('does not append duplicate ai-v1 starter messages on /me when the widget session is already seeded', async () => {
    const execute = vi.fn().mockResolvedValue({
      id: 'patient-1',
      patientId: 'patient-1',
      name: 'Hao Wang',
      email: 'hao@example.com',
      patientCode: 'P001',
      preferredLanguage: 'en',
      caseId: '11111111-1111-4111-8111-111111111111',
      nextStep: 'select-hospitals',
      selectedHospitalIds: [],
      profileSubmitted: true,
      chatUnlocked: true,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      },
    });
    const findBySessionId = vi.fn().mockResolvedValue({
      id: 'db-session-1',
      sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
    });
    const listBySession = vi.fn().mockResolvedValue([
      {
        id: 'assistant-seeded-1',
        role: 'ASSISTANT',
        content: 'Thanks for sharing your details. We will walk through the next step together.',
        metadata: {
          widgetStarterSeed: true,
          widgetStarterVersion: 'ai-v1',
          internalNextAction: null,
        },
      },
    ]);
    const create = vi.fn().mockResolvedValue({});
    const updateMessage = vi.fn().mockResolvedValue({});
    const createChatMessage = vi.fn();
    mockGetServices.mockReturnValue({
      getPatientSessionState: { execute },
      aiChatSessionRepo: { findBySessionId },
      aiChatMessageRepo: { listBySession, create, updateMessage },
      difyApi: { createChatMessage },
      matchHospitals: { execute: vi.fn() },
    });

    const res = await patientProtectedRoutes.request('/me');

    expect(res.status).toBe(200);
    expect(createChatMessage).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(updateMessage).not.toHaveBeenCalled();
  });

  it('retries a pending widget starter seed on /me instead of treating an empty placeholder as complete', async () => {
    const execute = vi.fn().mockResolvedValue({
      id: 'patient-1',
      patientId: 'patient-1',
      name: 'Hao Wang',
      email: 'hao@example.com',
      patientCode: 'P001',
      preferredLanguage: 'en',
      caseId: '11111111-1111-4111-8111-111111111111',
      nextStep: 'select-hospitals',
      selectedHospitalIds: [],
      profileSubmitted: true,
      chatUnlocked: true,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      },
    });
    const findBySessionId = vi.fn().mockResolvedValue({
      id: 'db-session-1',
      sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      difyConversationId: null,
      hospitalType: 'REGULAR',
      statusSnapshot: {},
    });
    const listBySession = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'assistant-pending-1',
          role: 'ASSISTANT',
          content: '',
          metadata: {
            widgetStarterSeed: true,
            widgetStarterVersion: 'ai-v1',
          },
        },
      ]);
    const create = vi.fn().mockResolvedValue({});
    const updateMessage = vi.fn().mockResolvedValue({});
    const createChatMessage = vi.fn()
      .mockRejectedValueOnce(new Error('upstream timeout'))
      .mockResolvedValueOnce({
        conversation_id: 'dify-conversation-retry-1',
        answer: JSON.stringify({
          answer: 'Choosing preferred hospitals will help us continue with the best-fit options.',
          nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          internalNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
          shortlist: [
            {
              hospitalId: '24872781-f62f-49b5-8ff7-b97a78d6bc1d',
              name: 'Shenzhen People\'s Hospital',
            },
          ],
        }),
        metadata: { retriever_resources: [] },
      });

    mockGetServices.mockReturnValue({
      getPatientSessionState: { execute },
      aiChatSessionRepo: { findBySessionId, save: vi.fn().mockImplementation(async (entity) => entity) },
      aiChatMessageRepo: { listBySession, create, updateMessage },
      difyApi: { createChatMessage },
      matchHospitals: { execute: vi.fn() },
    });

    const firstRes = await patientProtectedRoutes.request('/me');
    const secondRes = await patientProtectedRoutes.request('/me');

    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    expect(create).toHaveBeenCalledOnce();
    expect(createChatMessage).toHaveBeenCalledTimes(2);
    expect(updateMessage).toHaveBeenCalledOnce();
    expect(updateMessage).toHaveBeenCalledWith('assistant-pending-1', expect.objectContaining({
      metadata: expect.objectContaining({
        widgetStarterVersion: 'ai-v1',
        draftState: 'succeeded',
      }),
    }));
  });

  it('passes custom hospital request through /select-hospitals', async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const caseId = '11111111-1111-4111-8111-111111111111';
    mockGetServices.mockReturnValue({ selectHospitals: { execute } });

    const res = await patientProtectedRoutes.request('/select-hospitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        caseId,
        hospitalIds: [],
        customHospitalRequest: 'Ruijin Hospital',
      }),
    });

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledWith({
      caseId,
      hospitalIds: [],
      customHospitalRequest: 'Ruijin Hospital',
      patientId: 'patient-1',
    });
    expect(await res.json()).toEqual({ ok: true, contacts: [] });
  });
});
