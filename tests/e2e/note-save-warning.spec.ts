import { expect, test } from "@playwright/test";

for (const { width, committed } of [{ width: 390, committed: false }, { width: 1440, committed: true }]) {
  test(`unknown save explains departure and explicit recovery at ${width}px, server committed=${committed}`, async ({ page, request }) => {
    const original = "人間が保存した本文。";
    const addition = " 失いたくない追記。";
    const { document } = await (await request.post("/api/documents", { data: { title: `保存案内 ${width}`, content: original } })).json();
    const path = `/api/documents/${document.id}`;
    let writes = 0;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.setViewportSize({ width, height: 844 });
    await page.route(`**${path}?*`, async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      writes++;
      if (writes !== 1) return route.continue();
      if (committed) {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
      }
      await held;
      await route.fulfill({ status: 503, json: { error: "接続を確認してください" } });
    });
    try {
      await page.goto(`/workspaces/default/documents/${document.id}`);
      await page.getByRole("button", { name: "編集", exact: true }).click();
      const editor = page.getByRole("textbox", { name: "Markdown本文" });
      await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(addition);
      await expect.poll(() => writes).toBe(1);
      await expect(page.getByText("保存中…", { exact: true })).toBeVisible();
      await expect(page.locator("p.error[role=alert]")).toHaveCount(0);

      release();
      await expect(page.getByText("保存結果は不明です", { exact: true })).toBeVisible();
      const warning = page.locator("p.error[role=alert]");
      await expect(warning).toContainText("入力内容はこの画面に残っています");
      await expect(warning).toContainText("タブを閉じたり再読み込みしたりすると");
      await expect(warning).toContainText("サーバーに反映されていない入力は復元できない可能性があります");
      await expect(warning).toContainText("この取得だけでは引用の成否は確定しません");
      await expect(warning).toContainText("最新の保存内容を確認");
      await expect(warning).toContainText("確認した内容を基準に再試行");
      await expect(warning).toContainText("保存を再試行");
      await expect(warning).toContainText("確認だけでは保存しません");
      await expect(warning).not.toContainText("保存されていない");
      await expect(editor).toHaveText(original + addition);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.getByRole("button", { name: "保存を再試行", exact: true })).toBeDisabled();

      await page.getByRole("button", { name: "最新の保存内容を確認", exact: true }).click();
      await expect(page.getByRole("region", { name: "取得したMarkdown本文" })).toHaveText(committed ? original + addition : original);
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "確認した内容を基準に再試行", exact: true }).click();
      await expect(page.getByText("保存の再開待ち", { exact: true })).toBeVisible();
      await expect(warning).toHaveCount(0);
      await page.waitForTimeout(1100);
      expect(writes).toBe(1);
      await page.getByRole("button", { name: "保存を再試行", exact: true }).click();
      await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
      expect(writes).toBe(2);
      expect((await (await request.get(path)).json()).content).toBe(original + addition);
    } finally {
      release(); await page.unrouteAll({ behavior: "wait" }); await request.delete(path);
    }
  });
}
