import React from 'react';
// @ts-expect-error hospital tests do not include react-dom type declarations
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLoadMessages = vi.fn(async (locale: string) => ({ locale }));
const mockCookies = vi.fn();
const mockHeaders = vi.fn();

vi.mock('next/font/google', () => ({
  Poppins: () => ({ variable: 'font-poppins' }),
}));

vi.mock('@/lib/query-provider', () => ({
  QueryProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/hospital-i18n', () => ({
  HOSPITAL_LOCALE_COOKIE_NAME: 'medical-crm-hospital-locale',
  HospitalI18nProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('next/headers', () => ({
  cookies: mockCookies,
  headers: mockHeaders,
}));

vi.mock('@medical-crm/i18n', async () => {
  const actual = await vi.importActual<typeof import('@medical-crm/i18n')>('@medical-crm/i18n');
  return {
    ...actual,
    loadMessages: mockLoadMessages,
  };
});

describe('hospital root layout locale selection', () => {
  beforeEach(() => {
    vi.resetModules();
    mockLoadMessages.mockClear();
    mockCookies.mockResolvedValue({
      get: () => undefined,
    });
    mockHeaders.mockResolvedValue(new Headers());
  });

  it('prefers the hospital locale cookie for initial messages and html lang', async () => {
    mockCookies.mockResolvedValue({
      get: (name: string) =>
        name === 'medical-crm-hospital-locale' ? { value: 'de' } : undefined,
    });
    mockHeaders.mockResolvedValue(
      new Headers({ 'accept-language': 'fr-CA,fr;q=0.9,en;q=0.8' }),
    );

    const { default: RootLayout } = await import('@/app/layout');
    const markup = renderToStaticMarkup(
      await RootLayout({ children: <div>Hallo</div> }),
    );

    expect(mockLoadMessages).toHaveBeenCalledWith('de');
    expect(markup).toContain('<html lang="de"');
  });

  it('falls back to the request accept-language header when no locale cookie exists', async () => {
    mockHeaders.mockResolvedValue(
      new Headers({ 'accept-language': 'fr-CA,fr;q=0.9,en;q=0.8' }),
    );

    const { default: RootLayout } = await import('@/app/layout');
    const markup = renderToStaticMarkup(
      await RootLayout({ children: <div>Bonjour</div> }),
    );

    expect(mockLoadMessages).toHaveBeenCalledWith('fr');
    expect(markup).toContain('<html lang="fr"');
  });
});
