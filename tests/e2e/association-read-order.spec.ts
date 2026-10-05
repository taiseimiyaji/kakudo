import { test, expect } from "./manual-note-fixture";
import type { Page } from "@playwright/test";

for (const inFlight of [false, true]) test(`a newer deletion proof invalidates older document confirmation ${inFlight}`, async ({ page, context, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let mapId = ""; let documentId = ""; let secondary: Page | undefined;
  let failOptions = false; let delayNextOptions = false; let oldDoc = false; let optionHeld = false; let docHeld = false; let docDelivered = false;
  let releaseOptions!: () => void; const optionGate = new Promise<void>((resolve) => { releaseOptions = resolve; });
  let releaseDoc!: () => void; const docGate = new Promise<void>((resolve) => { releaseDoc = resolve; });
  const draftTitle = "未保存の人間の名前"; const draftContent = "最初に人間が保存した本文。人間が追記した本文。";
  try {
    const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: `読み取り順の地図 ${inFlight}` } })).json(); mapId = roadmap.id;
    const nodes: { id: string; title: string }[] = [];
    for (const [index, title] of ["残す項目A", "削除する項目B"].entries()) nodes.push((await (await request.post("/api/nodes", { data: { roadmapId: mapId, title, positionX: index * 320 } })).json()).node);
    const { document } = await (await request.post("/api/documents", { data: { title: "元の名前", content: "最初に人間が保存した本文。", nodeIds: nodes.map((node) => node.id) } })).json(); documentId = document.id;
    await page.route(`**/api/documents/${documentId}?*`, async (route) => {
      if (route.request().method() === "PUT") return route.fulfill({ status: 500, json: {} });
      if (oldDoc) { oldDoc = false; const response = await route.fetch(); docHeld = true; await docGate; await route.fulfill({ response }).catch(() => {}); docDelivered = true; return; }
      await route.continue();
    });
    await page.route(`**/api/documents/${documentId}/node-options?*`, async (route) => {
      if (delayNextOptions) { delayNextOptions = false; optionHeld = true; await optionGate; }
      if (failOptions) return route.fulfill({ status: 503, json: {} });
      await route.continue();
    });
    await page.goto(`/workspaces/default/documents/${documentId}`); await page.getByRole("button", { name: "編集", exact: true }).click();
    const region = page.getByRole("region", { name: "関連する学習項目と目標", exact: true }); await region.getByText("学習項目の関連を変更", { exact: true }).click();
    const b = region.getByRole("checkbox", { name: `${roadmap.title} / ${nodes[1].title}`, exact: true }); await expect(b).toBeChecked();
    await page.getByLabel("ノート名（必須）").fill(draftTitle); const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially("人間が追記した本文。");
    await page.getByLabel("資料URL（必須）").fill("https://example.com/unregistered-read-order"); await page.getByLabel("資料名（任意）").fill("未登録の資料名");
    await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存結果は不明です", { exact: true })).toBeVisible();
    if (inFlight) { delayNextOptions = true; await region.getByRole("button", { name: "学習項目と目標を再取得", exact: true }).click(); await expect.poll(() => optionHeld).toBe(true); oldDoc = true; }
    await page.getByRole("button", { name: "最新の保存内容を確認", exact: true }).click();
    const latest = page.getByRole("region", { name: "最新の保存内容", exact: true });
    if (inFlight) await expect.poll(() => docHeld).toBe(true); else await expect(latest).toBeVisible();
    secondary = await context.newPage(); await secondary.goto(`/workspaces/default/roadmaps/${mapId}?nodeId=${nodes[1].id}`); await expect(secondary.getByLabel("学習項目名（必須）", { exact: true })).toHaveValue(nodes[1].title);
    secondary.once("dialog", (dialog) => dialog.accept()); await secondary.getByRole("button", { name: "学習項目を削除", exact: true }).click(); await expect(secondary.locator(".learning-card")).toHaveCount(1);
    if (inFlight) releaseOptions(); else await region.getByRole("button", { name: "学習項目と目標を再取得", exact: true }).click();
    await expect(b).toHaveCount(0); await expect(region.getByRole("article")).toHaveCount(1); await expect(latest).toHaveCount(0);
    if (inFlight) { releaseDoc(); await expect.poll(() => docDelivered).toBe(true); await page.waitForTimeout(150); await expect(latest).toHaveCount(0); }
    await expect(page.getByLabel("ノート名（必須）")).toHaveValue(draftTitle); await expect(editor).toContainText(draftContent);
    await expect(page.getByLabel("資料URL（必須）")).toHaveValue("https://example.com/unregistered-read-order"); await expect(page.getByLabel("資料名（任意）")).toHaveValue("未登録の資料名");
    const before = await (await request.get(`/api/documents/${documentId}`)).json(); expect(before.nodeIds).toEqual([nodes[0].id]); expect(before.document.title).toBe("元の名前"); expect(before.content).toBe("最初に人間が保存した本文。");
    failOptions = true; await page.getByRole("button", { name: "最新の保存内容を確認", exact: true }).click(); await expect(latest).toBeVisible(); page.once("dialog", dialog => dialog.accept()); await page.getByRole("button", { name: "確認した内容を基準に再試行", exact: true }).click();
    await expect(region.getByRole("alert")).toContainText("サーバーで処理できませんでした"); await expect(b).toHaveCount(0); await expect(region.getByRole("article")).toHaveCount(1);
    await expect(region.getByText("関連の変更は未保存です。「関連を保存」で確定してください。", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("ノート名（必須）")).toHaveValue(draftTitle); await expect(editor).toContainText(draftContent);
    await page.unroute(`**/api/documents/${documentId}?*`); await page.getByRole("button", { name: "保存を再試行", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    const saved = await (await request.get(`/api/documents/${documentId}`)).json(); expect(saved.nodeIds).toEqual([nodes[0].id]); expect(saved.document.title).toBe(draftTitle); expect(saved.content).toBe(draftContent);
    await expect(page.getByLabel("資料URL（必須）")).toHaveValue("https://example.com/unregistered-read-order");
  } finally { releaseOptions(); releaseDoc(); await page.unrouteAll({ behavior: "wait" }); await secondary?.close(); if (documentId) await request.delete(`/api/documents/${documentId}`); if (mapId) await request.delete(`/api/roadmaps/${mapId}`); }
});
