type Event = "api_request" | "api_error" | "health_database_failed" | "health_storage_failed" | "review_failed" | "review_queue_failed" | "review_failure_persist_failed" | "ownership_lost";
type Fields = { requestId?: string; reviewId?: string; method?: string; status?: number; durationMs?: number; reason?: string };
export function errorKind(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  const known: Record<string, string> = { EACCES: "storage_permission", EPERM: "storage_permission", ENOSPC: "storage_full", ENOENT: "storage_missing", ENOTDIR: "storage_not_directory", ECONNREFUSED: "connection_refused", ECONNRESET: "connection_reset", ETIMEDOUT: "connection_timeout", "57014": "query_timeout", "57P01": "database_shutdown", "23503": "foreign_key", "23505": "unique_constraint", "42P01": "missing_table" };
  if (typeof code === "string" && known[code]) return known[code];
  if (error instanceof TypeError) return "type_error";
  return "unexpected";
}
/** Call sites supply only IDs, counts and fixed reason codes; never Error.message, body, URL or headers. */
export function logEvent(event: Event, fields: Fields = {}) {
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields }));
}
