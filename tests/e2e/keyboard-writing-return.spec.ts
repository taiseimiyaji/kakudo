import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import postgres from "postgres";
import { expect, test as base, type Page, type Locator } from "@playwright/test";
import type { EditorView } from "@codemirror/view";
import { requireE2eRunner } from "../../lib/e2e-env";

const test = base.extend<{ workspace: string }>({ workspace: async ({ request }, use) => {
  requireE2eRunner();
  const db = postgres(process.env.KAKUDO_E2E_DATABASE_URL!, { max: 1, onnotice: () => {} });
  const id = randomUUID();
  try { await db`insert into workspaces (id,name) values (${id}, 'キーボード復帰の隔離検証')`; expect((await request.get(`/api/workspaces/${id}`)).ok()).toBe(true); await use(id); }
  finally { await db`delete from workspaces where id=${id}`; await db.end(); }
} });
const paragraph = "学んだことを自分の言葉で記録する。資料に書かれた事実と、自分が考えた説明を区別する。読み返しながら言葉を整え、理解が足りないところだけ必要な資料で確かめる。本文を長く書き続けても、考えていた箇所に戻って続きを書きたい。";
const original = "# 長く静かに書き続ける\n\nCookieを使うので安全である。\n\n" + Array.from({ length: 90 }, (_, i) => `段落${String(i).padStart(3, "0")}。${paragraph}`).join("\n\n");
// Read-only test diagnostics. Product code uses supported EditorView APIs only.
type EditorDOM = HTMLElement & { cmTile: { root: { view: EditorView } } };
async function position(page: Page) {
  return page.evaluate(() => {
    const editor = document.querySelector(".cm-content") as EditorDOM;
    const view = editor.cmTile.root.view, range = view.state.selection.main;
    const head = view.coordsAtPos(range.head, range.assoc || (range.head > range.anchor ? -1 : 1));
    const headerBottom = document.querySelector(".note-header")!.getBoundingClientRect().bottom;
    return { anchor: range.anchor, head: range.head, length: range.to - range.from, headRect: head, headerBottom, scrollY, focused: document.activeElement === editor, height: innerHeight, scrollWidth: document.documentElement.scrollWidth };
  });
}
async function keyTo(page: Page, target: Locator, key: "Tab" | "Shift+Tab") {
  for (let i = 0; i < 20; i++) { if (await target.evaluate(e => e === document.activeElement)) return; await page.keyboard.press(key); }
  throw new Error(`No keyboard path to target after20 ${key}`);
}
async function settle(page: Page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function selectMiddle(editor: Locator, kind: "forward" | "backward" | "caret") {
  await editor.press("ControlOrMeta+Home"); for (let i = 0; i < 70; i++) await editor.press("ArrowDown");
  if (kind === "forward") for (let i = 0; i < 60; i++) await editor.press("Shift+ArrowDown");
  if (kind === "backward") { for (let i = 0; i < 60; i++) await editor.press("ArrowDown"); for (let i = 0; i < 60; i++) await editor.press("Shift+ArrowUp"); }
}
async function visibleHead(page: Page) {
  await settle(page);
  const result = await position(page);
  expect(result.focused).toBe(true); expect(result.headRect).not.toBeNull();
  expect(result.headRect!.top).toBeGreaterThanOrEqual(result.headerBottom);
  expect(result.headRect!.bottom).toBeLessThanOrEqual(result.height);
  return result;
}

for (const width of [390, 1440]) test(`keyboard return reveals writing head without changing selection or saved text ${width}`, async ({ page, request, workspace }, info) => {
  test.setTimeout(60000); await page.setViewportSize({ width, height: 1000 });
  const suffix = `?workspaceId=${workspace}`;
  const { document } = await (await request.post(`/api/documents${suffix}`, { data: { title: "資料とレビューから同じ本文へ", content: original } })).json();
  const api = `/api/documents/${document.id}`, stored = async () => { const response = await request.get(api + suffix); expect(response.status()).toBe(200); return response.json(); };
  const saveResponses: number[] = []; page.on("response", r => { if (r.request().method() === "PUT" && new URL(r.url()).pathname === api) saveResponses.push(r.status()); });
  let puts = 0, fullSaveVerified = false; page.on("request", r => { if (r.method() === "PUT" && new URL(r.url()).pathname === api) puts++; });
  const observations: Record<string, unknown> = {};
  try {
    await page.goto(`/workspaces/${workspace}/documents/${document.id}`); await page.getByRole("button", { name: "編集", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Markdown本文" }), identity = await editor.elementHandle();
    await selectMiddle(editor, "caret"); for (let i = 0; i < 6; i++) await editor.press("Shift+ArrowRight");
    const replaced = await position(page), expectedChanged = original.slice(0, Math.min(replaced.anchor, replaced.head)) + "人間の追記" + original.slice(Math.max(replaced.anchor, replaced.head));
    await editor.pressSequentially("人間の追記");
    await expect.poll(async () => (await stored()).content).toBe(expectedChanged); await expect(page.locator(".save-state")).toHaveText("保存済み");
    const changed = await stored(), writingPuts = puts; expect(await editor.evaluate(e => (e as EditorDOM).cmTile.root.view.state.sliceDoc())).toBe(expectedChanged); for (let i = 0; i < 3; i++) await editor.press("Shift+ArrowLeft"); const selected = await position(page);
    const summary = page.locator("[data-note-panel=resources] > summary"); await keyTo(page, summary, "Tab"); await page.keyboard.press("Enter");
    const form = page.getByRole("region", { name: "参考資料", exact: true }); await keyTo(page, form.getByLabel("資料URL（必須）"), "Tab"); await page.keyboard.type(`https://example.com/keyboard-return-${document.id}`);
    await page.keyboard.press("Tab"); await page.keyboard.type("自分が必要とした資料"); await keyTo(page, form.getByRole("button", { name: "資料を登録", exact: true }), "Tab"); await page.keyboard.press("Enter");
    await expect(form.getByText("資料を登録しました。", { exact: true })).toBeVisible(); await keyTo(page, summary, "Shift+Tab"); await page.keyboard.press("Enter");
    const review = page.locator("[data-note-panel=review] > summary"); await keyTo(page, review, "Shift+Tab"); await page.keyboard.press("Enter");
    const panel = page.getByRole("region", { name: "レビュー", exact: true }); await keyTo(page, panel.getByRole("button", { name: "論理を確認", exact: true }), "Tab"); await page.keyboard.press("Enter"); await expect(panel.getByLabel("レビューの状態")).toContainText("完了");
    expect((await stored()).content).toBe(changed.content);
    await keyTo(page, review, "Shift+Tab"); await page.keyboard.press("Enter"); await keyTo(page, editor, "Shift+Tab");
    observations.shortReviewReturn = await position(page); const returned = await visibleHead(page);
    expect([returned.anchor, returned.head]).toEqual([selected.anchor, selected.head]); expect(await editor.evaluate((e, previous) => e === previous, identity)).toBe(true); expect(puts).toBe(writingPuts);
    await page.screenshot({ path: info.outputPath(`review-return-${width}.png`) });
    await editor.press("ControlOrMeta+z"); await expect.poll(async () => (await stored()).content).toBe(original); await expect(page.locator(".save-state")).toHaveText("保存済み");
    await editor.press("ControlOrMeta+Shift+z"); await expect.poll(async () => (await stored()).content).toBe(changed.content); await expect(page.locator(".save-state")).toHaveText("保存済み");
    const undoRedoPuts = puts;
    for (const kind of ["forward", "backward", "caret"] as const) {
      await selectMiddle(editor, kind); const before = await position(page); if (kind !== "caret") expect(before.length).toBeGreaterThan(500);
      const writes = puts; await keyTo(page, summary, "Tab"); await page.keyboard.press("Enter"); await keyTo(page, form.getByLabel("資料URL（必須）"), "Tab");
      await keyTo(page, summary, "Shift+Tab"); await page.keyboard.press("Enter"); await keyTo(page, editor, "Shift+Tab"); const after = await visibleHead(page);
      expect([after.anchor, after.head]).toEqual([before.anchor, before.head]); expect(puts).toBe(writes); expect((await stored()).content).toBe(changed.content); observations[kind] = { before, after };
    }
    // The title is the immediate previous control: also exercise forward Tab.
    const beforeTitle = await position(page); await keyTo(page, page.getByLabel("ノート名（必須）"), "Shift+Tab"); await page.keyboard.press("Tab"); const afterTitle = await visibleHead(page);
    expect([afterTitle.anchor, afterTitle.head]).toEqual([beforeTitle.anchor, beforeTitle.head]); observations.forwardTab = afterTitle;
    const expectedFinal = expectedChanged.slice(0, afterTitle.head) + " 続けて考える。" + expectedChanged.slice(afterTitle.head);
    await editor.pressSequentially(" 続けて考える。"); await expect.poll(async () => (await stored()).content).toBe(expectedFinal); await expect(page.locator(".save-state")).toHaveText("保存済み"); expect(puts).toBeGreaterThan(undoRedoPuts); expect(await editor.evaluate(e => (e as EditorDOM).cmTile.root.view.state.sliceDoc())).toBe(expectedFinal); expect(saveResponses.length).toBeGreaterThan(0); expect(saveResponses.every(status => status === 200)).toBe(true); fullSaveVerified = true;
    expect(await editor.evaluate((e, previous) => e === previous, identity)).toBe(true); await expect(page.getByRole("alert")).toHaveCount(0); expect((await position(page)).scrollWidth).toBe(width);
    await page.screenshot({ path: info.outputPath(`writing-continues-${width}.png`) });
  } finally { await writeFile(info.outputPath(`keyboard-return-${width}.json`), JSON.stringify({ width, normalTimers: true, originalCharacters: original.length, puts, saveResponses, fullSavedTextEqualsExpectedHumanEdits: fullSaveVerified, observations }, null, 2)); }
});

test("native Tab reveals the head below the sticky header and leaves an already visible head alone", async ({ page, request, workspace }, info) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const { document } = await (await request.post(`/api/documents?workspaceId=${workspace}`, { data: { title: "headと固定ヘッダー", content: original } })).json();
  await page.goto(`/workspaces/${workspace}/documents/${document.id}`); await page.getByRole("button", { name: "編集", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown本文" }), summary = page.locator("[data-note-panel=resources] > summary");
  type NativeFocusWindow = Window & { nativeWritingFocus?: { scrollY: number; headTop: number; headBottom: number; headerBottom: number } };
  const observations: Record<string, unknown> = {};
  for (const kind of ["backward", "caret"] as const) {
    await selectMiddle(editor, kind); if (kind === "caret") for (let i = 0; i < 3; i++) await editor.press("Shift+ArrowRight");
    await keyTo(page, summary, "Tab");
    // Keep the native DOM selection, to observe Chrome's default selection scroll.
    await page.evaluate(() => {
      const capture = (event: FocusEvent) => {
        if (event.target !== document.querySelector(".cm-content")) return;
        const selected = getSelection()!, head = document.createRange(); head.setStart(selected.focusNode!, selected.focusOffset); head.collapse(true); const rect = head.getBoundingClientRect();
        (window as unknown as NativeFocusWindow).nativeWritingFocus = { scrollY, headTop: rect.top, headBottom: rect.bottom, headerBottom: document.querySelector(".note-header")!.getBoundingClientRect().bottom };
        window.removeEventListener("focus", capture, true);
      };
      window.addEventListener("focus", capture, true);
    });
    await keyTo(page, editor, "Shift+Tab"); const after = await visibleHead(page), native = await page.evaluate(() => (window as unknown as NativeFocusWindow).nativeWritingFocus!);
    if (kind === "caret") { expect(native.headTop).toBeGreaterThanOrEqual(native.headerBottom + 4); expect(native.headBottom).toBeLessThan(996); expect(after.scrollY).toBe(native.scrollY); }
    observations[kind] = { native, after };
  }
  await writeFile(info.outputPath("native-focus-header.json"), JSON.stringify(observations, null, 2));
});

test("mouse and imperative focus preserve their scroll intent", async ({ page, request, workspace }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const { document } = await (await request.post(`/api/documents?workspaceId=${workspace}`, { data: { title: "明示的なfocusの位置", content: original } })).json();
  await page.goto(`/workspaces/${workspace}/documents/${document.id}`); await page.getByRole("button", { name: "編集", exact: true }).click(); const editor = page.getByRole("textbox", { name: "Markdown本文" });
  await selectMiddle(editor, "caret"); for (let i = 0; i < 6; i++) await editor.press("Shift+ArrowLeft"); const selection = await position(page);
  const resources = page.locator("[data-note-panel=resources] > summary"); await keyTo(page, resources, "Tab"); const contextScroll = await page.evaluate(() => scrollY);
  await page.getByRole("button", { name: "編集", exact: true }).click(); await settle(page); expect(await page.evaluate(() => scrollY)).toBe(contextScroll); expect([(await position(page)).anchor, (await position(page)).head]).toEqual([selection.anchor, selection.head]);
  await page.getByRole("button", { name: "閲覧", exact: true }).click(); await page.evaluate(() => scrollTo(0, 0)); await page.getByRole("button", { name: "編集", exact: true }).click(); await settle(page); expect(await page.evaluate(() => scrollY)).toBe(contextScroll);
  await keyTo(page, resources, "Tab"); await page.evaluate(() => scrollTo(0, 0)); await editor.click({ position: { x: 30, y: 30 } }); await settle(page); const mouse = await position(page); expect(mouse.anchor).toBe(mouse.head); expect(mouse.head).toBeLessThan(40); expect(mouse.scrollY).toBe(0);
});

test("a deferred keyboard reveal yields to newer input, scrolling and focus", async ({ page, request, workspace }, info) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  const { document } = await (await request.post(`/api/documents?workspaceId=${workspace}`, { data: { title: "遅延復帰を取り消す", content: original } })).json();
  await page.goto(`/workspaces/${workspace}/documents/${document.id}`); await page.getByRole("button", { name: "編集", exact: true }).click(); const editor = page.getByRole("textbox", { name: "Markdown本文" });
  const summary = page.locator("[data-note-panel=resources] > summary");
  // Hold this feature's named measure only. Native focus/caret scrolling,
  // browser frames and normal autosave continue without a synthetic clock.
  type MeasureGate = Window & { keyboardMeasures: (() => void)[] };
  await page.evaluate(() => {
    const view = (document.querySelector(".cm-content") as EditorDOM).cmTile.root.view;
    const schedule = view.requestMeasure.bind(view), held: (() => void)[] = [];
    (window as unknown as MeasureGate).keyboardMeasures = held;
    view.requestMeasure = request => {
      if (typeof request?.key === "symbol" && request.key.description === "keyboard-return") held.push(() => schedule(request));
      else schedule(request);
    };
  });
  const observations: Record<string, unknown> = {};
  for (const action of ["none", "key", "scroll", "wheel", "focus", "pointer", "imperative"] as const) {
    await editor.focus(); await selectMiddle(editor, "caret"); for (let i = 0; i < 6; i++) await editor.press("Shift+ArrowLeft"); await settle(page);
    await keyTo(page, summary, "Tab"); if (await page.locator("[data-note-panel=resources]").getAttribute("open") === null) await page.keyboard.press("Enter");
    await keyTo(page, page.getByLabel("資料URL（必須）"), "Tab"); await keyTo(page, summary, "Shift+Tab"); await page.keyboard.press("Enter"); await settle(page);
    await keyTo(page, editor, "Shift+Tab");
    expect(await page.evaluate(() => (window as unknown as MeasureGate).keyboardMeasures.length)).toBe(1);
    const beforeAction = await page.evaluate(() => ({ scrollY, selected: getSelection()?.toString() }));
    expect(beforeAction.scrollY).toBe(0);
    if (action === "key") await page.keyboard.press("ControlOrMeta+Home");
    if (action === "scroll") await page.evaluate(() => scrollTo(0, 600));
    if (action === "wheel") { await page.mouse.wheel(0, 600); await expect.poll(() => page.evaluate(() => scrollY)).toBe(600); }
    if (action === "focus") await summary.focus();
    if (action === "pointer") await page.getByRole("button", { name: "閲覧", exact: true }).click();
    if (action === "imperative") await page.getByRole("button", { name: "編集", exact: true }).evaluate(e => (e as HTMLElement).click());
    await settle(page); const intended = await page.evaluate(() => scrollY);
    await page.evaluate(() => { for (const release of (window as unknown as MeasureGate).keyboardMeasures.splice(0)) release(); });
    await settle(page); const after = await position(page);
    if (action === "none") { expect(after.headRect!.top).toBeGreaterThanOrEqual(after.headerBottom); expect(after.headRect!.bottom).toBeLessThanOrEqual(after.height); expect(after.scrollY).toBeGreaterThan(500); }
    else expect(after.scrollY).toBe(intended);
    if (action === "key") expect(after.head).toBe(0);
    observations[action] = { beforeAction, intended, after };
    if (action === "pointer") { await expect(page.getByRole("region", { name: "閲覧モード" })).toBeVisible(); await page.getByRole("button", { name: "編集", exact: true }).click(); await settle(page); }
  }
  expect((await (await request.get(`/api/documents/${document.id}?workspaceId=${workspace}`)).json()).content).toBe(original);
  await writeFile(info.outputPath("cancelled-reveals.json"), JSON.stringify({ heldKeyboardMeasureOnly: true, normalTimers: true, observations }, null, 2));
});
