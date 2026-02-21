import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CloudPortalLanguage = "en" | "es";
export type CloudPortalTheme = "dark" | "light";

type CloudPortalTranslateParams = Record<string, string | number>;

type CloudPortalUiContextValue = {
  language: CloudPortalLanguage;
  setLanguage: (language: CloudPortalLanguage) => void;
  theme: CloudPortalTheme;
  setTheme: (theme: CloudPortalTheme) => void;
  tx: (english: string, spanish: string, params?: CloudPortalTranslateParams) => string;
};

const CLOUD_PORTAL_LANGUAGE_KEY = "pos_cloud_portal_language";
const CLOUD_PORTAL_THEME_KEY = "pos_cloud_portal_theme";
const CLOUD_PORTAL_LANGUAGE_EVENT = "pos:cloud-portal-language";
const CLOUD_PORTAL_THEME_EVENT = "pos:cloud-portal-theme";

const CloudPortalUiContext = createContext<CloudPortalUiContextValue | null>(null);

function normalizeLanguage(value: unknown): CloudPortalLanguage {
  return value === "es" ? "es" : "en";
}

function normalizeTheme(value: unknown): CloudPortalTheme {
  return value === "light" ? "light" : "dark";
}

function readStoredLanguage(): CloudPortalLanguage {
  if (typeof window === "undefined") return "en";
  return normalizeLanguage(window.localStorage.getItem(CLOUD_PORTAL_LANGUAGE_KEY));
}

function readStoredTheme(): CloudPortalTheme {
  if (typeof window === "undefined") return "dark";
  return normalizeTheme(window.localStorage.getItem(CLOUD_PORTAL_THEME_KEY));
}

function applyParams(template: string, params?: CloudPortalTranslateParams) {
  if (!params) return template;
  return Object.entries(params).reduce((result, [key, value]) => {
    return result.replaceAll(`{{${key}}}`, String(value));
  }, template);
}

function dispatchLanguage(language: CloudPortalLanguage) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CloudPortalLanguage>(CLOUD_PORTAL_LANGUAGE_EVENT, { detail: language }));
}

function dispatchTheme(theme: CloudPortalTheme) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CloudPortalTheme>(CLOUD_PORTAL_THEME_EVENT, { detail: theme }));
}

export function CloudPortalUiProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<CloudPortalLanguage>(() => readStoredLanguage());
  const [theme, setThemeState] = useState<CloudPortalTheme>(() => readStoredTheme());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onLanguage = (event: Event) => {
      const customEvent = event as CustomEvent<CloudPortalLanguage>;
      setLanguageState(normalizeLanguage(customEvent.detail));
    };

    const onTheme = (event: Event) => {
      const customEvent = event as CustomEvent<CloudPortalTheme>;
      setThemeState(normalizeTheme(customEvent.detail));
    };

    window.addEventListener(CLOUD_PORTAL_LANGUAGE_EVENT, onLanguage as EventListener);
    window.addEventListener(CLOUD_PORTAL_THEME_EVENT, onTheme as EventListener);

    return () => {
      window.removeEventListener(CLOUD_PORTAL_LANGUAGE_EVENT, onLanguage as EventListener);
      window.removeEventListener(CLOUD_PORTAL_THEME_EVENT, onTheme as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-cloud-theme", theme);
    return () => {
      document.documentElement.removeAttribute("data-cloud-theme");
    };
  }, [theme]);

  const setLanguage = (next: CloudPortalLanguage) => {
    const normalized = normalizeLanguage(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CLOUD_PORTAL_LANGUAGE_KEY, normalized);
    }
    setLanguageState(normalized);
    dispatchLanguage(normalized);
  };

  const setTheme = (next: CloudPortalTheme) => {
    const normalized = normalizeTheme(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(CLOUD_PORTAL_THEME_KEY, normalized);
    }
    setThemeState(normalized);
    dispatchTheme(normalized);
  };

  const value = useMemo<CloudPortalUiContextValue>(
    () => ({
      language,
      setLanguage,
      theme,
      setTheme,
      tx: (english: string, spanish: string, params?: CloudPortalTranslateParams) => {
        const template = language === "es" ? spanish : english;
        return applyParams(template, params);
      }
    }),
    [language, theme]
  );

  return <CloudPortalUiContext.Provider value={value}>{children}</CloudPortalUiContext.Provider>;
}

export function useCloudPortalUi() {
  const context = useContext(CloudPortalUiContext);
  if (!context) {
    throw new Error("useCloudPortalUi must be used within CloudPortalUiProvider");
  }
  return context;
}
