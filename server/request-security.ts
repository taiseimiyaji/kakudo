import type { MiddlewareHandler } from "hono";

export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const values = (env.ALLOWED_ORIGINS ?? "http://127.0.0.1:43170,http://127.0.0.1:43171").split(",").map((value) => value.trim());
  for (const value of values) {
    const url = URL.parse(value);
    if (!url || !["http:", "https:"].includes(url.protocol) || url.origin !== value) {
      throw new Error("ALLOWED_ORIGINS must contain comma-separated HTTP(S) origins without paths.");
    }
  }
  return new Set(values);
}

/** Origin is mandatory for mutations, including non-browser clients. Never trust Host/Forwarded. */
export function requestSecurity(origins = allowedOrigins()): MiddlewareHandler {
  return async (c, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
    const origin = c.req.header("Origin");
    if (!origin || !origins.has(origin) || c.req.header("Sec-Fetch-Site") === "cross-site") {
      return c.json({ error: "Request origin is not allowed" }, 403);
    }
    // Node represents even a bodyless DELETE as a stream. Require JSON where handlers parse it.
    const readsJson = ["POST", "PUT", "PATCH"].includes(c.req.method)
      && !(c.req.method === "POST" && /^\/api\/resources\/[^/]+\/fetch$/.test(c.req.path));
    const contentType = c.req.header("Content-Type");
    if ((readsJson || contentType) && contentType?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
      return c.json({ error: "JSON Content-Type is required" }, 415);
    }
    return next();
  };
}
