import { z } from "zod";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { Database } from "../db/client";
import { resourceService } from "../modules/resource/service";
import { createResourceFetcher, ResourceUnavailable, type ResourceFetcher } from "../modules/resource/fetcher";
import { resourceInput, resourceLinkInput } from "../shared/resource";
export function resourceRoutes(database?: () => Database, fetcher: ResourceFetcher = createResourceFetcher()) {
  const api = new Hono(); const service = () => resourceService(database?.());
  api.use("*", bodyLimit({ maxSize: 8_000_000 }));
  api.get("/resources", async (c) => c.json({ resources: await service().list(c.req.query("workspaceId") ?? "default") }));
  api.post("/resources", async (c) => c.json({ resource: await service().create(c.req.query("workspaceId") ?? "default", resourceInput.parse(await c.req.json())) }, 201));
  for (const kind of ["node", "document"] as const) {
    api.get(`/${kind}s/:id/resources`, async (c) => c.json({ resources: await service().list(c.req.query("workspaceId") ?? "default", { kind, id: c.req.param("id") }) }));
    api.post(`/${kind}s/:id/resources`, async (c) => {
      const workspaceId = c.req.query("workspaceId") ?? "default"; const scope = { kind, id: c.req.param("id") }; const body = z.union([resourceLinkInput, resourceInput]).parse(await c.req.json());
      const resource = "resourceId" in body ? await service().link(workspaceId, resourceLinkInput.parse(body).resourceId, scope) : await service().create(workspaceId, resourceInput.parse(body), scope);
      return c.json({ resource }, 201);
    });
    api.delete(`/${kind}s/:id/resources/:resourceId`, async (c) => { await service().unlink(c.req.query("workspaceId") ?? "default", c.req.param("resourceId"), { kind, id: c.req.param("id") }); return c.body(null, 204); });
  }
  api.delete("/resources/:id", async (c) => { await service().remove(c.req.param("id"), c.req.query("workspaceId") ?? "default"); return c.body(null, 204); });
  api.post("/resources/:id/fetch", async (c) => {
    const resource = await service().get(c.req.param("id"), c.req.query("workspaceId") ?? "default");
    try { return c.json({ status: "AVAILABLE", document: await fetcher.fetch(resource.url) }); }
    catch (e) { return c.json({ status: "UNAVAILABLE", error: e instanceof ResourceUnavailable ? e.message : "資料を取得できませんでした。" }, 422); }
  });
  return api;
}
