import { expect, test, editNote } from "./manual-note-fixture";
test("human objectives drive coverage, logic asks a question, and manual edits make the review stale", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "Coverage browser" } })).json();
  await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "OAuth" } }); let documentId: string | undefined;
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`); await page.locator(".learning-card").filter({ hasText: "OAuth" }).click();
    await page.getByLabel("学習目標（任意・1行1項目）").fill("OAuthとAuthenticationの違いを説明できる\nAuthorization Code Flowを説明できる\nAccess Tokenの役割を説明できる\nPKCEの目的を説明できる");
    await page.getByRole("button", { name: "学習項目を保存" }).click();
    await page.getByLabel("新しいノート（必須）").fill("My reasoning"); await page.getByRole("button", { name: "ノートを作成" }).click();
    await editNote(page); await expect(page.getByLabel("ノート名（必須）")).toHaveValue("My reasoning"); documentId = new URL(page.url()).pathname.split("/").at(-1);
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click(); await editor.pressSequentially("Cookieを使うのでSession認証は安全である。");
    await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    const panel = page.getByRole("region", { name: "レビュー", exact: true });
    await panel.getByRole("button", { name: "学習目標を確認" }).click(); await expect(panel.getByLabel("レビューの状態")).toContainText("完了", { timeout: 15000 });
    await expect(panel.locator(".coverage-result")).toHaveCount(4); await expect(panel.locator(".coverage-result").filter({ hasText: "PKCE" })).toContainText("まだ説明がありません");
    await panel.getByRole("button", { name: "論理を確認" }).click(); await expect(panel.getByRole("article", { name: "論理の指摘" })).toBeVisible({ timeout: 15000 });
    await expect(panel.getByText(/考えるヒント: 安全性/)).toBeVisible(); expect((await (await request.get(`/api/documents/${documentId}`)).json()).content).toBe("Cookieを使うのでSession認証は安全である。");
    await editor.click(); await editor.press("ControlOrMeta+End"); await editor.press("Enter"); await editor.pressSequentially("安全性の条件を自分で調べて整理する。"); await expect(panel.getByText(/更新前のレビュー/)).toBeVisible();
    await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
  } finally { if (documentId) await request.delete(`/api/documents/${documentId}`); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});
