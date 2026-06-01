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
    vi.unstubAllGlobals();
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

  it('updates patient profile fields on PATCH /me and returns the refreshed session state', async () => {
    const updateExecute = vi.fn().mockResolvedValue(undefined);
    const getExecute = vi.fn().mockResolvedValue({
      id: 'patient-1',
      patientId: 'patient-1',
      name: 'Hao Wang',
      email: 'liuxue8901@gmail.com',
      age: '43',
      patientCode: 'P001',
      preferredLanguage: 'zh',
      caseId: 'case-1',
      nextStep: 'messages-ready',
      selectedHospitalIds: [],
      profileSubmitted: true,
      chatUnlocked: true,
    });
    mockGetServices.mockReturnValue({
      updatePatientSessionProfile: { execute: updateExecute },
      getPatientSessionState: { execute: getExecute },
    });

    const res = await patientProtectedRoutes.request('/me', {
      method: 'PATCH',
      body: JSON.stringify({ age: '43' }),
      headers: { 'content-type': 'application/json' },
    });

    expect(res.status).toBe(200);
    expect(updateExecute).toHaveBeenCalledWith({
      patientId: 'patient-1',
      profile: { age: '43' },
    });
    expect(getExecute).toHaveBeenCalledWith({ patientId: 'patient-1', site: 'beauty' });
    expect(await res.json()).toEqual(expect.objectContaining({
      patientId: 'patient-1',
      email: 'liuxue8901@gmail.com',
      age: '43',
    }));
  });

  it('returns patient session summaries plus case authority meta on /conversations', async () => {
    const execute = vi.fn().mockResolvedValue({
      sessions: [
        {
          sessionId: 'widget-chat:patient-1:case-1',
          caseId: 'case-1',
          type: 'CARE_TEAM',
          title: 'Medora Care Team',
          hospitalId: null,
          hospitalName: null,
          isAiAvailable: false,
          unreadCount: 0,
          lastMessagePreview: null,
          lastMessageAt: null,
          updatedAt: '2026-04-18T00:00:00.000Z',
        },
      ],
      meta: {
        caseId: 'case-1',
        chatAuthority: 'HUMAN_TAKEOVER',
      },
    });
    mockGetServices.mockReturnValue({
      getPatientConversations: { execute },
    });

    const res = await patientProtectedRoutes.request('/conversations?caseId=11111111-1111-4111-8111-111111111111');

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledWith({
      patientId: 'patient-1',
      caseId: '11111111-1111-4111-8111-111111111111',
    });
    expect(await res.json()).toEqual({
      sessions: [
        expect.objectContaining({
          sessionId: 'widget-chat:patient-1:case-1',
          type: 'CARE_TEAM',
          title: 'Medora Care Team',
          isAiAvailable: false,
        }),
      ],
      meta: {
        caseId: 'case-1',
        chatAuthority: 'HUMAN_TAKEOVER',
      },
    });
  });

  it('does not leak legacy conversation-shaped payloads from /conversations', async () => {
    const execute = vi.fn().mockResolvedValue({
      sessions: [
        {
          sessionId: 'widget-chat:patient-1:case-1',
          caseId: 'case-1',
          type: 'CARE_TEAM',
          title: 'Medora Care Team',
          hospitalId: null,
          hospitalName: null,
          isAiAvailable: false,
          unreadCount: 0,
          lastMessagePreview: null,
          lastMessageAt: null,
          updatedAt: '2026-04-18T00:00:00.000Z',
        },
      ],
      meta: {
        caseId: 'case-1',
        chatAuthority: 'HUMAN_TAKEOVER',
      },
    });
    mockGetServices.mockReturnValue({
      getPatientConversations: { execute },
    });

    const res = await patientProtectedRoutes.request('/conversations');
    const payload = await res.json();

    expect(res.status).toBe(200);
    expect(payload).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          assistantMode: expect.any(String),
        }),
      ]),
    );
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

  it('returns merged patient session detail payloads on /sessions/:sessionId/messages', async () => {
    const execute = vi.fn().mockResolvedValue({
      sessionId: 'widget-chat:patient-1:case-1',
      caseId: 'case-1',
      type: 'CARE_TEAM',
      title: 'Medora Care Team',
      hospitalId: null,
      hospitalName: null,
      isAiAvailable: false,
      chatAuthority: 'HUMAN_TAKEOVER',
      data: [
        { id: 'msg-ai', sessionId: 'widget-chat:patient-1:case-1', source: 'CHATBOT', conversationId: null, senderRole: 'AI', senderName: 'Medora AI', content: 'AI reply', messageType: 'TEXT', moderationStatus: null, attachments: [], createdAt: '2026-04-18T00:00:00.000Z' },
        { id: 'msg-admin', sessionId: 'widget-chat:patient-1:case-1', source: 'FORMAL', conversationId: 'conv-1', senderRole: 'ADMIN', senderName: 'Medora Care Team', content: 'Human reply', messageType: 'TEXT', moderationStatus: 'ALLOWED', attachments: [], createdAt: '2026-04-18T00:01:00.000Z' },
      ],
      total: 2,
      page: 1,
      limit: 20,
      totalPages: 1,
      hasMore: false,
    });
    mockGetServices.mockReturnValue({
      getPatientSessionDetail: { execute },
    });

    const res = await patientProtectedRoutes.request('/sessions/widget-chat:patient-1:case-1/messages');

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledWith({
      patientId: 'patient-1',
      sessionId: 'widget-chat:patient-1:case-1',
      site: 'beauty',
      limit: 50,
    });
    expect(await res.json()).toEqual(
      expect.objectContaining({
        sessionId: 'widget-chat:patient-1:case-1',
        type: 'CARE_TEAM',
        chatAuthority: 'HUMAN_TAKEOVER',
        data: [
          expect.objectContaining({ id: 'msg-ai', source: 'CHATBOT', senderRole: 'AI' }),
          expect.objectContaining({ id: 'msg-admin', source: 'FORMAL', senderRole: 'ADMIN' }),
        ],
      }),
    );
  });

  it('persists process-guide confirmation on the active widget chat session', async () => {
    const patchStatus = vi.fn().mockResolvedValue({
      sessionId: 'widget-chat:patient-1:case-1',
      statusSnapshot: { processExplained: true },
    });
    mockGetServices.mockReturnValue({
      aiChatSessionRepo: { patchStatus },
    });

    const res = await patientProtectedRoutes.request('/sessions/widget-chat:patient-1:case-1/process-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    expect(patchStatus).toHaveBeenCalledWith(
      'widget-chat:patient-1:case-1',
      'beauty',
      { processExplained: true },
    );
    expect(await res.json()).toEqual({ ok: true, status: 'confirmed' });
  });

  it('routes human-takeover care-team session sends through the formal message path', async () => {
    const getConversation = { execute: vi.fn().mockResolvedValue({ id: 'conv-1', caseId: 'case-1', category: 'ADMIN_PATIENT', assistantMode: 'HUMAN_TAKEOVER' }) };
    const sendMessage = {
      execute: vi.fn().mockResolvedValue({
        message: {
          id: 'msg-1',
          conversationId: 'conv-1',
          senderId: 'patient-1',
          senderRole: 'PATIENT',
          senderName: null,
          content: 'Need a human update',
          originalLanguage: 'en',
          translatedContent: null,
          messageType: 'TEXT',
          moderationStatus: 'ALLOWED',
          attachments: [],
          aiSummary: null,
          createdAt: '2026-04-18T00:00:00.000Z',
        },
      }),
    };
    mockGetServices.mockReturnValue({
      conversationRepo: {
        findByPatientId: vi.fn().mockResolvedValue([
          { id: 'conv-1', caseId: 'case-1', category: 'ADMIN_PATIENT', hospitalId: null, assistantMode: 'HUMAN_TAKEOVER' },
        ]),
      },
      sendMessage,
      caseRepo: { findById: vi.fn().mockResolvedValue({ id: 'case-1', patientId: 'patient-1' }) },
      notifyAdminsOfPatientMessage: { execute: vi.fn().mockResolvedValue(undefined) },
    });

    const res = await patientProtectedRoutes.request('/sessions/widget-chat:patient-1:case-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Need a human update', messageType: 'TEXT' }),
    });

    expect(res.status).toBe(200);
    expect(sendMessage.execute).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ content: 'Need a human update', messageType: 'TEXT' }),
      expect.objectContaining({ userId: 'patient-1', role: 'PATIENT' }),
    );
  });

  it('rejects formal care-team session sends while AI is still active', async () => {
    mockGetServices.mockReturnValue({
      conversationRepo: {
        findByPatientId: vi.fn().mockResolvedValue([
          { id: 'conv-1', caseId: 'case-1', category: 'ADMIN_PATIENT', hospitalId: null, assistantMode: 'AI_ACTIVE' },
        ]),
      },
    });

    const res = await patientProtectedRoutes.request('/sessions/widget-chat:patient-1:case-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hello', messageType: 'TEXT' }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'Care-team AI is still active for this session',
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

  it('proxies signed patient upload targets through /uploads/proxy', async () => {
    const upstreamFetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', upstreamFetch);
    mockGetServices.mockReturnValue({});

    const formData = new FormData();
    formData.append('uploadUrl', 'https://example.r2.cloudflarestorage.com/upload/key');
    formData.append('file', new File(['report'], 'report.pdf', { type: 'application/pdf' }));

    const res = await patientProtectedRoutes.request('/uploads/proxy', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(204);
    expect(upstreamFetch).toHaveBeenCalledWith(
      'https://example.r2.cloudflarestorage.com/upload/key',
      expect.objectContaining({
        method: 'PUT',
        headers: {
          'Content-Type': 'application/pdf',
        },
      }),
    );
  });

  it('rejects invalid patient upload proxy targets', async () => {
    mockGetServices.mockReturnValue({});

    const formData = new FormData();
    formData.append('uploadUrl', 'https://example.com/upload/key');
    formData.append('file', new File(['report'], 'report.pdf', { type: 'application/pdf' }));

    const res = await patientProtectedRoutes.request('/uploads/proxy', {
      method: 'POST',
      body: formData,
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'uploadUrl target is not allowed' });
  });

  it('notifies offline admins when a patient sends a message from the patient portal', async () => {
    const getConversation = {
      execute: vi.fn().mockResolvedValue({
        id: 'conv-1',
        caseId: '11111111-1111-4111-8111-111111111111',
        category: 'ADMIN_PATIENT',
      }),
    };
    const sendMessage = {
      execute: vi.fn().mockResolvedValue({
        message: {
          id: 'msg-1',
          content: 'Need help with my case',
          senderRole: 'PATIENT',
        },
        sideEffectMessages: [],
      }),
    };
    const caseRepo = {
      findById: vi.fn().mockResolvedValue({
        id: '11111111-1111-4111-8111-111111111111',
        patientId: 'patient-1',
      }),
    };
    const notifyAdminsOfPatientMessage = {
      execute: vi.fn().mockResolvedValue(undefined),
    };
    mockGetServices.mockReturnValue({
      getConversation,
      sendMessage,
      caseRepo,
      notifyAdminsOfPatientMessage,
      patientAuthService: { verifySessionToken: vi.fn() },
    });

    const res = await patientProtectedRoutes.request('/conversations/conv-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Need help with my case' }),
    });

    expect(res.status).toBe(200);
    expect(notifyAdminsOfPatientMessage.execute).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      caseId: '11111111-1111-4111-8111-111111111111',
      patientId: 'patient-1',
      patientName: null,
      messagePreview: 'Need help with my case',
    });
  });

  it('notifies offline admins when a patient creates a support ticket from the patient portal', async () => {
    const createTicket = {
      execute: vi.fn().mockResolvedValue({
        id: 'ticket-1',
        ticketNumber: 'TKT-20260418-0009',
        patientId: 'patient-1',
        type: 'GENERAL_QUESTIONS',
        priority: 'MEDIUM',
        subject: 'Need help',
        description: 'Please contact me about travel timing.',
        sourcePage: '/dashboard',
        status: 'OPEN',
      }),
    };
    const notifyAdminsOfNewTicket = {
      execute: vi.fn().mockResolvedValue(undefined),
    };
    mockGetServices.mockReturnValue({
      createTicket,
      notifyAdminsOfNewTicket,
      patientAuthService: { verifySessionToken: vi.fn() },
    });

    const res = await patientProtectedRoutes.request('/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'GENERAL_SUPPORT',
        subject: 'Need help',
        description: 'Please contact me about travel timing.',
        sourcePage: '/dashboard',
      }),
    });

    expect(res.status).toBe(201);
    expect(notifyAdminsOfNewTicket.execute).toHaveBeenCalledWith({
      ticketId: 'ticket-1',
      ticketNumber: 'TKT-20260418-0009',
      patientId: 'patient-1',
      patientName: null,
      subject: 'Need help',
      descriptionPreview: 'Please contact me about travel timing.',
    });
  });
});
