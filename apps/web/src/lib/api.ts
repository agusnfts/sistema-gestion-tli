import type { ApiError as ApiErrorBody, AttachmentInfo } from '@tli/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: { path: string; message: string }[] = [],
    readonly code?: string,
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;

async function getCsrfToken(force = false): Promise<string> {
  if (!csrfToken || force) {
    const res = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    csrfToken = ((await res.json()) as { token: string }).token;
  }
  return csrfToken;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
};

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const qs = params.toString();
  return `/api${path}${qs ? `?${qs}` : ''}`;
}

/** Cliente de la API: mismo origen, cookies de sesión y token CSRF en métodos que modifican. */
export async function api<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-CSRF-Token'] = await getCsrfToken();
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(buildUrl(path, opts.query), {
    method,
    headers,
    credentials: 'same-origin',
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiErrorBody> & { code?: string };
    if (res.status === 403 && err.code === 'CSRF' && !retried) {
      await getCsrfToken(true);
      return api<T>(path, opts, true);
    }
    throw new ApiError(res.status, err.message ?? 'Error inesperado', err.issues ?? [], err.code);
  }
  return data as T;
}

/** Sube un archivo (multipart) a /api/attachments. */
export async function uploadFile(file: File, retried = false): Promise<AttachmentInfo> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch('/api/attachments', {
    method: 'POST',
    headers: { 'X-CSRF-Token': await getCsrfToken(), Accept: 'application/json' },
    credentials: 'same-origin',
    body: form,
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ApiErrorBody> & { code?: string };
    if (res.status === 403 && err.code === 'CSRF' && !retried) {
      await getCsrfToken(true);
      return uploadFile(file, true);
    }
    const message =
      res.status === 413 ? 'El archivo supera los 25 MB' : (err.message ?? 'Error al subir');
    throw new ApiError(res.status, message, err.issues ?? [], err.code);
  }
  return data as AttachmentInfo;
}

/** Vuelca los errores de validación del servidor sobre los campos de un formulario. */
export function applyServerErrors(
  error: unknown,
  setError: (field: never, e: { message: string }) => void,
): string | null {
  if (!(error instanceof ApiError)) return 'Error inesperado. Probá de nuevo.';
  for (const issue of error.issues) {
    if (issue.path) setError(issue.path as never, { message: issue.message });
  }
  return error.issues.length ? null : error.message;
}
