import { expect, test } from "@playwright/test";

for (const scope of ["workspace", "linked", "available"] as const) test(`stalled ${scope} resource list exposes retry without losing a newer result`, async ({ page, request }) => {
  test.setTimeout(40000);
  await page.clock.install();
  let documentId: string | undefined;
  if (scope !== "workspace") documentId = (await (await request.post("/api/documents", { data: { title: `一覧再読込 ${scope}`, content: "人間が書いた本文。" } })).json()).document.id;
  const resource = { id: `resource-${scope}`, workspaceId: "default", url: `https://example.com/resource-${scope}`, title: `確認済みの資料 ${scope}`, type: "WEB", createdAt: new Date().toISOString() };
  const heldPath = scope === "linked" ? `**/api/documents/${documentId}/resources?*` : "**/api/resources?*";
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let heldGets = 0; let delivered = false;
  await page.route(heldPath, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    heldGets++;
    if (heldGets === 1) { await gate; await route.fulfill({ json: { resources: [] } }).catch(() => {}); delivered = true; }
    else await route.fulfill({ json: { resources: [resource] } });
  });
  if (scope !== "workspace") {
    const otherPath = scope === "linked" ? "**/api/resources?*" : `**/api/documents/${documentId}/resources?*`;
    await page.route(otherPath, (route) => route.fulfill({ json: { resources: scope === "linked" ? [resource] : [] } }));
  }
  try {
    await page.goto(scope === "workspace" ? "/workspaces/default/resources" : `/workspaces/default/documents/${documentId}`);
    const panel = page.getByRole("region", { name: "参考資料", exact: true }); await expect(panel.getByRole("status")).toContainText("資料を読み込んでいます"); await expect.poll(() => heldGets).toBe(1);
    await panel.getByLabel("資料URL（必須）").fill("https://example.com/retained-human-draft");
    await page.clock.runFor(20_100);
    await expect(panel.getByRole("alert")).toContainText("資料を読み込めませんでした"); await expect(panel.getByRole("button", { name: "資料を再読み込み" })).toBeEnabled();
    await expect(panel.getByLabel("資料URL（必須）")).toHaveValue("https://example.com/retained-human-draft");
    await panel.getByRole("button", { name: "資料を再読み込み" }).click(); await expect.poll(() => heldGets).toBe(2);
    if (scope === "available") await expect(panel.getByLabel("登録済み資料").locator(`option[value="${resource.id}"]`)).toHaveCount(1);
    else await expect(panel.getByRole("link", { name: resource.title, exact: true })).toBeVisible();
    release(); await expect.poll(() => delivered).toBe(true);
    if (scope === "available") await expect(panel.getByLabel("登録済み資料").locator(`option[value="${resource.id}"]`)).toHaveCount(1);
    else await expect(panel.getByRole("link", { name: resource.title, exact: true })).toBeVisible();
    await expect(panel.getByLabel("資料URL（必須）")).toHaveValue("https://example.com/retained-human-draft");
    await expect(panel.getByRole("alert")).toHaveCount(0);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); if (documentId) await request.delete(`/api/documents/${documentId}`); }
});
