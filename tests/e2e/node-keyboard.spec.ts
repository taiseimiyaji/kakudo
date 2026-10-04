import { test, expect, type Page, type Locator } from "@playwright/test";

const card = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
async function focus(item: Locator) { await expect(item).toBeVisible(); await item.focus(); await expect(item).toBeFocused(); }
const title = (page: Page) => page.getByLabel("学習項目名（必須）", { exact: true });
const idle = (page: Page) => expect(page.locator(".map-layout")).toHaveAttribute("aria-busy", "false");
const viewport = (page: Page) => page.locator(".react-flow__viewport").evaluate((e) => (e as HTMLElement).style.transform);
async function position(page: Page, id: string) { return card(page, id).evaluate((e) => (e as HTMLElement).style.transform); }

for (const width of [1280, 390]) {
  test(`node keyboard selects, saves all arrow directions and Shift moves, then clears details at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 1000 });
    const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: `キーボード ${width}` } })).json();
    const { node } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "人間が選んだ学習項目" } })).json();
    let patches = 0; page.on("request", (r) => { if (r.method() === "PATCH" && r.url().includes(`/api/nodes/${node.id}?`)) patches++; });
    try {
      await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`); const item = card(page, node.id); await focus(item); await item.press("Enter");
      await expect(title(page)).toHaveValue(node.title); await expect(item).toHaveClass(/selected/);
      let x = 0; let y = 0;
      for (const [key, dx, dy] of [["ArrowRight", 5, 0], ["ArrowDown", 0, 5], ["Shift+ArrowLeft", -20, 0], ["ArrowUp", 0, -5]] as const) {
        await item.press(key); x += dx; y += dy;
        await expect.poll(async () => { const detail = await (await request.get(`/api/roadmaps/${roadmap.id}`)).json(); const current = detail.nodes.find((n: { id: string }) => n.id === node.id); return [current.positionX, current.positionY]; }).toEqual([x, y]);
        await idle(page); await expect(page.getByLabel("X", { exact: true })).toHaveValue(String(x)); await expect(page.getByLabel("Y", { exact: true })).toHaveValue(String(y));
      }
      expect(patches).toBe(4); await item.press("Escape"); await expect(title(page)).toHaveCount(0); await expect(item).not.toHaveClass(/selected/);
      await focus(item); await item.press(" "); await expect(title(page)).toHaveValue(node.title); await item.press("Escape"); await page.reload();
      await expect.poll(() => position(page, node.id)).toBe(`translate(${x}px, ${y}px)`); expect(patches).toBe(4);
    } finally { await request.delete(`/api/roadmaps/${roadmap.id}`); }
  });
}

test("keyboard selection and Escape use one existing guard for node, resource and edge drafts", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "キーボードとdraft保護" } })).json();
  const nodes = [];
  for (const [i, text] of ["最初の項目", "別の項目"].entries()) nodes.push((await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: text, positionX: i * 320 } })).json()).node);
  await request.post("/api/edges", { data: { roadmapId: roadmap.id, sourceId: nodes[0].id, targetId: nodes[1].id, type: "RELATED" } });
  let dialogs = 0; let accept = false; page.on("dialog", async (d) => { dialogs++; if (accept) await d.accept(); else await d.dismiss(); });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`); await focus(card(page, nodes[0].id)); await card(page, nodes[0].id).press("Enter");
    await page.getByLabel("学習目標（任意・1行1項目）").fill("人間の未保存目標"); await page.getByLabel("資料URL（必須）").fill("https://example.com/keyboard-draft"); await page.getByLabel("マップの説明（任意）").fill("保持するマップ説明");
    await focus(card(page, nodes[1].id)); await card(page, nodes[1].id).press("Enter"); expect(dialogs).toBe(1); await expect(title(page)).toHaveValue(nodes[0].title);
    await focus(card(page, nodes[0].id)); await card(page, nodes[0].id).press("Escape"); expect(dialogs).toBe(2); await expect(page.getByLabel("資料URL（必須）")).toHaveValue("https://example.com/keyboard-draft");
    await page.getByText("接続一覧 (1)", { exact: true }).click(); await page.getByRole("button", { name: "接続位置を変更", exact: true }).click(); await page.getByLabel("入口の位置").selectOption("left");
    await focus(card(page, nodes[0].id)); await card(page, nodes[0].id).press("Escape"); expect(dialogs).toBe(3); await expect(page.getByLabel("入口の位置")).toHaveValue("left"); await expect(page.getByLabel("学習目標（任意・1行1項目）")).toHaveValue("人間の未保存目標");
    accept = true; await card(page, nodes[0].id).press("Escape"); expect(dialogs).toBe(4); await expect(title(page)).toHaveCount(0); await expect(page.getByRole("form", { name: "接続位置の編集" })).toHaveCount(0);
    await focus(card(page, nodes[1].id)); await card(page, nodes[1].id).press("Enter"); expect(dialogs).toBe(4); await expect(title(page)).toHaveValue(nodes[1].title); await expect(page.getByLabel("資料URL（必須）")).toHaveValue(""); await expect(page.getByLabel("マップの説明（任意）")).toHaveValue("保持するマップ説明");
  } finally { await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test("arrow save blocks further movement while pending, rolls back failure and reconciles a committed lost response without losing drafts or viewport", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "矢印保存と再試行" } })).json();
  const { node } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "座標を保存する項目" } })).json();
  let fail = true; let patches = 0; let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**/api/nodes/${node.id}?*`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue(); patches++;
    if (fail) { await gate; await route.fulfill({ status: 500, json: { error: "private-stack" } }); }
    else { await route.fetch(); await route.abort(); }
  });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`); const item = card(page, node.id); await focus(item); await item.press("Enter");
    await page.getByLabel("学習目標（任意・1行1項目）").fill("保持する人間の目標"); await page.getByLabel("マップの説明（任意）").fill("保持する説明"); await page.getByLabel("X", { exact: true }).fill("900");
    await focus(item); const view = await viewport(page); await item.press("ArrowRight"); await expect(page.locator(".map-layout")).toHaveAttribute("aria-busy", "true"); const moved = await position(page, node.id);
    await item.press("ArrowRight"); expect(patches).toBe(1); expect(await position(page, node.id)).toBe(moved); release(); await expect(page.getByRole("alert")).not.toContainText("private-stack"); await idle(page); await expect.poll(() => position(page, node.id)).toBe("translate(0px, 0px)");
    fail = false; await item.press("ArrowRight"); await expect.poll(async () => (await (await request.get(`/api/roadmaps/${roadmap.id}`)).json()).nodes[0].positionX).toBe(5); await idle(page); await expect.poll(() => position(page, node.id)).toBe("translate(5px, 0px)"); expect(patches).toBe(2);
    await expect(page.getByLabel("X", { exact: true })).toHaveValue("900"); await expect(page.getByLabel("学習目標（任意・1行1項目）")).toHaveValue("保持する人間の目標"); await expect(page.getByLabel("マップの説明（任意）")).toHaveValue("保持する説明"); expect(await viewport(page)).toBe(view);
    await page.getByLabel("資料名（任意）").fill("ArrowRight"); await page.getByLabel("資料名（任意）").press("ArrowRight"); expect(patches).toBe(2);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test("pointer drag also uses the completed-position save once and retains map/node drafts", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "ドラッグ保存の回帰" } })).json();
  const { node } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "ドラッグする項目" } })).json();
  let patches = 0; page.on("request", (r) => { if (r.method() === "PATCH" && r.url().includes(`/api/nodes/${node.id}?`)) patches++; });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`); const item = card(page, node.id); await item.click(); await page.getByLabel("学習目標（任意・1行1項目）").fill("保持する目標"); await page.getByLabel("マップの説明（任意）").fill("保持する説明");
    const box = (await item.boundingBox())!; const before = await position(page, node.id); const view = await viewport(page);
    await page.mouse.move(box.x + box.width / 2, box.y + 20); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 45, box.y + 60, { steps: 10 }); await page.mouse.up();
    await expect.poll(() => patches).toBe(1); await idle(page); expect(await position(page, node.id)).not.toBe(before); await expect(page.getByLabel("学習目標（任意・1行1項目）")).toHaveValue("保持する目標"); await expect(page.getByLabel("マップの説明（任意）")).toHaveValue("保持する説明"); expect(await viewport(page)).toBe(view);
  } finally { await request.delete(`/api/roadmaps/${roadmap.id}`); }
});
