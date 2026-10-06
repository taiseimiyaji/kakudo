import { openNotePanels } from "./manual-note-fixture";
import { expect, test } from "@playwright/test";

for (const outcome of ["stale success", "timeout"] as const) test(`background resource list ${outcome} cannot hide a newer inline registration`, async ({ page, context, request }) => {
  test.setTimeout(40000);
  await page.clock.install(); await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { document } = await (await request.post("/api/documents", { data: { title: `背景更新 ${outcome}`, content: "人間が書いた本文。" } })).json();
  const sourceA = `https://example.com/background-a-${outcome.replace(" ", "-")}`;
  const sourceB = `https://example.com/background-b-${outcome.replace(" ", "-")}`;
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let hold = false; let held = false;
  await page.route(`**/api/documents/${document.id}/resources?*`, async (route) => {
    if (route.request().method() !== "GET" || !hold) return route.continue();
    hold = false; const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await openNotePanels(page); await page.getByRole("button", { name: "編集", exact: true }).click();
    const panel = page.getByRole("region", { name: "参考資料", exact: true }); await expect(panel.getByText("登録された資料はありません。", { exact: true })).toBeVisible();
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click();
    await page.evaluate((value) => navigator.clipboard.writeText(value), sourceA); await editor.press("ControlOrMeta+V");
    hold = true; await page.getByRole("dialog").getByRole("button", { name: "資料を登録", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0); await expect.poll(() => held).toBe(true);
    await panel.getByLabel("資料URL（必須）").fill(sourceB); await panel.getByLabel("資料名（任意）").fill("後から登録した資料"); await panel.getByRole("button", { name: "資料を登録", exact: true }).click();
    await expect(panel.getByRole("link", { name: "後から登録した資料", exact: true })).toBeVisible();
    if (outcome === "stale success") release(); else await page.clock.runFor(20_100);
    await expect(panel.getByRole("link", { name: "後から登録した資料", exact: true })).toBeVisible();
    await expect(panel.getByRole("alert")).toHaveCount(0);
    const stored = (await (await request.get(`/api/documents/${document.id}/resources`)).json()).resources;
    expect(stored.map((item: { url: string }) => item.url)).toEqual(expect.arrayContaining([sourceA, sourceB]));
  } finally {
    release(); await page.unrouteAll({ behavior: "wait" });
    const stored = (await (await request.get(`/api/documents/${document.id}/resources`)).json()).resources;
    for (const item of stored) await request.delete(`/api/resources/${item.id}`);
    await request.delete(`/api/documents/${document.id}`);
  }
});

test("a current background refresh timeout retains a known registration and offers retry", async ({ page, request }) => {
  test.setTimeout(40000);
  await page.clock.install();
  const { document } = await (await request.post("/api/documents", { data: { title: "背景更新の期限", content: "人間が書いた本文。" } })).json();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let hold = false; let held = false;
  await page.route(`**/api/documents/${document.id}/resources?*`, async (route) => {
    if (route.request().method() !== "GET" || !hold) return route.continue();
    hold = false; const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }).catch(() => {});
  });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await openNotePanels(page); const panel = page.getByRole("region", { name: "参考資料", exact: true });
    await expect(panel.getByText("登録された資料はありません。", { exact: true })).toBeVisible();
    hold = true; await panel.getByLabel("資料URL（必須）").fill("https://example.com/known-after-timeout"); await panel.getByLabel("資料名（任意）").fill("保存が確定した資料");
    await panel.getByRole("button", { name: "資料を登録", exact: true }).click(); await expect.poll(() => held).toBe(true);
    await expect(panel.getByRole("link", { name: "保存が確定した資料", exact: true })).toBeVisible();
    await page.clock.runFor(20_100);
    await expect(panel.getByRole("link", { name: "保存が確定した資料", exact: true })).toBeVisible();
    await expect(panel.getByRole("alert")).toContainText("資料を読み込めませんでした"); await expect(panel.getByRole("button", { name: "資料を再読み込み" })).toBeEnabled();
    await panel.getByRole("button", { name: "資料を再読み込み" }).click(); await expect(panel.getByRole("alert")).toHaveCount(0); await expect(panel.getByRole("link", { name: "保存が確定した資料", exact: true })).toBeVisible();
    release(); await expect(panel.getByRole("link", { name: "保存が確定した資料", exact: true })).toBeVisible();
  } finally {
    release(); await page.unrouteAll({ behavior: "wait" });
    const stored = (await (await request.get(`/api/documents/${document.id}/resources`)).json()).resources;
    for (const item of stored) await request.delete(`/api/resources/${item.id}`);
    await request.delete(`/api/documents/${document.id}`);
  }
});

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
    await page.goto(scope === "workspace" ? "/workspaces/default/resources" : `/workspaces/default/documents/${documentId}`); await openNotePanels(page);
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
