import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@medical-crm/utils';
import patientProtectedRoutes from '../routes/patient-protected.routes.js';

const { mockGetServices, mockSeedWidgetStarterMessage, mockGetStripe, mockReconcileStripeCheckoutOrder } = vi.hoisted(() => ({
  mockGetServices: vi.fn(),
  mockSeedWidgetStarterMessage: vi.fn(),
  mockGetStripe: vi.fn(),
  mockReconcileStripeCheckoutOrder: vi.fn(),
}));

vi.mock('../composition-root.js', () => ({
  getServices: mockGetServices,
}));

vi.mock('../routes/patient-widget-starter.js', () => ({
  seedWidgetStarterMessage: mockSeedWidgetStarterMessage,
}));

vi.mock('../routes/patient-payments.routes.js', () => ({
  getStripe: mockGetStripe,
  reconcileStripeCheckoutOrder: mockReconcileStripeCheckoutOrder,
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
    mockGetStripe.mockReset();
    mockReconcileStripeCheckoutOrder.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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

    const res = await patientProtectedRoutes.request('/sessions/widget-chat:patient-1:case-1/messages?locale=es');

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledWith({
      patientId: 'patient-1',
      sessionId: 'widget-chat:patient-1:case-1',
      site: 'beauty',
      limit: 50,
      locale: 'es',
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
    const sessionId = 'widget-chat:patient-1:case-1';
    const aiChatSession = {
      id: 'ai-session-guide',
      sessionId,
      site: 'beauty',
      patientId: 'patient-1',
      statusSnapshot: { processExplained: false, lastAssistantMessageAt: null },
    };
    const patchStatus = vi.fn().mockResolvedValue({
      ...aiChatSession,
      statusSnapshot: { processExplained: true, journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS', journeyCurrentPhase: 'active' },
    });
    const create = vi.fn().mockImplementation(async (message) => message);
    const saveMessage = vi.fn().mockImplementation(async (message) => message);
    const saveConversation = vi.fn().mockImplementation(async (conversation) => conversation);
    const conversation = {
      id: 'conv-1',
      caseId: 'case-1',
      category: 'ADMIN_PATIENT',
      hospitalId: null,
      assistantMode: 'AI_ACTIVE',
      updateLastMessage: vi.fn(),
    };
    mockGetServices.mockReturnValue({
      conversationRepo: {
        findByPatientId: vi.fn().mockResolvedValue([conversation]),
        save: saveConversation,
      },
      aiChatSessionRepo: {
        findBySessionId: vi.fn().mockResolvedValue(aiChatSession),
        patchStatus,
      },
      aiChatMessageRepo: {
        listRecentBySession: vi.fn().mockResolvedValue([]),
        create,
      },
      patientRepo: {
        findById: vi.fn().mockResolvedValue({ id: 'patient-1', preferredLanguage: 'en' }),
      },
      messageRepo: {
        save: saveMessage,
      },
    });

    const res = await patientProtectedRoutes.request(`/sessions/${sessionId}/process-confirmation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    expect(patchStatus).toHaveBeenCalledWith(
      sessionId,
      'beauty',
      expect.objectContaining({
        processExplained: true,
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
      }),
    );
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'ai-session-guide',
      role: 'ASSISTANT',
      metadata: expect.objectContaining({ processConfirmationMessage: true }),
    }));
    expect(saveMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-1',
      senderRole: 'AI',
      messageType: 'TEXT',
    }));
    expect(saveConversation).toHaveBeenCalledWith(conversation);
    expect(await res.json()).toEqual(expect.objectContaining({ ok: true, status: 'confirmed' }));
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

  it('allows mechanical attachment-only care-team sends while AI is still active', async () => {
    const sendMessage = {
      execute: vi.fn().mockResolvedValue({
        message: {
          id: 'msg-mechanical-upload',
          conversationId: 'conv-1',
          senderId: 'patient-1',
          senderRole: 'PATIENT',
          senderName: null,
          content: '',
          originalLanguage: null,
          translatedContent: null,
          messageType: 'FILE',
          moderationStatus: 'ALLOWED',
          attachments: [{
            fileName: 'ct-scan.pdf',
            mimeType: 'application/pdf',
            fileSize: 24,
            storageKey: 'medical-records/ct-scan.pdf',
          }],
          aiSummary: null,
          createdAt: '2026-06-02T00:00:00.000Z',
        },
      }),
    };
    mockGetServices.mockReturnValue({
      conversationRepo: {
        findByPatientId: vi.fn().mockResolvedValue([
          { id: 'conv-1', caseId: 'case-1', category: 'ADMIN_PATIENT', hospitalId: null, assistantMode: 'AI_ACTIVE' },
        ]),
      },
      sendMessage,
      caseRepo: { findById: vi.fn().mockResolvedValue({ id: 'case-1', patientId: 'patient-1' }) },
      notifyAdminsOfPatientMessage: { execute: vi.fn().mockResolvedValue(undefined) },
    });

    const res = await patientProtectedRoutes.request('/sessions/widget-chat:patient-1:case-1/messages?mode=mechanical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: '',
        messageType: 'FILE',
        attachments: [{
          fileName: 'ct-scan.pdf',
          mimeType: 'application/pdf',
          fileSize: 24,
          storageKey: 'medical-records/ct-scan.pdf',
        }],
      }),
    });

    expect(res.status).toBe(200);
    expect(sendMessage.execute).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        content: '',
        messageType: 'FILE',
        attachments: [expect.objectContaining({ fileName: 'ct-scan.pdf' })],
      }),
      expect.objectContaining({ userId: 'patient-1', role: 'PATIENT' }),
    );
  });

  it('allows mechanical care-team text sends while AI is active', async () => {
    const sendMessage = {
      execute: vi.fn().mockResolvedValue({
        message: {
          id: 'msg-mechanical-text',
          conversationId: 'conv-1',
          senderId: 'patient-1',
          senderRole: 'PATIENT',
          senderName: null,
          content: 'Please read this',
          originalLanguage: null,
          translatedContent: null,
          messageType: 'TEXT',
          moderationStatus: 'ALLOWED',
          attachments: [],
          aiSummary: null,
          createdAt: '2026-06-02T00:00:00.000Z',
        },
      }),
    };
    mockGetServices.mockReturnValue({
      conversationRepo: {
        findByPatientId: vi.fn().mockResolvedValue([
          { id: 'conv-1', caseId: 'case-1', category: 'ADMIN_PATIENT', hospitalId: null, assistantMode: 'AI_ACTIVE' },
        ]),
      },
      sendMessage,
      caseRepo: { findById: vi.fn().mockResolvedValue({ id: 'case-1', patientId: 'patient-1' }) },
      notifyAdminsOfPatientMessage: { execute: vi.fn().mockResolvedValue(undefined) },
    });

    const res = await patientProtectedRoutes.request('/sessions/widget-chat:patient-1:case-1/messages?mode=mechanical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Please read this', messageType: 'TEXT' }),
    });

    expect(res.status).toBe(200);
    expect(sendMessage.execute).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ content: 'Please read this', messageType: 'TEXT' }),
      expect.objectContaining({ userId: 'patient-1', role: 'PATIENT' }),
    );
  });

  it('allows mechanical care-team upload initialization while AI is still active', async () => {
    const createUploadIntent = vi.fn().mockResolvedValue({
      uploadUrl: 'https://example.r2.cloudflarestorage.com/upload/ct-scan.pdf',
      storageKey: 'medical-records/ct-scan.pdf',
      expiresIn: 900,
      asset: {
        fileName: 'ct-scan.pdf',
        mimeType: 'application/pdf',
        fileSize: 24,
        storageKey: 'medical-records/ct-scan.pdf',
      },
    });
    mockGetServices.mockReturnValue({
      conversationRepo: {
        findByPatientId: vi.fn().mockResolvedValue([
          { id: 'conv-1', caseId: 'case-1', category: 'ADMIN_PATIENT', hospitalId: null, assistantMode: 'AI_ACTIVE' },
        ]),
      },
      mediaUpload: { createUploadIntent },
    });

    const res = await patientProtectedRoutes.request('/sessions/widget-chat:patient-1:case-1/attachments/upload?mode=mechanical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'ct-scan.pdf',
        fileSize: 24,
        mimeType: 'application/pdf',
      }),
    });

    expect(res.status).toBe(201);
    expect(createUploadIntent).toHaveBeenCalledWith(expect.objectContaining({
      ownerType: 'conversation',
      ownerId: 'conv-1',
      fileName: 'ct-scan.pdf',
    }));
  });

  it('persists process confirmation and creates the follow-up upload prompt message', async () => {
    const sessionId = 'widget-chat:patient-1:case-1';
    const aiChatSession = {
      id: 'ai-session-1',
      sessionId,
      site: 'beauty',
      patientId: 'patient-1',
      statusSnapshot: {
        processExplained: false,
        lastAssistantMessageAt: null,
      },
    };
    const patchStatus = vi.fn().mockResolvedValue({
      ...aiChatSession,
      statusSnapshot: {
        ...aiChatSession.statusSnapshot,
        processExplained: true,
        journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
        journeyCurrentPhase: 'active',
      },
    });
    const create = vi.fn().mockImplementation(async (message) => message);
    const saveConversation = vi.fn().mockImplementation(async (conversation) => conversation);
    const saveMessage = vi.fn().mockImplementation(async (message) => message);
    const conversation = {
      id: 'conv-1',
      caseId: 'case-1',
      category: 'ADMIN_PATIENT',
      hospitalId: null,
      assistantMode: 'AI_ACTIVE',
      updateLastMessage: vi.fn(),
    };
    mockGetServices.mockReturnValue({
      conversationRepo: {
        findByPatientId: vi.fn().mockResolvedValue([
          conversation,
        ]),
        save: saveConversation,
      },
      aiChatSessionRepo: {
        findBySessionId: vi.fn().mockResolvedValue(aiChatSession),
        patchStatus,
      },
      aiChatMessageRepo: {
        listRecentBySession: vi.fn().mockResolvedValue([]),
        create,
      },
      patientRepo: {
        findById: vi.fn().mockResolvedValue({ id: 'patient-1', preferredLanguage: 'zh' }),
      },
      messageRepo: {
        save: saveMessage,
      },
    });

    const res = await patientProtectedRoutes.request(`/sessions/${sessionId}/process-confirmation`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(patchStatus).toHaveBeenCalledWith(sessionId, 'beauty', expect.objectContaining({
      processExplained: true,
      journeyCurrentStage: 'COLLECT_MEDICAL_INPUTS',
      journeyCurrentPhase: 'active',
    }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      id: expect.any(String),
      sessionId: 'ai-session-1',
      role: 'ASSISTANT',
      content: expect.stringContaining('感谢您确认医疗旅行流程'),
      metadata: expect.objectContaining({
        processConfirmationMessage: true,
        chatbotV3: expect.objectContaining({
          journey: { stage: 'COLLECT_MEDICAL_INPUTS', phase: 'active' },
          cards: [expect.objectContaining({ cardType: 'UPLOAD_RECORDS' })],
        }),
      }),
    }));
    expect(saveMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: create.mock.calls[0]?.[0]?.id,
      conversationId: 'conv-1',
      senderRole: 'AI',
      senderName: 'Medora AI',
      content: expect.stringContaining('感谢您确认医疗旅行流程'),
      messageType: 'TEXT',
      moderationStatus: 'ALLOWED',
    }));
    expect(conversation.updateLastMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: create.mock.calls[0]?.[0]?.id,
      content: expect.stringContaining('感谢您确认医疗旅行流程'),
    }));
    expect(saveConversation).toHaveBeenCalledWith(conversation);
    expect(await res.json()).toEqual(expect.objectContaining({
      ok: true,
      status: 'confirmed',
    }));
  });

  it('reuses the deterministic process confirmation message on duplicate inserts', async () => {
    const sessionId = 'widget-chat:patient-1:case-1';
    const aiChatSession = {
      id: 'ai-session-duplicate',
      sessionId,
      site: 'beauty',
      patientId: 'patient-1',
      statusSnapshot: {
        processExplained: true,
        lastAssistantMessageAt: new Date('2026-05-31T00:00:00.000Z'),
      },
    };
    const existingCreatedAt = new Date('2026-05-31T00:00:01.000Z');
    const duplicateError = Object.assign(new Error('duplicate key value violates unique constraint'), { code: '23505' });
    const create = vi.fn().mockRejectedValue(duplicateError);
    const updateMessage = vi.fn().mockResolvedValue({
      id: 'existing-process-message',
      sessionId: aiChatSession.id,
      role: 'ASSISTANT',
      content: 'Thank you for confirming the medical travel process.',
      citations: [],
      metadata: {
        processConfirmationMessage: true,
        processConfirmationMessageVersion: 'process-confirmation-v1',
      },
      createdAt: existingCreatedAt,
    });
    const saveMessage = vi.fn().mockImplementation(async (message) => message);
    const conversation = {
      id: 'conv-1',
      caseId: 'case-1',
      category: 'ADMIN_PATIENT',
      hospitalId: null,
      assistantMode: 'AI_ACTIVE',
      updateLastMessage: vi.fn(),
    };
    mockGetServices.mockReturnValue({
      conversationRepo: {
        findByPatientId: vi.fn().mockResolvedValue([conversation]),
        save: vi.fn().mockImplementation(async (savedConversation) => savedConversation),
      },
      aiChatSessionRepo: {
        findBySessionId: vi.fn().mockResolvedValue(aiChatSession),
        patchStatus: vi.fn().mockResolvedValue(aiChatSession),
      },
      aiChatMessageRepo: {
        listRecentBySession: vi.fn().mockResolvedValue([]),
        create,
        updateMessage,
      },
      patientRepo: {
        findById: vi.fn().mockResolvedValue({ id: 'patient-1', preferredLanguage: 'en' }),
      },
      messageRepo: {
        save: saveMessage,
      },
    });

    const res = await patientProtectedRoutes.request(`/sessions/${sessionId}/process-confirmation`, {
      method: 'POST',
    });

    expect(res.status).toBe(200);
    expect(create).toHaveBeenCalledOnce();
    expect(updateMessage).toHaveBeenCalledWith(create.mock.calls[0]?.[0]?.id, {});
    expect(saveMessage).toHaveBeenCalledWith(expect.objectContaining({
      id: create.mock.calls[0]?.[0]?.id,
      conversationId: 'conv-1',
      content: 'Thank you for confirming the medical travel process.',
      createdAt: existingCreatedAt,
    }));
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

  it('creates a server-priced Stripe checkout after Written Review intake', async () => {
    const caseId = '11111111-1111-4111-8111-111111111111';
    const orderId = '22222222-2222-4222-8222-222222222222';
    const createCheckoutSession = vi.fn().mockResolvedValue({
      id: 'cs_test_written_review',
      url: 'https://checkout.stripe.com/c/pay/cs_test_written_review',
    });
    mockGetStripe.mockReturnValue({ checkout: { sessions: { create: createCheckoutSession } } });
    vi.stubEnv('CHINA_ORIGIN', 'https://medicaltourismchina.health/');

    const createOrder = {
      execute: vi.fn().mockResolvedValue({
        id: orderId,
        caseId,
        patientId: 'patient-1',
        type: 'SECOND_OPINION',
        amount: '99.00',
        currency: 'USD',
        status: 'PENDING_PAYMENT',
        metadata: { serviceName: 'Written Review' },
        version: 1,
      }),
    };
    mockGetServices.mockReturnValue({
      caseRepo: { findById: vi.fn().mockResolvedValue({ id: caseId, patientId: 'patient-1' }) },
      createOrder,
    });

    const res = await patientProtectedRoutes.request('/orders/written-review/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caseId, idempotencyKey: 'written-review-intake-1' }),
    });

    expect(res.status).toBe(201);
    expect(createOrder.execute).toHaveBeenCalledWith(expect.objectContaining({
      caseId,
      type: 'SECOND_OPINION',
      amount: '99.00',
      currency: 'USD',
    }), expect.objectContaining({ userId: 'patient-1', role: 'PATIENT' }));
    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [expect.objectContaining({
          price_data: expect.objectContaining({ currency: 'usd', unit_amount: 9900 }),
        })],
        metadata: expect.objectContaining({ orderId, caseId, patientId: 'patient-1' }),
        success_url: `https://medicaltourismchina.health/dashboard?tab=orders&orderId=${orderId}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `https://medicaltourismchina.health/dashboard?tab=orders&orderId=${orderId}&checkout=cancelled`,
      }),
      { idempotencyKey: `patient-order-checkout-${orderId}-v1` },
    );
    expect(await res.json()).toEqual({
      orderId,
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_written_review',
    });
  });

  it('reopens Stripe checkout for an existing pending patient order', async () => {
    const orderId = '22222222-2222-4222-8222-222222222222';
    const createCheckoutSession = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/retry' });
    mockGetStripe.mockReturnValue({ checkout: { sessions: { create: createCheckoutSession } } });
    vi.stubEnv('PATIENT_APP_ORIGIN', 'https://medicaltourismchina.health');
    mockGetServices.mockReturnValue({
      getOrder: {
        execute: vi.fn().mockResolvedValue({
          id: orderId,
          caseId: '11111111-1111-4111-8111-111111111111',
          patientId: 'patient-1',
          type: 'SECOND_OPINION',
          amount: '99.00',
          currency: 'USD',
          status: 'PENDING_PAYMENT',
          metadata: { serviceName: 'Written Review' },
          version: 1,
        }),
      },
    });

    const res = await patientProtectedRoutes.request(`/orders/${orderId}/payment-intents`, { method: 'POST' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ orderId, checkoutUrl: 'https://checkout.stripe.com/retry' });
  });
});
