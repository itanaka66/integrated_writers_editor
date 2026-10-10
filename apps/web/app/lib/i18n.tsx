"use client";
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import en from "../locales/en";
import type { MessageKey, Messages } from "../locales/en";
import ja from "../locales/ja";
import zh from "../locales/zh";
import ko from "../locales/ko";
import es from "../locales/es";
import fr from "../locales/fr";
import de from "../locales/de";
import pt from "../locales/pt";

export type { MessageKey };

// ---------------------------------------------------------------------------
// The ONE place the supported UI languages are listed. To add / remove a
// language: edit this array, add / delete the matching locales/<code>.ts
// (typed against en.ts so a missing key is a compile error) and its entry in
// DICTIONARIES below.
// `name` is the language's own native name (shown in the login selector),
// `locale` is the BCP-47 tag used for dates / numbers.
// ---------------------------------------------------------------------------
export const LANGUAGES = [
  { code: "en", name: "English", locale: "en-US" },
  { code: "ja", name: "日本語", locale: "ja-JP" },
  { code: "zh", name: "简体中文", locale: "zh-CN" },
  { code: "ko", name: "한국어", locale: "ko-KR" },
  { code: "es", name: "Español", locale: "es-ES" },
  { code: "fr", name: "Français", locale: "fr-FR" },
  { code: "de", name: "Deutsch", locale: "de-DE" },
  { code: "pt", name: "Português", locale: "pt-BR" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

export const DICTIONARIES: Record<LanguageCode, Messages> = { en, ja, zh, ko, es, fr, de, pt };

export const STORAGE_KEY = "ine-language";
const FALLBACK_LANGUAGE: LanguageCode = "en";
// What useT() uses when there is no provider (keeps component tests that
// render a single component in the original Japanese).
const NO_PROVIDER_LANGUAGE: LanguageCode = "ja";

export function isLanguageCode(v: unknown): v is LanguageCode {
  return typeof v === "string" && LANGUAGES.some((l) => l.code === v);
}

/** Map a navigator.language-style tag ("ja-JP", "pt-BR", "zh-Hans") to a supported code, else "en". */
export function languageFromNavigator(tag: string | undefined | null): LanguageCode {
  const primary = (tag || "").toLowerCase().split(/[-_]/)[0];
  return isLanguageCode(primary) ? primary : FALLBACK_LANGUAGE;
}

export function getStoredLanguage(): LanguageCode | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return isLanguageCode(v) ? v : null;
  } catch {
    return null;
  }
}

export function setStoredLanguage(code: LanguageCode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* storage blocked / full — the choice just won't persist */
  }
}

/** Stored choice, else the browser's language, else English. */
export function resolveLanguage(): LanguageCode {
  const stored = getStoredLanguage();
  if (stored) return stored;
  try {
    return languageFromNavigator(window.navigator.language);
  } catch {
    return FALLBACK_LANGUAGE;
  }
}

export type Params = Record<string, string | number>;
export type TFunction = (key: MessageKey, params?: Params) => string;

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

export function makeT(language: LanguageCode): TFunction {
  const dict = DICTIONARIES[language];
  return (key, params) => interpolate(dict[key] ?? en[key] ?? key, params);
}

type Ctx = { language: LanguageCode; locale: string; t: TFunction };
function buildCtx(language: LanguageCode): Ctx {
  return { language, locale: LANGUAGES.find((l) => l.code === language)!.locale, t: makeT(language) };
}
const I18nContext = createContext<Ctx>(buildCtx(NO_PROVIDER_LANGUAGE));

/** Wraps the logged-in workspace. The language is fixed for the lifetime of the
 *  provider — it can only change by logging out and choosing another at login. */
export function I18nProvider({ language, children }: { language?: LanguageCode; children: ReactNode }) {
  const [initial] = useState<LanguageCode>(() => language ?? resolveLanguage());
  const value = useMemo(() => buildCtx(initial), [initial]);
  useEffect(() => {
    document.documentElement.lang = initial;
    // Pre-login screens are English; restore that when the workspace unmounts.
    return () => { document.documentElement.lang = "en"; };
  }, [initial]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): TFunction {
  return useContext(I18nContext).t;
}

/** BCP-47 locale of the active language, for toLocaleString / toLocaleDateString. */
export function useLocale(): string {
  return useContext(I18nContext).locale;
}

export function useLanguage(): LanguageCode {
  return useContext(I18nContext).language;
}
