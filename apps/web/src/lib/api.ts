export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// Nest returns `message` as a string, or as an array for validation errors.
function errorMessage(body: unknown, status: number): string {
  const message = (body as { message?: unknown } | null)?.message;
  if (Array.isArray(message)) return message.join('; ');
  if (typeof message === 'string') return message;
  return `request failed (${status})`;
}

export async function fetchJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { signal, cache: 'no-store' });
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new Error(errorMessage(body, res.status));
  }
  return (await res.json()) as T;
}
