import React from 'react';
// @ts-expect-error hospital tests do not include react-dom type declarations
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSession = vi.fn();
const mockExtractUserFromToken = vi.fn();
const mockApiFetch = vi.fn();
const mockLoadMessages = vi.fn(async (locale: string) => ({ locale }));
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/lib/session', () => ({
  getSession: mockGetSession,
}));

vi.mock('@/lib/keycloak-client', () => ({
  extractUserFromToken: mockExtractUserFromToken,
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: mockApiFetch,
}));

vi.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/portal-shell', () => ({
  PortalShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/hospital-i18n', () => ({
  HospitalI18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@medical-crm/i18n', async () => {
  const actual = await vi.importActual<typeof import('@medical-crm/i18n')>('@medical-crm/i18n');
  return {
    ...actual,
    loadMessages: mockLoadMessages,
    normalizeLocale: (locale?: string) => locale ?? 'en',
  };
});

describe('Hospital portal layout', () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { React?: typeof React }).React = React;
    vi.resetModules();
    mockGetSession.mockResolvedValue({ access_token: 'token-1' });
    mockExtractUserFromToken.mockReturnValue({
      sub: 'user-1',
      email: 'hospital@example.com',
      roles: ['hospital'],
      hospital_id: 'hospital-1',
    });
    mockApiFetch.mockReset();
    mockLoadMessages.mockClear();
  });

  it('redirects to login when the profile request returns 401', async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    const { default: PortalLayout } = await import('@/app/(portal)/layout');

    await expect(
      PortalLayout({ children: <div>Portal content</div> }),
    ).rejects.toThrow('REDIRECT:/auth/login');
  });

  it('falls back to the default locale when the profile request fails with a non-auth error', async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service unavailable',
    });

    const { default: PortalLayout } = await import('@/app/(portal)/layout');
    const markup = renderToStaticMarkup(
      await PortalLayout({ children: <div>Portal content</div> }),
    );

    expect(mockLoadMessages).toHaveBeenCalledWith('en');
    expect(markup).toContain('Portal content');
  });
});
