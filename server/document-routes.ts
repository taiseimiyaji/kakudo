import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Database } from "../db/client";
import type { ContentStorage } from "../modules/storage/content-storage";
import { documentService } from "../modules/document/service";
import { documentCreate, documentSave } from "../shared/document";
export function documentRoutes(database?: () => Database, storage?: () => ContentStorage) {
  const api = new Hono(); const service = () => documentService(database?.(), storage?.());
  api.use("/documents/*", bodyLimit({ maxSize: 8_000_000 }));
  api.use("/documents", bodyLimit({ maxSize: 8_000_000 }));
  api.get("/documents", async (c) => c.json({ documents: await service().list(c.req.query("workspaceId") ?? "default", c.req.query("nodeId")) }));
  api.post("/documents", async (c) => c.json({ document: await service().create(c.req.query("workspaceId") ?? "default", documentCreate.parse(await c.req.json())) }, 201));
  api.get("/documents/:id", async (c) => c.json(await service().get(c.req.param("id"), c.req.query("workspaceId") ?? "default")));
  api.put("/documents/:id", async (c) => c.json(await service().save(c.req.param("id"), c.req.query("workspaceId") ?? "default", documentSave.parse(await c.req.json()))));
  api.delete("/documents/:id", async (c) => { await service().remove(c.req.param("id"), c.req.query("workspaceId") ?? "default"); return c.body(null, 204); });
  return api;
}
