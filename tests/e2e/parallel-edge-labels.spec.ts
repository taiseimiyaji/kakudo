import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const relations = { PREREQUISITE: "先に学ぶ", PARENT: "親子関係", RELATED: "関連" };
const view = (page: Page) => page.locator(".react-flow__viewport").evaluate((element) => (element as HTMLElement).style.transform);
async function snapshot(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/roadmaps/${id}`); expect(response).toBeOK();
  const data = await response.json();
  const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
  return { ...data, nodes: data.nodes.sort(byId), edges: data.edges.sort(byId) };
}
async function labelsAreDistinct(page: Page) {
  await page.locator(".flow-canvas").scrollIntoViewIfNeeded();
  const labels = await page.locator(".parallel-edge-label").evaluateAll((elements) => elements.map((e) => {
    const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { id: e.getAttribute("data-edge-label"), text: e.getAttribute("aria-label"), x: r.x, y: r.y, width: r.width, height: r.height, hit: hit?.closest("[data-edge-label]")?.getAttribute("data-edge-label") };
  }));
  expect(labels.length).toBeGreaterThan(1);
  for (const [i, a] of labels.entries()) {
    expect(a.hit).toBe(a.id);
    for (const b of labels.slice(i + 1)) expect(a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height).toBe(false);
  }
  return labels;
}

for (const shape of ["horizontal", "vertical", "mixed"] as const) {
  test(`six reverse-direction ${shape} labels are distinct and select exact edges at narrow widths and zoom`, async ({ page, request }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 1000 });
    const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: `接続の読み取り ${shape}` } })).json();
    const { node: a } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "A", positionX: 0 } })).json();
    const { node: b } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "B", positionX: shape === "vertical" ? 0 : 420, positionY: shape === "vertical" ? 420 : 0 } })).json();
    const edges: { id: string; sourceId: string; targetId: string; type: keyof typeof relations; sourceSide: string; targetSide: string }[] = [];
    try {
      for (const [source, target, reversed] of [[a, b, false], [b, a, true]] as const) {
        for (const [index, type] of (["PREREQUISITE", "PARENT", "RELATED"] as const).entries()) {
          const [sourceSide, targetSide] = shape === "mixed" ? [["top", "bottom"], ["right", "left"], ["bottom", "top"]][index]
            : shape === "vertical" ? reversed ? ["top", "bottom"] : ["bottom", "top"] : reversed ? ["left", "right"] : ["right", "left"];
          const response = await request.post("/api/edges", { data: { roadmapId: roadmap.id, sourceId: source.id, targetId: target.id, sourceSide, targetSide, type } }); expect(response.status()).toBe(201); edges.push((await response.json()).edge);
        }
      }
      const saved = await snapshot(request, roadmap.id);
      await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`); await expect(page.locator(".parallel-edge-label")).toHaveCount(6);
      const report: Record<string, unknown> = {};
      for (const width of [1280, 640, 390]) {
        await page.setViewportSize({ width, height: 1000 }); await page.getByRole("button", { name: "全体を表示", exact: true }).click();
        await expect.poll(async () => (await labelsAreDistinct(page)).length).toBe(6);
        report[String(width)] = await labelsAreDistinct(page);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath(`labels-${shape}-${width}.png`), fullPage: true });
      }
      await page.setViewportSize({ width: 1280, height: 1000 }); await page.getByRole("button", { name: "全体を表示", exact: true }).click();
      await page.getByRole("button", { name: "拡大", exact: true }).click(); await page.getByRole("button", { name: "縮小", exact: true }).click();
      await labelsAreDistinct(page);
      for (const edge of edges) {
        const route = edge.sourceId === a.id ? "A → B" : "B → A";
        const button = page.getByRole("button", { name: `${route}（${relations[edge.type]}）`, exact: true });
        await button.click(); await expect(button).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator(`.react-flow__edge[data-id="${edge.id}"]`)).toHaveClass(/selected/);
        const editor = page.getByRole("form", { name: "接続位置の編集" }); await expect(editor).toContainText(`${route}（${relations[edge.type]}）`);
        await expect(editor.getByLabel("出口の位置")).toHaveValue(edge.sourceSide); await expect(editor.getByLabel("入口の位置")).toHaveValue(edge.targetSide);
      }
      const first = page.locator(`[data-edge-label="${edges[0].id}"]`); await first.focus(); await first.press("Enter"); await expect(first).toHaveAttribute("aria-pressed", "true");
      const editor = page.getByRole("form", { name: "接続位置の編集" }); const alternate = edges[0].sourceSide === "left" ? "right" : "left";
      await editor.getByLabel("出口の位置").selectOption(alternate);
      page.once("dialog", (event) => event.dismiss()); await first.focus(); await first.press("Escape"); await expect(editor.getByLabel("出口の位置")).toHaveValue(alternate);
      const second = page.locator(`[data-edge-label="${edges[1].id}"]`); page.once("dialog", (event) => event.dismiss()); await second.click(); await expect(first).toHaveAttribute("aria-pressed", "true");
      page.once("dialog", (event) => event.accept()); await first.focus(); await first.press("Escape"); await expect(editor).toHaveCount(0);
      expect(await snapshot(request, roadmap.id)).toEqual(saved);
      await writeFile(testInfo.outputPath(`labels-${shape}-measurements.json`), JSON.stringify(report, null, 2));
    } finally { await request.delete(`/api/roadmaps/${roadmap.id}`); }
  });
}

test("same-direction relations return to unchanged single-edge paths without losing selection, viewport or drafts", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "単方向への回帰" } })).json();
  const { node: a } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "長い日本語の接続元".repeat(10), positionX: 0 } })).json();
  const { node: b } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "接続先", positionX: 1400 } })).json();
  const create = async (type: string) => (await (await request.post("/api/edges", { data: { roadmapId: roadmap.id, sourceId: a.id, targetId: b.id, sourceSide: "right", targetSide: "left", type } })).json()).edge;
  try {
    const original = await create("RELATED"); await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await expect(page.locator(".react-flow__edge-text")).toHaveCount(1); const path = page.locator(`.react-flow__edge[data-id="${original.id}"] .react-flow__edge-path`); const originalPath = await path.getAttribute("d");
    await create("PARENT"); await create("PREREQUISITE"); await page.reload(); await expect(page.locator(".parallel-edge-label")).toHaveCount(3); await labelsAreDistinct(page);
    expect(await path.getAttribute("d")).toBe(originalPath);
    await page.locator(`[data-edge-label="${original.id}"]`).click(); await page.locator(`.react-flow__node[data-id="${a.id}"]`).click();
    await page.getByLabel("学習目標（任意・1行1項目）").fill("保持する目標"); await page.getByLabel("マップの説明（任意）").fill("保持する説明");
    await page.locator(`[data-edge-label="${original.id}"]`).click();
    await page.getByRole("button", { name: "拡大", exact: true }).click(); const transform = await view(page);
    await page.getByText("接続一覧 (3)", { exact: true }).click();
    for (const relation of ["親子関係", "先に学ぶ"]) {
      await page.locator(".edge-row").filter({ hasText: `(${relation})` }).getByRole("button", { name: "接続を削除" }).click();
      await expect(page.locator(".map-layout")).toHaveAttribute("aria-busy", "false");
      await expect(page.getByLabel("学習目標（任意・1行1項目）")).toHaveValue("保持する目標"); await expect(page.getByLabel("マップの説明（任意）")).toHaveValue("保持する説明");
      expect(await view(page)).toBe(transform);
    }
    await expect(page.locator(".parallel-edge-label")).toHaveCount(0); await expect(page.locator(".react-flow__edge-text")).toHaveCount(1); expect(await path.getAttribute("d")).toBe(originalPath);
    await expect(page.locator(`.react-flow__edge[data-id="${original.id}"]`)).toHaveClass(/selected/);
    const current = await (await request.get(`/api/roadmaps/${roadmap.id}`)).json(); expect(current.edges).toEqual([original]); expect(current.nodes.find((n: { id: string }) => n.id === a.id).learningObjectives).toEqual([]);
  } finally { await request.delete(`/api/roadmaps/${roadmap.id}`); }
});
