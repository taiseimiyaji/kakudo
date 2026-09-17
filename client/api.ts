export async function request<T = unknown>(path: string, method = "GET", data?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method, headers: data === undefined ? undefined : { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? `Request failed (${response.status})`);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}
