import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const card = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const nodeTitle = (page: Page) => page.getByLabel("学習項目名（必須）", { exact: true });
const newNote = (page: Page) => page.getByLabel("新しいノート（必須）", { exact: true });
const newMap = (page: Page) => page.getByLabel("新しいマップ（必須）", { exact: true });
async function maps(request: APIRequestContext, suffix: string) {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: `作成元 ${suffix}` } })).json();
  const { roadmap: other } = await (await request.post("/api/roadmaps", { data: { title: `移動先 ${suffix}` } })).json();
  const nodes = [];
  for (const [index, title] of ["作成元の項目", "移動先の項目"].entries()) nodes.push((await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title, positionX: index * 320 } })).json()).node);
  return { roadmap, other, nodes };
}

for (const destination of ["node", "map", "roundtrip", "late-error"] as const) {
  test(`late note creation preserves later ${destination} context and its new input`, async ({ page, request }) => {
    const { roadmap, other, nodes } = await maps(request, destination);
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let held = false; let delivered = false; let documentId = ""; let posts = 0;
    await page.route("**/api/documents?*", async (route) => {
      if (route.request().method() !== "POST") return route.continue(); posts++;
      if (destination === "late-error") { held = true; await gate; await route.fulfill({ status: 500, json: { error: "old-request-secret" } }); }
      else { const response = await route.fetch(); documentId = (await response.json()).document.id; held = true; await gate; await route.fulfill({ response }); }
      delivered = true;
    });
    try {
      await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`); await card(page, nodes[0].id).click();
      await newNote(page).fill("遅れて作成されたノート"); await page.getByRole("button", { name: "ノートを作成", exact: true }).click(); await expect.poll(() => held).toBe(true);
      if (destination === "map") { await page.getByRole("link", { name: other.title, exact: true }).click(); await expect(page.getByLabel("マップ名（必須）", { exact: true })).toHaveValue(other.title); await newMap(page).fill("新しい画面の入力"); }
      else {
        await card(page, nodes[1].id).click(); await expect(nodeTitle(page)).toHaveValue(nodes[1].title);
        if (destination === "roundtrip") { await card(page, nodes[0].id).click(); await expect(nodeTitle(page)).toHaveValue(nodes[0].title); }
        await newNote(page).fill("新しい画面の入力");
      }
      const chosen = page.url(); release(); await expect.poll(() => delivered).toBe(true);
      // Allow the old response callback and any resulting router transition to settle.
      await page.waitForTimeout(150); await expect(page).toHaveURL(chosen);
      await expect(destination === "map" ? newMap(page) : newNote(page)).toHaveValue("新しい画面の入力"); await expect(page.getByRole("alert")).toHaveCount(0); expect(posts).toBe(1);
      if (destination !== "map") await expect(page.getByRole("button", { name: "ノートを作成", exact: true })).toBeEnabled();
      if (documentId) {
        const saved = await (await request.get(`/api/documents/${documentId}`)).json(); expect(saved.nodes.map((n: { id: string }) => n.id)).toEqual([nodes[0].id]); expect(saved.content).toBe("");
        if (destination === "map") await page.getByRole("link", { name: roadmap.title, exact: true }).click();
        await card(page, nodes[0].id).click(); await expect(page.locator(".node-documents").getByRole("link", { name: "遅れて作成されたノート", exact: true })).toBeVisible();
      }
    } finally { release(); await page.unrouteAll({ behavior: "wait" }); if (documentId) await request.delete(`/api/documents/${documentId}`); await request.delete(`/api/roadmaps/${roadmap.id}`); await request.delete(`/api/roadmaps/${other.id}`); }
  });
}

for (const destination of ["home", "roundtrip"] as const) {
  test(`late map creation preserves later ${destination} navigation and remains discoverable`, async ({ page, request }) => {
    let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let held = false; let delivered = false; let roadmapId = ""; let posts = 0;
    await page.route("**/api/roadmaps?*", async (route) => { if (route.request().method() !== "POST") return route.continue(); posts++; const response = await route.fetch(); roadmapId = (await response.json()).roadmap.id; held = true; await gate; await route.fulfill({ response }); delivered = true; });
    try {
      await page.goto("/workspaces/default/roadmaps"); await newMap(page).fill(`遅れて作成されたマップ ${destination}`); await page.getByRole("button", { name: "マップを作成", exact: true }).click(); await expect.poll(() => held).toBe(true);
      await page.getByRole("link", { name: "ホーム", exact: true }).click(); await expect(page).toHaveURL(/\/workspaces\/default$/);
      if (destination === "roundtrip") { await page.getByRole("link", { name: "学習マップ", exact: true }).click(); await newMap(page).fill("新しい操作のマップ名"); }
      const chosen = page.url(); release(); await expect.poll(() => delivered).toBe(true); await page.waitForTimeout(150); await expect(page).toHaveURL(chosen); expect(posts).toBe(1);
      if (destination === "roundtrip") { await expect(newMap(page)).toHaveValue("新しい操作のマップ名"); await expect(page.getByRole("button", { name: "マップを作成", exact: true })).toBeEnabled(); }
      else await page.getByRole("link", { name: "学習マップ", exact: true }).click();
      await expect(page.getByRole("link", { name: `遅れて作成されたマップ ${destination}`, exact: true })).toBeVisible();
    } finally { release(); await page.unrouteAll({ behavior: "wait" }); if (roadmapId) await request.delete(`/api/roadmaps/${roadmapId}`); }
  });
}

for (const kind of ["note", "map"] as const) {
  test(`same-context ${kind} creation retains failed input, blocks synchronous duplicates, then opens the created result`, async ({ page, request }) => {
    const fixture = kind === "note" ? await maps(request, "正常な作成") : null;
    let fail = true; let posts = 0; let createdId = ""; let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let held = false;
    await page.route(kind === "note" ? "**/api/documents?*" : "**/api/roadmaps?*", async (route) => {
      if (route.request().method() !== "POST") return route.continue(); posts++;
      if (fail) return route.fulfill({ status: 500, json: { error: "private-stack" } });
      const response = await route.fetch(); const result = await response.json(); createdId = (kind === "note" ? result.document : result.roadmap).id; held = true; await gate; await route.fulfill({ response });
    });
    try {
      await page.goto(fixture ? `/workspaces/default/roadmaps/${fixture.roadmap.id}` : "/workspaces/default/roadmaps"); if (fixture) await card(page, fixture.nodes[0].id).click();
      const field = kind === "note" ? newNote(page) : newMap(page); const title = `自分で作る ${kind}`;
      await field.fill(title); await page.getByRole("button", { name: kind === "note" ? "ノートを作成" : "マップを作成", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("サーバーで処理できませんでした"); await expect(page.getByRole("alert")).not.toContainText("private-stack"); await expect(field).toHaveValue(title);
      fail = false;
      await field.evaluate((element) => { const form = (element as HTMLInputElement).form!; form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
      await expect.poll(() => held).toBe(true); expect(posts).toBe(2); await expect(field).toBeDisabled(); release();
      await expect(page).toHaveURL(new RegExp(`/${kind === "note" ? "documents" : "roadmaps"}/${createdId}$`));
      if (fixture) { const saved = await (await request.get(`/api/documents/${createdId}`)).json(); expect(saved.nodes.map((n: { id: string }) => n.id)).toEqual([fixture.nodes[0].id]); expect(saved.content).toBe(""); }
    } finally { release(); await page.unrouteAll({ behavior: "wait" }); if (createdId) await request.delete(`/api/${kind === "note" ? "documents" : "roadmaps"}/${createdId}`); if (fixture) { await request.delete(`/api/roadmaps/${fixture.roadmap.id}`); await request.delete(`/api/roadmaps/${fixture.other.id}`); } }
  });
}

test("successful note creation remains listed when the existing objective draft guard cancels navigation", async ({ page, request }) => {
  const { roadmap, other, nodes } = await maps(request, "作成後の移動キャンセル"); let documentId = "";
  page.once("dialog", (dialog) => dialog.dismiss());
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`); await card(page, nodes[0].id).click(); await page.getByLabel("学習目標（任意・1行1項目）").fill("人間が考えた目標");
    await newNote(page).fill("作成済みの空ノート"); await page.getByRole("button", { name: "ノートを作成", exact: true }).click();
    await expect(page.locator(".node-documents [role=status]").first()).toHaveText("ノートを作成しました。"); await expect(newNote(page)).toHaveValue(""); await expect(page.getByLabel("学習目標（任意・1行1項目）")).toHaveValue("人間が考えた目標");
    const link = page.locator(".node-documents").getByRole("link", { name: "作成済みの空ノート", exact: true }); await expect(link).toBeVisible(); documentId = (await link.getAttribute("href"))!.split("/").at(-1)!;
    await page.getByRole("button", { name: "学習項目を保存", exact: true }).click(); await expect(page.locator(".node-details > form [role=status]")).toHaveText("保存しました"); await link.click(); await expect(page).toHaveURL(new RegExp(`/documents/${documentId}$`));
  } finally { if (documentId) await request.delete(`/api/documents/${documentId}`); await request.delete(`/api/roadmaps/${roadmap.id}`); await request.delete(`/api/roadmaps/${other.id}`); }
});
