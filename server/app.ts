import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApi, type ApiServices } from "./api";

export function createApp(services?: ApiServices) {
  const app = new Hono();
  app.route("/api", createApi(services));
  // Unknown APIs must not receive the SPA HTML fallback.
  app.all("/api/*", (c) => c.json({ error: "API route not found" }, 404));
  app.all("/api", (c) => c.json({ error: "API route not found" }, 404));
  app.use("/assets/*", serveStatic({ root: "./dist/client" }));
  // Serve the entry point for the existing pages, including direct navigation.
  app.get("/", serveStatic({ path: "./dist/client/index.html" }));
  app.get("/workspaces/*", serveStatic({ path: "./dist/client/index.html" }));
  return app;
}
