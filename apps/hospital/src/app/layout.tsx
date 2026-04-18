import { Poppins } from 'next/font/google';
import { DEFAULT_LOCALE, loadMessages } from '@medical-crm/i18n';
import { QueryProvider } from '@/lib/query-provider';
import { HospitalI18nProvider } from '@/lib/hospital-i18n';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
});

export const metadata = {
  title: 'Medical CRM — Hospital Portal',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const messages = await loadMessages(DEFAULT_LOCALE);

  return (
    <html lang="en" className={poppins.variable}>
      <body className="font-[family-name:var(--font-poppins)] bg-slate-50 antialiased">
        <QueryProvider>
          <HospitalI18nProvider initialLocale={DEFAULT_LOCALE} initialMessages={messages}>
            {children}
          </HospitalI18nProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
