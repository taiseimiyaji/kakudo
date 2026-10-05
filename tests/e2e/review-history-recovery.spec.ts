import { expect, test, editNote, openNotePanels } from "./manual-note-fixture";

test("review history recovers after a lost initial GET while preserving the unsaved note", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "History recovery", content: "My words." } })).json();
  let reads = 0; let started = 0;
  try {
    const { run } = await (await request.post(`/api/documents/${document.id}/reviews`, { data: { revisionId: document.currentRevisionId, type: "LOGIC" } })).json();
    await expect.poll(async () => (await (await request.get(`/api/reviews/${run.id}`)).json()).run.status).toBe("COMPLETED");
    page.on("request", (req) => { if (req.method() === "POST" && req.url().includes(`/documents/${document.id}/reviews`)) started++; });
    await page.route(`**/api/documents/${document.id}/reviews?*`, async (route) => {
      if (route.request().method() !== "GET") { await route.continue(); return; }
      if (++reads === 1) await route.abort("failed"); else await route.continue();
    });
    await page.goto(`/workspaces/default/documents/${document.id}`); await openNotePanels(page); await editNote(page);
    await expect(page.locator(".review-panel").getByRole("alert")).toContainText("通信できませんでした");
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" My draft.");
    await expect(page.getByLabel("レビュー履歴")).toHaveValue(run.id, { timeout: 8000 });
    await expect(page.getByLabel("レビューの状態")).toContainText("完了");
    await expect(page.locator(".review-panel")).not.toContainText("通信できませんでした");
    await expect(editor).toContainText("My words. My draft.");
    await expect(page.getByText("未保存の変更", { exact: true })).toBeVisible();
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe("My words.");
    expect(reads).toBeGreaterThan(1); expect(started).toBe(0);
  } finally { await page.unrouteAll({ behavior: "wait" }); await request.delete(`/api/documents/${document.id}`); }
});
