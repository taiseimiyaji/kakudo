import { expect, test } from "@playwright/test";

test("resource loading distinguishes failure, retry and empty results", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let attempts = 0;
  await page.route("**/api/resources?*", async (route) => {
    attempts++;
    if (attempts === 1) { await gate; await route.abort(); }
    else await route.fulfill({ json: { resources: [] } });
  });
  await page.goto("/workspaces/default/resources");
  const panel = page.getByRole("region", { name: "Sources", exact: true });
  await expect(panel.getByRole("status")).toHaveText("資料を読み込んでいます…");
  await expect(panel.getByText("登録された資料はありません。", { exact: true })).toHaveCount(0);
  release();
  await expect(panel.getByRole("alert")).toContainText("資料を読み込めませんでした");
  await panel.getByRole("button", { name: "資料を再読み込み" }).click();
  await expect(panel.getByText("登録された資料はありません。", { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});

test("resource operations retain input and block duplicates while pending, then allow retries", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "Resource feedback" } })).json();
  const resource = { id: "feedback-source", title: "検証用資料", url: "https://example.com/reference", type: "WEB", workspaceId: "default", createdAt: new Date().toISOString() };
  let linked = false;
  let fail = true;
  let count = 0;
  let release!: () => void;
  let gate = Promise.resolve();
  const pause = () => { gate = new Promise<void>((resolve) => { release = resolve; }); };
  await page.route("**/api/resources?*", (route) => route.fulfill({ json: { resources: [resource] } }));
  await page.route(`**/api/documents/${document.id}/resources**`, async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { resources: linked ? [resource] : [] } });
    count++; await gate;
    if (fail) return route.fulfill({ status: 500, json: { error: "secret-token internal stack" } });
    linked = route.request().method() !== "DELETE";
    return linked ? route.fulfill({ json: { resource } }) : route.fulfill({ status: 204 });
  });
  let fetchCount = 0;
  await page.route("**/api/resources/feedback-source/fetch?*", async (route) => { fetchCount++; await gate; if (fail) await route.abort(); else await route.fulfill({ json: { status: "AVAILABLE" } }); });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const panel = page.getByRole("region", { name: "Sources", exact: true });
    await expect(panel.getByText("登録された資料はありません。", { exact: true })).toBeVisible();
    await panel.getByLabel("Resource URL").fill("ftp://example.com");
    await panel.getByRole("button", { name: "資料を登録", exact: true }).click();
    await expect(panel.getByLabel("Resource URL")).toHaveAttribute("aria-invalid", "true");
    await expect(panel.getByLabel("Resource URL")).toHaveAccessibleDescription("HTTP(S)のURLを入力してください。");
    await panel.getByLabel("Resource URL").fill(resource.url);
    await panel.getByLabel("Resource Title").fill("保持するタイトル");
    pause();
    await panel.getByRole("button", { name: "資料を登録", exact: true }).dblclick();
    await expect(panel.getByRole("button", { name: "登録中…", exact: true })).toBeDisabled();
    await expect.poll(() => count).toBe(1); release();
    await expect(panel.getByRole("alert")).toContainText("資料を登録できませんでした");
    await expect(panel.getByLabel("Resource Title")).toHaveValue("保持するタイトル");
    await expect(panel).not.toContainText("secret-token");
    await panel.getByLabel("登録済み資料").selectOption(resource.id);
    pause();
    await panel.getByRole("button", { name: "資料を関連付け" }).dblclick();
    await expect(panel.getByRole("button", { name: "関連付け中…" })).toBeDisabled();
    await expect.poll(() => count).toBe(2); release();
    await expect(panel.getByText(/検証用資料.*関連付けられませんでした/)).toBeVisible();
    await expect(panel.getByLabel("登録済み資料")).toHaveValue(resource.id);
    fail = false;
    await panel.getByRole("button", { name: "資料を関連付け" }).click();
    const row = panel.getByRole("listitem").filter({ hasText: resource.title });
    await expect(row.getByRole("link")).toBeVisible();
    fail = true; pause();
    await row.getByRole("button", { name: "取得を確認" }).dblclick();
    await expect(row.getByRole("button", { name: "取得確認中…" })).toBeDisabled();
    await expect(row.getByRole("button", { name: "関連を外す" })).toBeDisabled();
    await expect.poll(() => fetchCount).toBe(1); release();
    await expect(row.getByRole("alert")).toContainText("内容が間違っているという意味ではありません");
    await panel.screenshot({ path: "test-results/resource-feedback.png" });
    fail = false;
    await row.getByRole("button", { name: "取得を確認" }).click();
    await expect(row.getByRole("status")).toContainText("資料を取得できました");
    fail = true; pause();
    await row.getByRole("button", { name: "関連を外す" }).dblclick();
    await expect(row.getByRole("button", { name: "解除中…" })).toBeDisabled();
    await expect.poll(() => count).toBe(4); release();
    await expect(row.getByRole("alert")).toContainText("関連を外せませんでした");
    fail = false;
    await row.getByRole("button", { name: "関連を外す" }).click();
    await expect(row).toHaveCount(0);
    await expect(panel.getByText(/検証用資料.*関連を外しました/)).toBeVisible();
    await panel.getByLabel("登録済み資料").selectOption(resource.id);
  } finally { release?.(); await request.delete(`/api/documents/${document.id}`); }
});
