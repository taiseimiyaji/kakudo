import { expect, test } from "@playwright/test";

async function pasteText(editor: import("@playwright/test").Locator, text: string) {
  await editor.evaluate((element, text) => {
    const data = new DataTransfer(); data.setData("text/plain", text);
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  }, text);
}
function deferred() { let release!: () => void; const promise = new Promise<void>((resolve) => { release = resolve; }); return { promise, release }; }

// Real autosave intervals under Playwright's controllable clock, without the
// manual-note fixture used by older explicit-save regressions.
test("IME pauses body and title autosave until composition ends", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "IME" } })).json();
  const path = `/api/documents/${document.id}`; let writes = 0;
  page.on("request", (req) => { if (req.method() === "PUT" && new URL(req.url()).pathname === path) writes++; });
  try {
    await page.clock.install(); await page.goto(`/workspaces/default/documents/${document.id}`);
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await expect(editor).toBeVisible(); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await editor.dispatchEvent("compositionstart"); await editor.pressSequentially("日本語の確定前");
    await page.clock.runFor(3000); expect(writes).toBe(0);
    await editor.dispatchEvent("compositionend"); await page.clock.runFor(1000);
    await expect(page.getByText("保存済み", { exact: true })).toBeVisible(); expect(writes).toBe(1);
    const title = page.getByLabel("ノート名（必須）"); await title.dispatchEvent("compositionstart"); await title.fill("人間が付けた名前");
    await page.clock.runFor(3000); expect(writes).toBe(1);
    await title.dispatchEvent("compositionend"); await page.clock.runFor(1000); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    const saved = await (await request.get(path)).json(); expect(saved.content).toBe("日本語の確定前"); expect(saved.document.title).toBe("人間が付けた名前"); expect(writes).toBe(2);
  } finally { await request.delete(path); }
});

test("quote waits for slow autosave, carries its write ID, and keeps Undo across mode switching and later autosaves", async ({ page, request }, testInfo) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "引用キュー", content: "Original\r\n" } })).json();
  const path = `/api/documents/${document.id}`; const hold = deferred(); let saves = 0; let quotes = 0;
  await page.route(`**${path}?*`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    saves++; if (saves !== 1) return route.continue();
    const response = await route.fetch(); await hold.promise; await route.fulfill({ response });
  });
  page.on("request", (req) => { if (req.method() === "POST" && new URL(req.url()).pathname === `${path}/quotes`) quotes++; });
  try {
    await page.clock.install(); await page.goto(`/workspaces/default/documents/${document.id}`);
    await page.getByRole("button", { name: "編集", exact: true }).click(); const editor = page.getByRole("textbox", { name: "Markdown本文" }); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially("My words"); await page.clock.runFor(1000);
    await expect.poll(() => saves).toBe(1); await expect(page.getByText("保存中…", { exact: true })).toBeVisible();
    const firstSave = await (await request.get(path)).json();
    await pasteText(editor, "Cited reference"); const dialog = page.getByRole("dialog");
    await dialog.getByLabel("出典URL（必須）").fill("https://example.com/cited"); await dialog.getByRole("button", { name: "引用を追加", exact: true }).click();
    await page.clock.runFor(3000); expect(quotes).toBe(0); expect(saves).toBe(1);
    hold.release(); await expect(dialog).toHaveCount(0); await expect(editor).toContainText("> Cited reference"); expect(quotes).toBe(1);
    const quoted = await (await request.get(path)).json(); expect(quoted.document.lastWriteId).not.toBe(firstSave.document.lastWriteId);
    await page.getByRole("button", { name: "閲覧", exact: true }).click(); await expect(page.getByRole("region", { name: "閲覧モード" })).toContainText("Cited reference");
    await page.getByRole("button", { name: "編集", exact: true }).click(); await editor.click(); await editor.press("ControlOrMeta+Z");
    await expect(editor).not.toContainText("Cited reference"); await expect(editor).toContainText("My words");
    await page.clock.runFor(1000); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    expect((await (await request.get(path)).json()).content).not.toContain("Cited reference");
    await editor.press("ControlOrMeta+Shift+Z"); await expect(editor).toContainText("Cited reference");
    await page.clock.runFor(1000); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    await editor.press("ControlOrMeta+Z"); await editor.press("ControlOrMeta+Z"); await expect(editor).not.toContainText("My words");
    await page.clock.runFor(1000); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    expect((await (await request.get(path)).json()).content).toBe("Original\r\n");
    await page.screenshot({ path: testInfo.outputPath("autosave-quote-undo.png"), fullPage: true });
  } finally { hold.release(); await page.unrouteAll({ behavior: "wait" }); await request.delete(path); }
});

test("related-node write holds autosave while typing, then carries the new token and marks old objectives outdated", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "関連と保存" } })).json();
  const a = (await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "A", learningObjectives: ["Aの目標"] } })).json()).node;
  const b = (await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "B", learningObjectives: ["Bの目標"] } })).json()).node;
  const { document } = await (await request.post("/api/documents", { data: { title: "関連のノート", content: "Human words.", nodeIds: [a.id] } })).json();
  const { run } = await (await request.post(`/api/documents/${document.id}/reviews`, { data: { type: "COVERAGE", revisionId: document.currentRevisionId } })).json();
  await expect.poll(async () => (await (await request.get(`/api/reviews/${run.id}`)).json()).run.status).toBe("COMPLETED");
  const path = `/api/documents/${document.id}`; const hold = deferred(); let saves = 0; let linkToken: string | undefined;
  page.on("request", (req) => { if (req.method() === "PUT" && new URL(req.url()).pathname === path) saves++; });
  await page.route(`**${path}/nodes?*`, async (route) => { const response = await route.fetch(); linkToken = (await response.json()).document.lastWriteId; await hold.promise; await route.fulfill({ response }); });
  try {
    await page.clock.install(); await page.goto(`/workspaces/default/documents/${document.id}`); await page.getByRole("button", { name: "編集", exact: true }).click(); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    const related = page.getByRole("region", { name: "関連する学習項目と目標" }); await related.getByText("学習項目の関連を変更", { exact: true }).click();
    await related.getByRole("checkbox", { name: `${roadmap.title} / A`, exact: true }).uncheck(); await related.getByRole("checkbox", { name: `${roadmap.title} / B`, exact: true }).check();
    await related.getByRole("button", { name: "関連を保存", exact: true }).click(); await expect.poll(() => linkToken).toBeTruthy();
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" New draft."); await page.clock.runFor(3000); expect(saves).toBe(0);
    hold.release(); await expect(related.getByRole("status")).toContainText("関連を更新しました"); await expect(related).toContainText("Bの目標");
    expect((await (await request.get(path)).json()).content).toBe("Human words.");
    const nextSave = page.waitForRequest((req) => req.method() === "PUT" && new URL(req.url()).pathname === path);
    await page.clock.runFor(1000); expect((await nextSave).postDataJSON().baseWriteId).toBe(linkToken); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    await expect(page.locator(".stale-review")).toBeVisible();
    const old = await (await request.get(`/api/reviews/${run.id}`)).json(); expect(old.run.objectives[0].text).toBe("Aの目標"); expect(old.revision.contentSnapshot).toBe("Human words.");
    const saved = await (await request.get(path)).json(); expect(saved.content).toBe("Human words. New draft."); expect(saved.nodeIds).toEqual([b.id]);
  } finally { hold.release(); await page.unrouteAll({ behavior: "wait" }); await request.delete(path); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test("lost save response pauses timers; GET confirmation retains draft and requires explicit retry", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "応答喪失" } })).json();
  const path = `/api/documents/${document.id}`; let writes = 0;
  await page.route(`**${path}?*`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    writes++; if (writes !== 1) return route.continue();
    await route.fetch(); await route.abort("failed");
  });
  try {
    await page.clock.install(); await page.goto(`/workspaces/default/documents/${document.id}`); const editor = page.getByRole("textbox", { name: "Markdown本文" }); await expect(editor).toBeVisible(); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await editor.click(); await editor.pressSequentially("Retained human words."); await page.getByLabel("ノート名（必須）").fill("Retained title"); await page.clock.runFor(1000);
    await expect(page.getByRole("alert")).toContainText("自動保存を停止"); const committed = await (await request.get(path)).json(); expect(committed.content).toBe("Retained human words.");
    await page.clock.runFor(5000); expect(writes).toBe(1);
    await page.getByRole("button", { name: "最新の保存内容を確認" }).click(); await expect(page.getByRole("region", { name: "最新の保存内容" })).toContainText("Retained title");
    await page.getByRole("button", { name: "確認した内容を基準に再試行" }).click(); await page.clock.runFor(5000); expect(writes).toBe(1);
    await expect(editor).toContainText("Retained human words."); await expect(page.getByLabel("ノート名（必須）")).toHaveValue("Retained title");
    await page.getByRole("button", { name: "保存を再試行", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    expect((await (await request.get(path)).json()).document.currentRevisionId).toBe(committed.document.currentRevisionId); expect(writes).toBe(2);
    await editor.pressSequentially(" Next."); await page.clock.runFor(1000); await expect(page.getByText("保存済み", { exact: true })).toBeVisible(); expect(writes).toBe(3);
  } finally { await page.unrouteAll({ behavior: "wait" }); await request.delete(path); }
});

test("title-only conflict and a stale confirmed baseline never overwrite another tab without a fresh retry", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "Initial" } })).json();
  const path = `/api/documents/${document.id}`;
  const remoteTitle = async (title: string) => { const base = await (await request.get(path)).json(); const response = await request.put(path, { data: { title, content: base.content, baseHash: base.contentHash, baseWriteId: base.document.lastWriteId } }); expect(response.status()).toBe(200); };
  try {
    await page.clock.install(); await page.goto(`/workspaces/default/documents/${document.id}`); const title = page.getByLabel("ノート名（必須）"); await expect(title).toBeVisible(); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await title.fill("Local title"); await remoteTitle("Remote title"); await page.clock.runFor(1000); await expect(page.getByRole("alert")).toContainText("競合");
    await page.getByRole("button", { name: "最新の保存内容を確認" }).click(); await expect(page.getByRole("region", { name: "最新の保存内容" })).toContainText("Remote title");
    await page.getByRole("button", { name: "確認した内容を基準に再試行" }).click(); await remoteTitle("Remote newer");
    await page.getByRole("button", { name: "保存を再試行", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("競合"); await expect(title).toHaveValue("Local title");
    expect((await (await request.get(path)).json()).document.title).toBe("Remote newer");
    await page.getByRole("button", { name: "最新の保存内容を確認" }).click(); await expect(page.getByRole("region", { name: "最新の保存内容" })).toContainText("Remote newer"); await page.getByRole("button", { name: "確認した内容を基準に再試行" }).click();
    await page.getByRole("button", { name: "保存を再試行", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    const saved = await (await request.get(path)).json(); expect(saved.document.title).toBe("Local title"); expect(saved.document.currentRevisionId).toBe(document.currentRevisionId);
    await page.reload(); await expect(title).toHaveValue("Local title");
  } finally { await request.delete(path); }
});


test("pending quote guards browser departure and unmount clears the autosave timer", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "離脱確認", content: "Human words." } })).json();
  const path = `/api/documents/${document.id}`; const hold = deferred(); let quoted = false; let returned = false; let saves = 0;
  page.on("request", (req) => { if (req.method() === "PUT" && new URL(req.url()).pathname === path) saves++; });
  await page.route(`**${path}/quotes?*`, async (route) => {
    const response = await route.fetch(); quoted = true; await hold.promise;
    await route.fulfill({ response }); returned = true;
  });
  try {
    await page.clock.install(); await page.goto("/workspaces/default/documents");
    await page.getByRole("link", { name: "離脱確認", exact: true }).click();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" Pending draft.");
    await pasteText(editor, "Departure reference"); const dialog = page.getByRole("dialog");
    await dialog.getByLabel("出典URL（必須）").fill("https://example.com/departure"); await dialog.getByRole("button", { name: "引用を追加", exact: true }).click();
    await expect.poll(() => quoted).toBe(true);
    page.once("dialog", (event) => event.dismiss()); await page.goBack({ timeout: 1000 }).catch(() => {});
    await expect(page).toHaveURL(new RegExp(`/documents/${document.id}`)); await expect(editor).toContainText("Pending draft.");
    page.once("dialog", (event) => event.accept()); await page.goBack(); await expect(page).toHaveURL(/\/workspaces\/default\/documents$/);
    hold.release(); await expect.poll(() => returned).toBe(true); await page.clock.runFor(6000); expect(saves).toBe(0);
    const current = await (await request.get(path)).json(); expect(current.content).toContain("Pending draft."); expect(current.content).toContain("> Departure reference");
  } finally { hold.release(); await page.unrouteAll({ behavior: "wait" }); await request.delete(path); }
});
