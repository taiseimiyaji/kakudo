import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

async function setup(request: APIRequestContext, name: string) {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: `関連の保護 ${name}` } })).json();
  const nodes = [];
  for (const title of ["認証", "認可"]) nodes.push((await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title, learningObjectives: [`${title}の目的を説明する`] } })).json()).node);
  const { document } = await (await request.post("/api/documents", { data: { title: name, content: "人間が書いた本文。", nodeIds: [nodes[0].id] } })).json();
  return { roadmap, nodes, document, cleanup: async () => { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/roadmaps/${roadmap.id}`); } };
}
const region = (page: Page) => page.getByRole("region", { name: "関連する学習項目と目標" });
const home = (page: Page) => page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "ホーム", exact: true });
const pending = (page: Page) => region(page).getByText('関連の変更は未保存です。「関連を保存」で確定してください。', { exact: true });
async function open(page: Page, id: string) {
  await page.goto(`/workspaces/default/documents/${id}`); await region(page).getByText("学習項目の関連を変更", { exact: true }).click();
}

test("association draft guards links, history and reload; revert and accepted departure clear it", async ({ page, request }) => {
  const f = await setup(request, "移動と取消"); let dialogs = 0; let accept = false;
  page.on("dialog", async (d) => { dialogs++; if (accept) await d.accept(); else await d.dismiss(); });
  try {
    await page.goto("/workspaces/default"); await open(page, f.document.id);
    const choice = region(page).getByRole("checkbox", { name: `${f.roadmap.title} / 認可`, exact: true }); await choice.check(); await expect(pending(page)).toBeVisible();
    await home(page).click(); expect(dialogs).toBe(1); await expect(choice).toBeChecked(); await expect(page).toHaveURL(new RegExp(`/documents/${f.document.id}$`));
    await page.evaluate(() => history.back()); await expect.poll(() => dialogs).toBe(2); await expect(choice).toBeChecked();
    await page.evaluate(() => window.location.reload()); await expect.poll(() => dialogs).toBe(3); await expect(choice).toBeChecked();
    await choice.uncheck(); await expect(pending(page)).toHaveCount(0); await home(page).click(); await expect(page).toHaveURL(/\/workspaces\/default$/); expect(dialogs).toBe(3);
    await open(page, f.document.id); await choice.check(); accept = true; await home(page).click(); await expect(page).toHaveURL(/\/workspaces\/default$/); expect(dialogs).toBe(4);
    await open(page, f.document.id); await expect(choice).not.toBeChecked(); await expect(pending(page)).toHaveCount(0); expect((await (await request.get(`/api/documents/${f.document.id}`)).json()).nodeIds).toEqual([f.nodes[0].id]);
  } finally { await f.cleanup(); }
});

test("autosave, explicit note save and context refresh retain pending associations; relation save clears only its guard", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 1000 }); const f = await setup(request, "独立した保存"); let dialogs = 0; page.on("dialog", async (d) => { dialogs++; await d.dismiss(); });
  try {
    await open(page, f.document.id); await page.getByRole("button", { name: "編集", exact: true }).click();
    const choice = region(page).getByRole("checkbox", { name: `${f.roadmap.title} / 認可`, exact: true }); await choice.check();
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially("自分で追記した理解。");
    await expect.poll(async () => (await (await request.get(`/api/documents/${f.document.id}`)).json()).content).toBe("人間が書いた本文。自分で追記した理解。"); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    await expect(choice).toBeChecked(); await expect(pending(page)).toBeVisible(); await home(page).click(); expect(dialogs).toBe(1);
    await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible(); await expect(choice).toBeChecked(); await expect(pending(page)).toBeVisible();
    await region(page).getByRole("button", { name: "学習項目と目標を再取得", exact: true }).click(); await expect(choice).toBeChecked();
    await page.getByLabel("資料URL（必須）").fill("https://example.com/retained-association-resource");
    await region(page).getByRole("button", { name: "関連を保存", exact: true }).click(); await expect(pending(page)).toHaveCount(0);
    const saved = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(saved.nodeIds.sort()).toEqual(f.nodes.map((n) => n.id).sort()); expect(saved.content).toBe("人間が書いた本文。自分で追記した理解。");
    await home(page).click(); expect(dialogs).toBe(2); await expect(page.getByLabel("資料URL（必須）")).toHaveValue("https://example.com/retained-association-resource");
    await page.getByLabel("資料URL（必須）").fill(""); await home(page).click(); await expect(page).toHaveURL(/\/workspaces\/default$/); expect(dialogs).toBe(2);
    await open(page, f.document.id); await expect(choice).toBeChecked(); await expect(pending(page)).toHaveCount(0);
  } finally { await f.cleanup(); }
});

test("a failed relation save retains choices and departure protection until explicit retry succeeds", async ({ page, request }) => {
  const f = await setup(request, "関連保存の再試行"); let fail = true; let patches = 0; let dialogs = 0;
  page.on("dialog", async (d) => { dialogs++; await d.dismiss(); });
  await page.route(`**/api/documents/${f.document.id}/nodes?*`, async (route) => { if (route.request().method() !== "PATCH") return route.continue(); patches++; if (fail) await route.fulfill({ status: 500, json: { error: "関連を保存できませんでした" } }); else await route.continue(); });
  try {
    await open(page, f.document.id); const choice = region(page).getByRole("checkbox", { name: `${f.roadmap.title} / 認可`, exact: true }); await choice.check();
    await region(page).getByRole("button", { name: "関連を保存", exact: true }).click(); await expect(region(page).getByRole("alert")).toBeVisible(); await expect(choice).toBeChecked(); await expect(pending(page)).toBeVisible(); expect(patches).toBe(1);
    await home(page).click(); expect(dialogs).toBe(1); await expect(choice).toBeChecked(); fail = false;
    await region(page).getByRole("button", { name: "関連を保存", exact: true }).click(); await expect(pending(page)).toHaveCount(0); await expect(region(page).getByRole("alert")).toHaveCount(0); expect(patches).toBe(2);
    const saved = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(saved.nodeIds.sort()).toEqual(f.nodes.map((n) => n.id).sort()); expect(saved.content).toBe("人間が書いた本文。");
    await home(page).click(); await expect(page).toHaveURL(/\/workspaces\/default$/); expect(dialogs).toBe(1);
  } finally { await page.unrouteAll({ behavior: "wait" }); await f.cleanup(); }
});

test("clearing all associations is protected while pending and saves without changing note content", async ({ page, request }) => {
  const f = await setup(request, "全解除の確定"); let dialogs = 0; let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let patches = 0;
  page.on("dialog", async (d) => { dialogs++; await d.dismiss(); });
  await page.route(`**/api/documents/${f.document.id}/nodes?*`, async (route) => { if (route.request().method() !== "PATCH") return route.continue(); patches++; await gate; await route.continue(); });
  try {
    await open(page, f.document.id); await region(page).getByRole("button", { name: "関連をすべて解除", exact: true }).click(); await expect(pending(page)).toBeVisible(); await home(page).click(); expect(dialogs).toBe(1);
    await region(page).getByRole("button", { name: "関連を保存", exact: true }).click(); await expect(region(page).getByRole("button", { name: "関連を保存", exact: true })).toBeDisabled(); await home(page).click(); expect(dialogs).toBe(2); expect(patches).toBe(1);
    release(); await expect(pending(page)).toHaveCount(0); await expect(region(page).getByRole("button", { name: "関連を保存", exact: true })).toBeEnabled(); await expect(region(page)).toContainText("関連する学習項目はありません。");
    const saved = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(saved.nodeIds).toEqual([]); expect(saved.content).toBe("人間が書いた本文。");
    await home(page).click(); await expect(page).toHaveURL(/\/workspaces\/default$/); expect(dialogs).toBe(2);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await f.cleanup(); }
});
