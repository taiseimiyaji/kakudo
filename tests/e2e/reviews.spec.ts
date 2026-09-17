import { expect, test } from "@playwright/test";
test("run an explicit Mock fact check with evidence while keeping Markdown unchanged", async ({ page, request }) => {
  const content = "OAuthは認証プロトコルである。";
  const { document } = await (await request.post("/api/documents", { data: { title: "Review browser", content } })).json();
  await request.post(`/api/documents/${document.id}/resources`, { data: { url: "https://www.rfc-editor.org/rfc/rfc6749", title: "RFC 6749", type: "RFC" } });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const reviews = page.getByRole("region", { name: "Reviews", exact: true });
    await reviews.getByRole("button", { name: "Check Facts", exact: true }).click();
    await expect(reviews.getByLabel("Review Status")).toContainText("COMPLETED", { timeout: 15000 });
    await expect(reviews.getByText("CONTRADICTED", { exact: true })).toBeVisible();
    await expect(reviews.getByRole("link", { name: "RFC 6749", exact: true })).toHaveAttribute("href", "https://www.rfc-editor.org/rfc/rfc6749");
    await expect(reviews.getByText(/Mock（実AI/)).toBeVisible();
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe(content);
    await page.reload(); await expect(reviews.getByText("CONTRADICTED", { exact: true })).toBeVisible();
  } finally { await request.delete(`/api/documents/${document.id}`); }
});
test("highlight, resolve, dismiss, edit to stale and review a new revision with preserved history", async ({ page, request }) => {
  const content = "OAuthは認証プロトコルである。";
  const { document } = await (await request.post("/api/documents", { data: { title: "Review decisions", content } })).json();
  await request.post(`/api/documents/${document.id}/resources`, { data: { url: "https://www.rfc-editor.org/rfc/rfc6749", title: "RFC 6749", type: "RFC" } });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const panel = page.getByRole("region", { name: "Reviews", exact: true });
    await panel.getByRole("button", { name: "Check Facts", exact: true }).click(); await expect(panel.getByLabel("Review Status")).toContainText("COMPLETED", { timeout: 15000 });
    await panel.getByRole("button", { name: "本文で確認" }).click(); await expect(page.locator(".review-highlight")).toHaveText(content);
    await panel.getByRole("button", { name: "Resolve", exact: true }).click(); await expect(panel.getByText("RESOLVED", { exact: true })).toBeVisible();
    await page.reload(); await expect(panel.getByText("RESOLVED", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Dismiss", exact: true }).click(); await expect(panel.getByText("DISMISSED", { exact: true })).toBeVisible();
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe(content);
    await panel.getByRole("button", { name: "本文で確認" }).click();
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click(); await editor.press("ControlOrMeta+End"); await editor.press("Enter"); await editor.pressSequentially("My next question.");
    await expect(panel.getByText(/Outdated Review/)).toBeVisible(); await expect(page.locator(".review-highlight")).toHaveCount(0); await expect(panel.getByRole("button", { name: "本文で確認" })).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Review Again" })).toBeDisabled();
    await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Review Again" }).click(); await expect(panel.getByLabel("Review Status")).toContainText("COMPLETED", { timeout: 15000 });
    await expect(panel.getByText(/Outdated Review/)).toHaveCount(0);
    const history = (await (await request.get(`/api/documents/${document.id}/reviews`)).json()).reviews; expect(history).toHaveLength(2); expect(history[0].revisionId).not.toBe(history[1].revisionId);
    await panel.getByLabel("Review履歴").selectOption(history[1].id); await expect(panel.getByText(/Outdated Review/)).toBeVisible(); await expect(panel.getByText("DISMISSED", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Apply Fix|Rewrite|Accept Fix|Generate/ })).toHaveCount(0);
  } finally { await request.delete(`/api/documents/${document.id}`); }
});
