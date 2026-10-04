import { expect, test } from "@playwright/test";
import { RESOURCE_CONFIRMATION_TIMEOUT_MS } from "../../client/resource-registration";

for (const committed of [false, true]) test(`stalled resource confirmation ${committed ? "finds" : "does not find"} a stored match on manual retry`, async ({ page, request }) => {
  test.setTimeout(40000);
  await page.clock.install();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let posts = 0; let checks = 0; let delivered = false; let resourceId: string | undefined; let checking = false;
  const url = `https://example.com/check-timeout-${committed ? "stored" : "absent"}`;
  await page.route("**/api/resources?*", async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      if (committed) { const response = await route.fetch(); resourceId = (await response.json()).resource.id; }
      return route.abort();
    }
    if (!checking) return route.continue();
    checks++;
    if (checks > 1) return route.continue();
    await gate;
    const stale = committed ? [] : [{ id: "stale-match", workspaceId: "default", url, title: "人間が選んだ資料", type: "WEB", createdAt: new Date().toISOString() }];
    await route.fulfill({ json: { resources: stale } }).catch(() => {}); delivered = true;
  });
  try {
    await page.goto("/workspaces/default/resources"); const panel = page.getByRole("region", { name: "参考資料", exact: true });
    await panel.getByLabel("資料URL（必須）").fill(url); await panel.getByLabel("資料名（任意）").fill("人間が選んだ資料");
    await panel.getByRole("button", { name: "資料を登録", exact: true }).click(); await expect(panel.getByRole("alert")).toContainText("結果は不明");
    checking = true; await panel.getByRole("button", { name: "登録結果を確認", exact: true }).click(); await expect.poll(() => checks).toBe(1);
    await expect(panel.getByRole("button", { name: "確認中…" })).toBeDisabled();
    await page.clock.runFor(RESOURCE_CONFIRMATION_TIMEOUT_MS + 100);
    await expect(panel.getByRole("alert")).toContainText("登録結果を確認できませんでした"); await expect(panel.getByRole("button", { name: "登録結果を確認", exact: true })).toBeEnabled();
    await expect(panel.getByLabel("資料URL（必須）")).toHaveValue(url); await expect(panel.getByLabel("資料名（任意）")).toHaveValue("人間が選んだ資料"); expect(posts).toBe(1);
    await panel.getByRole("button", { name: "登録結果を確認", exact: true }).click(); await expect.poll(() => checks).toBe(2);
    if (committed) {
      await expect(panel.getByRole("link", { name: "人間が選んだ資料", exact: true })).toBeVisible();
      await panel.getByLabel("資料URL（必須）").fill("https://example.com/later-human-input");
      release(); await expect.poll(() => delivered).toBe(true); await expect(panel.getByLabel("資料URL（必須）")).toHaveValue("https://example.com/later-human-input");
    } else {
      await expect(panel.getByRole("alert")).toContainText("結果はまだ不明");
      release(); await expect.poll(() => delivered).toBe(true); await expect(panel.getByRole("alert")).toContainText("結果はまだ不明"); await expect(panel.getByLabel("資料URL（必須）")).toHaveValue(url);
    }
    expect(posts).toBe(1); expect(checks).toBe(2);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); if (resourceId) await request.delete(`/api/resources/${resourceId}`); }
});

test("a timed-out confirmation cannot change another screen after departure", async ({ page }) => {
  test.setTimeout(40000);
  await page.clock.install();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let delivered = false; let checks = 0; let posts = 0; let checking = false;
  page.on("dialog", async (dialog) => { await dialog.accept(); });
  await page.route("**/api/resources?*", async (route) => {
    if (route.request().method() === "POST") { posts++; return route.abort(); }
    if (!checking) return route.continue();
    checks++; await gate; await route.fulfill({ json: { resources: [] } }).catch(() => {}); delivered = true;
  });
  try {
    await page.goto("/workspaces/default/resources"); const panel = page.getByRole("region", { name: "参考資料", exact: true });
    await panel.getByLabel("資料URL（必須）").fill("https://example.com/check-timeout-departure");
    await panel.getByRole("button", { name: "資料を登録", exact: true }).click(); await expect(panel.getByRole("alert")).toContainText("結果は不明");
    checking = true; await panel.getByRole("button", { name: "登録結果を確認", exact: true }).click(); await expect.poll(() => checks).toBe(1);
    await page.clock.runFor(RESOURCE_CONFIRMATION_TIMEOUT_MS + 100); await expect(panel.getByRole("button", { name: "登録結果を確認", exact: true })).toBeEnabled();
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "ホーム", exact: true }).click(); await expect(page).toHaveURL(/\/workspaces\/default$/);
    release(); await expect.poll(() => delivered).toBe(true); await expect(page).toHaveURL(/\/workspaces\/default$/); await expect(panel).toHaveCount(0); expect(posts).toBe(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});
