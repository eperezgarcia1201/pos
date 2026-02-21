export type AppLanguage = "en" | "es";

export type SessionUser = {
  id: string;
  username: string;
  roleId: string;
  displayName?: string | null;
  language?: AppLanguage;
  permissions?: Record<string, boolean>;
  permissionOverrides?: Record<string, "allow" | "deny">;
  token?: string;
};

const STORAGE_KEY = "pos_user";
const LANGUAGE_EVENT = "pos:language-change";
const USER_EVENT = "pos:user-change";

function normalizeLanguage(value: unknown): AppLanguage {
  return value === "es" ? "es" : "en";
}

function dispatchLanguageChange(language: AppLanguage) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AppLanguage>(LANGUAGE_EVENT, { detail: language }));
}

function dispatchUserChange(user: SessionUser | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SessionUser | null>(USER_EVENT, { detail: user }));
}

export function getCurrentUser(): SessionUser | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionUser;
    return { ...parsed, language: normalizeLanguage(parsed.language), token: parsed.token };
  } catch {
    return null;
  }
}

export function setCurrentUser(user: SessionUser) {
  const normalized = { ...user, language: normalizeLanguage(user.language), token: user.token };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  dispatchLanguageChange(normalized.language);
  dispatchUserChange(normalized);
}

export function clearCurrentUser() {
  localStorage.removeItem(STORAGE_KEY);
  dispatchLanguageChange("en");
  dispatchUserChange(null);
}

export function getCurrentLanguage(): AppLanguage {
  return normalizeLanguage(getCurrentUser()?.language);
}

export function setCurrentUserLanguage(language: AppLanguage) {
  const user = getCurrentUser();
  if (!user) {
    dispatchLanguageChange(language);
    return;
  }
  setCurrentUser({ ...user, language });
}

export function subscribeLanguageChange(listener: (language: AppLanguage) => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const handler = (event: Event) => {
    const custom = event as CustomEvent<AppLanguage>;
    listener(normalizeLanguage(custom.detail));
  };
  window.addEventListener(LANGUAGE_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(LANGUAGE_EVENT, handler as EventListener);
  };
}

export function subscribeUserChange(listener: (user: SessionUser | null) => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const handler = (event: Event) => {
    const custom = event as CustomEvent<SessionUser | null>;
    listener(custom.detail ? { ...custom.detail, language: normalizeLanguage(custom.detail.language), token: custom.detail.token } : null);
  };
  window.addEventListener(USER_EVENT, handler as EventListener);
  return () => {
    window.removeEventListener(USER_EVENT, handler as EventListener);
  };
}
