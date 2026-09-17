import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { closeDatabase } from "../db/client";

const port = Number(process.env.PORT ?? 43171);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");
const hostname = process.env.HOST ?? "127.0.0.1";
const server = serve({ fetch: createApp().fetch, port, hostname }, () => {
  console.log(`Kakudo listening on http://${hostname}:${port}`);
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  server.close(() => {
    void closeDatabase().then(() => { clearTimeout(timeout); process.exit(0); });
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
