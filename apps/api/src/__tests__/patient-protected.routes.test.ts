import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@medical-crm/utils';
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
    c.set('patientSite', 'beauty');
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
      formalConversationState: {
        activeConversationId: 'conv-1',
        conversationIds: ['conv-1'],
        activeAssistantMode: 'HUMAN_TAKEOVER',
      },
      profileSubmitted: true,
      chatUnlocked: true,
    });
    mockGetServices.mockReturnValue({ getPatientSessionState: { execute } });

    const res = await patientProtectedRoutes.request('/me');

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledWith({ patientId: 'patient-1', site: 'beauty' });
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
      formalConversationState: {
        activeConversationId: 'conv-1',
        conversationIds: ['conv-1'],
        activeAssistantMode: 'HUMAN_TAKEOVER',
      },
      profileSubmitted: true,
      chatUnlocked: true,
    });
  });

  it('returns assistantMode on patient conversation reads', async () => {
    const execute = vi.fn().mockResolvedValue([
      {
        id: 'conv-1',
        caseId: 'case-1',
        category: 'ADMIN_PATIENT',
        title: null,
        hospitalId: null,
        assistantMode: 'HUMAN_TAKEOVER',
        lastMessageAt: null,
        lastMessagePreview: null,
        lastSenderId: null,
        createdAt: '2026-04-18T00:00:00.000Z',
        updatedAt: '2026-04-18T00:00:00.000Z',
      },
    ]);
    mockGetServices.mockReturnValue({
      getPatientConversations: { execute },
    });

    const res = await patientProtectedRoutes.request('/conversations');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      expect.objectContaining({
        id: 'conv-1',
        assistantMode: 'HUMAN_TAKEOVER',
      }),
    ]);
  });

  it('returns assistantMode alongside patient message list responses and preserves explicit sender roles', async () => {
    const getConversation = { execute: vi.fn().mockResolvedValue({ id: 'conv-1', assistantMode: 'HUMAN_TAKEOVER' }) };
    const listMessages = {
      execute: vi.fn().mockResolvedValue({
        data: [
          { id: 'msg-ai', senderId: null, senderRole: 'AI', messageType: 'TEXT', content: 'AI reply' },
          { id: 'msg-admin', senderId: 'admin-1', senderRole: 'ADMIN', messageType: 'TEXT', content: 'Human reply' },
          { id: 'msg-system', senderId: null, senderRole: 'SYSTEM', messageType: 'SYSTEM', content: 'Notice' },
        ],
        total: 3,
        page: 1,
        limit: 20,
        totalPages: 1,
        hasMore: false,
      }),
    };
    mockGetServices.mockReturnValue({
      getConversation,
      listMessages,
    });

    const res = await patientProtectedRoutes.request('/conversations/conv-1/messages');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      assistantMode: 'HUMAN_TAKEOVER',
      data: [
        expect.objectContaining({ id: 'msg-ai', senderRole: 'AI' }),
        expect.objectContaining({ id: 'msg-admin', senderRole: 'ADMIN' }),
        expect.objectContaining({ id: 'msg-system', senderRole: 'SYSTEM' }),
      ],
      total: 3,
      page: 1,
      limit: 20,
      totalPages: 1,
      hasMore: false,
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
      site: 'beauty',
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

  it('returns a patient-safe questionnaire template by templateId', async () => {
    const templateId = '11111111-1111-4111-8111-111111111111';
    const execute = vi.fn().mockResolvedValue({
      template: {
        id: templateId,
        templateName: 'Cancer Intake Template',
        category: 'CANCER',
        procedureTypes: [],
        questions: {
          steps: [
            {
              id: 'step-1',
              title: 'Symptoms',
              questions: [
                { id: 'q-1', prompt: 'Main concern', type: 'TEXT', required: true },
              ],
            },
          ],
        },
        translations: {},
        isActive: true,
        createdAt: '2026-04-07T00:00:00.000Z',
        updatedAt: '2026-04-07T00:00:00.000Z',
      },
    });
    mockGetServices.mockReturnValue({ getTemplate: { execute } });

    const caseId = '22222222-2222-4222-8222-222222222222';
    const res = await patientProtectedRoutes.request(`/qc-templates/${templateId}?caseId=${caseId}`);

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(templateId, {
      role: 'PATIENT',
      userId: 'patient-1',
      email: '',
      hospitalId: null,
    }, caseId);
    expect(await res.json()).toEqual({
      template: {
        id: templateId,
        templateName: 'Cancer Intake Template',
        category: 'CANCER',
        procedureTypes: [],
        questions: {
          steps: [
            {
              id: 'step-1',
              title: 'Symptoms',
              questions: [
                { id: 'q-1', prompt: 'Main concern', type: 'TEXT', required: true },
              ],
            },
          ],
        },
        translations: {},
        isActive: true,
        createdAt: '2026-04-07T00:00:00.000Z',
        updatedAt: '2026-04-07T00:00:00.000Z',
      },
    });
  });

  it('does not expose inactive questionnaire templates to patients', async () => {
    const templateId = '11111111-1111-4111-8111-111111111111';
    const caseId = '22222222-2222-4222-8222-222222222222';
    const execute = vi.fn().mockResolvedValue({
      template: {
        id: templateId,
        templateName: 'Inactive Template',
        category: 'CANCER',
        procedureTypes: [],
        questions: { steps: [] },
        translations: {},
        isActive: false,
        createdAt: '2026-04-07T00:00:00.000Z',
        updatedAt: '2026-04-07T00:00:00.000Z',
      },
    });
    mockGetServices.mockReturnValue({ getTemplate: { execute } });

    const res = await patientProtectedRoutes.request(`/qc-templates/${templateId}?caseId=${caseId}`);

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Template not found' });
  });

  it('fails closed when the requested caseId does not exist', async () => {
    const templateId = '11111111-1111-4111-8111-111111111111';
    const caseId = '33333333-3333-4333-8333-333333333333';
    const execute = vi.fn().mockRejectedValue(new NotFoundError(`Case ${caseId} not found`));
    mockGetServices.mockReturnValue({ getTemplate: { execute } });

    const res = await patientProtectedRoutes.request(`/qc-templates/${templateId}?caseId=${caseId}`);

    expect(execute).toHaveBeenCalledWith(templateId, {
      role: 'PATIENT',
      userId: 'patient-1',
      email: '',
      hospitalId: null,
    }, caseId);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Template not found' });
  });
});
