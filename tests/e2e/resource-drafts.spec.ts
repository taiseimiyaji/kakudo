import { openNotePanels } from "./manual-note-fixture";
import { test, expect, type Page } from "@playwright/test";

const urlField = (page: Page) => page.getByLabel("資料URL（必須）", { exact: true });
const titleField = (page: Page) => page.getByLabel("資料名（任意）", { exact: true });
const home = (page: Page) => page.getByRole("link", { name: "ホーム", exact: true });
const card = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
async function input(page: Page, url: string, title = "人間が選んだ日本語資料") {
  await urlField(page).fill(url); await titleField(page).fill(title);
  await page.getByLabel("資料の種類（必須）").selectOption("OFFICIAL_DOC");
}

// Normal navigation after a real, known failed response must retain the draft.
test("failed workspace registration survives cancelled link, history and reload departures, then retry clears the guard", async ({ page, request }, info) => {
  const url = "https://example.com/retained-reading"; let resourceId = ""; let dialogs = 0;
  const dismiss = async (dialog: import("@playwright/test").Dialog) => { dialogs++; await dialog.dismiss(); };
  page.on("dialog", dismiss);
  await page.goto("/workspaces/default/documents"); await page.getByRole("link", { name: "参考資料", exact: true }).click();
  await input(page, url);
  await page.route("**/api/resources?*", (route) => route.request().method() === "POST" ? route.fulfill({ status: 500, json: { error: "controlled failure" } }) : route.continue());
  try {
    await page.getByRole("button", { name: "資料を登録", exact: true }).click(); await expect(page.getByRole("alert")).toContainText("入力内容は保持されています");
    await home(page).focus(); await home(page).press("Enter"); expect(dialogs).toBe(1);
    await page.goBack(); expect(dialogs).toBe(2);
    await page.reload({ timeout: 2000 }).catch(() => {}); expect(dialogs).toBe(3);
    await expect(urlField(page)).toHaveValue(url); await expect(titleField(page)).toHaveValue("人間が選んだ日本語資料"); await expect(page.getByLabel("資料の種類（必須）")).toHaveValue("OFFICIAL_DOC");
    await page.screenshot({ path: info.outputPath("retained-registration.png"), fullPage: true });
    await page.unroute("**/api/resources?*"); await page.getByRole("button", { name: "資料を登録", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("資料を登録しました"); await expect(urlField(page)).toHaveValue("");
    const resources = (await (await request.get("/api/resources")).json()).resources; resourceId = resources.find((r: { url: string }) => r.url === url).id;
    await home(page).click(); await expect(page).toHaveURL(/\/workspaces\/default$/); expect(dialogs).toBe(3);
  } finally { await page.unrouteAll({ behavior: "wait" }); if (resourceId) await request.delete(`/api/resources/${resourceId}`); }
});

test("type-only edits guard navigation, reverting is clean, and accepted discard clears the next scope", async ({ page }) => {
  let dialogs = 0; let accept = false;
  page.on("dialog", async (dialog) => { dialogs++; if (accept) await dialog.accept(); else await dialog.dismiss(); });
  await page.goto("/workspaces/default/resources");
  await page.getByLabel("資料の種類（必須）").selectOption("PAPER"); await home(page).click(); expect(dialogs).toBe(1);
  await expect(page.getByLabel("資料の種類（必須）")).toHaveValue("PAPER");
  await page.getByLabel("資料の種類（必須）").selectOption("WEB"); await home(page).click(); await expect(page).toHaveURL(/\/workspaces\/default$/); expect(dialogs).toBe(1);
  await page.getByRole("link", { name: "参考資料", exact: true }).click(); await input(page, "invalid typed URL"); accept = true;
  await home(page).click(); await expect(page).toHaveURL(/\/workspaces\/default$/); expect(dialogs).toBe(2);
  await page.getByRole("link", { name: "参考資料", exact: true }).click(); await expect(urlField(page)).toHaveValue(""); await expect(titleField(page)).toHaveValue("");
  await home(page).click(); await expect(page).toHaveURL(/\/workspaces\/default$/); expect(dialogs).toBe(2);
});

test("node resource inputs survive cancelled node/map selection and refreshes including late node creation", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "入力を守るマップ" } })).json();
  const { roadmap: other } = await (await request.post("/api/roadmaps", { data: { title: "移動先マップ" } })).json();
  const nodes = [];
  for (const [index, title] of ["最初の項目", "次の項目"].entries()) nodes.push((await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title, positionX: index * 320 } })).json()).node);
  let dialogs = 0; page.on("dialog", async (dialog) => { dialogs++; await dialog.dismiss(); });
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`); await card(page, nodes[0].id).click();
    await page.getByLabel("新しい学習項目（必須）").fill("追加した項目");
    await page.route("**/api/nodes?*", async (route) => { if (route.request().method() !== "POST") return route.continue(); const response = await route.fetch(); await gate; await route.fulfill({ response }); });
    await page.getByRole("button", { name: "学習項目を追加", exact: true }).click(); await expect(page.locator(".map-layout")).toHaveAttribute("aria-busy", "true");
    await input(page, "https://example.com/node-reading"); release(); await expect(page.locator(".learning-card")).toHaveCount(3); await expect(page.locator(".map-layout")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByLabel("学習項目名（必須）", { exact: true })).toHaveValue(nodes[0].title);
    await card(page, nodes[1].id).click(); expect(dialogs).toBe(1); await expect(urlField(page)).toHaveValue("https://example.com/node-reading");
    await page.getByRole("link", { name: other.title, exact: true }).click(); expect(dialogs).toBe(2); await expect(urlField(page)).toHaveValue("https://example.com/node-reading");
    await page.getByLabel("学習目標（任意・1行1項目）").fill("人間の未保存目標"); await page.getByLabel("マップの説明（任意）").fill("人間の未保存説明");
    await home(page).click(); expect(dialogs).toBe(3); await expect(urlField(page)).toHaveValue("https://example.com/node-reading");
    await page.getByRole("button", { name: "学習項目を保存", exact: true }).click(); await expect(page.locator(".node-details > form [role=status]")).toHaveText("保存しました");
    await expect(urlField(page)).toHaveValue("https://example.com/node-reading");
    await page.getByRole("button", { name: "マップを保存", exact: true }).click(); await expect(page.locator(".map-toolbar [role=status]")).toHaveText("保存しました");
    await card(page, nodes[1].id).click(); expect(dialogs).toBe(4); await expect(titleField(page)).toHaveValue("人間が選んだ日本語資料");
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await request.delete(`/api/roadmaps/${roadmap.id}`); await request.delete(`/api/roadmaps/${other.id}`); }
});

test("pending registration guards node selection, accepted departure cannot deliver the old result into the new node", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "登録中の移動" } })).json();
  const nodes = [];
  for (const [index, title] of ["元の項目", "現在の項目"].entries()) nodes.push((await (await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title, positionX: index * 320 } })).json()).node);
  let resourceId = ""; let posts = 0; let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); let delivered = false;
  await page.route(`**/api/nodes/${nodes[0].id}/resources?*`, async (route) => { if (route.request().method() !== "POST") return route.continue(); posts++; const response = await route.fetch(); resourceId = (await response.json()).resource.id; await gate; await route.fulfill({ response }); delivered = true; });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`); await card(page, nodes[0].id).click(); await input(page, "https://example.com/pending-node-source");
    await page.getByRole("button", { name: "資料を登録", exact: true }).click(); await expect(page.getByRole("button", { name: "登録中…", exact: true })).toBeDisabled();
    page.once("dialog", (dialog) => dialog.dismiss()); await card(page, nodes[1].id).click(); await expect(page.getByLabel("学習項目名（必須）", { exact: true })).toHaveValue(nodes[0].title);
    page.once("dialog", (dialog) => dialog.accept()); await card(page, nodes[1].id).click(); await expect(page.getByLabel("学習項目名（必須）", { exact: true })).toHaveValue(nodes[1].title);
    await titleField(page).fill("新しい項目の入力"); release(); await expect.poll(() => delivered).toBe(true);
    await expect(titleField(page)).toHaveValue("新しい項目の入力"); await expect(page.getByLabel("学習項目名（必須）", { exact: true })).toHaveValue(nodes[1].title); expect(posts).toBe(1);
    expect((await (await request.get(`/api/nodes/${nodes[0].id}/resources`)).json()).resources).toHaveLength(1); expect((await (await request.get(`/api/nodes/${nodes[1].id}/resources`)).json()).resources).toHaveLength(0);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); if (resourceId) await request.delete(`/api/resources/${resourceId}`); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test("document autosave and manual save never clear the separate resource draft guard", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "ノートと参考資料", content: "自分で書いた本文。" } })).json();
  let dialogs = 0; page.on("dialog", async (dialog) => { dialogs++; await dialog.dismiss(); });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await openNotePanels(page); await page.getByRole("button", { name: "編集", exact: true }).click();
    await input(page, "https://example.com/note-source");
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" 自分で考えた追記。");
    await expect(page.locator(".save-state")).toHaveText("保存済み"); await expect.poll(async () => (await (await request.get(`/api/documents/${document.id}`)).json()).content).toContain("自分で考えた追記");
    await home(page).focus(); await home(page).press("Enter"); expect(dialogs).toBe(1); await expect(urlField(page)).toHaveValue("https://example.com/note-source");
    await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.locator(".save-state")).toHaveText("保存済み");
    await home(page).click(); expect(dialogs).toBe(2); await expect(titleField(page)).toHaveValue("人間が選んだ日本語資料");
    await urlField(page).fill(""); await titleField(page).fill(""); await page.getByLabel("資料の種類（必須）").selectOption("WEB");
    await home(page).click(); await expect(page).toHaveURL(/\/workspaces\/default$/); expect(dialogs).toBe(2);
  } finally { await request.delete(`/api/documents/${document.id}`); }
});

test("unknown registration result guards departure until GET confirmation without repeating POST", async ({ page, request }) => {
  const url = "https://example.com/protected-unknown-source"; let resourceId = ""; let posts = 0; let dialogs = 0;
  await page.route("**/api/resources?*", async (route) => { if (route.request().method() !== "POST") return route.continue(); posts++; const response = await route.fetch(); resourceId = (await response.json()).resource.id; await route.abort(); });
  page.on("dialog", async (dialog) => { dialogs++; await dialog.dismiss(); });
  try {
    await page.goto("/workspaces/default/resources"); await input(page, url); await page.getByRole("button", { name: "資料を登録", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("結果は不明"); await home(page).click(); expect(dialogs).toBe(1); await expect(urlField(page)).toHaveValue(url);
    await page.getByRole("button", { name: "登録結果を確認", exact: true }).click(); await expect(page.getByRole("status")).toContainText("登録済みの資料を確認しました"); await expect(urlField(page)).toHaveValue("");
    await home(page).click(); await expect(page).toHaveURL(/\/workspaces\/default$/); expect(dialogs).toBe(1); expect(posts).toBe(1);
  } finally { await page.unrouteAll({ behavior: "wait" }); if (resourceId) await request.delete(`/api/resources/${resourceId}`); }
});
