import { describe, expect, it } from "vitest";
import { createApp } from "../../server/app";
import type { ApiServices } from "../../server/api";

const unavailable = async (): Promise<never> => { throw new Error("secret database connection detail"); };
const services: ApiServices = { checkDatabase: async () => {}, findWorkspace: async () => null };

describe("Hono API boundary", () => {
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
