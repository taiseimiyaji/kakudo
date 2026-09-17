import { Hono } from "hono";
import type { Database } from "../db/client";
import { roadmapService } from "../modules/roadmap/service";
import { edgeInput, nodeInput, nodePatch, roadmapInput, roadmapPatch } from "../shared/roadmap";

export function roadmapRoutes(database?: () => Database) {
  const api = new Hono();
  const service = () => roadmapService(database?.());
  api.get("/roadmaps", async (c) => c.json({ roadmaps: await service().list(c.req.query("workspaceId") ?? "default") }));
  api.post("/roadmaps", async (c) => c.json({ roadmap: await service().create(c.req.query("workspaceId") ?? "default", roadmapInput.parse(await c.req.json())) }, 201));
  api.get("/roadmaps/:id", async (c) => c.json(await service().detail(c.req.param("id"), c.req.query("workspaceId") ?? "default")));
  api.patch("/roadmaps/:id", async (c) => c.json({ roadmap: await service().update(c.req.param("id"), c.req.query("workspaceId") ?? "default", roadmapPatch.parse(await c.req.json())) }));
  api.delete("/roadmaps/:id", async (c) => { await service().remove(c.req.param("id"), c.req.query("workspaceId") ?? "default"); return c.body(null, 204); });
  api.post("/nodes", async (c) => c.json({ node: await service().createNode(c.req.query("workspaceId") ?? "default", nodeInput.parse(await c.req.json())) }, 201));
  api.patch("/nodes/:id", async (c) => c.json({ node: await service().updateNode(c.req.param("id"), c.req.query("workspaceId") ?? "default", nodePatch.parse(await c.req.json())) }));
  api.delete("/nodes/:id", async (c) => { await service().removeNode(c.req.param("id"), c.req.query("workspaceId") ?? "default"); return c.body(null, 204); });
  api.post("/edges", async (c) => c.json({ edge: await service().createEdge(c.req.query("workspaceId") ?? "default", edgeInput.parse(await c.req.json())) }, 201));
  api.delete("/edges/:id", async (c) => { await service().removeEdge(c.req.param("id"), c.req.query("workspaceId") ?? "default"); return c.body(null, 204); });
  return api;
}
