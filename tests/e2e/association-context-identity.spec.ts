import { expect, test, openNotePanels } from "./manual-note-fixture";
import type { APIRequestContext, Page } from "@playwright/test";

async function setup(request: APIRequestContext, name: string, multiple = false) {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: `確認の関連 ${name}` } })).json(); const nodes = [];
  for (const title of ["認証", "認可", "PKCE"]) nodes.push((await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title, learningObjectives: [`${title}の目的を説明する`] } })).json()).node);
  const { document } = await (await request.post("/api/documents", { data: { title: name, content: "保存済みの本文。", nodeIds: multiple ? [nodes[0].id, nodes[2].id] : [nodes[0].id] } })).json();
  return { roadmap, nodes, document, cleanup: async () => { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/roadmaps/${roadmap.id}`); } };
}
const region = (page: Page) => page.getByRole("region", { name: "関連する学習項目と目標" });
async function open(page: Page, id: string) { await page.goto(`/workspaces/default/documents/${id}`); await openNotePanels(page); await page.getByRole("button", { name: "編集", exact: true }).click(); await region(page).getByText("学習項目の関連を変更", { exact: true }).click(); }
async function confirm(page: Page) { await page.getByRole("button", { name: "最新の保存内容を確認", exact: true }).click(); await expect(page.getByRole("region", { name: "最新の保存内容" })).toBeVisible(); await page.getByRole("button", { name: "確認した内容を基準に再試行", exact: true }).click(); }

for (const multiple of [false, true]) test(`unchanged association IDs keep pending choices and human drafts across baseline confirmation${multiple ? " with reordered metadata" : ""}`, async ({ page, request }) => {
  const f = await setup(request, multiple ? "同じIDの並び替え" : "同じIDの新しい基準", multiple); let confirms = 0;
  try {
    await open(page, f.document.id); const b = region(page).getByRole("checkbox", { name: `${f.roadmap.title} / 認可`, exact: true }); await b.check();
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially("保持する手書きの追記。"); await page.getByLabel("ノート名（必須）").fill("保持する手書きの名前");
    const original = await (await request.get(`/api/documents/${f.document.id}`)).json();
    const external = await request.put(`/api/documents/${f.document.id}`, { data: { title: "別タブの名前", content: "別タブの本文。", baseHash: original.contentHash, baseWriteId: original.document.lastWriteId } }); expect(external.status()).toBe(200);
    if (multiple) {
      await request.patch(`/api/nodes/${f.nodes[0].id}`, { data: { learningObjectives: ["人間が更新した認証の目標"] } });
      await page.route(`**/api/documents/${f.document.id}?*`, async (route) => {
        if (route.request().method() !== "GET") return route.continue(); const response = await route.fetch(); const data = await response.json(); confirms++; await route.fulfill({ response, json: { ...data, nodes: [...data.nodes].reverse() } });
      });
    }
    await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("競合"); await expect(b).toBeChecked(); await confirm(page);
    await expect(b).toBeChecked(); await expect(editor).toContainText("保持する手書きの追記。"); await expect(page.getByLabel("ノート名（必須）")).toHaveValue("保持する手書きの名前"); if (multiple) expect(confirms).toBe(1);
    await page.getByRole("button", { name: "保存を再試行", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible(); await expect(b).toBeChecked();
    let saved = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(saved.content).toBe("保存済みの本文。保持する手書きの追記。"); expect(saved.document.title).toBe("保持する手書きの名前"); expect(saved.nodeIds.sort()).toEqual(original.nodeIds.sort());
    await region(page).getByRole("button", { name: "関連を保存", exact: true }).click(); await expect(region(page)).toContainText("関連を更新しました。"); saved = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(saved.nodeIds.sort()).toEqual([...original.nodeIds, f.nodes[1].id].sort()); expect(saved.content).toBe("保存済みの本文。保持する手書きの追記。");
    await page.reload(); await openNotePanels(page); await expect(region(page)).toContainText("認可の目的を説明する"); await expect(page.getByRole("region", { name: "閲覧モード" })).toContainText("保持する手書きの追記。");
  } finally { await page.unrouteAll({ behavior: "wait" }); await f.cleanup(); }
});

test("a committed relation with a lost response adopts changed saved IDs after explicit confirmation without resending the relation", async ({ page, request }) => {
  const f = await setup(request, "確定済み関連の応答喪失"); let patches = 0;
  await page.route(`**/api/documents/${f.document.id}/nodes?*`, async (route) => { if (route.request().method() !== "PATCH") return route.continue(); patches++; await route.fetch(); await route.abort(); });
  try {
    await open(page, f.document.id); const b = region(page).getByRole("checkbox", { name: `${f.roadmap.title} / 認可`, exact: true }); await b.check(); await region(page).getByRole("button", { name: "関連を保存", exact: true }).click();
    await expect(region(page).getByRole("alert")).toBeVisible(); await expect(b).toBeChecked(); expect(patches).toBe(1); let current = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(current.nodeIds.sort()).toEqual([f.nodes[0].id, f.nodes[1].id].sort());
    await confirm(page); await expect(b).toBeChecked(); await expect(region(page)).toContainText("認可の目的を説明する"); await expect(region(page).getByRole("alert")).toHaveCount(0); await expect(region(page).getByRole("status")).toContainText("関連の保存結果を確認しました。");
    await page.getByRole("button", { name: "保存を再試行", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible(); await expect(region(page).getByRole("alert")).toHaveCount(0); expect(patches).toBe(1);
    current = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(current.content).toBe("保存済みの本文。"); expect(current.nodeIds.sort()).toEqual([f.nodes[0].id, f.nodes[1].id].sort());
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "ホーム", exact: true }).click(); await expect(page).toHaveURL(/\/workspaces\/default$/);
  } finally { await page.unrouteAll({ behavior: "wait" }); await f.cleanup(); }
});

test("an uncommitted failed relation retains its error and pending choices after latest-content confirmation", async ({ page, request }) => {
  const f = await setup(request, "未確定関連の応答失敗"); let fail = true; let patches = 0;
  await page.route(`**/api/documents/${f.document.id}/nodes?*`, async (route) => { if (route.request().method() !== "PATCH") return route.continue(); patches++; if (fail) await route.fulfill({ status: 500, json: { error: "関連の保存は未確定です" } }); else await route.continue(); });
  try {
    await open(page, f.document.id); const b = region(page).getByRole("checkbox", { name: `${f.roadmap.title} / 認可`, exact: true }); await b.check(); await region(page).getByRole("button", { name: "関連を保存", exact: true }).click();
    await expect(region(page).getByRole("alert")).toContainText("サーバーで処理できませんでした"); await region(page).getByRole("button", { name: "学習項目と目標を再取得", exact: true }).click(); await expect(region(page).getByRole("alert")).toContainText("サーバーで処理できませんでした"); await confirm(page);
    await expect(region(page).getByRole("alert")).toContainText("サーバーで処理できませんでした"); await expect(region(page).getByText('関連の変更は未保存です。「関連を保存」で確定してください。')).toBeVisible(); await expect(b).toBeChecked(); expect(patches).toBe(1);
    fail = false; await region(page).getByRole("button", { name: "関連を保存", exact: true }).click(); await expect(region(page).getByRole("alert")).toHaveCount(0); await expect(region(page).getByRole("status")).toContainText("関連を更新しました。"); expect(patches).toBe(2);
    const saved = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(saved.nodeIds.sort()).toEqual([f.nodes[0].id, f.nodes[1].id].sort()); expect(saved.content).toBe("保存済みの本文。");
  } finally { await page.unrouteAll({ behavior: "wait" }); await f.cleanup(); }
});

test("confirmation clears only the failed relation alert while a separate options refresh error remains", async ({ page, request }) => {
  const f = await setup(request, "関連と選択肢の別エラー"); let patches = 0;
  await page.route(`**/api/documents/${f.document.id}/nodes?*`, async (route) => { if (route.request().method() !== "PATCH") return route.continue(); patches++; await route.fetch(); await route.abort(); });
  try {
    await open(page, f.document.id); const b = region(page).getByRole("checkbox", { name: `${f.roadmap.title} / 認可`, exact: true }); await b.check(); await region(page).getByRole("button", { name: "関連を保存", exact: true }).click(); await expect(region(page).getByRole("alert")).toContainText("通信できませんでした");
    await page.route(`**/api/documents/${f.document.id}/node-options?*`, async (route) => { await route.fulfill({ status: 500, json: { error: "選択肢を取得できませんでした" } }); });
    await region(page).getByRole("button", { name: "学習項目と目標を再取得", exact: true }).click(); await expect(region(page).getByRole("alert")).toHaveCount(2);
    await confirm(page); await expect(region(page).getByRole("alert")).toHaveCount(1); await expect(region(page).getByRole("alert")).toContainText("サーバーで処理できませんでした"); await expect(region(page).getByRole("status")).toContainText("関連の保存結果を確認しました。"); await expect(b).toBeChecked(); expect(patches).toBe(1);
    await page.unroute(`**/api/documents/${f.document.id}/node-options?*`); await region(page).getByRole("button", { name: "学習項目と目標を再取得", exact: true }).click(); await expect(region(page).getByRole("alert")).toHaveCount(0);
  } finally { await page.unrouteAll({ behavior: "wait" }); await f.cleanup(); }
});

for (const editAfterLoss of [false, true]) test(`same-ID association save with a lost response confirms after latest fetch${editAfterLoss ? " and retains a newer unsaved choice" : ""}`, async ({ page, request }) => {
  const f = await setup(request, editAfterLoss ? "同じ関連IDと後続の選択" : "同じ関連IDの確認"); let patches = 0;
  const before = await (await request.get(`/api/documents/${f.document.id}`)).json();
  await page.route(`**/api/documents/${f.document.id}/nodes?*`, async (route) => { if (route.request().method() !== "PATCH") return route.continue(); patches++; await route.fetch(); await route.abort(); });
  try {
    await open(page, f.document.id); const b = region(page).getByRole("checkbox", { name: `${f.roadmap.title} / 認可`, exact: true });
    await region(page).getByRole("button", { name: "関連を保存", exact: true }).click(); await expect(region(page).getByRole("alert")).toContainText("通信できませんでした");
    const committed = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(committed.nodeIds).toEqual(before.nodeIds); expect(committed.document.lastWriteId).not.toBe(before.document.lastWriteId); expect(patches).toBe(1);
    if (editAfterLoss) { await b.check(); await expect(region(page).getByText('関連の変更は未保存です。「関連を保存」で確定してください。')).toBeVisible(); }
    await confirm(page); await expect(region(page).getByRole("alert")).toHaveCount(0); await expect(region(page).getByText("関連の保存結果を確認しました。", { exact: true })).toBeVisible(); await expect(b).toBeChecked({ checked: editAfterLoss });
    if (editAfterLoss) await expect(region(page).getByText('関連の変更は未保存です。「関連を保存」で確定してください。')).toBeVisible();
    expect(patches).toBe(1); const final = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(final.nodeIds).toEqual(before.nodeIds); expect(final.content).toBe("保存済みの本文。");
  } finally { await page.unrouteAll({ behavior: "wait" }); await f.cleanup(); }
});

test("same-ID failed save without a server write remains uncertain after latest confirmation", async ({ page, request }) => {
  const f = await setup(request, "同じ関連IDでも未確定"); let patches = 0;
  const before = await (await request.get(`/api/documents/${f.document.id}`)).json();
  await page.route(`**/api/documents/${f.document.id}/nodes?*`, async (route) => { if (route.request().method() !== "PATCH") return route.continue(); patches++; await route.fulfill({ status: 500, json: { error: "未確定" } }); });
  try {
    await open(page, f.document.id); await region(page).getByRole("button", { name: "関連を保存", exact: true }).click(); await expect(region(page).getByRole("alert")).toContainText("サーバーで処理できませんでした");
    await confirm(page); await expect(region(page).getByRole("alert")).toContainText("サーバーで処理できませんでした"); await expect(region(page).getByRole("status")).toHaveCount(0); expect(patches).toBe(1);
    const final = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(final.nodeIds).toEqual(before.nodeIds); expect(final.document.lastWriteId).toBe(before.document.lastWriteId);
  } finally { await page.unrouteAll({ behavior: "wait" }); await f.cleanup(); }
});

test("a new association write invalidates an older latest-content panel before another failed attempt", async ({ page, request }) => {
  const f = await setup(request, "古い確認パネルの無効化"); let patches = 0;
  await page.route(`**/api/documents/${f.document.id}/nodes?*`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    patches++; if (patches === 1 || patches === 3) await route.fulfill({ status: 500, json: { error: "未確定" } }); else await route.continue();
  });
  try {
    await open(page, f.document.id); const b = region(page).getByRole("checkbox", { name: `${f.roadmap.title} / 認可`, exact: true });
    await region(page).getByRole("button", { name: "関連を保存", exact: true }).click(); await expect(region(page).getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "最新の保存内容を確認", exact: true }).click(); await expect(page.getByRole("region", { name: "最新の保存内容" })).toBeVisible();
    await b.check(); await region(page).getByRole("button", { name: "関連を保存", exact: true }).click(); await expect(region(page).getByRole("status")).toContainText("関連を更新しました。");
    await expect(page.getByRole("region", { name: "最新の保存内容" })).toHaveCount(0);
    const committed = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(committed.nodeIds.sort()).toEqual([f.nodes[0].id, f.nodes[1].id].sort());
    await b.uncheck(); await region(page).getByRole("button", { name: "関連を保存", exact: true }).click(); await expect(region(page).getByRole("alert")).toBeVisible();
    await confirm(page); await expect(region(page).getByRole("alert")).toBeVisible(); await expect(b).not.toBeChecked(); await expect(region(page).getByText('関連の変更は未保存です。「関連を保存」で確定してください。')).toBeVisible(); expect(patches).toBe(3);
    const final = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(final.nodeIds.sort()).toEqual(committed.nodeIds.sort()); expect(final.document.lastWriteId).toBe(committed.document.lastWriteId);
  } finally { await page.unrouteAll({ behavior: "wait" }); await f.cleanup(); }
});
