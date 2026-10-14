import { expect, test } from "@playwright/test";

test("a candidate comparison does not call an old loaded copy the current server version", async ({ page, request }, info) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "最初の名前", content: "最初の本文" } })).json();
  const path = `/api/documents/${document.id}`;
  try {
    await page.route(`**${path}?*`, (route) => route.request().method() === "PUT"
      ? route.fulfill({ status: 503, json: { error: "応答不明" } }) : route.continue());
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const panel = page.getByRole("region", { name: "端末内の下書き" });
    await panel.locator("summary", { hasText: "端末内の下書き" }).click();
    await panel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await page.getByRole("textbox", { name: "Markdown本文" }).pressSequentially(" 人間の追記");
    await expect(page.locator(".save-state")).toHaveText("保存結果は不明です");
    await expect(panel.getByText("端末に保存済み（サーバーとは別）").last()).toBeVisible();

    const before = await (await request.get(path)).json();
    expect((await request.put(path, { data: { title: "別画面の名前", content: "別画面の本文", baseHash: before.contentHash, baseWriteId: before.document.lastWriteId } })).status()).toBe(200);
    expect((await (await request.get(path)).json()).content).toBe("別画面の本文");

    await expect(panel).toContainText("別画面での変更は自動反映されません");
    await panel.locator("summary", { hasText: "確認済みの保存版と候補の本文を比較" }).click();
    await expect(panel.getByRole("heading", { name: "この画面で最後に確認した保存版: 最初の名前" })).toBeVisible();
    await expect(panel).not.toContainText("現在のサーバー版");
    await expect(panel).not.toContainText("候補の保存基準よりサーバー版が変わっています");
    await page.screenshot({ path: info.outputPath("stale-candidate-comparison.png"), fullPage: true });
  } finally { await request.delete(path); }
});
