import { test, expect } from "@playwright/test";

test("connect from side handles, edit an existing connection and persist each endpoint", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "接続位置の確認" } })).json();
  const { node: source } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "接続元の項目", positionX: 0, positionY: 0 } })).json();
  const { node: target } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "接続先の項目", positionX: 400, positionY: 0 } })).json();
  const edges = async () => (await (await request.get(`/api/roadmaps/${roadmap.id}`)).json()).edges;
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    const from = page.locator(`[data-id="${source.id}"] [data-handleid="right"]`);
    const to = page.locator(`[data-id="${target.id}"] [data-handleid="left"]`);
    await expect(from).toBeVisible(); await expect(to).toBeVisible();
    // Actual pointer gesture verifies React Flow's handle IDs, not only the form API.
    await from.dragTo(to);
    await expect.poll(edges).toEqual([expect.objectContaining({ sourceId: source.id, targetId: target.id, sourceSide: "right", targetSide: "left" })]);
    const [original] = await edges();
    await page.reload();
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await page.locator('.react-flow__edge').click();
    const editor = page.getByRole("form", { name: "接続位置の編集" });
    await expect(editor.getByLabel("出口の位置")).toHaveValue("right");
    await expect(editor.getByLabel("入口の位置")).toHaveValue("left");
    for (const [sourceSide, targetSide] of [["top", "bottom"], ["left", "right"]]) {
      await editor.getByLabel("出口の位置").selectOption(sourceSide);
      await editor.getByLabel("入口の位置").selectOption(targetSide);
      await editor.getByRole("button", { name: "接続位置を保存" }).click();
      await expect.poll(edges).toEqual([expect.objectContaining({ id: original.id, sourceSide, targetSide })]);
    }
    await page.reload();
    await page.getByText("接続一覧 (1)", { exact: true }).click();
    await page.getByRole("button", { name: "接続位置を変更" }).click();
    await expect(editor.getByLabel("出口の位置")).toHaveValue("left");
    await expect(editor.getByLabel("入口の位置")).toHaveValue("right");
    await editor.getByRole("button", { name: "閉じる" }).click();
    // The select-based alternative remains available without dragging.
    await page.getByRole("combobox", { name: "接続元", exact: true }).selectOption(target.id);
    await page.getByRole("combobox", { name: "接続先", exact: true }).selectOption(source.id);
    await page.getByRole("combobox", { name: "出口", exact: true }).selectOption("bottom");
    await page.getByRole("combobox", { name: "入口", exact: true }).selectOption("top");
    await page.getByRole("button", { name: "接続を追加", exact: true }).click();
    await expect.poll(edges).toHaveLength(2);
    expect(await edges()).toContainEqual(expect.objectContaining({ sourceId: target.id, targetId: source.id, sourceSide: "bottom", targetSide: "top" }));
  } finally { await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test("endpoint drafts survive failed writes and cancelled close/navigation without resetting node drafts or viewport", async ({ page, request }, testInfo) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "接続下書きの保護" } })).json();
  const { node: a } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "A", positionX: 0 } })).json();
  const { node: b } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "B", positionX: 400 } })).json();
  const { edge } = await (await request.post("/api/edges", { data: { roadmapId: roadmap.id, sourceId: a.id, targetId: b.id, type: "RELATED" } })).json();
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await page.locator(`.react-flow__node[data-id="${a.id}"]`).click();
    await page.getByLabel("学習目標（任意・1行1項目）").fill("保持する目標");
    await page.getByLabel("マップの説明（任意）").fill("保持する説明");
    await page.getByRole("button", { name: "拡大", exact: true }).click();
    await page.getByText("接続一覧 (1)", { exact: true }).click(); await page.getByRole("button", { name: "接続位置を変更" }).click();
    const editor = page.getByRole("form", { name: "接続位置の編集" });
    const viewport = page.locator(".react-flow__viewport"); const transform = await viewport.getAttribute("style");
    await editor.getByLabel("出口の位置").selectOption("left"); await editor.getByLabel("入口の位置").selectOption("right");
    page.once("dialog", (dialog) => dialog.dismiss()); await editor.getByRole("button", { name: "閉じる" }).click();
    await expect(editor.getByLabel("出口の位置")).toHaveValue("left");
    page.once("dialog", (dialog) => dialog.dismiss()); await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link", { name: "ホーム", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/roadmaps/${roadmap.id}`));
    await page.route(`**/api/edges/${edge.id}?*`, async (route) => route.request().method() === "PATCH" ? route.fulfill({ status: 500, json: { error: "保存テスト失敗" } }) : route.continue());
    await editor.getByRole("button", { name: "接続位置を保存" }).click(); await expect(editor.getByRole("status")).toContainText("保存に失敗しました");
    await expect(editor.getByLabel("入口の位置")).toHaveValue("right");
    await expect(page.getByLabel("学習目標（任意・1行1項目）")).toHaveValue("保持する目標"); await expect(page.getByLabel("マップの説明（任意）")).toHaveValue("保持する説明");
    expect(await viewport.getAttribute("style")).toBe(transform);
    await page.unroute(`**/api/edges/${edge.id}?*`); await editor.getByRole("button", { name: "接続位置を保存" }).click(); await expect(editor.getByRole("status")).toHaveText("保存しました");
    expect((await (await request.get(`/api/roadmaps/${roadmap.id}`)).json()).edges).toEqual([expect.objectContaining({ ...edge, sourceSide: "left", targetSide: "right" })]);
    expect(await viewport.getAttribute("style")).toBe(transform);
    await expect(page.getByLabel("学習目標（任意・1行1項目）")).toHaveValue("保持する目標");
    await page.screenshot({ path: testInfo.outputPath("connection-sides-draft.png"), fullPage: true });
    await editor.getByLabel("出口の位置").selectOption("top"); page.once("dialog", (dialog) => dialog.accept()); await editor.getByRole("button", { name: "閉じる" }).click();
    await page.getByRole("button", { name: "接続位置を変更" }).click(); await expect(editor.getByLabel("出口の位置")).toHaveValue("left");
    for (const width of [390, 640, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await editor.locator("button,select").evaluateAll((elements) => elements.filter((element) => { const r = element.getBoundingClientRect(); return r.left < 0 || r.right > window.innerWidth; }).length)).toBe(0);
      await page.screenshot({ path: testInfo.outputPath(`connection-editor-${width}.png`), fullPage: true });
    }
  } finally { await request.delete(`/api/roadmaps/${roadmap.id}`); }
});
