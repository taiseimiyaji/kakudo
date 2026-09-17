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
