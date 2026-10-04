import { expect, test, editNote } from "./manual-note-fixture";

for (const terminal of ["COMPLETED", "FAILED"] as const) {
  test(`review status recovers after one lost GET to ${terminal} and keeps the learner draft`, async ({ page, request }) => {
    const { document } = await (await request.post("/api/documents", { data: { title: `Review recovery ${terminal}`, content: "My understanding." } })).json();
    let gets = 0; let posts = 0;
    page.on("request", (req) => { if (req.method() === "POST" && req.url().includes(`/documents/${document.id}/reviews`)) posts++; });
    await page.route("**/api/reviews/*", async (route) => {
      gets++;
      if (gets === 2) { await route.abort("failed"); return; }
      const response = await route.fetch();
      if (!response.ok()) { await route.fulfill({ response }); return; }
      const detail = await response.json();
      detail.run.status = gets === 1 ? "RUNNING" : terminal;
      detail.run.stage = gets === 1 ? "LOGIC" : terminal;
      detail.run.error = gets > 2 && terminal === "FAILED" ? "レビュー実行に失敗しました。再実行できます。" : null;
      await route.fulfill({ response, json: detail });
    });
    try {
      await page.goto(`/workspaces/default/documents/${document.id}`); await editNote(page);
      await page.getByRole("button", { name: "論理を確認", exact: true }).click();
      await expect(page.getByLabel("レビューの状態")).toContainText("確認中");
      const editor = page.getByRole("textbox", { name: "Markdown本文" });
      await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" My draft.");
      await expect(page.getByRole("alert")).toContainText("通信できませんでした");
      await expect(page.getByLabel("レビューの状態")).toContainText(terminal === "FAILED" ? "失敗" : "完了", { timeout: 8000 });
      await expect(editor).toContainText("My understanding. My draft.");
      await expect(page.getByText("未保存の変更", { exact: true })).toBeVisible();
      await expect(page.locator(".review-panel")).not.toContainText("通信できませんでした");
      if (terminal === "FAILED") await expect(page.getByRole("alert")).toContainText("レビュー実行に失敗");
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(page.getByRole("button", { name: "論理を確認", exact: true })).toBeEnabled();
      expect(posts).toBe(1); expect(gets).toBeGreaterThanOrEqual(3);
    } finally { await page.unrouteAll({ behavior: "wait" }); await request.delete(`/api/documents/${document.id}`); }
  });
}

test("switching review history ignores an old delayed response", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "Review switch", content: "My understanding." } })).json();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  try {
    const run = async () => {
      const { run } = await (await request.post(`/api/documents/${document.id}/reviews`, { data: { revisionId: document.currentRevisionId, type: "LOGIC" } })).json();
      await expect.poll(async () => (await (await request.get(`/api/reviews/${run.id}`)).json()).run.status).toBe("COMPLETED");
      return run.id as string;
    };
    const old = await run(); const current = await run(); let oldRequested = false;
    await page.route(`**/api/reviews/${old}?*`, async (route) => {
      const response = await route.fetch(); const detail = await response.json(); oldRequested = true;
      detail.run.status = "FAILED"; detail.run.error = "古い応答を表示してはいけません";
      await gate; await route.fulfill({ response, json: detail });
    });
    await page.goto(`/workspaces/default/documents/${document.id}`); await editNote(page);
    await expect(page.getByLabel("レビューの状態")).toContainText("完了");
    await page.getByLabel("レビュー履歴").selectOption(old);
    await expect.poll(() => oldRequested).toBe(true);
    await page.getByLabel("レビュー履歴").selectOption(current);
    await expect(page.getByLabel("レビューの状態")).toContainText("完了");
    const received = page.waitForResponse((response) => response.url().includes(`/reviews/${old}`));
    release(); await received;
    await expect(page.getByLabel("レビュー履歴")).toHaveValue(current);
    await expect(page.getByLabel("レビューの状態")).toContainText("完了");
    await expect(page.locator(".review-panel")).not.toContainText("古い応答");
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await request.delete(`/api/documents/${document.id}`); }
});
