export class DomainError extends Error {
  constructor(message: string, public status: 400 | 404 | 409 | 429 = 400) { super(message); }
}
export function requireFound<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw new DomainError(`${label} not found`, 404);
  return value;
}
