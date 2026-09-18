import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";

test.use({ extraHTTPHeaders: {} });
test("a different browser origin cannot create a roadmap with a simple POST", async ({ page, request, baseURL }) => {
  const attacker = createServer((_req, res) => { res.setHeader("Content-Type", "text/html"); res.end("<html><title>Other origin</title></html>"); });
  await new Promise<void>((resolve) => attacker.listen(0, "127.0.0.1", resolve));
  try {
    const title = `csrf-${Date.now()}`;
    await page.goto(`http://127.0.0.1:${(attacker.address() as AddressInfo).port}`);
    const response = page.waitForResponse(`${baseURL}/api/roadmaps`);
    await page.evaluate(async ({ url, title }) => { await fetch(`${url}/api/roadmaps`, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ title }) }); }, { url: baseURL, title });
    expect((await response).status()).toBe(403);
    const { roadmaps } = await (await request.get("/api/roadmaps")).json();
    expect(roadmaps.some((map: { title: string }) => map.title === title)).toBe(false);
  } finally { await new Promise<void>((resolve, reject) => attacker.close((error) => error ? reject(error) : resolve())); }
});
