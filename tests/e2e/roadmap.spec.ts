import { test, expect } from "@playwright/test";

test("create a map, connect nodes, persist edits and drag positions, then delete", async ({ page, request }) => {
  await page.goto("/workspaces/default/roadmaps");
  const title = `Browser Map ${Date.now()}`;
  await page.getByLabel("新しいRoadmap").fill(title);
  await page.getByRole("button", { name: "Roadmapを作成" }).click();
  await expect(page.getByLabel("Roadmap名", { exact: true })).toHaveValue(title);
  const mapId = decodeURIComponent(new URL(page.url()).pathname.split("/").at(-1)!);
  try {
    for (const name of ["Authentication", "OAuth", "PKCE"]) {
      await page.getByLabel("新しいNode").fill(name);
      await page.getByRole("button", { name: "Nodeを追加" }).click();
      await expect(page.getByLabel("Node名", { exact: true })).toHaveValue(name);
    }
    await page.getByRole("combobox", { name: "接続元", exact: true }).selectOption({ label: "Authentication" });
    await page.getByRole("combobox", { name: "接続先", exact: true }).selectOption({ label: "OAuth" });
    await page.getByRole("button", { name: "接続を追加" }).click();
    await expect(page.locator("summary")).toHaveText("接続一覧 (1)");
    await page.getByRole("combobox", { name: "接続元", exact: true }).selectOption({ label: "OAuth" });
    await page.getByRole("combobox", { name: "接続先", exact: true }).selectOption({ label: "PKCE" });
    await page.getByRole("button", { name: "接続を追加" }).click();
    await expect(page.locator("summary")).toHaveText("接続一覧 (2)");
    await page.locator(".learning-card").filter({ hasText: "OAuth" }).click();
    await page.getByLabel("学習状態").selectOption("LEARNING");
    await page.getByLabel("Learning Objectives（1行1項目）").fill("OAuthとAuthenticationを区別する");
    await page.getByLabel("Guiding Questions（1行1項目）").fill("誰が誰に権限を渡す？");
    await page.getByRole("button", { name: "Nodeを保存" }).click();
    await expect(page.locator(".learning-card").filter({ hasText: "OAuth" })).toContainText("LEARNING");
    await page.getByRole("button", { name: "全体を表示", exact: true }).click();
    const card = page.locator(".learning-card").filter({ hasText: "OAuth" });
    await expect(card).toBeInViewport();
    const box = await card.boundingBox();
    const before = Number(await page.getByLabel("X", { exact: true }).inputValue());
    await page.mouse.move(box!.x + box!.width / 2, box!.y + 25);
    await page.mouse.down(); await page.mouse.move(box!.x + box!.width / 2 + 85, box!.y + 65, { steps: 12 }); await page.mouse.up();
    await expect.poll(async () => Number(await page.getByLabel("X", { exact: true }).inputValue())).not.toBe(before);
    const after = await page.getByLabel("X", { exact: true }).inputValue();
    await page.reload();
    await page.locator(".learning-card").filter({ hasText: "OAuth" }).click();
    await expect(page.getByLabel("X", { exact: true })).toHaveValue(after);
    await expect(page.getByLabel("学習状態")).toHaveValue("LEARNING");
    await expect(page.getByLabel("Learning Objectives（1行1項目）")).toHaveValue("OAuthとAuthenticationを区別する");
    await page.locator("summary").click();
    await page.getByRole("button", { name: "接続を削除" }).first().click();
    await expect(page.locator("summary")).toHaveText("接続一覧 (1)");
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Nodeを削除", exact: true }).click();
    await expect(page.locator(".learning-card").filter({ hasText: "OAuth" })).toHaveCount(0);
    await page.getByLabel("Roadmap名", { exact: true }).fill(`${title} edited`);
    await page.getByRole("button", { name: "Roadmapを保存" }).click();
    await expect(page.getByRole("link", { name: `${title} edited`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Roadmapを削除" }).click();
    await expect(page.getByRole("link", { name: `${title} edited`, exact: true })).toHaveCount(0);
  } finally { await request.delete(`/api/roadmaps/${encodeURIComponent(mapId)}`).catch(() => {}); }
});
