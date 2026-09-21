import { test, expect, type Page } from "@playwright/test";

const objectives = (page: Page) => page.getByLabel("Learning Objectives（1行1項目）");
const card = (page: Page, title: string) => page.locator(".learning-card").filter({ hasText: title });

test("map drafts survive refreshes, failed saves and cancelled departures", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "Draft protection" } })).json();
  for (const [index, title] of ["First", "Second"].entries()) {
    await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title, positionX: index * 280, positionY: 0 } });
  }
  let dialogs = 0;
  page.on("dialog", async (dialog) => { dialogs++; await dialog.dismiss(); });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await card(page, "First").click();
    await objectives(page).fill("人間が定義した目標");
    await page.getByLabel("Guiding Questions（1行1項目）").fill("自分で考える問い");
    await page.getByLabel("学習状態").selectOption("LEARNING");
    await page.getByLabel("X", { exact: true }).fill("123");
    await page.getByLabel("Roadmapの説明").fill("編集中の説明");
    await card(page, "Second").click();
    expect(dialogs).toBe(1);
    await expect(page.getByLabel("Node名", { exact: true })).toHaveValue("First");
    await page.getByRole("link", { name: "Workspace", exact: true }).click();
    expect(dialogs).toBe(2);
    await expect(objectives(page)).toHaveValue("人間が定義した目標");
    await page.reload({ timeout: 2000 }).catch(() => {});
    expect(dialogs).toBe(3);
    await expect(objectives(page)).toHaveValue("人間が定義した目標");

    await page.getByLabel("登録済み資料").selectOption({ index: 1 });
    await page.getByRole("button", { name: "資料を関連付け", exact: true }).click();
    await expect(page.getByRole("button", { name: "関連を外す" })).toHaveCount(1);
    await expect(objectives(page)).toHaveValue("人間が定義した目標");
    await expect(page.getByLabel("Roadmapの説明")).toHaveValue("編集中の説明");

    // Dragging another node refreshes the map without discarding either form.
    const box = await card(page, "Second").boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 20);
    await page.mouse.down(); await page.mouse.move(box!.x + box!.width / 2 + 45, box!.y + 65, { steps: 10 }); await page.mouse.up();
    await expect(page.locator(".map-layout")).toHaveAttribute("aria-busy", "false");
    await expect(objectives(page)).toHaveValue("人間が定義した目標");
    await expect(page.getByLabel("X", { exact: true })).toHaveValue("123");
    await expect(page.getByLabel("Roadmapの説明")).toHaveValue("編集中の説明");

    await page.route("**/api/nodes/*", async (route) => {
      if (route.request().method() === "PATCH") await route.fulfill({ status: 500, json: { error: "保存テスト失敗" } });
      else await route.continue();
    });
    await page.getByRole("button", { name: "Nodeを保存" }).click();
    await expect(page.locator(".node-details [role=status]")).toContainText("保存に失敗しました");
    await expect(objectives(page)).toHaveValue("人間が定義した目標");
    await page.unroute("**/api/nodes/*");
    await page.getByRole("button", { name: "Nodeを保存" }).click();
    await expect(page.locator(".node-details [role=status]")).toHaveText("保存しました");
    await expect(page.getByLabel("Roadmapの説明")).toHaveValue("編集中の説明");
    await card(page, "Second").click();
    await expect(page.getByLabel("Node名", { exact: true })).toHaveValue("Second");
    await page.getByRole("button", { name: "Roadmapを保存" }).click();
    await expect(page.locator(".map-toolbar [role=status]")).toHaveText("保存しました");
    const afterSave = dialogs;
    await page.getByRole("link", { name: "Workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/workspaces\/default$/);
    expect(dialogs).toBe(afterSave);
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await card(page, "First").click();
    await expect(objectives(page)).toHaveValue("人間が定義した目標");
    await expect(page.getByLabel("X", { exact: true })).toHaveValue("123");
    await expect(page.getByLabel("学習状態")).toHaveValue("LEARNING");
    await expect(page.getByLabel("Guiding Questions（1行1項目）")).toHaveValue("自分で考える問い");
    await expect(page.getByLabel("Roadmapの説明")).toHaveValue("編集中の説明");
  } finally { await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test("discard, unchanged saves and deliberate deletion do not leave blockers", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "Discard map" } })).json();
  for (const title of ["First", "Second"]) await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title } });
  let dialogs = 0;
  page.on("dialog", async (dialog) => { dialogs++; await dialog.accept(); });
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    // Nodes overlap at their initial position; select by creating a new node.
    await page.getByLabel("新しいNode").fill("Third");
    await page.getByRole("button", { name: "Nodeを追加" }).click();
    await expect(page.getByLabel("Node名", { exact: true })).toHaveValue("Third");
    await objectives(page).fill("破棄する目標");
    await card(page, "Second").click();
    expect(dialogs).toBe(1);
    await page.getByRole("button", { name: "Nodeを保存" }).click();
    await expect(page.locator(".node-details [role=status]")).toHaveText("保存しました");
    await page.getByRole("button", { name: "Roadmapを保存" }).click();
    await expect(page.locator(".map-toolbar [role=status]")).toHaveText("保存しました");
    await page.getByRole("link", { name: "Workspace", exact: true }).click();
    await expect(page).toHaveURL(/\/workspaces\/default$/);
    expect(dialogs).toBe(1);
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await card(page, "Third").click();
    await expect(objectives(page)).toHaveValue("");
    await objectives(page).fill("削除する目標");
    await page.getByRole("button", { name: "Nodeを削除", exact: true }).click();
    await expect(card(page, "Third")).toHaveCount(0);
    expect(dialogs).toBe(2);
    await page.getByLabel("Roadmap名", { exact: true }).fill("削除するマップ");
    await page.getByRole("button", { name: "Roadmapを削除" }).click();
    await expect(page).toHaveURL(/\/roadmaps$/);
    expect(dialogs).toBe(3);
  } finally { await request.delete(`/api/roadmaps/${roadmap.id}`); }
});

test("map save reports pending and failure, keeps input for retry, and guards map links", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "Map save retry" } })).json();
  const { roadmap: other } = await (await request.post("/api/roadmaps", { data: { title: "Other destination" } })).json();
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await page.getByLabel("Roadmap名", { exact: true }).fill("  Changed map  ");
    await page.getByLabel("Roadmapの説明").fill("保持する説明");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("link", { name: "Other destination", exact: true }).click();
    await expect(page.getByLabel("Roadmap名", { exact: true })).toHaveValue("  Changed map  ");
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/api/roadmaps/${roadmap.id}?*`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      await pending;
      await route.fulfill({ status: 500, json: { error: "保存テスト失敗" } });
    });
    await page.getByRole("button", { name: "Roadmapを保存" }).click();
    await expect(page.locator(".map-toolbar [role=status]")).toHaveText("保存中…");
    await expect(page.getByLabel("Roadmap名", { exact: true })).toBeDisabled();
    release();
    await expect(page.locator(".map-toolbar [role=status]")).toContainText("保存に失敗しました");
    await expect(page.getByLabel("Roadmapの説明")).toHaveValue("保持する説明");
    await page.unroute(`**/api/roadmaps/${roadmap.id}?*`);
    await page.getByRole("button", { name: "Roadmapを保存" }).click();
    await expect(page.locator(".map-toolbar [role=status]")).toHaveText("保存しました");
    await expect(page.getByLabel("Roadmap名", { exact: true })).toHaveValue("Changed map");
    let dialogs = 0;
    page.on("dialog", async (dialog) => { dialogs++; await dialog.accept(); });
    await page.getByRole("link", { name: "Other destination", exact: true }).click();
    await expect(page.getByLabel("Roadmap名", { exact: true })).toHaveValue("Other destination");
    expect(dialogs).toBe(0);
    await page.getByLabel("Roadmapの説明").fill("破棄する説明");
    await page.goBack();
    await expect(page.getByLabel("Roadmap名", { exact: true })).toHaveValue("Changed map");
    expect(dialogs).toBe(1);
  } finally {
    await request.delete(`/api/roadmaps/${roadmap.id}`);
    await request.delete(`/api/roadmaps/${other.id}`);
  }
});
