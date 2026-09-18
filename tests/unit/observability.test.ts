import { expect, it, vi } from "vitest";
import { createApi } from "../../server/api";
import { errorKind } from "../../lib/observability";

it("correlates unexpected errors without logging request secrets or raw errors", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const app = createApi({ checkDatabase: async () => {}, findWorkspace: async () => null, database: () => { throw new Error("postgres://user:secret@host learner text"); } });
    const response = await app.request("/roadmaps?token=secret", { method: "POST", headers: { Origin: "http://127.0.0.1:43171", "Content-Type": "application/json", Authorization: "secret", "X-Request-ID": "secret" }, body: '{"title":"learner text"}' });
    expect(response.status).toBe(500);
    const id = response.headers.get("X-Request-ID"); expect(id).toMatch(/^[a-f0-9-]{36}$/);
    const entries = log.mock.calls.map(([entry]) => JSON.parse(entry));
    expect(entries).toContainEqual(expect.objectContaining({ event: "api_error", requestId: id, reason: "unexpected" }));
    expect(entries).toContainEqual(expect.objectContaining({ event: "api_request", requestId: id, status: 500 }));
    expect(JSON.stringify(entries)).not.toMatch(/secret|learner text|postgres:\/\//);
    expect(await response.text()).not.toContain("secret");
  } finally { log.mockRestore(); }
});

it("reports storage and database failures separately using safe cause codes", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const app = createApi({ checkDatabase: async () => {}, findWorkspace: async () => null, checkStorage: async () => { throw Object.assign(new Error("private path"), { code: "EACCES" }); } });
    const response = await app.request("/health");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable", database: "connected", storage: { status: "unavailable" } });
    expect(log.mock.calls.some(([entry]) => JSON.parse(entry).reason === "storage_permission")).toBe(true);
    expect(JSON.stringify(log.mock.calls)).not.toContain("private path");
    expect(errorKind({ code: "ECONNREFUSED", message: "secret" })).toBe("connection_refused");
  } finally { log.mockRestore(); }
});
