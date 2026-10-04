import { expect, test } from "./manual-note-fixture";
import type { APIRequestContext, Page } from "@playwright/test";

async function setup(request: APIRequestContext, name: string, multiple = false) {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: `確認の関連 ${name}` } })).json(); const nodes = [];
  for (const title of ["認証", "認可", "PKCE"]) nodes.push((await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title, learningObjectives: [`${title}の目的を説明する`] } })).json()).node);
  const { document } = await (await request.post("/api/documents", { data: { title: name, content: "保存済みの本文。", nodeIds: multiple ? [nodes[0].id, nodes[2].id] : [nodes[0].id] } })).json();
  return { roadmap, nodes, document, cleanup: async () => { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/roadmaps/${roadmap.id}`); } };
}
const region = (page: Page) => page.getByRole("region", { name: "関連する学習項目と目標" });
async function open(page: Page, id: string) { await page.goto(`/workspaces/default/documents/${id}`); await page.getByRole("button", { name: "編集", exact: true }).click(); await region(page).getByText("学習項目の関連を変更", { exact: true }).click(); }
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
    await page.reload(); await expect(region(page)).toContainText("認可の目的を説明する"); await expect(page.getByRole("region", { name: "閲覧モード" })).toContainText("保持する手書きの追記。");
  } finally { await page.unrouteAll({ behavior: "wait" }); await f.cleanup(); }
});

test("a committed relation with a lost response adopts changed saved IDs after explicit confirmation without resending the relation", async ({ page, request }) => {
  const f = await setup(request, "確定済み関連の応答喪失"); let patches = 0;
  await page.route(`**/api/documents/${f.document.id}/nodes?*`, async (route) => { if (route.request().method() !== "PATCH") return route.continue(); patches++; await route.fetch(); await route.abort(); });
  try {
    await open(page, f.document.id); const b = region(page).getByRole("checkbox", { name: `${f.roadmap.title} / 認可`, exact: true }); await b.check(); await region(page).getByRole("button", { name: "関連を保存", exact: true }).click();
    await expect(region(page).getByRole("alert")).toBeVisible(); await expect(b).toBeChecked(); expect(patches).toBe(1); let current = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(current.nodeIds.sort()).toEqual([f.nodes[0].id, f.nodes[1].id].sort());
    await confirm(page); await expect(b).toBeChecked(); await expect(region(page)).toContainText("認可の目的を説明する");
    await page.getByRole("button", { name: "保存を再試行", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible(); expect(patches).toBe(1);
    current = await (await request.get(`/api/documents/${f.document.id}`)).json(); expect(current.content).toBe("保存済みの本文。"); expect(current.nodeIds.sort()).toEqual([f.nodes[0].id, f.nodes[1].id].sort());
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "ホーム", exact: true }).click(); await expect(page).toHaveURL(/\/workspaces\/default$/);
  } finally { await page.unrouteAll({ behavior: "wait" }); await f.cleanup(); }
});
