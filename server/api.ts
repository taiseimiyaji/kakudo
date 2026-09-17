import { reviewRoutes } from "./review-routes";
import type { ReviewProvider } from "../modules/review/contracts";
import type { SearchProvider } from "../modules/review/evidence";
import { resourceRoutes } from "./resource-routes";
import type { ResourceFetcher } from "../modules/resource/fetcher";
import { documentRoutes } from "./document-routes";
import type { ContentStorage } from "../modules/storage/content-storage";
import { ZodError } from "zod";
import { HTTPException } from "hono/http-exception";
import { DomainError } from "../lib/errors";
import type { Database } from "../db/client";
import { roadmapRoutes } from "./roadmap-routes";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { getDatabase } from "../db/client";
import { findWorkspace } from "../modules/workspace/service";

export interface ApiServices {
  reviewProvider?: ReviewProvider;
  reviewFetcher?: ResourceFetcher;
  searchProvider?: SearchProvider;
  resourceFetcher?: ResourceFetcher;
  database?: () => Database;
  storage?: () => ContentStorage;
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
  api.route("/", roadmapRoutes(services.database));
  api.route("/", documentRoutes(services.database, services.storage));
  api.route("/", resourceRoutes(services.database, services.resourceFetcher));
  api.route("/", reviewRoutes(services));
  api.notFound((c) => c.json({ error: "API route not found" }, 404));
  api.onError((error, c) => {
    if (error instanceof ZodError) return c.json({ error: "Invalid input", issues: error.issues.map((i) => ({ path: i.path, message: i.message })) }, 400);
    if (error instanceof DomainError) return c.json({ error: error.message }, error.status);
    if (error instanceof SyntaxError) return c.json({ error: "Invalid JSON" }, 400);
    if (error instanceof HTTPException) return error.getResponse();
    return c.json({ error: "Internal server error" }, 500);
  });
  return api;
}
