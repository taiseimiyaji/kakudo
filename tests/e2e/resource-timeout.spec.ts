import { expect, test } from "@playwright/test";
import { RESOURCE_REGISTRATION_TIMEOUT_MS } from "../../client/resource-registration";

for (const committed of [false, true]) test(`stalled resource registration ${committed ? "after" : "before"} server commit becomes uncertain without a retry`, async ({ page, request }) => {
  test.setTimeout(40000);
  await page.clock.install();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let posts = 0; let delivered = false; let resourceId: string | undefined;
  const url = `https://example.com/resource-timeout-${committed ? "committed" : "uncommitted"}`;
  await page.route("**/api/resources?*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++;
    const response = committed ? await route.fetch() : null;
    if (response) { expect(response.status()).toBe(201); resourceId = (await response.json()).resource.id; }
    await gate;
    if (response) await route.fulfill({ response }).catch(() => {});
    else await route.abort().catch(() => {});
    delivered = true;
  });
  try {
    await page.goto("/workspaces/default/resources"); const panel = page.getByRole("region", { name: "参考資料", exact: true });
    await panel.getByLabel("資料URL（必須）").fill(url); await panel.getByLabel("資料名（任意）").fill("人間が選んだ資料");
    await panel.getByRole("button", { name: "資料を登録", exact: true }).click(); await expect.poll(() => posts).toBe(1);
    await expect(panel.getByRole("button", { name: "登録中…" })).toBeDisabled();
    await page.clock.runFor(RESOURCE_REGISTRATION_TIMEOUT_MS + 100);
    await expect(panel.getByRole("alert")).toContainText("結果は不明"); await expect(panel.getByRole("button", { name: "登録結果を確認", exact: true })).toBeEnabled();
    await expect(panel.getByLabel("資料URL（必須）")).toHaveValue(url); await expect(panel.getByLabel("資料名（任意）")).toHaveValue("人間が選んだ資料"); expect(posts).toBe(1);
    const stored = (await (await request.get("/api/resources?workspaceId=default")).json()).resources.filter((item: { url: string }) => item.url === url); expect(stored).toHaveLength(committed ? 1 : 0);
    await panel.getByRole("button", { name: "登録結果を確認", exact: true }).click();
    if (committed) {
      await expect(panel.getByRole("link", { name: "人間が選んだ資料", exact: true })).toBeVisible();
      await panel.getByLabel("資料URL（必須）").fill("https://example.com/new-human-draft");
      release(); await expect.poll(() => delivered).toBe(true); await expect(panel.getByLabel("資料URL（必須）")).toHaveValue("https://example.com/new-human-draft");
    } else {
      await expect(panel.getByRole("alert")).toContainText("結果はまだ不明");
      release(); await expect.poll(() => delivered).toBe(true); await expect(panel.getByLabel("資料URL（必須）")).toHaveValue(url);
    }
    expect(posts).toBe(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); if (resourceId) await request.delete(`/api/resources/${resourceId}`); }
});

test("a late timed-out registration response cannot change a different screen", async ({ page, request }) => {
  test.setTimeout(40000);
  await page.clock.install();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let delivered = false; let posts = 0; let resourceId: string | undefined;
  await page.route("**/api/resources?*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    posts++; const response = await route.fetch(); resourceId = (await response.json()).resource.id;
    await gate; await route.fulfill({ response }).catch(() => {}); delivered = true;
  });
  page.on("dialog", async (dialog) => { await dialog.accept(); });
  try {
    await page.goto("/workspaces/default/resources"); const panel = page.getByRole("region", { name: "参考資料", exact: true });
    await panel.getByLabel("資料URL（必須）").fill("https://example.com/late-other-screen");
    await panel.getByRole("button", { name: "資料を登録", exact: true }).click(); await expect.poll(() => posts).toBe(1);
    await page.clock.runFor(RESOURCE_REGISTRATION_TIMEOUT_MS + 100); await expect(panel.getByRole("alert")).toContainText("結果は不明");
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "ホーム", exact: true }).click(); await expect(page).toHaveURL(/\/workspaces\/default$/);
    release(); await expect.poll(() => delivered).toBe(true); await expect(page).toHaveURL(/\/workspaces\/default$/); await expect(panel).toHaveCount(0); expect(posts).toBe(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); if (resourceId) await request.delete(`/api/resources/${resourceId}`); }
});
