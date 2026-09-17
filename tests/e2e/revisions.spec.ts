import { expect, test } from "@playwright/test";
test("save, save unchanged, edit and reload preserve the right revision", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "Revision browser" } })).json();
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const revision = page.getByLabel("現在のRevision"); await expect(revision).toContainText(document.currentRevisionId);
    await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByRole("status")).toHaveText("保存しました");
    const revisions = async () => (await (await request.get(`/api/documents/${document.id}/revisions`)).json()).revisions;
    expect(await revisions()).toHaveLength(1);
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click(); await editor.pressSequentially("My own explanation.");
    await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    const current = (await (await request.get(`/api/documents/${document.id}`)).json()).document.currentRevisionId;
    expect(current).not.toBe(document.currentRevisionId); expect(await revisions()).toHaveLength(2);
    await page.reload(); await expect(revision).toContainText(current); await expect(editor).toContainText("My own explanation.");
    const old = await (await request.get(`/api/documents/${document.id}/revisions/${document.currentRevisionId}`)).json(); expect(old.revision.contentSnapshot).toBe("");
  } finally { await request.delete(`/api/documents/${document.id}`); }
});
