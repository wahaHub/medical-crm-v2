'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import {
  DEFAULT_LOCALE,
  getMessageValue,
  loadMessages,
  normalizeLocale,
  translateMessage,
  type Locale,
  type Messages,
} from '@medical-crm/i18n';

type TranslationValues = Record<string, string | number>;
export const HOSPITAL_LOCALE_COOKIE_NAME = 'medical-crm-hospital-locale';

interface HospitalI18nContextValue {
  locale: Locale;
  isSwitchingLocale: boolean;
  setLocale: (nextLocale: string) => Promise<void>;
  t: (key: string, values?: TranslationValues, fallback?: string) => string;
  has: (key: string) => boolean;
}

const HospitalI18nContext = createContext<HospitalI18nContextValue | null>(null);

export function HospitalI18nProvider({
  initialLocale = DEFAULT_LOCALE,
  initialMessages,
  children,
}: {
  initialLocale?: string;
  initialMessages: Messages;
  children: ReactNode;
}) {
  const normalizedInitialLocale = normalizeLocale(initialLocale);
  const [locale, setLocaleState] = useState<Locale>(normalizedInitialLocale);
  const [messages, setMessages] = useState<Messages>(initialMessages);
  const [isSwitchingLocale, startTransition] = useTransition();

  useEffect(() => {
    setLocaleState(normalizeLocale(initialLocale));
    setMessages(initialMessages);
  }, [initialLocale, initialMessages]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.cookie = `${HOSPITAL_LOCALE_COOKIE_NAME}=${locale}; path=/; max-age=31536000; samesite=lax`;
  }, [locale]);

  const setLocale = async (nextLocaleInput: string) => {
    const nextLocale = normalizeLocale(nextLocaleInput);
    if (nextLocale === locale) return;

    const nextMessages = await loadMessages(nextLocale);
    startTransition(() => {
      setLocaleState(nextLocale);
      setMessages(nextMessages);
    });
  };

  const t = (key: string, values?: TranslationValues, fallback?: string) =>
    translateMessage(messages, key, values, fallback);

  const has = (key: string) => getMessageValue(messages, key) !== undefined;

  return (
    <HospitalI18nContext.Provider value={{ locale, isSwitchingLocale, setLocale, t, has }}>
      {children}
    </HospitalI18nContext.Provider>
  );
}

export function useHospitalI18n(): HospitalI18nContextValue {
  const ctx = useContext(HospitalI18nContext);
  if (!ctx) {
    throw new Error('useHospitalI18n must be used within HospitalI18nProvider');
  }
  return ctx;
}
