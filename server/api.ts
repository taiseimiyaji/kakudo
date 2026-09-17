import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { getDatabase } from "../db/client";
import { findWorkspace } from "../modules/workspace/service";

export interface ApiServices {
  checkDatabase(): Promise<void>;
  findWorkspace(id: string): ReturnType<typeof findWorkspace>;
}

const defaultServices: ApiServices = {
  async checkDatabase() { await getDatabase().execute(sql`select 1`); },
  findWorkspace,
};

export function createApi(services: ApiServices = defaultServices) {
  const api = new Hono();
  api.get("/health", async (c) => {
    try {
      await services.checkDatabase();
      return c.json({ status: "ok", database: "connected" });
    } catch {
      return c.json({ status: "unavailable", database: "disconnected" }, 503);
    }
  });
  api.get("/workspaces/:id", async (c) => {
    try {
      const workspace = await services.findWorkspace(c.req.param("id"));
      if (!workspace) return c.json({ error: "Workspace not found" }, 404);
      return c.json({ workspace: { ...workspace, createdAt: workspace.createdAt.toISOString() } });
    } catch {
      return c.json({ error: "Workspace unavailable" }, 503);
    }
  });
  api.notFound((c) => c.json({ error: "API route not found" }, 404));
  api.onError((_error, c) => c.json({ error: "Internal server error" }, 500));
  return api;
}
