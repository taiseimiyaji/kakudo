import { openNotePanels } from "./manual-note-fixture";
import { expect, test } from "@playwright/test";

test("switch modes and preview without losing edits; save changes on each one-second tick", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "表示切替", content: "# Saved" } })).json();
  const path = `/api/documents/${document.id}`;
  let writes = 0;
  page.on("request", (req) => { if (req.method() === "PUT" && new URL(req.url()).pathname === path) writes++; });
  try {
    await page.clock.install();
    await page.goto(`/workspaces/default/documents/${document.id}`); await openNotePanels(page);
    await expect(page.getByRole("region", { name: "閲覧モード" })).toBeVisible();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toBeHidden();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await expect(editor).toBeVisible();
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" temporary");
    await page.getByRole("button", { name: "閲覧", exact: true }).click();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await editor.click(); await editor.press("ControlOrMeta+z");
    await expect(editor).toHaveText("# Saved");
    await page.getByRole("button", { name: "プレビューを表示" }).click();
    await page.getByRole("button", { name: "プレビューを非表示" }).click();
    await expect(page.getByLabel("ノートのプレビュー")).toHaveCount(0);
    await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" A");
    await page.clock.runFor(1000);
    await expect.poll(async () => (await (await request.get(path)).json()).content).toBe("# Saved A");
    await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    expect(writes).toBe(1);
    await editor.pressSequentially(" B");
    await page.clock.runFor(1000);
    await expect.poll(async () => (await (await request.get(path)).json()).content).toBe("# Saved A B");
    await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    expect(writes).toBe(2);
    await page.clock.runFor(3000); expect(writes).toBe(2);
    await page.getByLabel("ノート名").fill("新しい名前");
    await page.getByRole("button", { name: "閲覧", exact: true }).click();
    await expect(page.getByRole("region", { name: "閲覧モード" })).toContainText("Saved A B");
    await expect(editor).toBeHidden();
    await page.clock.runFor(1000);
    await expect.poll(async () => (await (await request.get(path)).json()).document.title).toBe("新しい名前");
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await expect(editor).toContainText("Saved A B");
    await page.getByRole("button", { name: "プレビューを表示" }).click();
    await expect(page.getByLabel("ノートのプレビュー")).toContainText("Saved A B");
    await page.getByRole("button", { name: "プレビューを非表示" }).click();
    await page.reload();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await expect(page.getByRole("button", { name: "プレビューを表示" })).toHaveAttribute("aria-pressed", "false");
    await expect(editor).toContainText("Saved A B");
  } finally { await request.delete(path); }
});

test("a delayed autosave preserves newer typing and uses the latest hash for the next write", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "遅い保存" } })).json();
  const path = `/api/documents/${document.id}`;
  let writes = 0; let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**${path}?*`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    writes++;
    if (writes !== 1) return route.continue();
    const response = await route.fetch();
    await hold;
    await route.fulfill({ response });
  });
  try {
    await page.clock.install();
    await page.goto(`/workspaces/default/documents/${document.id}`); await openNotePanels(page);
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toBeVisible(); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await editor.click(); await editor.pressSequentially("first"); await page.clock.runFor(1000);
    await expect.poll(() => writes).toBe(1);
    await expect(page.getByText("保存中…", { exact: true })).toBeVisible();
    await editor.pressSequentially(" second");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "ホーム", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/documents/${document.id}`));
    await page.getByRole("button", { name: "閲覧", exact: true }).click();
    await expect(page.getByRole("region", { name: "閲覧モード" })).toContainText("first second");
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await page.clock.runFor(3000); expect(writes).toBe(1);
    release();
    await expect(page.getByText("未保存の変更", { exact: true })).toBeVisible();
    await expect(editor).toContainText("first second");
    await page.clock.runFor(1000);
    await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    expect(writes).toBe(2);
    expect((await (await request.get(path)).json()).content).toBe("first second");
    await expect(page.getByRole("alert")).toHaveCount(0);
  } finally { release(); await request.delete(path); }
});

test("unknown 503 autosave keeps the draft and requires GET plus deliberate confirmation before explicit retry", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "保存失敗" } })).json();
  const path = `/api/documents/${document.id}`;
  let writes = 0;
  await page.route(`**${path}?*`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    writes++;
    if (writes === 1) return route.fulfill({ status: 503, json: { error: "接続を確認してください" } });
    return route.continue();
  });
  try {
    await page.clock.install(); await page.goto(`/workspaces/default/documents/${document.id}`); await openNotePanels(page);
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toBeVisible(); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await editor.click(); await editor.pressSequentially("Do not lose my words.");
    await page.clock.runFor(1000); await expect(page.getByRole("alert")).toContainText("自動保存を停止");
    await expect(editor).toContainText("Do not lose my words.");
    await page.clock.runFor(5000); expect(writes).toBe(1);
    await expect(page.getByText("保存結果は不明です", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "保存を再試行" })).toBeDisabled();
    await page.getByRole("button", { name: "最新の保存内容を確認", exact: true }).click();
    await expect(page.getByRole("region", { name: "最新の保存内容" })).toBeVisible();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "確認した内容を基準に再試行", exact: true }).click();
    await page.clock.runFor(5000); expect(writes).toBe(1);
    await page.getByRole("button", { name: "保存を再試行" }).click();
    await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    expect((await (await request.get(path)).json()).content).toBe("Do not lose my words.");
    await page.clock.runFor(2000); expect(writes).toBe(2);
  } finally { await request.delete(path); }
});

test("a conflicting external save is not overwritten by autosave or explicit retry", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "競合確認" } })).json();
  const path = `/api/documents/${document.id}`;
  try {
    await page.clock.install(); await page.goto(`/workspaces/default/documents/${document.id}`); await openNotePanels(page);
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toBeVisible(); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await editor.click(); await editor.pressSequentially("Local unsaved words.");
    const original = await (await request.get(path)).json();
    const external = await request.put(path, { data: { title: "競合確認", content: "External saved words.", baseHash: original.contentHash, baseWriteId: original.document.lastWriteId } });
    expect(external.status()).toBe(200);
    await page.clock.runFor(1000);
    await expect(page.getByRole("alert")).toContainText("自動保存を停止");
    await expect(editor).toHaveText("Local unsaved words.");
    await page.getByRole("button", { name: "保存を再試行" }).click();
    await expect(page.getByRole("alert")).toContainText("自動保存を停止");
    expect((await (await request.get(path)).json()).content).toBe("External saved words.");
    await page.getByRole("button", { name: "閲覧", exact: true }).click();
    await expect(page.getByRole("region", { name: "閲覧モード" })).toContainText("Local unsaved words.");
  } finally { await request.delete(path); }
});
