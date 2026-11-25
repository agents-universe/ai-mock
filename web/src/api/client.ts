export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const TOKEN_KEY = 'ai-mock-token';

/** Bearer token for the admin API — set via the 访问 Token settings page. */
export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode etc. — nothing to persist */
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers['authorization'] = `Bearer ${token}`;
  const res = await fetch(url, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    let message: string = data?.message ?? `请求失败 (${res.status})`;
    // surface zod field errors so the user knows *which* field failed
    if (data?.error === 'validation_error' && data?.details?.fieldErrors) {
      const parts: string[] = Object.entries(
        data.details.fieldErrors as Record<string, string[]>
      ).flatMap(([field, msgs]) => (msgs ?? []).map((m) => `${field}: ${m}`));
      if (parts.length > 0) message += ` — ${parts.join('；')}`;
    }
    throw new ApiError(res.status, data?.error ?? 'error', message, data?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  delete: <T>(url: string) => request<T>('DELETE', url),
};
