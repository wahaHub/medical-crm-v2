import React from 'react';
import { Poppins } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import {
  DEFAULT_LOCALE,
  loadMessages,
  normalizeLocale,
  translateMessage,
} from '@medical-crm/i18n';
import { QueryProvider } from '@/lib/query-provider';
import {
  HospitalI18nProvider,
  HOSPITAL_LOCALE_COOKIE_NAME,
} from '@/lib/hospital-i18n';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
});

async function getInitialLocale() {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(HOSPITAL_LOCALE_COOKIE_NAME)?.value;
  if (cookieLocale) {
    return normalizeLocale(cookieLocale);
  }

  const headerStore = await headers();
  const acceptLanguage = headerStore.get('accept-language');
  const firstAcceptedLocale = acceptLanguage?.split(',')[0]?.trim();
  return normalizeLocale(firstAcceptedLocale ?? DEFAULT_LOCALE);
}

export async function generateMetadata() {
  const locale = await getInitialLocale();
  const messages = await loadMessages(locale);

  return {
    title: translateMessage(
      messages,
      'hospital.app.title',
      undefined,
      'Medical CRM — Hospital Portal',
    ),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getInitialLocale();
  const messages = await loadMessages(locale);

  return (
    <html lang={locale} className={poppins.variable}>
      <body className="font-[family-name:var(--font-poppins)] bg-slate-50 antialiased">
        <QueryProvider>
          <HospitalI18nProvider initialLocale={locale} initialMessages={messages}>
            {children}
          </HospitalI18nProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
