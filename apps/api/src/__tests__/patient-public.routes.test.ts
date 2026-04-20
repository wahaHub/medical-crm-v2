import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EmailRoleConflictError,
  PatientAlreadyExistsError,
  VerifyPatientEntryTokenAuthError,
} from '@medical-crm/application';
import { NotFoundError } from '@medical-crm/utils';
import patientPublicRoutes from '../routes/patient-public.routes.js';

const { mockGetServices } = vi.hoisted(() => ({
  mockGetServices: vi.fn(),
}));

vi.mock('../composition-root.js', () => ({
  getServices: mockGetServices,
}));

describe('patientPublicRoutes', () => {
  function requestWithSite(path: string, init?: RequestInit, site = 'beauty') {
    return patientPublicRoutes.request(path, {
      ...init,
      headers: {
        'x-medora-site': site,
        ...(init?.headers ?? {}),
      },
    });
  }

  function createBaseServices(overrides: Record<string, unknown> = {}) {
    return {
      initOnboarding: { execute: vi.fn() },
      sendPatientOnboardingEmail: { execute: vi.fn().mockResolvedValue({ token: 'patient-login-token' }) },
      patientAuthService: {
        verifySessionToken: vi.fn(),
      },
      getProfile: {
        execute: vi.fn().mockResolvedValue({
          id: 'patient-123',
          email: 'existing@example.com',
          name: 'Existing User',
          role: 'PATIENT',
          phone: null,
          preferredLanguage: 'en',
          hospitalId: null,
          notificationSettings: null,
        }),
      },
      verifyPatientEntryToken: {
        execute: vi.fn(),
      },
      matchHospitals: {
        execute: vi.fn().mockResolvedValue({ hospitals: [] }),
      },
      aiChatSessionRepo: {
        findBySessionId: vi.fn().mockResolvedValue({
          id: 'ai-session-1',
          sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
          site: 'beauty',
          difyConversationId: null,
          hospitalType: 'REGULAR',
          statusSnapshot: {},
        }),
        save: vi.fn().mockImplementation(async (entity) => entity),
        setDifyConversationId: vi.fn().mockResolvedValue(null),
      },
      aiChatMessageRepo: {
        listBySession: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        updateMessage: vi.fn(),
      },
      difyApi: {
        createChatMessage: vi.fn().mockResolvedValue({
          conversation_id: 'dify-conversation-1',
          answer: JSON.stringify({
            answer: 'Thanks for sharing your details. Choosing a few preferred hospitals helps us narrow the right care path for you. Here are a few strong starting points.',
            nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
            internalNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
            shortlist: [
              {
                hospitalId: '22222222-2222-4222-8222-222222222222',
                name: 'Shenzhen ENT Center',
                reason: 'ENT • International desk',
                summary: 'ENT • International desk',
                thumbnailUrl: 'https://example.com/logo.png',
              },
              {
                hospitalId: '33333333-3333-4333-8333-333333333333',
                name: 'Shenzhen Second Hospital',
              },
              {
                hospitalId: '44444444-4444-4444-8444-444444444444',
                name: 'Shenzhen Third Hospital',
              },
            ],
          }),
          metadata: { retriever_resources: [] },
        }),
      },
      difyClassifierApi: {
        createChatMessage: vi.fn(),
      },
      difyFaqGroundingApi: {
        createChatMessage: vi.fn().mockResolvedValue({
          answer: JSON.stringify({
            faqScope: 'GENERAL_ONLY',
            categories: ['Consultation Process'],
            groundedContext: 'Grounded process context',
          }),
        }),
      },
      getTemplateByDisease: {
        execute: vi.fn().mockRejectedValue(new Error('default questionnaire unavailable')),
      },
      getAiPolicyContext: {
        execute: vi.fn().mockResolvedValue({
          chatbot_v2: {
            source: 'status_snapshot_bridge',
            scope_id: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
            journey_snapshot: {
              current_stage: 'RECOMMENDATION',
              current_phase: 'active',
            },
            allowed_resources: [{
              resource_type: 'HOSPITAL_RECOMMENDATION',
              resource_id: 'hospital-recommendation:widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
              status: 'available',
              stage_binding: {
                stage: 'RECOMMENDATION',
                phase: 'active',
              },
              visibility: {
                mode: 'journey',
              },
              payload: {
                recommendationKind: 'hospital',
              },
              actions: ['open', 'submit'],
            }],
          },
        }),
      },
      notifyAdminsOfNewCase: {
        execute: vi.fn().mockResolvedValue(undefined),
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    mockGetServices.mockReset();
  });

  it('returns a restore token from onboarding and seeds the widget through Dify instead of local hospital matching', async () => {
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-1',
      caseId: '11111111-1111-4111-8111-111111111111',
      nextStep: 'select-hospitals',
      token: 'session-token-123',
      restoreToken: 'restore-token-123',
      restoreCookie: 'restore-cookie-123',
      isExistingPatient: false,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      },
    });
    const services = createBaseServices({
      initOnboarding: { execute },
      getAiPolicyContext: {
        execute: vi.fn().mockResolvedValue({
          chatbot_v2: {
            source: 'status_snapshot_bridge',
            scope_id: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
            journey_snapshot: {
              current_stage: 'EXPLAIN_PROCESS',
              current_phase: 'active',
            },
            allowed_resources: [{
              resource_type: 'PROCESS_GUIDE',
              resource_id: 'process-guide:widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
              status: 'available',
              stage_binding: {
                stage: 'EXPLAIN_PROCESS',
                phase: 'active',
              },
              visibility: {
                mode: 'journey',
              },
              payload: {
                title: 'Understand our consultation process',
              },
              actions: ['open'],
            }],
          },
        }),
      },
    });
    mockGetServices.mockReturnValue(services);

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@example.com',
        name: 'New User',
        preferredLanguage: 'en',
        destination: 'Shenzhen',
        captchaToken: 'captcha-token',
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      patientId: 'patient-1',
      caseId: '11111111-1111-4111-8111-111111111111',
      nextStep: 'select-hospitals',
      isExistingPatient: false,
      restoreToken: 'restore-token-123',
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      },
    });
    expect(res.headers.get('set-cookie')).toContain('patient_session=session-token-123');
    expect(res.headers.get('set-cookie')).toContain('patient_restore=restore-cookie-123');
    await vi.waitFor(() => {
      expect(services.aiChatMessageRepo.updateMessage).toHaveBeenCalledOnce();
    });
    expect(services.difyApi.createChatMessage).toHaveBeenCalledOnce();
    expect(services.difyFaqGroundingApi.createChatMessage).toHaveBeenCalledOnce();
    expect(services.difyClassifierApi.createChatMessage).not.toHaveBeenCalled();
    expect(services.matchHospitals.execute).not.toHaveBeenCalled();
    const starterUpdate = services.aiChatMessageRepo.updateMessage.mock.calls[0]?.[1];
    expect(starterUpdate).toMatchObject({
      nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      metadata: {
        widgetStarterSeed: true,
        widgetStarterVersion: 'ai-v1',
        internalNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        classifierResult: {
          requestClass: 'process_explanation',
          targetResourceTypes: ['PROCESS_GUIDE'],
          includeProgressionFollowUp: false,
        },
        chatbotV2: expect.objectContaining({
          journeySnapshot: {
            currentStage: 'EXPLAIN_PROCESS',
            currentPhase: 'active',
          },
          requestClass: 'process_explanation',
          responseIntent: 'process_explanation',
        }),
      },
    });
    expect(starterUpdate?.metadata?.chatbotV2?.resources.map((resource: { resourceType: string }) => resource.resourceType)).toContain('PROCESS_GUIDE');
    expect(starterUpdate?.metadata?.chatbotV2?.resources.map((resource: { resourceType: string }) => resource.resourceType)).not.toContain('HOSPITAL_RECOMMENDATION');
    expect(starterUpdate?.metadata?.blocks).toBeUndefined();
    expect(services.aiChatSessionRepo.setDifyConversationId).toHaveBeenCalledWith(
      'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      'beauty',
      'dify-conversation-1',
    );
    expect(services.sendPatientOnboardingEmail.execute).toHaveBeenCalledWith({
      email: 'new@example.com',
      site: 'beauty',
      locale: 'en',
      summary: {
        country: undefined,
        department: undefined,
        condition: undefined,
        destination: 'Shenzhen',
        treatmentTimeline: undefined,
      },
    });
    expect(services.notifyAdminsOfNewCase.execute).toHaveBeenCalledWith({
      caseId: '11111111-1111-4111-8111-111111111111',
      patientId: 'patient-1',
      patientName: 'New User',
      patientEmail: 'new@example.com',
      site: 'beauty',
    });
    expect(services.difyApi.createChatMessage).toHaveBeenCalledWith(expect.objectContaining({
      inputs: expect.objectContaining({
        site: 'beauty',
        faqGrounding: JSON.stringify({
          faqScope: 'GENERAL_ONLY',
          categories: ['Consultation Process'],
          groundedContext: 'Grounded process context',
        }),
        chatbotV2: expect.any(String),
      }),
    }));
    const starterDifyPayload = services.difyApi.createChatMessage.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(JSON.parse(((starterDifyPayload.inputs as Record<string, unknown>).chatbotV2 as string))).toEqual(
      expect.objectContaining({
        journeySnapshot: {
          currentStage: 'EXPLAIN_PROCESS',
          currentPhase: 'active',
        },
        requestClass: 'process_explanation',
        responseIntent: 'process_explanation',
        resources: [
          expect.objectContaining({
            resourceType: 'PROCESS_GUIDE',
            resourceId: 'process-guide:widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
            status: 'available',
            stageBinding: {
              stage: 'EXPLAIN_PROCESS',
              phase: 'active',
            },
            visibility: {
              mode: 'global',
            },
            payload: {
              title: 'Understand our consultation process',
            },
            actions: ['open'],
          }),
        ],
      }),
    );
  });

  it('returns onboarding success without blocking on widget starter generation', async () => {
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-1',
      caseId: '11111111-1111-4111-8111-111111111111',
      nextStep: 'select-hospitals',
      token: 'session-token-123',
      restoreToken: 'restore-token-123',
      restoreCookie: 'restore-cookie-123',
      isExistingPatient: false,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      },
    });
    const starterDeferred = new Promise(() => {});
    const services = createBaseServices({
      initOnboarding: { execute },
      difyApi: {
        createChatMessage: vi.fn().mockReturnValue(starterDeferred),
      },
    });
    mockGetServices.mockReturnValue(services);

    const requestPromise = requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@example.com',
        name: 'New User',
        preferredLanguage: 'en',
        destination: 'Shenzhen',
        captchaToken: 'captcha-token',
      }),
    });

    const requestState = await Promise.race([
      requestPromise.then(async (response) => ({
        kind: 'resolved' as const,
        status: response.status,
        body: await response.json(),
      })),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        setTimeout(() => resolve({ kind: 'timeout' }), 25);
      }),
    ]);

    expect(requestState).toEqual({
      kind: 'resolved',
      status: 200,
      body: {
        patientId: 'patient-1',
        caseId: '11111111-1111-4111-8111-111111111111',
        nextStep: 'select-hospitals',
        isExistingPatient: false,
        restoreToken: 'restore-token-123',
        widgetChatTarget: {
          kind: 'CHATBOT_SESSION',
          sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
        },
      },
    });
  });

  it('does not send a follow-up onboarding email for existing patients', async () => {
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-1',
      caseId: '11111111-1111-4111-8111-111111111111',
      nextStep: 'messages-ready',
      token: 'session-token-123',
      restoreToken: 'restore-token-123',
      restoreCookie: 'restore-cookie-123',
      isExistingPatient: true,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      },
    });
    const services = createBaseServices({
      initOnboarding: { execute },
    });
    mockGetServices.mockReturnValue(services);

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'existing@example.com',
        name: 'Existing User',
        preferredLanguage: 'en',
        captchaToken: 'captcha-token',
      }),
    });

    expect(res.status).toBe(200);
    expect(services.sendPatientOnboardingEmail.execute).not.toHaveBeenCalled();
  });

  it('does not send a duplicate onboarding email when the submission is already backed by a register token', async () => {
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-1',
      caseId: '11111111-1111-4111-8111-111111111111',
      nextStep: 'select-hospitals',
      token: 'session-token-123',
      restoreToken: 'restore-token-123',
      restoreCookie: 'restore-cookie-123',
      isExistingPatient: false,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      },
    });
    const services = createBaseServices({
      initOnboarding: { execute },
      verifyPatientEntryToken: {
        execute: vi.fn().mockResolvedValue({
          email: 'new@example.com',
          purpose: 'patient-register',
        }),
      },
    });
    mockGetServices.mockReturnValue(services);

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@example.com',
        name: 'New User',
        preferredLanguage: 'en',
        registerToken: 'patient-register-token',
        captchaToken: 'captcha-token',
      }),
    });

    expect(res.status).toBe(200);
    expect(services.sendPatientOnboardingEmail.execute).not.toHaveBeenCalled();
  });

  it('does not overwrite an existing ai-v1 widget starter when the session has already been seeded', async () => {
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-1',
      caseId: '11111111-1111-4111-8111-111111111111',
      nextStep: 'select-hospitals',
      token: 'session-token-123',
      restoreToken: 'restore-token-123',
      restoreCookie: 'restore-cookie-123',
      isExistingPatient: false,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      },
    });
    const services = createBaseServices({
      initOnboarding: { execute },
      aiChatMessageRepo: {
        listBySession: vi.fn().mockResolvedValue([
          {
            id: 'assistant-1',
            role: 'ASSISTANT',
            content: 'Thanks for sharing your details. Let us walk through the next step.',
            metadata: {
              widgetStarterSeed: true,
              widgetStarterVersion: 'ai-v1',
            },
          },
        ]),
        create: vi.fn(),
        updateMessage: vi.fn(),
      },
    });
    mockGetServices.mockReturnValue(services);

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@example.com',
        name: 'New User',
        preferredLanguage: 'en',
        destination: 'Shenzhen',
      }),
    });

    expect(res.status).toBe(200);
    expect(services.difyApi.createChatMessage).not.toHaveBeenCalled();
    expect(services.aiChatMessageRepo.create).not.toHaveBeenCalled();
    expect(services.aiChatMessageRepo.updateMessage).not.toHaveBeenCalled();
  });

  it('clears stale starter metadata when async widget seeding fails on a reused starter row', async () => {
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-1',
      caseId: '11111111-1111-4111-8111-111111111111',
      nextStep: 'select-hospitals',
      token: 'session-token-123',
      restoreToken: 'restore-token-123',
      restoreCookie: 'restore-cookie-123',
      isExistingPatient: false,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      },
    });
    const services = createBaseServices({
      initOnboarding: { execute },
      aiChatMessageRepo: {
        listBySession: vi.fn().mockResolvedValue([
          {
            id: 'assistant-1',
            role: 'ASSISTANT',
            content: '',
            metadata: {
              widgetStarterSeed: true,
              widgetStarterVersion: 'old-version',
              draftState: 'provider_error',
              internalNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
              chatbotV2: {
                journeySnapshot: {
                  currentStage: 'RECOMMENDATION',
                  currentPhase: 'active',
                },
              },
              classifierResult: {
                requestClass: 'process_explanation',
              },
              blocks: [
                {
                  id: 'hospital-cards-1',
                  type: 'HOSPITAL_RECOMMENDATION_CARDS',
                  title: 'Recommended hospitals',
                  caseId: '11111111-1111-4111-8111-111111111111',
                  selectPath: '/select-hospitals',
                  hospitals: [
                    { hospitalId: 'hospital-1', name: 'Old Hospital' },
                  ],
                },
              ],
            },
          },
        ]),
        create: vi.fn(),
        updateMessage: vi.fn(),
      },
      difyApi: {
        createChatMessage: vi.fn().mockRejectedValue(new Error('starter provider down')),
      },
    });
    mockGetServices.mockReturnValue(services);

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@example.com',
        name: 'New User',
        preferredLanguage: 'en',
        destination: 'Shenzhen',
        captchaToken: 'captcha-token',
      }),
    });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(services.aiChatMessageRepo.updateMessage).toHaveBeenCalled();
    });
    expect(services.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      'assistant-1',
      expect.objectContaining({
        content: 'Thanks for sharing your details. We have opened your patient case and the next step will appear here shortly.',
        nextAction: null,
        shortlist: [],
        writebackStatus: 'failed',
        metadata: expect.objectContaining({
          draftState: 'provider_error',
          internalNextAction: null,
          chatbotV2: null,
          classifierResult: null,
          blocks: [],
        }),
      }),
    );
  });

  it('preserves refreshed writeback status before saving a widget starter difyConversationId', async () => {
    const questionnaireTemplateId = '55555555-5555-4555-8555-555555555555';
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-1',
      caseId: '11111111-1111-4111-8111-111111111111',
      nextStep: 'select-hospitals',
      token: 'session-token-123',
      restoreToken: 'restore-token-123',
      restoreCookie: 'restore-cookie-123',
      isExistingPatient: false,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      },
    });
    const services = createBaseServices({
      initOnboarding: { execute },
      aiChatSessionRepo: {
        findBySessionId: vi.fn()
          .mockResolvedValueOnce({
            id: 'ai-session-1',
            sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
            site: 'beauty',
            difyConversationId: null,
            hospitalType: 'REGULAR',
            statusSnapshot: {
              consultationStatus: 'not_introduced',
            },
          })
          .mockResolvedValueOnce({
            id: 'ai-session-1',
            sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
            site: 'beauty',
            difyConversationId: null,
            hospitalType: 'REGULAR',
            statusSnapshot: {
              consultationStatus: 'not_introduced',
            },
          }),
        save: vi.fn().mockImplementation(async (entity) => entity),
        setDifyConversationId: vi.fn().mockResolvedValue(null),
      },
      difyApi: {
        createChatMessage: vi.fn().mockResolvedValue({
          conversation_id: 'dify-conversation-docs-1',
          answer: JSON.stringify({
            answer: 'Please upload your reports so I can guide the next step.',
            nextAction: 'REQUEST_DOC_UPLOAD',
            internalNextAction: 'REQUEST_DOC_UPLOAD',
          }),
          metadata: { retriever_resources: [] },
        }),
      },
      caseRepo: {
        findById: vi.fn().mockResolvedValue({
          id: '11111111-1111-4111-8111-111111111111',
          structuredData: {
            patientHospitalSelection: {
              medicalFormStatus: 'NOT_STARTED',
            },
          },
        }),
      },
      getTemplateByDisease: {
        execute: vi.fn().mockResolvedValue({
          template: {
            id: questionnaireTemplateId,
          },
        }),
      },
    });
    mockGetServices.mockReturnValue(services);

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@example.com',
        name: 'New User',
        preferredLanguage: 'en',
        destination: 'Shenzhen',
      }),
    });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(services.aiChatSessionRepo.setDifyConversationId).toHaveBeenCalled();
    });
    expect(services.aiChatSessionRepo.setDifyConversationId).toHaveBeenCalledWith(
      'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      'beauty',
      'dify-conversation-docs-1',
    );
    expect(services.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextAction: 'REQUEST_DOC_UPLOAD',
        metadata: expect.objectContaining({
          internalNextAction: 'REQUEST_DOC_UPLOAD',
          chatbotV2: expect.objectContaining({
            journeySnapshot: {
              currentStage: 'RECOMMENDATION',
              currentPhase: 'active',
            },
            requestClass: 'process_explanation',
            responseIntent: 'process_explanation',
          }),
        }),
      }),
    );
  });

  it('builds REQUEST_DOC_UPLOAD starter blocks from the default questionnaire when questionnaire truth is still not submitted', async () => {
    const questionnaireTemplateId = '66666666-6666-4666-8666-666666666666';
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-1',
      caseId: '11111111-1111-4111-8111-111111111111',
      nextStep: 'select-hospitals',
      token: 'session-token-123',
      restoreToken: 'restore-token-123',
      restoreCookie: 'restore-cookie-123',
      isExistingPatient: false,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      },
    });
    const services = createBaseServices({
      initOnboarding: { execute },
      aiChatSessionRepo: {
        findBySessionId: vi.fn()
          .mockResolvedValueOnce({
            id: 'ai-session-1',
            sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
            site: 'beauty',
            difyConversationId: null,
            hospitalType: 'REGULAR',
            statusSnapshot: {
              consultationStatus: 'not_introduced',
            },
          })
          .mockResolvedValueOnce({
            id: 'ai-session-1',
            sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
            site: 'beauty',
            difyConversationId: null,
            hospitalType: 'REGULAR',
            statusSnapshot: {
              consultationStatus: 'not_introduced',
            },
          }),
        save: vi.fn().mockImplementation(async (entity) => entity),
        setDifyConversationId: vi.fn().mockResolvedValue(null),
      },
      difyApi: {
        createChatMessage: vi.fn().mockResolvedValue({
          conversation_id: 'dify-conversation-docs-2',
          answer: JSON.stringify({
            answer: 'Please upload your reports so I can guide the next step.',
            nextAction: 'REQUEST_DOC_UPLOAD',
            internalNextAction: 'REQUEST_DOC_UPLOAD',
          }),
          metadata: { retriever_resources: [] },
        }),
      },
      getTemplateByDisease: {
        execute: vi.fn().mockResolvedValue({
          template: {
            id: questionnaireTemplateId,
          },
        }),
      },
      caseRepo: {
        findById: vi.fn().mockResolvedValue({
          id: '11111111-1111-4111-8111-111111111111',
          structuredData: {
            patientHospitalSelection: {
              medicalFormStatus: 'NOT_STARTED',
            },
          },
        }),
      },
    });
    mockGetServices.mockReturnValue(services);

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@example.com',
        name: 'New User',
        preferredLanguage: 'en',
        destination: 'Shenzhen',
      }),
    });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(services.aiChatMessageRepo.updateMessage).toHaveBeenCalled();
    });
    expect(services.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextAction: 'REQUEST_DOC_UPLOAD',
        metadata: expect.objectContaining({
          internalNextAction: 'REQUEST_DOC_UPLOAD',
          chatbotV2: expect.objectContaining({
            journeySnapshot: {
              currentStage: 'RECOMMENDATION',
              currentPhase: 'active',
            },
          }),
        }),
      }),
    );
    expect(services.getTemplateByDisease.execute).toHaveBeenCalledWith('DEFAULT');
  });

  it('prefers a case-specific questionnaire template when seeding REQUEST_DOC_UPLOAD starter blocks', async () => {
    const questionnaireTemplateId = '77777777-7777-4777-8777-777777777777';
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-1',
      caseId: '11111111-1111-4111-8111-111111111111',
      nextStep: 'select-hospitals',
      token: 'session-token-123',
      restoreToken: 'restore-token-123',
      restoreCookie: 'restore-cookie-123',
      isExistingPatient: false,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
      },
    });
    const services = createBaseServices({
      initOnboarding: { execute },
      aiChatSessionRepo: {
        findBySessionId: vi.fn()
          .mockResolvedValueOnce({
            id: 'ai-session-1',
            sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
            site: 'beauty',
            difyConversationId: null,
            hospitalType: 'REGULAR',
            statusSnapshot: {
              consultationStatus: 'not_introduced',
            },
          })
          .mockResolvedValueOnce({
            id: 'ai-session-1',
            sessionId: 'widget-chat:patient-1:11111111-1111-4111-8111-111111111111',
            site: 'beauty',
            difyConversationId: null,
            hospitalType: 'REGULAR',
            statusSnapshot: {
              consultationStatus: 'not_introduced',
            },
          }),
        save: vi.fn().mockImplementation(async (entity) => entity),
        setDifyConversationId: vi.fn().mockResolvedValue(null),
      },
      difyApi: {
        createChatMessage: vi.fn().mockResolvedValue({
          conversation_id: 'dify-conversation-docs-case-template',
          answer: JSON.stringify({
            answer: 'Please upload your reports so I can guide the next step.',
            nextAction: 'REQUEST_DOC_UPLOAD',
            internalNextAction: 'REQUEST_DOC_UPLOAD',
          }),
          metadata: { retriever_resources: [] },
        }),
      },
      caseRepo: {
        findById: vi.fn().mockResolvedValue({
          id: '11111111-1111-4111-8111-111111111111',
          questionCollectorTemplateId: questionnaireTemplateId,
          structuredData: {
            patientHospitalSelection: {
              medicalFormStatus: 'NOT_STARTED',
            },
          },
        }),
      },
    });
    mockGetServices.mockReturnValue(services);

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@example.com',
        name: 'New User',
        preferredLanguage: 'en',
        destination: 'Shenzhen',
      }),
    });

    expect(res.status).toBe(200);
    await vi.waitFor(() => {
      expect(services.aiChatMessageRepo.updateMessage).toHaveBeenCalled();
    });
    expect(services.aiChatMessageRepo.updateMessage).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        nextAction: 'REQUEST_DOC_UPLOAD',
        metadata: expect.objectContaining({
          internalNextAction: 'REQUEST_DOC_UPLOAD',
          chatbotV2: expect.objectContaining({
            journeySnapshot: {
              currentStage: 'RECOMMENDATION',
              currentPhase: 'active',
            },
          }),
        }),
      }),
    );
    expect(services.getTemplateByDisease.execute).not.toHaveBeenCalled();
  });

  it('allows onboarding without a captcha token while captcha is temporarily disabled', async () => {
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-1',
      caseId: 'case-1',
      nextStep: 'select-hospitals',
      token: 'session-token-123',
      restoreToken: 'restore-token-123',
      restoreCookie: 'restore-cookie-123',
      isExistingPatient: false,
    });
    mockGetServices.mockReturnValue(createBaseServices({
      initOnboarding: { execute },
    }));

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@example.com',
        name: 'New User',
        preferredLanguage: 'en',
      }),
    });

    expect(res.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@example.com',
      name: 'New User',
    }));
  });

  it('passes authenticated patient identity into onboarding when a valid patient session cookie is present', async () => {
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-123',
      caseId: 'case-2',
      nextStep: 'select-hospitals',
      token: 'session-token-456',
      restoreToken: 'restore-token-456',
      restoreCookie: 'restore-cookie-456',
      isExistingPatient: true,
    });
    const verifySessionToken = vi.fn().mockResolvedValue({
      userId: 'patient-123',
      role: 'PATIENT',
      exp: 9999999999,
    });
    mockGetServices.mockReturnValue(createBaseServices({
      initOnboarding: { execute },
      patientAuthService: { verifySessionToken },
    }));

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=session-cookie-abc',
      },
      body: JSON.stringify({
        email: 'existing@example.com',
        name: 'Existing User',
        preferredLanguage: 'en',
        captchaToken: 'captcha-token',
      }),
    });

    expect(res.status).toBe(200);
    expect(verifySessionToken).toHaveBeenCalledWith('session-cookie-abc', 'beauty');
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      email: 'existing@example.com',
      authenticatedPatientId: 'patient-123',
    }));
  });

  it('ignores an authenticated patient session when the submitted onboarding email does not match the logged-in patient email', async () => {
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-999',
      caseId: 'case-9',
      nextStep: 'select-hospitals',
      token: 'session-token-999',
      restoreToken: 'restore-token-999',
      restoreCookie: 'restore-cookie-999',
      isExistingPatient: false,
    });
    const verifySessionToken = vi.fn().mockResolvedValue({
      userId: 'patient-123',
      role: 'PATIENT',
      exp: 9999999999,
    });
    const getPatientSessionState = {
      execute: vi.fn().mockResolvedValue({
        email: 'existing@example.com',
        id: 'patient-123',
        name: 'Existing User',
        role: 'PATIENT',
        phone: null,
        preferredLanguage: 'en',
        hospitalId: null,
        notificationSettings: null,
      }),
    };
    mockGetServices.mockReturnValue(createBaseServices({
      initOnboarding: { execute },
      patientAuthService: { verifySessionToken },
      getProfile: getPatientSessionState,
    }));

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=session-cookie-abc',
      },
      body: JSON.stringify({
        email: 'brand-new@example.com',
        name: 'Brand New User',
        preferredLanguage: 'en',
        captchaToken: 'captcha-token',
      }),
    });

    expect(res.status).toBe(200);
    expect(verifySessionToken).toHaveBeenCalledWith('session-cookie-abc', 'beauty');
    expect(getPatientSessionState.execute).toHaveBeenCalledWith({
      userId: 'patient-123',
      email: '',
      role: 'PATIENT',
      hospitalId: null,
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      email: 'brand-new@example.com',
      authenticatedPatientId: undefined,
    }));
  });

  it('ignores a stale authenticated patient session when the underlying patient can no longer be loaded', async () => {
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-999',
      caseId: 'case-10',
      nextStep: 'select-hospitals',
      token: 'session-token-999',
      restoreToken: 'restore-token-999',
      restoreCookie: 'restore-cookie-999',
      isExistingPatient: false,
    });
    const verifySessionToken = vi.fn().mockResolvedValue({
      userId: 'patient-deleted-123',
      role: 'PATIENT',
      exp: 9999999999,
    });
    const getPatientSessionState = {
      execute: vi.fn().mockRejectedValue(new NotFoundError('User patient-deleted-123 not found')),
    };
    mockGetServices.mockReturnValue(createBaseServices({
      initOnboarding: { execute },
      patientAuthService: { verifySessionToken },
      getProfile: getPatientSessionState,
    }));

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_session=session-cookie-abc',
      },
      body: JSON.stringify({
        email: 'brand-new@example.com',
        name: 'Recovered User',
        preferredLanguage: 'en',
        captchaToken: 'captcha-token',
      }),
    });

    expect(res.status).toBe(200);
    expect(getPatientSessionState.execute).toHaveBeenCalledWith({
      userId: 'patient-deleted-123',
      email: '',
      role: 'PATIENT',
      hospitalId: null,
    });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      email: 'brand-new@example.com',
      authenticatedPatientId: undefined,
    }));
  });

  it('verifies a register token and passes the verified email into onboarding', async () => {
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-5',
      caseId: 'case-5',
      nextStep: 'select-hospitals',
      token: 'session-token-789',
      restoreToken: 'restore-token-789',
      restoreCookie: 'restore-cookie-789',
      isExistingPatient: false,
    });
    const verifyRegisterToken = vi.fn().mockResolvedValue({
      email: 'new@example.com',
      purpose: 'patient-register',
    });
    mockGetServices.mockReturnValue(createBaseServices({
      initOnboarding: { execute },
      patientAuthService: {
        verifySessionToken: vi.fn().mockRejectedValue(new Error('Invalid session token')),
      },
      verifyPatientEntryToken: { execute: verifyRegisterToken },
    }));

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@example.com',
        name: 'New User',
        preferredLanguage: 'en',
        captchaToken: 'captcha-token',
        registerToken: 'register-token-abc',
      }),
    });

    expect(res.status).toBe(200);
    expect(verifyRegisterToken).toHaveBeenCalledWith({ token: 'register-token-abc', site: 'beauty' });
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@example.com',
      verifiedRegisterEmail: 'new@example.com',
    }));
  });

  it('returns 401 when register-token verification fails during onboarding', async () => {
    const verifyRegisterToken = vi.fn().mockRejectedValue(new VerifyPatientEntryTokenAuthError('Invalid token'));
    const execute = vi.fn();
    mockGetServices.mockReturnValue(createBaseServices({
      initOnboarding: { execute },
      patientAuthService: {
        verifySessionToken: vi.fn().mockRejectedValue(new Error('Invalid session token')),
      },
      verifyPatientEntryToken: { execute: verifyRegisterToken },
    }));

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@example.com',
        name: 'New User',
        preferredLanguage: 'en',
        captchaToken: 'captcha-token',
        registerToken: 'expired-register-token',
      }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(execute).not.toHaveBeenCalled();
  });

  it('returns a stable 409 response when onboarding hits an existing-patient conflict', async () => {
    const execute = vi.fn().mockRejectedValue(new PatientAlreadyExistsError());
    mockGetServices.mockReturnValue(createBaseServices({
      initOnboarding: { execute },
    }));

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'existing@example.com',
        name: 'Existing User',
        preferredLanguage: 'en',
        captchaToken: 'captcha-token',
      }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'This email is already registered as a patient. Please sign in instead.',
      code: 'PATIENT_ALREADY_EXISTS',
    });
  });

  it('returns a stable 409 response when onboarding hits a hospital/admin role conflict', async () => {
    const execute = vi.fn().mockRejectedValue(new EmailRoleConflictError());
    mockGetServices.mockReturnValue(createBaseServices({
      initOnboarding: { execute },
    }));

    const res = await requestWithSite('/onboarding/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'hospital@example.com',
        name: 'Hospital User',
        preferredLanguage: 'en',
        captchaToken: 'captcha-token',
      }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'This email is already associated with a hospital or admin account.',
      code: 'EMAIL_ROLE_CONFLICT',
    });
  });
});
