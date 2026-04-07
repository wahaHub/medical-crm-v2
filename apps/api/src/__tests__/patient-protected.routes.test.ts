import { beforeEach, describe, expect, it, vi } from 'vitest';
import patientProtectedRoutes from '../routes/patient-protected.routes.js';

const { mockGetServices, mockSeedWidgetStarterMessage } = vi.hoisted(() => ({
  mockGetServices: vi.fn(),
  mockSeedWidgetStarterMessage: vi.fn(),
}));

vi.mock('../composition-root.js', () => ({
  getServices: mockGetServices,
}));

vi.mock('../routes/patient-widget-starter.js', () => ({
  seedWidgetStarterMessage: mockSeedWidgetStarterMessage,
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
    mockSeedWidgetStarterMessage.mockReset();
    mockSeedWidgetStarterMessage.mockResolvedValue(undefined);
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

  it('triggers widget starter backfill on /me for select-hospitals restores', async () => {
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
    mockGetServices.mockReturnValue({
      getPatientSessionState: { execute },
    });

    const res = await patientProtectedRoutes.request('/me');

    expect(res.status).toBe(200);
    expect(mockSeedWidgetStarterMessage).toHaveBeenCalledWith({
      services: expect.any(Object),
      widgetSessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      caseId: '11111111-1111-4111-8111-111111111111',
      destination: 'Shenzhen',
    });
  });

  it('does not trigger widget starter backfill on /me when restore is already messages-ready', async () => {
    const execute = vi.fn().mockResolvedValue({
      id: 'patient-1',
      patientId: 'patient-1',
      name: 'Hao Wang',
      email: 'hao@example.com',
      patientCode: 'P001',
      preferredLanguage: 'en',
      caseId: '11111111-1111-4111-8111-111111111111',
      nextStep: 'messages-ready',
      selectedHospitalIds: ['hospital-1'],
      profileSubmitted: true,
      chatUnlocked: true,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      },
    });
    mockGetServices.mockReturnValue({
      getPatientSessionState: { execute },
    });

    const res = await patientProtectedRoutes.request('/me');

    expect(res.status).toBe(200);
    expect(mockSeedWidgetStarterMessage).not.toHaveBeenCalled();
  });

  it('does not wait for widget starter backfill before returning /me', async () => {
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
    mockSeedWidgetStarterMessage.mockImplementation(() => new Promise(() => {}));

    mockGetServices.mockReturnValue({
      getPatientSessionState: { execute },
    });

    const response = await Promise.race([
      patientProtectedRoutes.request('/me'),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 25)),
    ]);

    expect(response).not.toBe('timeout');
    expect((response as Response).status).toBe(200);
    expect(mockSeedWidgetStarterMessage).toHaveBeenCalledOnce();
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
