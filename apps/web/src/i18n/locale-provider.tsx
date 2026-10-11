'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { NextIntlClientProvider, useLocale } from 'next-intl';
import en from './messages/en.json';
import es from './messages/es.json';

type Locale = 'en' | 'es';
const LocaleContext = createContext<(locale: Locale) => void>(() => {});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    try {
      if (localStorage.getItem('pawstead-locale') === 'es') setLocale('es');
    } catch {
      /* Storage can be unavailable in private browsers. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const changeLocale = (next: Locale) => {
    setLocale(next);
    try {
      localStorage.setItem('pawstead-locale', next);
    } catch {
      /* The current session still changes language. */
    }
  };
  return (
    <LocaleContext.Provider value={changeLocale}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'es' ? es : en}
        timeZone="America/Havana"
      >
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}

export function LanguageSwitch() {
  const change = useContext(LocaleContext);
  const locale = useLocale();
  return (
    <select
      className="language-switch"
      aria-label="Language / Idioma"
      value={locale}
      onChange={(e) => change(e.target.value as Locale)}
    >
      <option value="en">English</option>
      <option value="es">Español</option>
    </select>
  );
}
