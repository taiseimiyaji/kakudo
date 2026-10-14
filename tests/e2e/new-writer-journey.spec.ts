import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) test(`opted-in draft survives note navigation, restore, edit, and save at ${width}px`, async ({ page, request }, testInfo) => {
  test.setTimeout(90000);
  const first = (await (await request.post("/api/documents", { data: { title: "最初のノート", content: "保存済みの本文" } })).json()).document;
  const second = (await (await request.post("/api/documents", { data: { title: "次のノート", content: "別の本文" } })).json()).document;
  const firstPath = `/api/documents/${first.id}`;
  const firstUrl = `/workspaces/default/documents/${first.id}`;
  let writes = 0;
  try {
    await page.setViewportSize({ width, height: 844 });
    await page.route(`**${firstPath}?*`, (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      writes++;
      return route.fulfill({ status: 503, json: { error: "一時的な接続エラー" } });
    });
    await page.goto(firstUrl);
    const firstPanel = page.getByRole("region", { name: "端末内の下書き" });
    await firstPanel.locator("summary", { hasText: "端末内の下書き" }).click();
    await expect(firstPanel).toContainText("初期設定は無効です");
    await expect(firstPanel).toContainText("平文で保存します");
    await firstPanel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await page.getByRole("textbox", { name: "Markdown本文" }).press("ControlOrMeta+End");
    await page.getByRole("textbox", { name: "Markdown本文" }).pressSequentially(" 人間の追記");
    await expect.poll(() => writes).toBe(1);
    await expect(firstPanel.getByText("端末に保存済み（サーバーとは別）").last()).toBeVisible();
    expect((await (await request.get(firstPath)).json()).content).toBe("保存済みの本文");

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator(".note-navigation summary").click();
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "ノート" }).click();
    await page.locator(`a[href="/workspaces/default/documents/${second.id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${second.id}$`));
    const secondPanel = page.getByRole("region", { name: "端末内の下書き" });
    await secondPanel.locator("summary", { hasText: "端末内の下書き" }).click();
    await expect(secondPanel.getByText("端末下書きは無効")).toBeVisible();
    await expect(secondPanel.getByRole("heading", { name: "この端末の復元候補" })).toHaveCount(0);

    await page.locator(".note-navigation summary").click();
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "ノート" }).click();
    await page.locator(`a[href="/workspaces/default/documents/${first.id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${first.id}$`));
    const reopened = page.getByRole("region", { name: "端末内の下書き" });
    await expect(reopened.getByRole("heading", { name: "この端末の復元候補" })).toBeVisible();
    await reopened.locator(".local-recovery-candidate summary", { hasText: "サーバー版と候補の本文を比較" }).click();
    await expect(reopened.getByText("保存済みの本文", { exact: true })).toBeVisible();
    await expect(reopened.getByText(" 人間の追記", { exact: false })).toBeVisible();
    await reopened.getByRole("button", { name: "この候補を編集画面に復元" }).click();
    await expect(page.getByText("端末の下書き", { exact: true })).toBeVisible();
    await expect(page.locator("[data-save-detail]")).toContainText("サーバーに未保存です");
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`restored-${width}.png`) });
    const detailOverlap = await page.evaluate(() => {
      const detail = document.querySelector("[data-save-detail]")!;
      const jump = document.querySelector(".local-recovery-jump")!.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(detail);
      return [...range.getClientRects()].some((line) => line.left < jump.right && line.right > jump.left && line.top < jump.bottom && line.bottom > jump.top);
    });
    expect(detailOverlap).toBe(false);
    await page.getByRole("button", { name: "閲覧", exact: true }).click();
    const readingOverlap = await page.evaluate(() => {
      const range = document.createRange(); range.selectNodeContents(document.querySelector("[data-save-detail]")!);
      const jump = document.querySelector(".local-recovery-jump")!.getBoundingClientRect();
      return [...range.getClientRects()].some((line) => line.left < jump.right && line.right > jump.left && line.top < jump.bottom && line.bottom > jump.top);
    });
    expect(readingOverlap).toBe(false);
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await page.getByRole("textbox", { name: "Markdown本文" }).press("ControlOrMeta+End");
    await page.getByRole("textbox", { name: "Markdown本文" }).pressSequentially(" 続き");
    await expect(page.getByRole("button", { name: "復元した下書きを保存" })).toBeEnabled();
    await page.waitForTimeout(1300);
    expect((await (await request.get(firstPath)).json()).content).toBe("保存済みの本文");
    await page.unroute(`**${firstPath}?*`);
    await page.getByRole("button", { name: "復元した下書きを保存" }).click();
    await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    expect((await (await request.get(firstPath)).json()).content).toBe("保存済みの本文 人間の追記 続き");
    await expect(reopened.getByRole("heading", { name: "この端末の復元候補" })).toHaveCount(0);

    await page.locator(".note-navigation summary").click();
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "ノート" }).click();
    await page.locator(`a[href="/workspaces/default/documents/${second.id}"]`).click();
    await expect(page.getByRole("heading", { name: "次のノート" })).toBeVisible();
  } finally {
    await page.unroute(`**${firstPath}?*`);
    await request.delete(firstPath);
    await request.delete(`/api/documents/${second.id}`);
  }
});
