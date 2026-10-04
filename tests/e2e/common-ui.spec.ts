import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 844 }, { width: 640, height: 450 }, { width: 1280, height: 900 }]) {
  test(`common navigation and forms reflow at ${viewport.width}px without changing learner text`, async ({ page, request }, testInfo) => {
    await page.setViewportSize(viewport);
    const title = "自分で付けた長い日本語の名前・My Original Title " + "学習の記録".repeat(12);
    const { roadmap } = await (await request.post("/api/roadmaps", { data: { title } })).json();
    const { node } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title, learningObjectives: ["自分で定義した目標"], status: "LEARNING" } })).json();
    const content = "# 自分の文章\n\nEnglish words stay unchanged. 自分で考えて書いた本文です。";
    const { document } = await (await request.post("/api/documents", { data: { title, content, nodeIds: [node.id] } })).json();
    try {
      const routes = ["/workspaces/default", `/workspaces/default/roadmaps/${roadmap.id}`, "/workspaces/default/documents", `/workspaces/default/documents/${document.id}`, "/workspaces/default/resources", "/workspaces/default/reviews"];
      for (const [index, route] of routes.entries()) {
        await page.goto(route);
        const menu = page.getByRole("navigation", { name: "メインメニュー" });
        await expect(menu).toBeVisible();
        await expect(menu.locator('[aria-current="page"]')).toHaveCount(1);
        if (route.includes("roadmaps/")) await page.locator(`.react-flow__node[data-id="${node.id}"]`).click();
        if (route.endsWith("resources")) await expect(page.getByRole("heading", { name: "参考資料", exact: true })).toHaveCount(1);
        // 640 CSS px is the reflow width of a 1280px window at 200% browser zoom.
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const outside = await page.locator('main button:visible, main input:visible, main select:visible, main textarea:visible').evaluateAll((elements) => elements.filter((element) => {
          const rect = element.getBoundingClientRect();
          return !element.closest('.react-flow') && (rect.left < -1 || rect.right > window.innerWidth + 1);
        }).map((element) => element.outerHTML.slice(0, 120)));
        expect(outside).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`page-${index}-${viewport.width}.png`), fullPage: true });
      }
      await page.goto(`/workspaces/default/documents/${document.id}`);
      await page.getByRole("button", { name: "編集", exact: true }).click();
      await expect(page.getByLabel("ノート名（必須）")).toHaveValue(title);
      await expect(page.getByLabel("ノートのプレビュー")).toContainText("English words stay unchanged.");
      const panel = page.getByRole("region", { name: "参考資料", exact: true });
      const url = panel.getByLabel("資料URL（必須）");
      await url.focus(); await url.press("Tab");
      const name = panel.getByLabel("資料名（任意）");
      await expect(name).toBeFocused();
      await expect(name).toHaveCSS("outline-style", "solid");
      await expect(name).toHaveCSS("outline-width", "3px");
      await name.press("Tab");
      const type = panel.getByRole("combobox", { name: "資料の種類（必須）", exact: true });
      await expect(type).toBeFocused(); await type.selectOption("OFFICIAL_DOC");
      await expect(type.locator("option:checked")).toHaveText("公式ドキュメント");
      await expect(type).toHaveValue("OFFICIAL_DOC");
      expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe(content);
    } finally { await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/roadmaps/${roadmap.id}`); }
  });
}

test("200% text scaling keeps resource controls inside the page", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/workspaces/default/resources");
  await expect(page.getByRole("heading", { name: "参考資料", exact: true })).toBeVisible();
  // In addition to the 640px reflow check above, scale the rendered text and controls.
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const panel = page.getByRole("region", { name: "参考資料", exact: true });
  await panel.getByLabel("資料名（任意）").fill("長い日本語の資料名".repeat(20));
  await expect(panel.getByRole("button", { name: "資料を登録", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("resource-text-200-percent.png"), fullPage: true });
});
