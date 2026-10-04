import { expect, test, type Page } from "@playwright/test";

for (const removal of ["node", "map"] as const) for (const humanDraft of [false, true]) {
  test(`confirmed ${removal} deletion clears a false association draft and preserves real choices ${humanDraft}`, async ({ page, context, request }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const maps: { id: string; title: string }[] = []; const nodes: { id: string; title: string }[] = [];
    let documentId = ""; let otherPage: Page | undefined; let patches = 0; let failOptions = false;
    const suffix = `${removal} ${humanDraft}`;
    const content = "認証は誰かを確認し、認可は許可された操作を決める。"; const appended = "二つの地図の違いを自分の言葉で整理する。";
    try {
      for (const [index, title] of ["認証を学ぶ地図", "認可を学ぶ地図"].entries()) {
        const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: `${title} ${suffix}` } })).json(); maps.push(roadmap);
        const { node } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: index ? "認可の項目" : "認証の項目", learningObjectives: [index ? "認可を自分で説明できる" : "認証を自分で説明できる"] } })).json(); nodes.push(node);
      }
      const { node: extra } = await (await request.post("/api/nodes", { data: { roadmapId: maps[0].id, title: "後で人間が関連付ける項目" } })).json();
      const { document } = await (await request.post("/api/documents", { data: { title: `人間のノート ${suffix}`, content, nodeIds: [nodes[0].id] } })).json(); documentId = document.id;
      page.on("request", (req) => { if (req.method() === "PATCH" && req.url().includes(`/documents/${documentId}/nodes?`)) patches++; });
      await page.route(`**/api/documents/${documentId}/node-options?*`, (route) => failOptions ? route.fulfill({ status: 503, json: {} }) : route.continue());
      await page.goto(`/workspaces/default/documents/${documentId}`);
      const region = page.getByRole("region", { name: "関連する学習項目と目標", exact: true });
      const pending = region.getByText("関連の変更は未保存です。「関連を保存」で確定してください。", { exact: true });
      await region.getByText("学習項目の関連を変更", { exact: true }).click();
      const first = region.getByRole("checkbox", { name: `${maps[0].title} / ${nodes[0].title}`, exact: true });
      const second = region.getByRole("checkbox", { name: `${maps[1].title} / ${nodes[1].title}`, exact: true });
      const later = region.getByRole("checkbox", { name: `${maps[0].title} / ${extra.title}`, exact: true });
      await second.check(); await page.getByRole("button", { name: "編集", exact: true }).click();
      const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click(); await editor.press("ControlOrMeta+End"); await editor.press("Enter"); await editor.pressSequentially(appended);
      await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible(); await expect(pending).toBeVisible();
      await region.getByRole("button", { name: "関連を保存", exact: true }).click(); await expect(pending).toHaveCount(0); await expect(region.getByRole("article")).toHaveCount(2); expect(patches).toBe(1);
      const saved = await (await request.get(`/api/documents/${documentId}`)).json(); expect(saved.content).toBe(`${content}\n${appended}`);
      const review = page.getByRole("region", { name: "レビュー", exact: true }); await review.getByRole("button", { name: "学習目標を確認", exact: true }).click(); await expect(review.getByLabel("レビューの状態")).toContainText("完了", { timeout: 15000 }); await expect(review.locator(".coverage-result")).toHaveCount(2);
      if (humanDraft) { await later.check(); await expect(pending).toBeVisible(); }
      otherPage = await context.newPage(); await otherPage.goto(`/workspaces/default/roadmaps/${maps[1].id}?nodeId=${nodes[1].id}`);
      await expect(otherPage.getByLabel("学習項目名（必須）", { exact: true })).toHaveValue(nodes[1].title);
      otherPage.once("dialog", (dialog) => dialog.accept()); await otherPage.getByRole("button", { name: removal === "node" ? "学習項目を削除" : "マップを削除", exact: true }).click();
      if (removal === "map") await otherPage.waitForURL(/\/workspaces\/default\/roadmaps$/);
      else await expect(otherPage.locator(".learning-card")).toHaveCount(0);
      if (humanDraft) {
        failOptions = true; await region.getByRole("button", { name: "学習項目と目標を再取得", exact: true }).click();
        await expect(region.getByRole("alert")).toBeVisible(); await expect(later).toBeChecked(); await expect(second).toBeChecked(); await expect(pending).toBeVisible();
        failOptions = false;
      }
      await region.getByRole("button", { name: "学習項目と目標を再取得", exact: true }).click();
      await expect(second).toHaveCount(0); await expect(first).toBeChecked(); await expect(region.getByRole("article")).toHaveCount(1);
      const latest = await (await request.get(`/api/documents/${documentId}`)).json(); expect(latest.nodeIds).toEqual([nodes[0].id]); expect(latest.content).toBe(saved.content); expect(patches).toBe(1);
      await expect(review.getByText(/学習目標が変更されています/)).toBeVisible();
      let warnings = 0; page.on("dialog", async (dialog) => { warnings++; await dialog.dismiss(); });
      if (humanDraft) {
        await expect(later).toBeChecked(); await expect(pending).toBeVisible(); await expect(region.locator("input[type=checkbox]:checked")).toHaveCount(2);
        await page.getByRole("link", { name: "ホーム", exact: true }).click(); expect(warnings).toBe(1); await expect(page).toHaveURL(new RegExp(`/documents/${documentId}$`));
        await region.getByRole("button", { name: "関連を保存", exact: true }).click(); await expect(pending).toHaveCount(0); expect(patches).toBe(2);
        const committed = await (await request.get(`/api/documents/${documentId}`)).json(); expect(committed.nodeIds.sort()).toEqual([nodes[0].id, extra.id].sort()); expect(committed.content).toBe(saved.content);
      } else {
        await expect(pending).toHaveCount(0); await expect(region.locator("input[type=checkbox]:checked")).toHaveCount(1);
      }
      await page.getByRole("link", { name: "ホーム", exact: true }).click(); await expect(page).toHaveURL(/\/workspaces\/default$/); expect(warnings).toBe(humanDraft ? 1 : 0);
    } finally {
      await page.unrouteAll({ behavior: "wait" }); await otherPage?.close();
      if (documentId) await request.delete(`/api/documents/${documentId}`); for (const map of maps) await request.delete(`/api/roadmaps/${map.id}`);
    }
  });
}
