import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EmailRoleConflictError,
  PatientAlreadyExistsError,
  VerifyPatientEntryTokenAuthError,
} from '@medical-crm/application';
import patientPublicRoutes from '../routes/patient-public.routes.js';

const { mockGetServices } = vi.hoisted(() => ({
  mockGetServices: vi.fn(),
}));

vi.mock('../composition-root.js', () => ({
  getServices: mockGetServices,
}));

describe('patientPublicRoutes', () => {
  function createBaseServices(overrides: Record<string, unknown> = {}) {
    return {
      initOnboarding: { execute: vi.fn() },
      patientAuthService: {
        verifySessionToken: vi.fn(),
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
        }),
      },
      aiChatMessageRepo: {
        listBySession: vi.fn().mockResolvedValue([]),
        create: vi.fn(),
        updateMessage: vi.fn(),
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    mockGetServices.mockReset();
  });

  it('returns a restore token from onboarding and still sets the patient session cookie', async () => {
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
      matchHospitals: {
        execute: vi.fn().mockResolvedValue({
          hospitals: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              name: 'Shenzhen ENT Center',
              nameEn: 'Shenzhen ENT Center',
              rating: null,
              logoUrl: 'https://example.com/logo.png',
              tags: ['ENT', 'International desk'],
              procedureCount: 3,
            },
            {
              id: '33333333-3333-4333-8333-333333333333',
              name: 'Shenzhen Second Hospital',
              nameEn: 'Shenzhen Second Hospital',
              rating: null,
              logoUrl: null,
              tags: [],
              procedureCount: 2,
            },
            {
              id: '44444444-4444-4444-8444-444444444444',
              name: 'Shenzhen Third Hospital',
              nameEn: 'Shenzhen Third Hospital',
              rating: null,
              logoUrl: null,
              tags: [],
              procedureCount: 1,
            },
            {
              id: '55555555-5555-4555-8555-555555555555',
              name: 'Shenzhen Fourth Hospital',
              nameEn: 'Shenzhen Fourth Hospital',
              rating: null,
              logoUrl: null,
              tags: [],
              procedureCount: 1,
            },
          ],
        }),
      },
    });
    mockGetServices.mockReturnValue(services);

    const res = await patientPublicRoutes.request('/onboarding/init', {
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
    expect(services.aiChatMessageRepo.create).toHaveBeenCalledOnce();
    expect(services.aiChatMessageRepo.create.mock.calls[0]?.[0]).toMatchObject({
      role: 'ASSISTANT',
      nextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
      metadata: {
        internalNextAction: 'SHOW_HOSPITAL_RECOMMENDATIONS',
        blocks: [
          expect.objectContaining({
            type: 'HOSPITAL_RECOMMENDATION_CARDS',
            caseId: '11111111-1111-4111-8111-111111111111',
          }),
        ],
      },
    });
    const createdBlocks = services.aiChatMessageRepo.create.mock.calls[0]?.[0]?.metadata?.blocks;
    expect(createdBlocks?.[0]?.hospitals).toHaveLength(3);
    expect(createdBlocks?.[0]?.hospitals?.[0]).toMatchObject({
      hospitalId: '22222222-2222-4222-8222-222222222222',
      name: 'Shenzhen ENT Center',
      reason: 'ENT • International desk',
      summary: 'ENT • International desk',
      thumbnailUrl: 'https://example.com/logo.png',
    });
    expect(createdBlocks?.[0]?.hospitals?.[0]?.thumbnailFallbackUrls).toBeUndefined();
  });

  it('rewrites stale starter hospital blocks down to three items instead of keeping the old long list', async () => {
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
    const updateMessage = vi.fn();
    const services = createBaseServices({
      initOnboarding: { execute },
      matchHospitals: {
        execute: vi.fn().mockResolvedValue({
          hospitals: [
            { id: '22222222-2222-4222-8222-222222222222', name: 'A', nameEn: 'A', rating: null, logoUrl: null, tags: [], procedureCount: 1 },
            { id: '33333333-3333-4333-8333-333333333333', name: 'B', nameEn: 'B', rating: null, logoUrl: null, tags: [], procedureCount: 1 },
            { id: '44444444-4444-4444-8444-444444444444', name: 'C', nameEn: 'C', rating: null, logoUrl: null, tags: [], procedureCount: 1 },
            { id: '55555555-5555-4555-8555-555555555555', name: 'D', nameEn: 'D', rating: null, logoUrl: null, tags: [], procedureCount: 1 },
          ],
        }),
      },
      aiChatMessageRepo: {
        listBySession: vi.fn().mockResolvedValue([
          {
            id: 'assistant-1',
            role: 'ASSISTANT',
            metadata: {
              blocks: [
                {
                  id: 'hospital-cards-1',
                  type: 'HOSPITAL_RECOMMENDATION_CARDS',
                  title: 'Recommended hospitals',
                  caseId: '11111111-1111-4111-8111-111111111111',
                  selectPath: '/select-hospitals',
                  hospitals: [
                    { hospitalId: '1f0f3f8b-4d23-4b6e-9303-0ffbb48ac001', name: 'Old 1' },
                    { hospitalId: '1f0f3f8b-4d23-4b6e-9303-0ffbb48ac002', name: 'Old 2' },
                    { hospitalId: '1f0f3f8b-4d23-4b6e-9303-0ffbb48ac003', name: 'Old 3' },
                    { hospitalId: '1f0f3f8b-4d23-4b6e-9303-0ffbb48ac004', name: 'Old 4' },
                  ],
                },
              ],
            },
          },
        ]),
        create: vi.fn(),
        updateMessage,
      },
    });
    mockGetServices.mockReturnValue(services);

    const res = await patientPublicRoutes.request('/onboarding/init', {
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
    expect(updateMessage).toHaveBeenCalledOnce();
    expect(updateMessage.mock.calls[0]?.[1]?.metadata?.blocks?.[0]?.hospitals).toHaveLength(3);
    expect(updateMessage.mock.calls[0]?.[1]?.content).toBe('');
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

    const res = await patientPublicRoutes.request('/onboarding/init', {
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

    const res = await patientPublicRoutes.request('/onboarding/init', {
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
    expect(verifySessionToken).toHaveBeenCalledWith('session-cookie-abc');
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      email: 'existing@example.com',
      authenticatedPatientId: 'patient-123',
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

    const res = await patientPublicRoutes.request('/onboarding/init', {
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
    expect(verifyRegisterToken).toHaveBeenCalledWith({ token: 'register-token-abc' });
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

    const res = await patientPublicRoutes.request('/onboarding/init', {
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

    const res = await patientPublicRoutes.request('/onboarding/init', {
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

    const res = await patientPublicRoutes.request('/onboarding/init', {
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
