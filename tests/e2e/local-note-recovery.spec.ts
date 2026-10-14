import { expect, test, type Page } from "@playwright/test";

async function readLocalDrafts(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("kakudo-local-recovery", 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise<Array<Record<string, unknown>>>((resolve, reject) => { const request = db.transaction("drafts", "readonly").objectStore("drafts").getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  });
}
async function writeLocalDraft(page: Page, record: Record<string, unknown>) {
  await page.evaluate(async (value) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("kakudo-local-recovery", 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("drafts", "readwrite"); tx.objectStore("drafts").put(value); tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error); }); }
    finally { db.close(); }
  }, record);
}
async function countLocalDrafts(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("kakudo-local-recovery", 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    try { return await new Promise<number>((resolve, reject) => { const request = db.transaction("drafts", "readonly").objectStore("drafts").count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
    finally { db.close(); }
  });
}

test("opted-in local draft survives failed save and tab close, then needs explicit restore and save", async ({ browser, request }) => {
  test.setTimeout(90000);
  const original = "# 人間の本文\r\n" + "調べたことを自分の言葉で整理する。\r\n".repeat(80);
  const addition = "タブを閉じても戻したい追記。";
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: original } })).json();
  const path = `/api/documents/${document.id}`;
  const baseURL = "http://127.0.0.1:43172";
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, extraHTTPHeaders: { Origin: baseURL } });
  let writes = 0;
  try {
    const page = await context.newPage();
    await page.route(`**${path}?*`, (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      writes++;
      return route.fulfill({ status: 503, json: { error: "一時的な接続エラー" } });
    });
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const recovery = page.getByRole("region", { name: "端末内の下書き" });
    await recovery.locator("summary", { hasText: "端末内の下書き" }).click();
    await expect(recovery.getByRole("button", { name: "このノートの端末下書きを有効にする" })).toBeEnabled();
    await recovery.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(addition);
    await page.getByLabel("ノート名（必須）").fill("  人間の変更した名前  ");
    await expect.poll(() => writes).toBe(1);
    await expect(page.getByText("保存結果は不明です", { exact: true })).toBeVisible();
    await expect(recovery.getByText("端末に保存済み（サーバーとは別）").last()).toBeVisible();
    await expect.poll(async () => readLocalDrafts(page)).toMatchObject([{ title: "  人間の変更した名前  ", content: original + addition, outcomeUnknown: true }]);
    await page.evaluate(() => scrollTo(0, 0));
    const targets = await page.evaluate(() => ["本文を検索", "端末内の下書き（候補1件）"].map((label) => {
      const button = [...document.querySelectorAll(".document-toolbar button")].find((item) => item.textContent === label)!;
      const box = button.getBoundingClientRect();
      return { left: box.left, right: box.right, centerIsButton: document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === button };
    }));
    expect(targets[0].right).toBeLessThanOrEqual(targets[1].left);
    expect(targets.every((target) => target.centerIsButton)).toBe(true);
    const dialogs: string[] = [];
    page.on("dialog", async (dialog) => { dialogs.push(dialog.type()); await dialog.accept(); });
    await page.close({ runBeforeUnload: true });
    await expect.poll(() => page.isClosed()).toBe(true);
    expect(dialogs).toEqual(["beforeunload"]);
    const reopened = await context.newPage();
    let retryWrites = 0;
    await reopened.route(`**${path}?*`, (route) => { if (route.request().method() === "PUT") retryWrites++; return route.continue(); });
    await reopened.goto(`/workspaces/default/documents/${document.id}`);
    const candidates = reopened.getByRole("region", { name: "端末内の下書き" });
    await expect(candidates.getByRole("heading", { name: "この端末の復元候補" })).toBeVisible();
    await expect(candidates.getByRole("heading", { name: "人間の変更した名前" })).toBeVisible();
    expect((await (await request.get(path)).json()).content).toBe(original);
    await candidates.getByRole("button", { name: "この候補を編集画面に復元" }).click();
    await expect(reopened.getByText("端末の下書き", { exact: true })).toBeVisible();
    await expect(reopened.getByLabel("ノート名（必須）")).toHaveValue("  人間の変更した名前  ");
    await expect(reopened.getByRole("textbox", { name: "Markdown本文" })).toContainText(addition);
    expect(retryWrites).toBe(0);
    await candidates.getByRole("button", { name: "復元前に戻す（本文と名前）" }).click();
    await expect(reopened.getByLabel("ノート名（必須）")).toHaveValue("元の名前");
    await expect(reopened.getByRole("textbox", { name: "Markdown本文" })).not.toContainText(addition);
    await candidates.getByRole("button", { name: "この候補を編集画面に復元" }).click();
    await reopened.getByRole("textbox", { name: "Markdown本文" }).press("ControlOrMeta+End");
    await expect(reopened.getByRole("textbox", { name: "Markdown本文" })).toContainText(addition);
    await reopened.getByRole("textbox", { name: "Markdown本文" }).press("ControlOrMeta+Z");
    await expect(reopened.getByRole("textbox", { name: "Markdown本文" })).not.toContainText(addition);
    await expect(reopened.getByLabel("ノート名（必須）")).toHaveValue("  人間の変更した名前  ");
    await reopened.getByRole("textbox", { name: "Markdown本文" }).press("ControlOrMeta+Shift+Z");
    await expect(reopened.getByRole("textbox", { name: "Markdown本文" })).toContainText(addition);
    expect(retryWrites).toBe(0);
    await reopened.getByRole("button", { name: "復元した下書きを保存" }).click();
    await expect(reopened.getByText("保存済み", { exact: true })).toBeVisible();
    expect(retryWrites).toBe(1);
    expect((await (await request.get(path)).json()).content).toBe(original + addition);
    await expect(candidates.getByRole("heading", { name: "この端末の復元候補" })).toHaveCount(0);
  } finally {
    await context.close().catch(() => {}); await request.delete(path);
  }
});

test("separate tabs keep separate blank-title candidates; disable removes them without a delayed write resurrecting them", async ({ browser, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "保存済み本文" } })).json();
  const path = `/api/documents/${document.id}`;
  const baseURL = "http://127.0.0.1:43172";
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, extraHTTPHeaders: { Origin: baseURL } });
  try {
    const first = await context.newPage();
    await first.goto(`/workspaces/default/documents/${document.id}`);
    const firstPanel = first.getByRole("region", { name: "端末内の下書き" });
    await firstPanel.locator("summary", { hasText: "端末内の下書き" }).click();
    await firstPanel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    await first.getByRole("button", { name: "編集", exact: true }).click();
    await first.getByLabel("ノート名（必須）").fill("");
    await expect.poll(async () => readLocalDrafts(first)).toMatchObject([{ title: "" }]);
    await first.getByLabel("ノート名（必須）").fill("   ");
    await first.getByRole("textbox", { name: "Markdown本文" }).pressSequentially(" 最初のタブ");
    await expect(firstPanel.getByText("端末に保存済み（サーバーとは別）").last()).toBeVisible();
    const second = await context.newPage();
    await second.goto(`/workspaces/default/documents/${document.id}`);
    const secondPanel = second.getByRole("region", { name: "端末内の下書き" });
    await secondPanel.locator("summary", { hasText: "端末内の下書き" }).click();
    await expect(secondPanel.getByRole("heading", { name: "（名前が空または空白の下書き）" })).toBeVisible();
    await second.getByRole("button", { name: "編集", exact: true }).click();
    await second.getByLabel("ノート名（必須）").fill(" ");
    await second.getByRole("textbox", { name: "Markdown本文" }).pressSequentially(" 二番目のタブ");
    await expect(secondPanel.getByRole("button", { name: "この候補を編集画面に復元" })).toBeDisabled();
    await expect.poll(async () => (await readLocalDrafts(second)).length).toBe(2);
    const drafts = await readLocalDrafts(second);
    expect(new Set(drafts.map((item) => item.sessionId)).size).toBe(2);
    expect(drafts.map((item) => item.title).sort()).toEqual([" ", "   "]);
    await first.getByRole("textbox", { name: "Markdown本文" }).pressSequentially(" 遅延中の入力");
    second.once("dialog", (dialog) => dialog.accept());
    await secondPanel.getByRole("button", { name: "無効にしてこのノートの端末下書きを削除" }).click();
    await expect.poll(async () => (await readLocalDrafts(second)).length).toBe(0);
    await expect(firstPanel.getByRole("button", { name: "このノートの端末下書きを有効にする" })).toBeVisible();
    await first.waitForTimeout(250);
    expect(await readLocalDrafts(first)).toEqual([]);
    expect((await (await request.get(path)).json()).content).toBe("保存済み本文");
  } finally { await context.close().catch(() => {}); await request.delete(path); }
});

test("next opening expires only seven-day-old drafts and preserves unknown schema without rewriting it", async ({ browser, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "保存済み" } })).json();
  const path = `/api/documents/${document.id}`;
  const baseURL = "http://127.0.0.1:43172";
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  try {
    const first = await context.newPage();
    await first.goto(`/workspaces/default/documents/${document.id}`);
    const panel = first.getByRole("region", { name: "端末内の下書き" });
    await panel.locator("summary", { hasText: "端末内の下書き" }).click();
    await panel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    await first.getByRole("button", { name: "編集", exact: true }).click();
    await first.getByLabel("ノート名（必須）").fill(" ");
    await expect.poll(async () => (await readLocalDrafts(first)).length).toBe(1);
    const original = (await readLocalDrafts(first))[0];
    const now = Date.now(); const period = 7 * 24 * 60 * 60 * 1000;
    await writeLocalDraft(first, { ...original, updatedAt: now - period + 60000 });
    const expiredSession = crypto.randomUUID();
    await writeLocalDraft(first, { ...original, key: `${original.documentKey}:${expiredSession}`, sessionId: expiredSession, updatedAt: now - period - 60000 });
    const unknownSession = crypto.randomUUID();
    await writeLocalDraft(first, { ...original, key: `${original.documentKey}:${unknownSession}`, sessionId: unknownSession, version: 2 });
    const orphanDocumentKey = `default:${crypto.randomUUID()}`;
    const orphanSession = crypto.randomUUID();
    await writeLocalDraft(first, { ...original, key: `${orphanDocumentKey}:${orphanSession}`, documentKey: orphanDocumentKey, sessionId: orphanSession, updatedAt: now - period - 60000 });
    const second = await context.newPage();
    await second.goto(`/workspaces/default/documents/${document.id}`);
    const secondPanel = second.getByRole("region", { name: "端末内の下書き" });
    await expect(secondPanel.getByRole("heading", { name: "この端末の復元候補" })).toBeVisible();
    await secondPanel.locator("summary", { hasText: "端末内の下書き" }).click();
    await expect(secondPanel.getByRole("alert")).toContainText("読めない形式");
    const kept = await readLocalDrafts(second);
    expect(kept.map((record) => record.key).sort()).toEqual([original.key, `${original.documentKey}:${unknownSession}`].sort());
    expect(kept.find((record) => record.key === `${original.documentKey}:${unknownSession}`)?.version).toBe(2);
    expect(kept.some((record) => record.documentKey === orphanDocumentKey)).toBe(false);
  } finally { await context.close().catch(() => {}); await request.delete(path); }
});

test("storage quota refusal keeps the prior committed candidate and shows the newer text is unprotected", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "保存済み" } })).json();
  const path = `/api/documents/${document.id}`;
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const panel = page.getByRole("region", { name: "端末内の下書き" });
    await panel.locator("summary", { hasText: "端末内の下書き" }).click();
    await panel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await page.getByLabel("ノート名（必須）").fill(" ");
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await editor.pressSequentially(" 初めの候補");
    await expect(panel.getByText("端末に保存済み（サーバーとは別）").last()).toBeVisible();
    const first = (await readLocalDrafts(page))[0];
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) { if (this.name === "drafts") throw new DOMException("容量不足", "QuotaExceededError"); return original.apply(this, args); };
    });
    await editor.pressSequentially(" 新しい追記");
    await expect(panel.getByRole("alert")).toContainText("保存容量が不足");
    expect((await readLocalDrafts(page))[0]).toMatchObject({ key: first.key, content: first.content, generation: first.generation });
    await expect(editor).toContainText("新しい追記");
    expect((await (await request.get(path)).json()).content).toBe("保存済み");
  } finally { await request.delete(path); }
});

test("confirmed slow save clears only the submitted generation and retains later human input", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "保存済み" } })).json();
  const path = `/api/documents/${document.id}`;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let writes = 0;
  try {
    await page.route(`**${path}?*`, async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      writes++;
      if (writes === 1) await held;
      return route.continue();
    });
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const panel = page.getByRole("region", { name: "端末内の下書き" });
    await panel.locator("summary", { hasText: "端末内の下書き" }).click();
    await panel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await editor.press("ControlOrMeta+End");
    await editor.pressSequentially(" 最初の提出");
    await expect(panel.getByText("端末に保存済み（サーバーとは別）").last()).toBeVisible();
    const submitted = (await readLocalDrafts(page))[0];
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect.poll(() => writes).toBe(1);
    await editor.press("ControlOrMeta+End");
    await editor.pressSequentially(" 後からの入力");
    await page.getByLabel("ノート名（必須）").fill(" ");
    await expect.poll(async () => (await readLocalDrafts(page))[0]?.content).toBe("保存済み 最初の提出 後からの入力");
    const later = (await readLocalDrafts(page))[0];
    expect(later.generation).toBeGreaterThan(submitted.generation as number);
    release();
    await expect.poll(async () => (await (await request.get(path)).json()).content).toBe("保存済み 最初の提出");
    await expect.poll(async () => (await readLocalDrafts(page))[0]?.generation).toBe(later.generation);
    expect((await readLocalDrafts(page))[0]).toMatchObject({ title: " ", content: "保存済み 最初の提出 後からの入力" });
    expect(writes).toBe(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await request.delete(path); }
});

test("document capacity limit keeps all unexpired candidates and warns instead of evicting another tab", async ({ page, request }) => {
  test.setTimeout(90000);
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "保存済み" } })).json();
  const path = `/api/documents/${document.id}`;
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const panel = page.getByRole("region", { name: "端末内の下書き" });
    await panel.locator("summary", { hasText: "端末内の下書き" }).click();
    await panel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await page.getByLabel("ノート名（必須）").fill(" ");
    await expect.poll(async () => countLocalDrafts(page)).toBe(1);
    const original = (await readLocalDrafts(page))[0];
    const full = "a".repeat(2 * 1024 * 1024);
    for (let number = 0; number < 10; number++) {
      const sessionId = `other-${number}`;
      await writeLocalDraft(page, { ...original, key: `${original.documentKey}:${sessionId}`, sessionId, title: "", content: full });
    }
    expect(await countLocalDrafts(page)).toBe(11);
    await page.getByRole("textbox", { name: "Markdown本文" }).pressSequentially(" 新しい入力");
    await expect(panel.getByRole("alert")).toContainText("容量上限");
    expect(await countLocalDrafts(page)).toBe(11);
    expect((await (await request.get(path)).json()).content).toBe("保存済み");
  } finally { await request.delete(path); }
});

test("denied browser storage reports the lack of protection while keeping in-memory typing", async ({ browser, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "保存済み" } })).json();
  const path = `/api/documents/${document.id}`;
  const baseURL = "http://127.0.0.1:43172";
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  try {
    await context.addInitScript(() => { Object.defineProperty(window, "indexedDB", { configurable: true, get() { throw new DOMException("storage denied", "SecurityError"); } }); });
    const page = await context.newPage();
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const panel = page.getByRole("region", { name: "端末内の下書き" });
    await panel.locator("summary", { hasText: "端末内の下書き" }).click();
    await expect(panel.getByRole("alert")).toContainText("読み書きできません");
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await page.getByLabel("ノート名（必須）").fill(" ");
    await page.getByRole("textbox", { name: "Markdown本文" }).pressSequentially(" 画面に残る入力");
    await expect(page.getByRole("textbox", { name: "Markdown本文" })).toContainText("画面に残る入力");
    expect((await (await request.get(path)).json()).content).toBe("保存済み");
  } finally { await context.close().catch(() => {}); await request.delete(path); }
});

test("a restored old local candidate uses the fresh server baseline and a later external write still wins CAS", async ({ browser, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "初期本文" } })).json();
  const path = `/api/documents/${document.id}`;
  const baseURL = "http://127.0.0.1:43172";
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  try {
    const first = await context.newPage();
    await first.route(`**${path}?*`, (route) => route.request().method() === "PUT" ? route.fulfill({ status: 503, json: { error: "応答不明" } }) : route.continue());
    await first.goto(`/workspaces/default/documents/${document.id}`);
    const panel = first.getByRole("region", { name: "端末内の下書き" });
    await panel.locator("summary", { hasText: "端末内の下書き" }).click();
    await panel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    await first.getByRole("button", { name: "編集", exact: true }).click();
    await first.getByRole("textbox", { name: "Markdown本文" }).pressSequentially(" 候補の入力");
    await expect(first.getByText("保存結果は不明です", { exact: true })).toBeVisible();
    await expect(panel.getByText("端末に保存済み（サーバーとは別）").last()).toBeVisible();
    first.on("dialog", (dialog) => dialog.accept());
    await first.close({ runBeforeUnload: true }); await expect.poll(() => first.isClosed()).toBe(true);
    const original = await (await request.get(path)).json();
    expect((await request.put(path, { data: { title: "外部C", content: "外部C本文", baseHash: original.contentHash, baseWriteId: original.document.lastWriteId } })).status()).toBe(200);
    const reopened = await context.newPage();
    let localWrites = 0;
    await reopened.route(`**${path}?*`, (route) => { if (route.request().method() === "PUT") localWrites++; return route.continue(); });
    await reopened.goto(`/workspaces/default/documents/${document.id}`);
    const candidates = reopened.getByRole("region", { name: "端末内の下書き" });
    await expect(candidates).toContainText("候補の保存基準よりサーバー版が変わっています");
    await expect(candidates).toContainText("本文が一致しても引用の成否は確定しません");
    await candidates.getByRole("button", { name: "この候補を編集画面に復元" }).click();
    expect(localWrites).toBe(0);
    const fresh = await (await request.get(path)).json();
    expect((await request.put(path, { data: { title: "外部D", content: "外部D本文", baseHash: fresh.contentHash, baseWriteId: fresh.document.lastWriteId } })).status()).toBe(200);
    await reopened.getByRole("button", { name: "復元した下書きを保存" }).click();
    await expect(reopened.getByText("保存できませんでした", { exact: true })).toBeVisible();
    expect(localWrites).toBe(1);
    expect((await (await request.get(path)).json()).content).toBe("外部D本文");
    expect(await countLocalDrafts(reopened)).toBe(1);
    await reopened.getByRole("button", { name: "最新の保存内容を確認" }).click();
    await expect(reopened.getByRole("region", { name: "最新の保存内容" })).toContainText("外部D本文");
    await reopened.getByRole("button", { name: "確認した内容を基準に再試行" }).click();
    await expect(candidates.getByRole("button", { name: "復元前に戻す（本文と名前）" })).toHaveCount(0);
    await reopened.getByRole("textbox", { name: "Markdown本文" }).press("ControlOrMeta+Z");
    await expect(reopened.getByRole("textbox", { name: "Markdown本文" })).toContainText("外部C本文");
    await reopened.waitForTimeout(1200);
    expect(localWrites).toBe(1);
    expect((await (await request.get(path)).json()).content).toBe("外部D本文");
  } finally { await context.close().catch(() => {}); await request.delete(path); }
});

test("discarding one generation cannot erase a later pending edit in the same session", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "保存済み" } })).json();
  const path = `/api/documents/${document.id}`;
  try {
    await page.clock.install({ time: new Date() });
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const panel = page.getByRole("region", { name: "端末内の下書き" });
    await panel.locator("summary", { hasText: "端末内の下書き" }).click();
    await panel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await page.getByLabel("ノート名（必須）").fill(" ");
    await page.clock.runFor(200);
    await expect.poll(async () => countLocalDrafts(page)).toBe(1);
    const old = (await readLocalDrafts(page))[0];
    await page.getByRole("textbox", { name: "Markdown本文" }).pressSequentially(" 新しい入力");
    page.once("dialog", (dialog) => dialog.accept());
    await panel.getByRole("button", { name: "この候補を破棄" }).click();
    await page.clock.runFor(200);
    await expect.poll(async () => (await readLocalDrafts(page))[0]?.content).toContain("新しい入力");
    expect((await readLocalDrafts(page))[0].generation).toBeGreaterThan(old.generation as number);
    expect((await (await request.get(path)).json()).content).toBe("保存済み");
  } finally { await request.delete(path); }
});

test("a delayed local read never replaces typing started after the server page opened", async ({ browser, request }) => {
  test.setTimeout(60000);
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "保存済み" } })).json();
  const path = `/api/documents/${document.id}`;
  const baseURL = "http://127.0.0.1:43172";
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  let first: Page | null = null;
  try {
    first = await context.newPage();
    await first.goto(`/workspaces/default/documents/${document.id}`);
    const firstPanel = first.getByRole("region", { name: "端末内の下書き" });
    await firstPanel.locator("summary", { hasText: "端末内の下書き" }).click();
    await firstPanel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    await first.getByRole("button", { name: "編集", exact: true }).click();
    await first.getByLabel("ノート名（必須）").fill(" ");
    await first.getByRole("textbox", { name: "Markdown本文" }).pressSequentially(" Aの候補");
    await expect.poll(async () => countLocalDrafts(first!)).toBe(1);
    await first.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("kakudo-local-recovery", 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const tx = db.transaction(["settings", "drafts"], "readwrite");
      let hold = true;
      (window as unknown as { releaseLocalRead: () => void }).releaseLocalRead = () => { hold = false; };
      const keepAlive = () => { if (!hold) return; const request = tx.objectStore("settings").get("hold"); request.onsuccess = keepAlive; };
      keepAlive(); tx.oncomplete = () => db.close();
    });
    const second = await context.newPage();
    await second.goto(`/workspaces/default/documents/${document.id}`);
    const secondPanel = second.getByRole("region", { name: "端末内の下書き" });
    await second.getByRole("button", { name: "編集", exact: true }).click();
    await second.getByLabel("ノート名（必須）").fill(" ");
    await second.getByRole("textbox", { name: "Markdown本文" }).pressSequentially(" Bの新入力");
    await expect(second.getByRole("textbox", { name: "Markdown本文" })).toContainText("Bの新入力");
    await first.evaluate(() => (window as unknown as { releaseLocalRead: () => void }).releaseLocalRead());
    await expect(secondPanel.getByRole("heading", { name: "この端末の復元候補" })).toBeVisible();
    await expect.poll(async () => countLocalDrafts(second)).toBe(2);
    await expect(second.getByRole("textbox", { name: "Markdown本文" })).toContainText("Bの新入力");
    await expect(secondPanel.getByRole("button", { name: "この候補を編集画面に復元" }).first()).toBeDisabled();
    expect((await (await request.get(path)).json()).content).toBe("保存済み");
  } finally {
    if (first && !first.isClosed()) await first.evaluate(() => (window as unknown as { releaseLocalRead?: () => void }).releaseLocalRead?.()).catch(() => {});
    await context.close().catch(() => {}); await request.delete(path);
  }
});

test("restoring CRLF over an LF server version remains undoable without normalizing the final saved body", async ({ browser, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "初行\n次行" } })).json();
  const path = `/api/documents/${document.id}`;
  const baseURL = "http://127.0.0.1:43172";
  const context = await browser.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  try {
    const first = await context.newPage();
    await first.goto(`/workspaces/default/documents/${document.id}`);
    const panel = first.getByRole("region", { name: "端末内の下書き" });
    await panel.locator("summary", { hasText: "端末内の下書き" }).click();
    await panel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    const saved = await (await request.get(path)).json();
    const sessionId = crypto.randomUUID(); const documentKey = `default:${document.id}`;
    await writeLocalDraft(first, { version: 1, key: `${documentKey}:${sessionId}`, documentKey, sessionId, generation: 1,
      title: "改行テスト", content: "復元した行\r\n次の行", baseHash: saved.contentHash, baseWriteId: saved.document.lastWriteId, outcomeUnknown: false, updatedAt: Date.now() });
    const second = await context.newPage();
    let writes = 0;
    await second.route(`**${path}?*`, (route) => { if (route.request().method() === "PUT") writes++; return route.continue(); });
    await second.goto(`/workspaces/default/documents/${document.id}`);
    await second.getByRole("region", { name: "端末内の下書き" }).getByRole("button", { name: "この候補を編集画面に復元" }).click();
    const editor = second.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toContainText("復元した行");
    await editor.press("ControlOrMeta+Z");
    await expect(editor).toContainText("初行");
    await editor.press("ControlOrMeta+Shift+Z");
    await expect(editor).toContainText("復元した行");
    expect(writes).toBe(0);
    await second.getByRole("button", { name: "復元した下書きを保存" }).click();
    await expect(second.getByText("保存済み", { exact: true })).toBeVisible();
    expect(writes).toBe(1);
    expect((await (await request.get(path)).json()).content).toBe("復元した行\r\n次の行");
  } finally { await context.close().catch(() => {}); await request.delete(path); }
});

test("enabling during new typing stores the latest note snapshot before reporting it protected", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "保存済み" } })).json();
  const path = `/api/documents/${document.id}`;
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const panel = page.getByRole("region", { name: "端末内の下書き" });
    await panel.locator("summary", { hasText: "端末内の下書き" }).click();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await page.getByLabel("ノート名（必須）").fill(" ");
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" A");
    await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open("kakudo-local-recovery", 2); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const tx = db.transaction("settings", "readwrite");
      let hold = true;
      (window as unknown as { releaseLocalEnable: () => void }).releaseLocalEnable = () => { hold = false; };
      const keepAlive = () => { if (!hold) return; const request = tx.objectStore("settings").get("hold"); request.onsuccess = keepAlive; };
      keepAlive(); tx.oncomplete = () => db.close();
    });
    await panel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    await expect(panel.getByRole("button", { name: "このノートの端末下書きを有効にする" })).toBeDisabled();
    await editor.pressSequentially(" B");
    await page.evaluate(() => (window as unknown as { releaseLocalEnable: () => void }).releaseLocalEnable());
    await expect(panel.getByText("端末に保存済み（サーバーとは別）").last()).toBeVisible();
    expect((await readLocalDrafts(page))[0]).toMatchObject({ title: " ", content: "保存済み A B" });
    expect((await (await request.get(path)).json()).content).toBe("保存済み");
  } finally {
    await page.evaluate(() => (window as unknown as { releaseLocalEnable?: () => void }).releaseLocalEnable?.()).catch(() => {});
    await request.delete(path);
  }
});

test("canceling a restore keeps the write gate if native Redo brings the candidate back", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "保存済み" } })).json();
  const path = `/api/documents/${document.id}`;
  let writes = 0;
  try {
    await page.route(`**${path}?*`, (route) => { if (route.request().method() === "PUT") writes++; return route.continue(); });
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const panel = page.getByRole("region", { name: "端末内の下書き" });
    await panel.locator("summary", { hasText: "端末内の下書き" }).click();
    await panel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    const saved = await (await request.get(path)).json();
    const documentKey = `default:${document.id}`; const sessionId = crypto.randomUUID();
    await writeLocalDraft(page, { version: 1, key: `${documentKey}:${sessionId}`, documentKey, sessionId, generation: 1,
      title: "候補の名前", content: "候補の本文", baseHash: saved.contentHash, baseWriteId: saved.document.lastWriteId, outcomeUnknown: false, updatedAt: Date.now() });
    await panel.getByRole("button", { name: "候補を再確認" }).click();
    await panel.getByRole("button", { name: "この候補を編集画面に復元" }).click();
    await panel.getByRole("button", { name: "復元前に戻す（本文と名前）" }).click();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toContainText("保存済み");
    await expect(page.getByLabel("ノート名（必須）")).toHaveValue("元の名前");
    await page.getByRole("button", { name: "自動保存を再開" }).click();
    await expect.poll(() => writes).toBe(1);
    expect((await (await request.get(path)).json()).content).toBe("保存済み");
    await editor.press("ControlOrMeta+Shift+Z");
    await expect(editor).toContainText("候補の本文");
    await expect(page.getByText("端末の下書き", { exact: true })).toBeVisible();
    await page.waitForTimeout(1300);
    expect(writes).toBe(1);
    await page.getByRole("button", { name: "復元した下書きを保存" }).click();
    await expect.poll(() => writes).toBe(2);
    expect((await (await request.get(path)).json()).content).toBe("候補の本文");
  } finally { await request.delete(path); }
});

test("restore cancellation is unavailable during an in-flight explicit save", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "保存済み" } })).json();
  const path = `/api/documents/${document.id}`;
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let writes = 0;
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const panel = page.getByRole("region", { name: "端末内の下書き" });
    await panel.locator("summary", { hasText: "端末内の下書き" }).click();
    await panel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    const saved = await (await request.get(path)).json();
    const documentKey = `default:${document.id}`; const sessionId = crypto.randomUUID();
    await writeLocalDraft(page, { version: 1, key: `${documentKey}:${sessionId}`, documentKey, sessionId, generation: 1,
      title: "復元後の名前", content: "復元後の本文", baseHash: saved.contentHash, baseWriteId: saved.document.lastWriteId, outcomeUnknown: false, updatedAt: Date.now() });
    await panel.getByRole("button", { name: "候補を再確認" }).click();
    await panel.getByRole("button", { name: "この候補を編集画面に復元" }).click();
    await page.route(`**${path}?*`, async (route) => { if (route.request().method() === "PUT") { writes++; await held; } return route.continue(); });
    await page.getByRole("button", { name: "復元した下書きを保存" }).click();
    await expect.poll(() => writes).toBe(1);
    await expect(panel.getByRole("button", { name: "復元前に戻す（本文と名前）" })).toHaveCount(0);
    await expect(page.getByLabel("ノート名（必須）")).toHaveValue("復元後の名前");
    await expect(page.getByRole("textbox", { name: "Markdown本文" })).toContainText("復元後の本文");
    release();
    await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    expect((await (await request.get(path)).json()).content).toBe("復元後の本文");
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await request.delete(path); }
});

test("successful quote application does not create a second local candidate for already saved prose", async ({ page, context, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "人間の本文" } })).json();
  const path = `/api/documents/${document.id}`;
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const panel = page.getByRole("region", { name: "端末内の下書き" });
    await panel.locator("summary", { hasText: "端末内の下書き" }).click();
    await panel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await editor.press("ControlOrMeta+End");
    await page.evaluate(() => navigator.clipboard.writeText("人間が出典を確かめた引用文"));
    await editor.press("ControlOrMeta+V");
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("出典URL（必須）").fill("https://example.com/quote-source");
    await dialog.getByRole("button", { name: "引用を追加" }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(async () => (await (await request.get(path)).json()).content).toContain("人間が出典を確かめた引用文");
    expect(await readLocalDrafts(page)).toEqual([]);
    await page.getByLabel("ノート名（必須）").fill(" ");
    await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" 後続の人間入力");
    await expect(panel.getByText("端末に保存済み（サーバーとは別）").last()).toBeVisible();
    expect((await readLocalDrafts(page))[0].content).toContain("後続の人間入力");
  } finally { await request.delete(path); }
});

test("deleting a note removes its local candidate after the server confirms deletion", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "保存済み" } })).json();
  const path = `/api/documents/${document.id}`;
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const panel = page.getByRole("region", { name: "端末内の下書き" });
    await panel.locator("summary", { hasText: "端末内の下書き" }).click();
    await panel.getByRole("button", { name: "このノートの端末下書きを有効にする" }).click();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await page.getByLabel("ノート名（必須）").fill(" ");
    await expect(panel.getByText("端末に保存済み（サーバーとは別）").last()).toBeVisible();
    page.on("dialog", (dialog) => dialog.accept());
    await panel.getByRole("button", { name: "この候補を破棄" }).click();
    await expect.poll(async () => countLocalDrafts(page)).toBe(0);
    await expect(panel.getByText("端末に保存済み（サーバーとは別）")).toHaveCount(0);
    await page.getByRole("textbox", { name: "Markdown本文" }).pressSequentially(" 新しい候補");
    await expect.poll(async () => countLocalDrafts(page)).toBe(1);
    await page.getByRole("button", { name: "ノートを削除" }).click();
    await page.waitForURL(/\/roadmaps$/);
    expect(await countLocalDrafts(page)).toBe(0);
    expect((await request.get(path)).status()).toBe(404);
  } finally { if ((await request.get(path)).status() !== 404) await request.delete(path); }
});
