import { describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import type { ApiServices } from "../../server/api";
import { allowedOrigins } from "../../server/request-security";

const unavailable = async (): Promise<never> => { throw new Error("secret database connection detail"); };
const services: ApiServices = { checkDatabase: async () => {}, findWorkspace: async () => null };

describe("Hono API boundary", () => {
  it("rejects mutations before touching services, including missing origins and forged proxy headers", async () => {
    let touched = false;
    const app = createApp({ ...services, database: () => { touched = true; throw new Error("Must not access DB"); } });
    const cases: Record<string, string>[] = [
      {}, { Origin: "null" }, { Origin: "https://untrusted.example" },
      { Origin: "https://untrusted.example", "X-Forwarded-Host": "untrusted.example", "X-Forwarded-Proto": "https" },
      { Origin: "http://127.0.0.1:43171", "Sec-Fetch-Site": "cross-site" },
    ];
    for (const headers of cases) {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const response = await app.request("/api/roadmaps", { method, headers: { ...headers, "Content-Type": "application/json" }, body: '{"title":"Rejected"}' });
        expect(response.status).toBe(403);
      }
    }
    const plain = await app.request("/api/roadmaps", { method: "POST", headers: { Origin: "http://127.0.0.1:43171", "Content-Type": "text/plain" }, body: '{"title":"Rejected"}' });
    expect(plain.status).toBe(415);
    expect(touched).toBe(false);
  });
  it("requires exact configured origins", () => {
    expect(allowedOrigins({ ALLOWED_ORIGINS: "https://notes.example,http://127.0.0.1:43170" }).size).toBe(2);
    for (const value of ["*", "null", "https://notes.example/", "https://user@notes.example", ""]) {
      expect(() => allowedOrigins({ ALLOWED_ORIGINS: value })).toThrow("ALLOWED_ORIGINS");
    }
  });
  it("returns JSON 404 for unknown API paths instead of SPA HTML", async () => {
    const app = createApp(services);
    for (const path of ["/api", "/api/unknown"]) {
      const response = await app.request(path);
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");
    }
  });
  it("distinguishes a missing workspace", async () => {
    const response = await createApp(services).request("/api/workspaces/missing");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Workspace not found" });
  });
  it("returns 503 without leaking database errors", async () => {
    const app = createApp({ checkDatabase: unavailable, findWorkspace: unavailable });
    for (const path of ["/api/health", "/api/workspaces/default"]) {
      const response = await app.request(path);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("secret");
    }
  });
});
