import { revisionService } from "../modules/revision/service";
import { quoteInput } from "../shared/quote";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Database } from "../db/client";
import type { ContentStorage } from "../modules/storage/content-storage";
import { documentService, DocumentRecoveryRequiredError } from "../modules/document/service";
import { documentCreate, documentSave, documentNodesInput, DOCUMENT_CREATE_OUTCOME_UNKNOWN, DOCUMENT_WRITE_OUTCOME_UNKNOWN } from "../shared/document";
export function documentRoutes(database?: () => Database, storage?: () => ContentStorage) {
  const api = new Hono(); const service = () => documentService(database?.(), storage?.());
  api.use("/documents/*", bodyLimit({ maxSize: 8_000_000 }));
  api.use("/documents", bodyLimit({ maxSize: 8_000_000 }));
  api.get("/documents", async (c) => c.json({ documents: await service().list(c.req.query("workspaceId") ?? "default", c.req.query("nodeId")) }));
  api.post("/documents", async (c) => {
    try { return c.json({ document: await service().create(c.req.query("workspaceId") ?? "default", documentCreate.parse(await c.req.json())) }, 201); }
    catch (error) {
      if (error instanceof DocumentRecoveryRequiredError) return c.json({ code: DOCUMENT_CREATE_OUTCOME_UNKNOWN, error: error.message }, 409);
      throw error;
    }
  });
  api.get("/documents/:id", async (c) => c.json(await service().get(c.req.param("id"), c.req.query("workspaceId") ?? "default")));
  api.get("/documents/:id/node-options", async (c) => c.json({ nodes: await service().nodeOptions(c.req.param("id"), c.req.query("workspaceId") ?? "default") }));
  api.patch("/documents/:id/nodes", async (c) => c.json(await service().setNodes(c.req.param("id"), c.req.query("workspaceId") ?? "default", documentNodesInput.parse(await c.req.json()))));
  api.put("/documents/:id", async (c) => {
    try { return c.json(await service().save(c.req.param("id"), c.req.query("workspaceId") ?? "default", documentSave.parse(await c.req.json()))); }
    catch (error) {
      if (error instanceof DocumentRecoveryRequiredError) return c.json({ code: DOCUMENT_WRITE_OUTCOME_UNKNOWN, error: error.message }, 409);
      throw error;
    }
  });
  api.post("/documents/:id/quotes", async (c) => {
    try { return c.json(await service().quote(c.req.param("id"), c.req.query("workspaceId") ?? "default", quoteInput.parse(await c.req.json())), 201); }
    catch (error) {
      if (error instanceof DocumentRecoveryRequiredError) return c.json({ code: DOCUMENT_WRITE_OUTCOME_UNKNOWN, error: error.message }, 409);
      throw error;
    }
  });
  api.get("/documents/:id/revisions", async (c) => c.json({ revisions: await revisionService(database?.()).list(c.req.param("id"), c.req.query("workspaceId") ?? "default") }));
  api.get("/documents/:id/revisions/:revisionId", async (c) => c.json({ revision: await revisionService(database?.()).get(c.req.param("id"), c.req.param("revisionId"), c.req.query("workspaceId") ?? "default") }));
  api.delete("/documents/:id", async (c) => { await service().remove(c.req.param("id"), c.req.query("workspaceId") ?? "default"); return c.body(null, 204); });
  return api;
}
