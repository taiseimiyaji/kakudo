import { expect, test } from "@playwright/test";
test("human objectives drive coverage, logic asks a question, and manual edits make the review stale", async ({ page, request }) => {
  const { roadmap } = await (await request.post("/api/roadmaps", { data: { title: "Coverage browser" } })).json();
  await request.post("/api/nodes", { data: { roadmapId: roadmap.id, title: "OAuth" } }); let documentId: string | undefined;
  try {
    await page.goto(`/workspaces/default/roadmaps/${roadmap.id}`); await page.locator(".learning-card").filter({ hasText: "OAuth" }).click();
    await page.getByLabel("Learning Objectives（1行1項目）").fill("OAuthとAuthenticationの違いを説明できる\nAuthorization Code Flowを説明できる\nAccess Tokenの役割を説明できる\nPKCEの目的を説明できる");
    await page.getByRole("button", { name: "Nodeを保存" }).click();
    await page.getByLabel("新しいDocument").fill("My reasoning"); await page.getByRole("button", { name: "Documentを作成" }).click();
    await expect(page.getByLabel("Document名")).toHaveValue("My reasoning"); documentId = new URL(page.url()).pathname.split("/").at(-1);
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click(); await editor.pressSequentially("Cookieを使うのでSession認証は安全である。");
    await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    const panel = page.getByRole("region", { name: "Reviews", exact: true });
    await panel.getByRole("button", { name: "Check Coverage" }).click(); await expect(panel.getByLabel("Review Status")).toContainText("COMPLETED", { timeout: 15000 });
    await expect(panel.locator(".coverage-result")).toHaveCount(4); await expect(panel.locator(".coverage-result").filter({ hasText: "PKCE" })).toContainText("Not Covered");
    await panel.getByRole("button", { name: "Check Logic" }).click(); await expect(panel.getByRole("article", { name: "LOGIC Finding" })).toBeVisible({ timeout: 15000 });
    await expect(panel.getByText(/Think about: 安全性/)).toBeVisible(); expect((await (await request.get(`/api/documents/${documentId}`)).json()).content).toBe("Cookieを使うのでSession認証は安全である。");
    await editor.click(); await editor.press("ControlOrMeta+End"); await editor.press("Enter"); await editor.pressSequentially("安全性の条件を自分で調べて整理する。"); await expect(panel.getByText(/Outdated Review/)).toBeVisible();
    await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
  } finally { if (documentId) await request.delete(`/api/documents/${documentId}`); await request.delete(`/api/roadmaps/${roadmap.id}`); }
});
