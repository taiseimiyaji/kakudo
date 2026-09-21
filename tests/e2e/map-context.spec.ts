import { test, expect, type Page } from "@playwright/test";

const viewport = (page: Page) => page.locator(".react-flow__viewport").evaluate((element) => (element as HTMLElement).style.transform);
const idle = (page: Page) => expect(page.locator(".map-layout")).toHaveAttribute("aria-busy", "false");
async function drag(page: Page, id: string, dx = 30) {
  const card = page.locator(`.react-flow__node[data-id="${id}"] .learning-card`);
  const box = (await card.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + 40, { steps: 10 });
  await page.mouse.up();
  await idle(page);
}

test("large map retains viewport, selection, drafts and scroll across edits and failures", async ({ page, request }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: `Context ${Date.now()}` } })).json();
  const { roadmap: other } = await (await request.post("/api/roadmaps", { data: { title: `Other ${Date.now()}` } })).json();
  const nodes: { id: string; title: string }[] = [];
  try {
    for (let i = 0; i < 24; i++) {
      nodes.push((await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: `学習項目 ${i}`, positionX: (i % 6) * 260, positionY: Math.floor(i / 6) * 210 } })).json()).node);
    }
    await request.post("/api/nodes", { data: { roadmapId: other.id, title: "別のマップの項目", positionX: -500, positionY: 800 } });
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await expect(page.locator(".learning-card")).toHaveCount(24);
    const fitted = await viewport(page);
    await page.getByRole("button", { name: "拡大", exact: true }).click();
    await page.getByRole("button", { name: "拡大", exact: true }).click();
    await expect.poll(() => viewport(page)).not.toBe(fitted);
    // Pan using the background, retaining a central node in view.
    const canvas = (await page.locator(".flow-canvas").boundingBox())!;
    await page.mouse.move(canvas.x + 15, canvas.y + 15);
    await page.mouse.down(); await page.mouse.move(canvas.x + 45, canvas.y + 40, { steps: 8 }); await page.mouse.up();
    const view = await viewport(page);
    const node = nodes[8];
    await page.locator(`.react-flow__node[data-id="${node.id}"]`).click();
    await page.getByLabel("Learning Objectives（1行1項目）").fill("編集中の目標を保持する");
    await page.getByLabel("Roadmapの説明").fill("編集中のマップ説明");
    await page.locator(".node-details").evaluate((element) => { element.scrollTop = 120; });
    const scroll = await page.locator(".node-details").evaluate((element) => element.scrollTop);
    expect(scroll).toBeGreaterThan(0);
    for (let i = 0; i < 3; i++) {
      const before = await page.getByLabel("X", { exact: true }).inputValue();
      await drag(page, node.id);
      await expect(page.getByLabel("X", { exact: true })).not.toHaveValue(before);
      await page.getByRole("combobox", { name: "接続元", exact: true }).selectOption(node.id);
      await page.getByRole("combobox", { name: "接続先", exact: true }).selectOption(nodes[9 + i].id);
      await page.getByRole("button", { name: "接続を追加", exact: true }).click();
      await expect(page.locator("summary")).toHaveText(`接続一覧 (${i + 1})`);
      await expect.poll(() => viewport(page)).toBe(view);
      await expect(page.locator(`.react-flow__node[data-id="${node.id}"]`)).toHaveClass(/selected/);
      await expect(page.getByLabel("Learning Objectives（1行1項目）")).toHaveValue("編集中の目標を保持する");
      await expect.poll(() => page.locator(".node-details").evaluate((element) => element.scrollTop)).toBe(scroll);
    }
    // Select an edge via keyboard; selection survives unrelated map saving.
    const edge = page.locator(".react-flow__edge").first();
    await edge.focus(); await page.keyboard.press("Enter");
    await expect(edge).toHaveClass(/selected/);
    await page.getByRole("button", { name: "Roadmapを保存", exact: true }).click();
    await idle(page);
    await expect(edge).toHaveClass(/selected/);
    await expect.poll(() => viewport(page)).toBe(view);
    await expect(page.getByLabel("Learning Objectives（1行1項目）")).toHaveValue("編集中の目標を保持する");
    await expect.poll(() => page.locator(".node-details").evaluate((element) => element.scrollTop)).toBe(scroll);

    await page.getByLabel("登録済み資料").selectOption({ label: "RFC 6749" });
    await page.getByRole("button", { name: "資料を関連付け", exact: true }).click();
    await expect(page.locator(`.react-flow__node[data-id="${node.id}"]`)).toContainText("Sources 1");
    await expect.poll(() => viewport(page)).toBe(view);
    await expect(edge).toHaveClass(/selected/);
    await expect(page.getByLabel("Learning Objectives（1行1項目）")).toHaveValue("編集中の目標を保持する");

    const beforeFailure = await page.locator(`.react-flow__node[data-id="${node.id}"]`).getAttribute("style");
    const x = await page.getByLabel("X", { exact: true }).inputValue();
    await page.route(`**/api/nodes/${node.id}?*`, async (route) => {
      if (route.request().method() === "PATCH") await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "保存失敗のテスト" }) });
      else await route.continue();
    });
    await drag(page, node.id);
    await expect(page.getByRole("alert")).toContainText("保存失敗のテスト");
    await expect(page.locator(`.react-flow__node[data-id="${node.id}"]`)).toHaveAttribute("style", beforeFailure!);
    await expect(page.getByLabel("X", { exact: true })).toHaveValue(x);
    await expect.poll(() => viewport(page)).toBe(view);
    const persisted = await (await request.get(`/api/roadmaps/${roadmap.id}`)).json();
    expect(persisted.nodes.find((item: { id: string }) => item.id === node.id).positionX).toBe(Number(x));
    await page.getByLabel("X", { exact: true }).fill(String(Number(x) + 15));
    await page.getByRole("button", { name: "Nodeを保存", exact: true }).click();
    await idle(page);
    await expect(page.getByLabel("X", { exact: true })).toHaveValue(String(Number(x) + 15));
    await expect.poll(() => viewport(page)).toBe(view);
    await page.unroute(`**/api/nodes/${node.id}?*`);
    await page.getByRole("button", { name: "Nodeを保存", exact: true }).click();
    await idle(page);
    await expect.poll(() => viewport(page)).toBe(view);

    // A lost response after a committed write must converge to the server position.
    const beforeLostResponse = await page.getByLabel("X", { exact: true }).inputValue();
    await page.route(`**/api/nodes/${node.id}?*`, async (route) => {
      if (route.request().method() === "PATCH") { await route.fetch(); await route.abort("failed"); }
      else await route.continue();
    });
    await drag(page, node.id, -20);
    await expect(page.getByLabel("X", { exact: true })).not.toHaveValue(beforeLostResponse);
    const committed = await (await request.get(`/api/roadmaps/${roadmap.id}`)).json();
    await expect(page.getByLabel("X", { exact: true })).toHaveValue(String(committed.nodes.find((item: { id: string }) => item.id === node.id).positionX));
    await expect.poll(() => viewport(page)).toBe(view);
    await page.unroute(`**/api/nodes/${node.id}?*`);

    await page.getByRole("button", { name: "全体を表示", exact: true }).click();
    await expect.poll(() => viewport(page)).not.toBe(view);
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.getByRole("button", { name: "全体を表示", exact: true }).click();
      await page.screenshot({ path: testInfo.outputPath(`map-${width}.png`), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("link", { name: other.title, exact: true }).click();
    await expect(page.locator(".learning-card")).toHaveCount(1);
    await expect(page.locator(".learning-card")).toBeInViewport();
    await expect(page.getByLabel("Node名", { exact: true })).toHaveCount(0);
    await expect.poll(() => viewport(page)).not.toBe(view);
    await page.goBack();
    await expect(page.locator(".learning-card")).toHaveCount(24);
    await expect.poll(() => viewport(page)).not.toBe(view);
  } finally {
    await request.delete(`/api/roadmaps/${roadmap.id}`);
    await request.delete(`/api/roadmaps/${other.id}`);
  }
});
