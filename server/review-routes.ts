import { Hono } from "hono";
import { reviewService } from "../modules/review/service";
import { reviewStart } from "../shared/review";
import type { ApiServices } from "./api";
export function reviewRoutes(services: ApiServices) {
  const api = new Hono(); const service = () => reviewService({ db: services.database?.(), storage: services.storage?.(), provider: services.reviewProvider, fetcher: services.reviewFetcher, search: services.searchProvider });
  api.post("/documents/:id/reviews", async (c) => c.json({ run: await service().start(c.req.param("id"), c.req.query("workspaceId") ?? "default", reviewStart.parse(await c.req.json())) }, 202));
  api.get("/documents/:id/reviews", async (c) => c.json({ reviews: await service().list(c.req.param("id"), c.req.query("workspaceId") ?? "default") }));
  api.get("/reviews/:id", async (c) => c.json(await service().get(c.req.param("id"), c.req.query("workspaceId") ?? "default")));
  return api;
}
