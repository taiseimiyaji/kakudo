import { expect, test } from "@playwright/test";
import { RESOURCE_FETCH_TIMEOUT_MS } from "../../components/resources/resource-panel";

test("stalled resource fetch becomes uncertain and requires an explicit retry; late old response cannot replace success", async ({ page, request }) => {
  test.setTimeout(40000);
  await page.clock.install();
  const { resource } = await (await request.post("/api/resources", { data: { url: "https://example.com/fetch-timeout-header", title: "取得結果を確認する資料", type: "WEB" } })).json();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let attempts = 0; let delivered = false;
  await page.route(`**/api/resources/${resource.id}/fetch?*`, async (route) => {
    attempts++;
    if (attempts === 1) { await gate; await route.fulfill({ json: { status: "UNAVAILABLE" } }).catch(() => {}); delivered = true; }
    else await route.fulfill({ json: { status: "AVAILABLE" } });
  });
  try {
    await page.goto("/workspaces/default/resources");
    const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "取得結果を確認する資料" }) });
    await row.getByRole("button", { name: "取得を確認" }).click();
    await expect.poll(() => attempts).toBe(1);
    await page.clock.runFor(RESOURCE_FETCH_TIMEOUT_MS + 100);
    await expect(row.getByRole("alert")).toContainText("取得結果を確認できませんでした");
    await expect(row.getByRole("alert")).not.toContainText("UNAVAILABLE");
    await expect(row.getByRole("button", { name: "取得を確認" })).toBeEnabled();
    expect(attempts).toBe(1);
    await row.getByRole("button", { name: "取得を確認" }).click();
    await expect.poll(() => attempts).toBe(2);
    await expect(row.getByText("資料を取得できました。内容の正確性を判定する操作ではありません。")).toBeVisible();
    release(); await expect.poll(() => delivered).toBe(true);
    await expect(row.getByText("資料を取得できました。内容の正確性を判定する操作ではありません。")).toBeVisible();
    expect(attempts).toBe(2);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await request.delete(`/api/resources/${resource.id}`); }
});

test("resource fetch deadline also covers a successful response with a stalled body", async ({ page, request }) => {
  test.setTimeout(40000);
  await page.clock.install();
  const { resource } = await (await request.post("/api/resources", { data: { url: "https://example.com/fetch-timeout-body", title: "本文が止まる資料", type: "WEB" } })).json();
  await page.addInitScript((resourceId) => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = String(input);
      if (url.includes(`/api/resources/${resourceId}/fetch`) && init?.method === "POST") {
        return Promise.resolve(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); } }), { status: 200, headers: { "Content-Type": "application/json" } }));
      }
      return original(input, init);
    };
  }, resource.id);
  try {
    await page.goto("/workspaces/default/resources");
    const row = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: "本文が止まる資料" }) });
    await row.getByRole("button", { name: "取得を確認" }).click();
    await expect(row.getByRole("button", { name: "取得確認中…" })).toBeDisabled();
    await page.clock.runFor(RESOURCE_FETCH_TIMEOUT_MS + 100);
    await expect(row.getByRole("alert")).toContainText("取得結果を確認できませんでした");
    await expect(row.getByRole("button", { name: "取得を確認" })).toBeEnabled();
  } finally { await request.delete(`/api/resources/${resource.id}`); }
});

test("an old fetch response cannot change the same resource row in another document", async ({ page, request }) => {
  const { resource } = await (await request.post("/api/resources", { data: { url: "https://example.com/fetch-scope", title: "両ノートの資料", type: "WEB" } })).json();
  const { document: first } = await (await request.post("/api/documents", { data: { title: "取得確認の前のノート" } })).json();
  const { document: second } = await (await request.post("/api/documents", { data: { title: "取得確認の後のノート" } })).json();
  await request.post(`/api/documents/${first.id}/resources`, { data: { resourceId: resource.id } });
  await request.post(`/api/documents/${second.id}/resources`, { data: { resourceId: resource.id } });
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let attempts = 0; let delivered = false;
  await page.route(`**/api/resources/${resource.id}/fetch?*`, async (route) => {
    attempts++;
    if (attempts === 1) { await gate; await route.fulfill({ json: { status: "UNAVAILABLE" } }).catch(() => {}); delivered = true; }
    else await route.fulfill({ json: { status: "AVAILABLE" } });
  });
  try {
    await page.goto(`/workspaces/default/documents/${first.id}`);
    const row = page.getByRole("region", { name: "参考資料", exact: true }).getByRole("listitem").filter({ hasText: "両ノートの資料" });
    await row.getByRole("button", { name: "取得を確認" }).click(); await expect.poll(() => attempts).toBe(1);
    await page.goto(`/workspaces/default/documents/${second.id}`);
    await expect(row.getByRole("button", { name: "取得を確認" })).toBeEnabled();
    await row.getByRole("button", { name: "取得を確認" }).click(); await expect.poll(() => attempts).toBe(2);
    await expect(row.getByText("資料を取得できました。内容の正確性を判定する操作ではありません。")).toBeVisible();
    release(); await expect.poll(() => delivered).toBe(true);
    await expect(row.getByText("資料を取得できました。内容の正確性を判定する操作ではありません。")).toBeVisible();
  } finally {
    release(); await page.unrouteAll({ behavior: "wait" });
    await request.delete(`/api/documents/${first.id}`); await request.delete(`/api/documents/${second.id}`); await request.delete(`/api/resources/${resource.id}`);
  }
});
