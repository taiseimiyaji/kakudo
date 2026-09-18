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
import { requestSecurity } from "./request-security";
import { randomUUID } from "node:crypto";
import { errorKind, logEvent } from "../lib/observability";
import { checkStorageHealth, type StorageHealth } from "../modules/operations/health";

export interface ApiServices {
  reviewProvider?: ReviewProvider;
  reviewFetcher?: ResourceFetcher;
  searchProvider?: SearchProvider;
  resourceFetcher?: ResourceFetcher;
  database?: () => Database;
  storage?: () => ContentStorage;
  checkDatabase(): Promise<void>;
  checkStorage?(): Promise<StorageHealth>;
  findWorkspace(id: string): ReturnType<typeof findWorkspace>;
}

const defaultServices: ApiServices = {
  async checkDatabase() { await getDatabase().execute(sql`select 1`); },
  findWorkspace,
  checkStorage: () => checkStorageHealth(process.env.CONTENT_STORAGE_ROOT ?? "./workspace-data", Number(process.env.STORAGE_MIN_FREE_BYTES ?? 104857600)),
};

export function createApi(services: ApiServices = defaultServices) {
  const api = new Hono<{ Variables: { requestId: string } }>();
  api.use("*", async (c, next) => {
    const requestId = randomUUID(); const started = performance.now();
    c.set("requestId", requestId); c.header("X-Request-ID", requestId);
    await next();
    logEvent("api_request", { requestId, method: c.req.method.slice(0, 10), status: c.res.status, durationMs: Math.round(performance.now() - started) });
  });
  api.use("*", requestSecurity());
  api.get("/health", async (c) => {
    try {
      await services.checkDatabase();
    } catch (error) {
      logEvent("health_database_failed", { requestId: c.get("requestId"), reason: errorKind(error) });
      return c.json({ status: "unavailable", database: "disconnected" }, 503);
    }
    try {
      const storage = await services.checkStorage?.();
      return c.json({ status: "ok", database: "connected", ...(storage ? { storage } : {}) });
    } catch (error) {
      logEvent("health_storage_failed", { requestId: c.get("requestId"), reason: errorKind(error) });
      return c.json({ status: "unavailable", database: "connected", storage: { status: "unavailable" } }, 503);
    }
  });
  api.get("/workspaces/:id", async (c) => {
    try {
      const workspace = await services.findWorkspace(c.req.param("id"));
      if (!workspace) return c.json({ error: "Workspace not found" }, 404);
      return c.json({ workspace: { ...workspace, createdAt: workspace.createdAt.toISOString() } });
    } catch (error) {
      logEvent("api_error", { requestId: c.get("requestId"), reason: errorKind(error) });
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
    logEvent("api_error", { requestId: c.get("requestId"), reason: errorKind(error) });
    return c.json({ error: "Internal server error" }, 500);
  });
  return api;
}
