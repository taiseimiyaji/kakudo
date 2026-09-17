import { expect, test } from "@playwright/test";
test("register a node source, associate it with a document, paste a URL and show unavailable fetch", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: `Sources ${Date.now()}` } })).json();
  await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "OAuth" } });
  const { document } = await (await request.post("/api/documents", { data: { title: "Sources note" } })).json();
  const resourceIds: string[] = [];
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`); await page.locator(".learning-card").filter({ hasText: "OAuth" }).click();
    const panel = page.getByRole("region", { name: "Sources", exact: true });
    const url = `http://127.0.0.1/source-${Date.now()}`;
    await panel.getByLabel("Resource URL").fill(url); await panel.getByLabel("Resource Title").fill("My reference"); await panel.getByRole("button", { name: "資料を登録", exact: true }).click();
    await expect(panel.getByRole("link", { name: "My reference" })).toHaveAttribute("href", url);
    const all = await (await request.get("/api/resources")).json(); resourceIds.push(all.resources.find((r: { url: string }) => r.url === url).id);
    await panel.getByRole("button", { name: "取得を確認" }).click(); await expect(panel.getByRole("alert")).toContainText("UNAVAILABLE");
    await page.goto(`/workspaces/default/documents/${document.id}`);
    await panel.getByLabel("登録済み資料").selectOption(resourceIds[0]); await panel.getByRole("button", { name: "資料を関連付け" }).click();
    await expect(panel.getByRole("link", { name: "My reference" })).toBeVisible();
    const pasted = `https://example.com/source-${Date.now()}`;
    await page.evaluate((value) => navigator.clipboard.writeText(value), pasted);
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click(); await editor.press("ControlOrMeta+V");
    await page.getByRole("dialog").getByRole("button", { name: "資料を登録" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0); await expect(panel.getByRole("link", { name: pasted, exact: true })).toBeVisible();
    const linked = await (await request.get(`/api/documents/${document.id}/resources`)).json(); for (const r of linked.resources) if (!resourceIds.includes(r.id)) resourceIds.push(r.id);
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe("");
    await page.reload(); await expect(panel.getByRole("link", { name: "My reference" })).toBeVisible();
  } finally { for (const id of resourceIds) await request.delete(`/api/resources/${id}`); await request.delete(`/api/documents/${document.id}`); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});
