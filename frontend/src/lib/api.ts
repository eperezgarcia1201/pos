import { enqueueRequest } from "./offlineQueue";
import { getCurrentUser } from "./session";

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

function inferApiUrl() {
  if (typeof window === "undefined") return "http://localhost:8080";
  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const host = window.location.hostname || "localhost";
  return `${protocol}//${host}:8080`;
}

function buildApiUrlCandidates() {
  const candidates: string[] = [];
  const add = (baseUrl?: string) => {
    if (!baseUrl) return;
    const normalized = normalizeBaseUrl(baseUrl);
    if (!candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  add(import.meta.env.VITE_API_URL);
  add(inferApiUrl());
  add("http://localhost:8080");
  add("http://127.0.0.1:8080");

  return candidates;
}

function isNetworkError(err: unknown) {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("load failed")
  );
}

const API_URL_CANDIDATES = buildApiUrlCandidates();

export const API_URL = API_URL_CANDIDATES[0] || "http://localhost:8080";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const hasBody = typeof options.body !== "undefined" && options.body !== null;
  const user = getCurrentUser();
  const userHeader = user?.id ? { "x-user-id": user.id } : {};
  const authHeader = user?.token ? { Authorization: `Bearer ${user.token}` } : {};
  const requestHeaders = {
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    ...authHeader,
    ...userHeader,
    ...(options.headers || {})
  };

  let lastError: unknown = null;

  for (let index = 0; index < API_URL_CANDIDATES.length; index += 1) {
    const baseUrl = API_URL_CANDIDATES[index];
    const url = `${baseUrl}${path}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: requestHeaders
      });

      if (!response.ok) {
        let message = `Request failed: ${response.status}`;
        try {
          const text = await response.text();
          if (text) {
            try {
              const parsed = JSON.parse(text);
              message = parsed?.message || parsed?.error || text;
            } catch {
              message = text;
            }
          }
        } catch {
          // ignore
        }
        throw new Error(message);
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return response.json();
      }
      return response.text();
    } catch (err) {
      lastError = err;
      if (!isNetworkError(err)) {
        break;
      }
    }
  }

  if (options.method && options.method !== "GET") {
    await enqueueRequest({
      url: `${API_URL}${path}`,
      method: options.method,
      body: hasBody ? String(options.body) : null,
      headers: {
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
        ...authHeader,
        ...userHeader
      }
    });
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed.");
}
