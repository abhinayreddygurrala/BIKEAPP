// Set in `.env` once the Railway server is deployed, e.g.
// EXPO_PUBLIC_API_URL=https://odomap-production.up.railway.app
// (restart Metro after changing it — the value is baked in at bundle time).
const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '');

const REQUEST_TIMEOUT_MS = 15_000;

/** An error from the Odomap server (or from not being able to reach it). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Which form field the server says is at fault, when it names one. */
    readonly field?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiConfigured(): boolean {
  return Boolean(API_URL);
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  token?: string | null;
};

export async function apiRequest<T>(path: string, { method = 'GET', body, token }: RequestOptions = {}): Promise<T> {
  if (!API_URL) {
    throw new ApiError(0, 'not_configured', 'Accounts aren’t connected yet.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'network', 'Can’t reach Odomap right now. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // Non-JSON body (e.g. a proxy error page) — handled below.
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; field?: string } } | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'server_error',
      error?.message ?? 'Something went wrong. Try again in a moment.',
      error?.field
    );
  }
  return payload as T;
}
