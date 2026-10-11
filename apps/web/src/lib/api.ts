import { requestSchema } from '@vet-clinic/validation';
import { localizeError } from '@/i18n/errors';
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(localizeError(message));
  }
}
export async function api<T = unknown>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  if (body !== undefined) {
    const result = requestSchema(path, method)?.safeParse(body);
    if (result && !result.success)
      throw new ApiError(
        result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
        400,
      );
    if (result?.success) body = result.data;
  }
  const response = await fetch(`/api/${path}`, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response
    .json()
    .catch(() => ({ message: 'The clinic server is unavailable. Please try again.' }));
  if (!response.ok) throw new ApiError(data.message || 'Request failed', response.status);
  return data as T;
}
