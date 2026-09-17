import { expect, test } from "@playwright/test";
test("create a node document, type Markdown, preview, save, reload and delete", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: `Document browser ${Date.now()}` } })).json();
  await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "OAuth" } });
  let documentId: string | undefined;
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`);
    await page.locator(".learning-card").filter({ hasText: "OAuth" }).click();
    await page.getByLabel("新しいDocument").fill("My OAuth note");
    await page.getByRole("button", { name: "Documentを作成" }).click();
    await expect(page.getByLabel("Document名")).toHaveValue("My OAuth note");
    documentId = new URL(page.url()).pathname.split("/").at(-1);
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await editor.click(); await editor.pressSequentially("# My understanding"); await editor.press("Enter"); await editor.press("Enter"); await editor.pressSequentially("I will verify this with sources.");
    await expect(page.getByLabel("Markdown Preview").getByRole("heading", { name: "My understanding" })).toBeVisible();
    await expect(page.getByText("未保存の変更", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByRole("status")).toHaveText("保存しました");
    const saved = await (await request.get(`/api/documents/${documentId}`)).json(); expect(saved.content).toBe("# My understanding\n\nI will verify this with sources."); expect(saved.document.path).toMatch(/\.md$/);
    await page.reload(); await expect(editor).toContainText("I will verify this with sources.");
    await page.getByLabel("Document名").fill("Renamed note"); await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByRole("status")).toHaveText("保存しました");
    page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Documentを削除" }).click();
    await expect(page.getByRole("heading", { name: "Knowledge Map", exact: true })).toBeVisible();
    expect((await request.get(`/api/documents/${documentId}`)).status()).toBe(404);
  } finally {
    if (documentId) await request.delete(`/api/documents/${documentId}`);
    await request.delete(`/api/roadmaps/${roadmap.id}`);
  }
});
