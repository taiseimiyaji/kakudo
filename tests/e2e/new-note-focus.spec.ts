import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`new note focuses writing once and saves direct and IME input at ${width}px`, async ({ page, request }) => {
    await page.setViewportSize({ width, height: 844 });
    const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: `新規執筆 ${width}` } })).json();
    const { node } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "人間が書く項目" } })).json();
    let documentId = "";
    try {
      await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
      await page.locator(`.react-flow__node[data-id="${node.id}"]`).click();
      await page.getByLabel("新しいノート（必須）").fill("書き始めるノート");
      await page.getByRole("button", { name: "ノートを作成", exact: true }).click();
      await page.waitForURL(/\/documents\/[^/]+$/);
      documentId = new URL(page.url()).pathname.split("/").at(-1)!;
      const editor = page.getByRole("textbox", { name: "Markdown本文" });
      await expect(editor).toBeVisible();
      await expect(editor).toBeFocused();
      await page.keyboard.type("自分の考え");
      const path = `/api/documents/${documentId}`;
      await expect.poll(async () => (await (await request.get(path)).json()).content).toBe("自分の考え");
      await expect(page.locator(".save-state")).toHaveText("保存済み");

      await editor.dispatchEvent("compositionstart");
      await editor.pressSequentially(" 変換中");
      await page.waitForTimeout(1300);
      expect((await (await request.get(path)).json()).content).toBe("自分の考え");
      await editor.dispatchEvent("compositionend");
      await expect.poll(async () => (await (await request.get(path)).json()).content).toBe("自分の考え 変換中");
      await page.reload();
      await expect(page.getByRole("region", { name: "閲覧モード" })).toContainText("自分の考え 変換中");
      await expect(page.locator(".cm-content")).not.toBeFocused();
      await expect(page).toHaveURL(new RegExp(`/documents/${documentId}$`));
    } finally {
      if (documentId) await request.delete(`/api/documents/${documentId}`);
      await request.delete(`/api/roadmaps/${roadmap.id}`);
    }
  });
}

test("existing empty note and cancelled creation navigation never inherit initial focus", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "既存ノートの入口" } })).json();
  const { node } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "作成元" } })).json();
  const { document: existing } = await (await request.post("/api/documents", { data: { title: "既存の空ノート", nodeIds: [node.id] } })).json();
  const { document: populated } = await (await request.post("/api/documents", { data: { title: "保存済みノート", content: "人間の本文" } })).json();
  let createdId = "";
  try {
    await page.goto(`/workspaces/default/documents/${existing.id}`);
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toBeVisible();
    await expect(editor).not.toBeFocused();
    await page.reload();
    await expect(editor).not.toBeFocused();
    await page.goto(`/workspaces/default/documents/${populated.id}?focusNewNote=${populated.id}`);
    await expect(page.getByRole("region", { name: "閲覧モード" })).toContainText("人間の本文");
    await expect(page).toHaveURL(new RegExp(`/documents/${populated.id}$`));
    await expect(page.locator(".cm-content")).not.toBeFocused();

    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await page.locator(`.react-flow__node[data-id="${node.id}"]`).click();
    await page.getByLabel("学習目標（任意・1行1項目）").fill("人間の未保存目標");
    await page.getByLabel("新しいノート（必須）").fill("遷移を取り消したノート");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("button", { name: "ノートを作成", exact: true }).click();
    const link = page.locator(".node-documents").getByRole("link", { name: "遷移を取り消したノート", exact: true });
    await expect(link).toBeVisible();
    createdId = (await link.getAttribute("href"))!.split("/").at(-1)!;
    await expect(page).toHaveURL(new RegExp(`/roadmaps/${roadmap.id}$`));
    await page.getByRole("button", { name: "学習項目を保存", exact: true }).click();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/documents/${createdId}$`));
    await expect(editor).toBeVisible();
    await expect(editor).not.toBeFocused();
  } finally {
    if (createdId) await request.delete(`/api/documents/${createdId}`);
    await request.delete(`/api/documents/${populated.id}`);
    await request.delete(`/api/documents/${existing.id}`);
    await request.delete(`/api/roadmaps/${roadmap.id}`);
  }
});

test("a new note does not take focus from navigation chosen during a slow read", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "読込中のキーボード選択" } })).json();
  const { node } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "作成元" } })).json();
  let createdId = ""; let release!: () => void; let held = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/documents?*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch(); createdId = (await response.json()).document.id;
    await route.fulfill({ response });
  });
  await page.route(/\/api\/documents\/[^/?]+\?/, async (route) => {
    if (!createdId || !new URL(route.request().url()).pathname.endsWith(`/${createdId}`)) return route.continue();
    held = true; await gate; await route.continue();
  });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await page.locator(`.react-flow__node[data-id="${node.id}"]`).click();
    await page.getByLabel("新しいノート（必須）").fill("読込待ちのノート");
    await page.getByRole("button", { name: "ノートを作成", exact: true }).click();
    await expect.poll(() => held).toBe(true);
    const navLink = page.getByRole("navigation", { name: "メインメニュー" }).getByRole("link").first();
    for (let i = 0; i < 10 && !await navLink.evaluate((element) => element === document.activeElement); i++) await page.keyboard.press("Tab");
    await expect(navLink).toBeFocused();
    release();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toBeVisible();
    await expect(editor).not.toBeFocused();
    await page.keyboard.press("Enter");
    expect((await (await request.get(`/api/documents/${createdId}`)).json()).content).toBe("");
  } finally {
    release(); await page.unrouteAll({ behavior: "wait" });
    if (createdId) await request.delete(`/api/documents/${createdId}`);
    await request.delete(`/api/roadmaps/${roadmap.id}`);
  }
});

test("an interrupted new-note read does not restore creation focus on Back and Forward", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "読込を中断したノート" } })).json();
  const { node } = await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "作成元" } })).json();
  let createdId = ""; let release!: () => void; let held = false; let reads = 0;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/documents?*", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch(); createdId = (await response.json()).document.id;
    await route.fulfill({ response });
  });
  await page.route(/\/api\/documents\/[^/?]+\?/, async (route) => {
    if (!createdId || !new URL(route.request().url()).pathname.endsWith(`/${createdId}`)) return route.continue();
    reads++;
    if (reads === 1) {
      held = true; await gate;
      try { await route.continue(); } catch { /* The first read is cancelled on Back. */ }
      return;
    }
    await route.continue();
  });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await page.locator(`.react-flow__node[data-id="${node.id}"]`).click();
    await page.getByLabel("新しいノート（必須）").fill("途中で戻るノート");
    await page.getByRole("button", { name: "ノートを作成", exact: true }).click();
    await expect.poll(() => held).toBe(true);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/roadmaps/${roadmap.id}$`));
    release();
    await page.goForward();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toBeVisible();
    await expect(editor).not.toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/documents/${createdId}$`));
  } finally {
    release(); await page.unrouteAll({ behavior: "wait" });
    if (createdId) await request.delete(`/api/documents/${createdId}`);
    await request.delete(`/api/roadmaps/${roadmap.id}`);
  }
});
