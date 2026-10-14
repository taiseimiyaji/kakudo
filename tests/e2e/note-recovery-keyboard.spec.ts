import { expect, test, type Locator, type Page } from "@playwright/test";

async function tabUntil(page: Page, target: Locator, limit = 70) {
  for (let count = 0; count <= limit; count++) {
    if (await target.evaluate((element) => document.activeElement === element)) return count;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab did not reach ${await target.getAttribute("aria-label") ?? await target.textContent()}`);
}

for (const width of [390, 1440]) test(`keyboard-only long note recovery keeps focus and human input at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 844 });
  const body = "# 人間の長いノート\n" + "自分の考察を資料と照らし、次に確かめる点を記録する。\n".repeat(110);
  const suffix = " Continued by human.";
  const { document } = await (await request.post("/api/documents", { data: { title: "キーボードで復帰", content: body } })).json();
  const path = `/api/documents/${document.id}`;
  let writes = 0;
  await page.route(`**${path}?*`, (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    writes++;
    return writes === 1 ? route.fulfill({ status: 503, json: { error: "一時的に応答できません" } }) : route.continue();
  });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const edit = page.getByRole("button", { name: "編集", exact: true });
    await tabUntil(page, edit);
    await page.keyboard.press("Enter");
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toBeFocused();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(suffix);
    await expect(page.getByText("保存結果は不明です", { exact: true })).toBeVisible();
    await expect(editor).toContainText(suffix);
    const check = page.getByRole("button", { name: "最新の保存内容を確認", exact: true });
    await tabUntil(page, check);
    await page.keyboard.press("Enter");
    const recovery = page.getByRole("region", { name: "最新の保存内容", exact: true });
    await expect(recovery).toBeVisible();
    const compare = recovery.getByRole("button", { name: "現在の入力と比べる", exact: true });
    await tabUntil(page, compare);
    await page.keyboard.press("Enter");
    await expect(compare).toHaveAttribute("aria-expanded", "true");
    const current = recovery.getByRole("region", { name: "現在のMarkdown本文" });
    await tabUntil(page, current);
    await expect(current).toHaveText(body + suffix);
    await page.keyboard.press("PageDown");
    await expect.poll(() => current.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    const fetched = recovery.getByRole("region", { name: "取得したMarkdown本文" });
    await tabUntil(page, fetched);
    await expect(fetched).toHaveText(body);
    const acknowledge = recovery.getByRole("button", { name: "確認した内容を基準に再試行", exact: true });
    await tabUntil(page, acknowledge);
    page.once("dialog", (dialog) => dialog.accept());
    await page.keyboard.press("Enter");
    await expect(page.getByText("保存の再開待ち", { exact: true })).toBeVisible();
    const retry = page.getByRole("button", { name: "保存を再試行", exact: true });
    await expect(retry).toBeFocused();
    expect(writes).toBe(1);
    await page.keyboard.press("Enter");
    await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    expect((await (await request.get(path)).json()).content).toBe(body + suffix);
    expect(writes).toBe(2);
  } finally {
    await page.unrouteAll({ behavior: "wait" }); await request.delete(path);
  }
});
