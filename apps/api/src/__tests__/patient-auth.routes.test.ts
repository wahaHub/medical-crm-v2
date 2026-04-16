import { describe, it, expect, vi, beforeEach } from 'vitest';
import patientAuthRoutes from '../routes/patient-auth.routes.js';
import {
  EmailRoleConflictError,
  RestoreGuestSessionAuthError,
  VerifyMagicLinkAuthError,
  VerifyPatientEntryTokenAuthError,
} from '@medical-crm/application';

const { mockGetServices } = vi.hoisted(() => ({
  mockGetServices: vi.fn(),
}));

vi.mock('../composition-root.js', () => ({
  getServices: mockGetServices,
}));

describe('patientAuthRoutes', () => {
  function requestWithSite(path: string, init?: RequestInit, site = 'beauty') {
    return patientAuthRoutes.request(path, {
      ...init,
      headers: {
        'x-medora-site': site,
        ...(init?.headers ?? {}),
      },
    });
  }

  beforeEach(() => {
    mockGetServices.mockReset();
  });

  it('returns ok for an existing patient email and dispatches dashboard-login delivery', async () => {
    const execute = vi.fn().mockResolvedValue({
      delivery: 'dashboard-login',
      token: 'patient-login-token',
    });
    mockGetServices.mockReturnValue({ sendPatientLoginLink: { execute } });

    const res = await requestWithSite('/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'patient@example.com' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(execute).toHaveBeenCalledWith({ email: 'patient@example.com', site: 'beauty' });
  });

  it('scopes magic-link rate limiting by site as well as email', async () => {
    const execute = vi.fn().mockResolvedValue({
      delivery: 'dashboard-login',
      token: 'patient-login-token',
    });
    mockGetServices.mockReturnValue({ sendPatientLoginLink: { execute } });

    const body = JSON.stringify({ email: 'same-email-cross-site@example.com' });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const res = await requestWithSite('/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }, 'beauty');
      expect(res.status).toBe(200);
    }

    const chinaRes = await requestWithSite('/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }, 'china');

    expect(chinaRes.status).toBe(200);
    expect(execute).toHaveBeenNthCalledWith(4, {
      email: 'same-email-cross-site@example.com',
      site: 'china',
    });
  });

  it('returns ok for an unregistered email and dispatches register delivery', async () => {
    const execute = vi.fn().mockResolvedValue({
      delivery: 'register',
      token: 'patient-register-token',
    });
    mockGetServices.mockReturnValue({ sendPatientLoginLink: { execute } });

    const res = await requestWithSite('/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(execute).toHaveBeenCalledWith({ email: 'new@example.com', site: 'beauty' });
  });

  it('returns 409 for hospital/admin email role conflict', async () => {
    const execute = vi.fn().mockRejectedValue(new EmailRoleConflictError());
    mockGetServices.mockReturnValue({ sendPatientLoginLink: { execute } });

    const res = await requestWithSite('/magic-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hospital@example.com' }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: 'This email is already associated with a hospital or admin account.',
      code: 'EMAIL_ROLE_CONFLICT',
    });
  });

  it('verifies a patient-register token without creating a session', async () => {
    const execute = vi.fn().mockResolvedValue({
      email: 'new@example.com',
      purpose: 'patient-register',
    });
    mockGetServices.mockReturnValue({ verifyPatientEntryToken: { execute } });

    const res = await requestWithSite('/register-token/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'register-token-abc' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      email: 'new@example.com',
      purpose: 'patient-register',
    });
    expect(execute).toHaveBeenCalledWith({ token: 'register-token-abc', site: 'beauty' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('returns 401 when register-token verification fails', async () => {
    const execute = vi.fn().mockRejectedValue(new VerifyPatientEntryTokenAuthError('Invalid token'));
    mockGetServices.mockReturnValue({ verifyPatientEntryToken: { execute } });

    const res = await requestWithSite('/register-token/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'expired-register-token' }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('returns a restore token from verify-token and sets the session and restore cookies', async () => {
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-1',
      sessionToken: 'session-token-verify',
      restoreToken: 'restore-token-verify',
      restoreCookie: 'restore-cookie-verify',
    });
    const getPatientSessionState = {
      execute: vi.fn().mockResolvedValue({
        id: 'patient-1',
        patientId: 'patient-1',
        name: 'Hao Wang',
        email: 'hao@example.com',
        patientCode: 'P001',
        preferredLanguage: 'en',
        caseId: 'case-1',
        nextStep: 'select-hospitals',
        selectedHospitalId: null,
        selectedHospitalIds: [],
        profileSubmitted: true,
        chatUnlocked: true,
        widgetChatTarget: {
          kind: 'CHATBOT_SESSION',
          sessionId: 'widget-chat:patient-1:case-1',
        },
        formalConversationState: {
          activeConversationId: 'conv-admin-1',
          conversationIds: ['conv-admin-1'],
        },
        chatbotOrchestrationState: {
          conversationSummary: '',
        },
      }),
    };
    mockGetServices.mockReturnValue({ verifyMagicLink: { execute }, getPatientSessionState });

    const res = await requestWithSite('/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'magic-token-abc' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: 'patient-1',
      patientId: 'patient-1',
      caseId: 'case-1',
      nextStep: 'select-hospitals',
      selectedHospitalIds: [],
      profileSubmitted: true,
      chatUnlocked: true,
      name: 'Hao Wang',
      email: 'hao@example.com',
      patientCode: 'P001',
      preferredLanguage: 'en',
      restoreToken: 'restore-token-verify',
      selectedHospitalId: null,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:case-1',
      },
      formalConversationState: {
        activeConversationId: 'conv-admin-1',
        conversationIds: ['conv-admin-1'],
      },
      chatbotOrchestrationState: {
        conversationSummary: '',
      },
    });
    expect(res.headers.get('set-cookie')).toContain('patient_session=session-token-verify');
    expect(res.headers.get('set-cookie')).toContain('patient_restore=restore-cookie-verify');
  });

  it('rejects a register-purpose token on /verify-token without creating a session', async () => {
    const execute = vi.fn().mockRejectedValue(new VerifyMagicLinkAuthError('Invalid token purpose'));
    mockGetServices.mockReturnValue({ verifyMagicLink: { execute } });

    const res = await requestWithSite('/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'register-token-abc' }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('logs in with password and sets the session and restore cookies', async () => {
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-1',
      sessionToken: 'session-token-login',
      restoreToken: 'restore-token-login',
      restoreCookie: 'restore-cookie-login',
    });
    const getPatientSessionState = {
      execute: vi.fn().mockResolvedValue({
        id: 'patient-1',
        patientId: 'patient-1',
        name: 'Hao Wang',
        email: 'hao@example.com',
        patientCode: 'P001',
        preferredLanguage: 'zh',
        caseId: 'case-1',
        nextStep: 'select-hospitals',
        selectedHospitalId: null,
        selectedHospitalIds: [],
        profileSubmitted: true,
        chatUnlocked: true,
        widgetChatTarget: {
          kind: 'CHATBOT_SESSION',
          sessionId: 'widget-chat:patient-1:case-1',
        },
        formalConversationState: {
          activeConversationId: 'conv-admin-1',
          conversationIds: ['conv-admin-1'],
        },
        chatbotOrchestrationState: {
          conversationSummary: '',
        },
      }),
    };
    mockGetServices.mockReturnValue({ loginWithPassword: { execute }, getPatientSessionState });

    const res = await requestWithSite('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hao@example.com', password: 'SecurePass123' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: 'patient-1',
      patientId: 'patient-1',
      caseId: 'case-1',
      nextStep: 'select-hospitals',
      selectedHospitalIds: [],
      profileSubmitted: true,
      chatUnlocked: true,
      name: 'Hao Wang',
      email: 'hao@example.com',
      patientCode: 'P001',
      preferredLanguage: 'zh',
      restoreToken: 'restore-token-login',
      selectedHospitalId: null,
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:case-1',
      },
      formalConversationState: {
        activeConversationId: 'conv-admin-1',
        conversationIds: ['conv-admin-1'],
      },
      chatbotOrchestrationState: {
        conversationSummary: '',
      },
    });
    expect(execute).toHaveBeenCalledWith({
      email: 'hao@example.com',
      password: 'SecurePass123',
      site: 'beauty',
    });
    expect(res.headers.get('set-cookie')).toContain('patient_session=session-token-login');
    expect(res.headers.get('set-cookie')).toContain('patient_restore=restore-cookie-login');
  });

  it('returns 401 when patient password login fails', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('Invalid credentials'));
    mockGetServices.mockReturnValue({ loginWithPassword: { execute } });

    const res = await requestWithSite('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hao@example.com', password: 'WrongPassword123' }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Invalid credentials' });
  });

  it('rejects restoreToken alone when restore cookie is missing', async () => {
    const execute = vi.fn();
    mockGetServices.mockReturnValue({ restoreGuestSession: { execute } });

    const res = await requestWithSite('/session/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restoreToken: 'restore-token-abc' }),
    });

    expect(res.status).toBe(401);
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects restore cookie alone when restoreToken is missing', async () => {
    const res = await requestWithSite('/session/restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_restore=restore-cookie-abc',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it('rejects mismatched restore token and restore cookie', async () => {
    const execute = vi.fn().mockRejectedValue(new RestoreGuestSessionAuthError('Restore token mismatch'));
    mockGetServices.mockReturnValue({ restoreGuestSession: { execute } });

    const res = await requestWithSite('/session/restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_restore=restore-cookie-correct',
      },
      body: JSON.stringify({ restoreToken: 'restore-token-abc' }),
    });

    expect(res.status).toBe(401);
    expect(execute).toHaveBeenCalledWith({
      restoreToken: 'restore-token-abc',
      restoreCookie: 'restore-cookie-correct',
      site: 'beauty',
    });
  });

  it('returns 500 when restore session fails unexpectedly', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('database unavailable'));
    mockGetServices.mockReturnValue({ restoreGuestSession: { execute } });

    const res = await requestWithSite('/session/restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_restore=restore-cookie-correct',
      },
      body: JSON.stringify({ restoreToken: 'restore-token-abc' }),
    });

    expect(res.status).toBe(500);
    expect(execute).toHaveBeenCalledWith({
      restoreToken: 'restore-token-abc',
      restoreCookie: 'restore-cookie-correct',
      site: 'beauty',
    });
  });

  it('restores a guest session and rotates both artifacts', async () => {
    const execute = vi.fn().mockResolvedValue({
      patientId: 'patient-1',
      sessionToken: 'session-token-restored',
      restoreToken: 'restore-token-new',
      restoreCookie: 'restore-cookie-new',
    });
    const getPatientSessionState = {
      execute: vi.fn().mockResolvedValue({
        id: 'patient-1',
        patientId: 'patient-1',
        name: 'Hao Wang',
        email: 'hao@example.com',
        patientCode: 'P001',
        preferredLanguage: 'en',
        caseId: 'case-1',
        nextStep: 'messages-ready',
        selectedHospitalId: 'hospital-1',
        selectedHospitalIds: ['hospital-1'],
        profileSubmitted: true,
        chatUnlocked: true,
        widgetChatTarget: {
          kind: 'CHATBOT_SESSION',
          sessionId: 'widget-chat:patient-1:case-1',
        },
        formalConversationState: {
          activeConversationId: 'conv-admin-1',
          conversationIds: ['conv-admin-1', 'conv-hospital-1'],
        },
        chatbotOrchestrationState: {
          conversationSummary: 'Patient selected hospital-1 and can continue.',
        },
      }),
    };
    mockGetServices.mockReturnValue({ restoreGuestSession: { execute }, getPatientSessionState });

    const res = await requestWithSite('/session/restore', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'patient_restore=restore-cookie-old',
      },
      body: JSON.stringify({ restoreToken: 'restore-token-old' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: 'patient-1',
      patientId: 'patient-1',
      caseId: 'case-1',
      nextStep: 'messages-ready',
      selectedHospitalId: 'hospital-1',
      selectedHospitalIds: ['hospital-1'],
      profileSubmitted: true,
      chatUnlocked: true,
      name: 'Hao Wang',
      email: 'hao@example.com',
      patientCode: 'P001',
      preferredLanguage: 'en',
      restoreToken: 'restore-token-new',
      widgetChatTarget: {
        kind: 'CHATBOT_SESSION',
        sessionId: 'widget-chat:patient-1:case-1',
      },
      formalConversationState: {
        activeConversationId: 'conv-admin-1',
        conversationIds: ['conv-admin-1', 'conv-hospital-1'],
      },
      chatbotOrchestrationState: {
        conversationSummary: 'Patient selected hospital-1 and can continue.',
      },
    });
    expect(res.headers.get('set-cookie')).toContain('patient_session=session-token-restored');
    expect(res.headers.get('set-cookie')).toContain('patient_restore=restore-cookie-new');
  });
});
