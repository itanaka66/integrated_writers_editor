import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DICTIONARIES, I18nProvider, LANGUAGES, getStoredLanguage, languageFromNavigator, makeT, resolveLanguage, setStoredLanguage, useT,
} from "./i18n";
import en from "../locales/en";

const placeholders = (s: string) => Array.from(s.matchAll(/\{(\w+)\}/g), (m) => m[1]).sort();

describe("locale integrity", () => {
  it("lists exactly the 8 supported languages with native names", () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(["en", "ja", "zh", "ko", "es", "fr", "de", "pt"]);
    expect(LANGUAGES.map((l) => l.name)).toEqual(["English", "日本語", "简体中文", "한국어", "Español", "Français", "Deutsch", "Português"]);
    expect(Object.keys(DICTIONARIES).sort()).toEqual(LANGUAGES.map((l) => l.code).sort());
  });

  const enKeys = Object.keys(en).sort();

  for (const { code } of LANGUAGES) {
    describe(code, () => {
      const dict = DICTIONARIES[code] as Record<string, string>;

      it("has exactly the same keys as en", () => {
        expect(Object.keys(dict).sort()).toEqual(enKeys);
      });

      it("has no empty strings", () => {
        const empty = enKeys.filter((k) => typeof dict[k] !== "string" || dict[k].trim() === "");
        expect(empty).toEqual([]);
      });

      it("keeps the same {param} placeholders as en for every key", () => {
        const mismatched = enKeys.filter((k) => JSON.stringify(placeholders(dict[k])) !== JSON.stringify(placeholders((en as Record<string, string>)[k])));
        expect(mismatched).toEqual([]);
      });
    });
  }
});

describe("language helpers", () => {
  afterEach(() => window.localStorage.clear());

  it("maps navigator languages to a supported code, else English", () => {
    expect(languageFromNavigator("ja-JP")).toBe("ja");
    expect(languageFromNavigator("zh-Hans-CN")).toBe("zh");
    expect(languageFromNavigator("pt_BR")).toBe("pt");
    expect(languageFromNavigator("it-IT")).toBe("en");
    expect(languageFromNavigator(undefined)).toBe("en");
  });

  it("round-trips a stored language and ignores junk", () => {
    expect(getStoredLanguage()).toBeNull();
    setStoredLanguage("de");
    expect(getStoredLanguage()).toBe("de");
    expect(resolveLanguage()).toBe("de");
    window.localStorage.setItem("ine-language", "xx");
    expect(getStoredLanguage()).toBeNull();
  });

  it("interpolates params and leaves unknown placeholders alone", () => {
    expect(makeT("en")("dashboard.greeting", { name: "Ann" })).toBe("Hello, Ann");
    expect(makeT("en")("dashboard.greeting")).toBe("Hello, {name}");
  });
});

describe("I18nProvider", () => {
  function Probe() {
    const t = useT();
    return <span>{t("common.logout")}</span>;
  }

  it("falls back to Japanese without a provider (keeps single-component tests unchanged)", () => {
    render(<Probe />);
    expect(screen.getByText("ログアウト")).toBeInTheDocument();
  });

  it("uses the given language and sets <html lang>, restoring en on unmount", () => {
    const { unmount } = render(<I18nProvider language="fr"><Probe /></I18nProvider>);
    expect(screen.getByText("Se déconnecter")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("fr");
    unmount();
    expect(document.documentElement.lang).toBe("en");
  });

  it("reads the stored language when none is given", () => {
    setStoredLanguage("ko");
    render(<I18nProvider><Probe /></I18nProvider>);
    expect(screen.getByText("로그아웃")).toBeInTheDocument();
    window.localStorage.clear();
  });
});
