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

  it('backfills widget hospital starter blocks on /me when restore returns an empty select-hospitals session', async () => {
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
    });
    const listBySession = vi.fn().mockResolvedValue([]);
    const create = vi.fn().mockResolvedValue({});
    const matchHospitals = vi.fn().mockResolvedValue({
      hospitals: [
        {
          id: '24872781-f62f-49b5-8ff7-b97a78d6bc1d',
          name: '深圳市人民医院',
          nameEn: 'Shenzhen People\'s Hospital',
          logoUrl: null,
          tags: [],
          procedureCount: 0,
        },
      ],
    });
    mockGetServices.mockReturnValue({
      getPatientSessionState: { execute },
      aiChatSessionRepo: { findBySessionId },
      aiChatMessageRepo: { listBySession, create },
      matchHospitals: { execute: matchHospitals },
    });

    const res = await patientProtectedRoutes.request('/me');

    expect(res.status).toBe(200);
    expect(findBySessionId).toHaveBeenCalledWith('widget-chat:patient-1:11111111-1111-4111-8111-111111111111');
    expect(matchHospitals).toHaveBeenCalledWith({
      destination: 'Shenzhen',
      category: undefined,
      procedureId: undefined,
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      role: 'ASSISTANT',
      nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      metadata: expect.objectContaining({
        widgetStarterSeed: true,
        internalNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      }),
    }));
  });

  it('does not append duplicate generic starter messages on /me when the widget session is already seeded without hospitals', async () => {
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
        content: 'Thanks for sharing your details. We have opened your patient case and the next step will appear here shortly.',
        metadata: {
          widgetStarterSeed: true,
          internalNextAction: null,
        },
      },
    ]);
    const create = vi.fn().mockResolvedValue({});
    const updateMessage = vi.fn().mockResolvedValue({});
    const matchHospitals = vi.fn().mockResolvedValue({ hospitals: [] });
    mockGetServices.mockReturnValue({
      getPatientSessionState: { execute },
      aiChatSessionRepo: { findBySessionId },
      aiChatMessageRepo: { listBySession, create, updateMessage },
      matchHospitals: { execute: matchHospitals },
    });

    const res = await patientProtectedRoutes.request('/me');

    expect(res.status).toBe(200);
    expect(create).not.toHaveBeenCalled();
    expect(updateMessage).not.toHaveBeenCalled();
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
