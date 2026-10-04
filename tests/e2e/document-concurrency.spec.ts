import { expect, test, editNote } from "./manual-note-fixture";

test("a stale tab preserves its title and text and can review the latest save before retrying", async ({ page, context, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "Old", content: "A" } })).json();
  const other = await context.newPage();
  try {
    const url = `/workspaces/default/documents/${document.id}`;
    await page.goto(url); await editNote(page); await other.goto(url); await editNote(other);
    await expect(page.getByLabel("ノート名（必須）")).toHaveValue("Old");
    await expect(other.getByLabel("ノート名（必須）")).toHaveValue("Old");
    await page.getByLabel("ノート名（必須）").fill("New");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("保存しました");
    const editor = other.getByRole("textbox", { name: "Markdown本文" });
    await editor.click(); await editor.press("End"); await editor.pressSequentially(" my draft");
    await other.getByLabel("ノート名（必須）").fill("My draft title");
    await other.getByRole("button", { name: "保存", exact: true }).click();
    await expect(other.getByRole("alert")).toContainText("競合");
    await expect(editor).toContainText("A my draft");
    await expect(other.getByLabel("ノート名（必須）")).toHaveValue("My draft title");
    const current = await (await request.get(`/api/documents/${document.id}`)).json();
    expect(current.document.title).toBe("New"); expect(current.content).toBe("A");
    await other.getByRole("button", { name: "最新の保存内容を確認" }).click();
    const latest = other.getByRole("region", { name: "最新の保存内容" });
    await expect(latest).toContainText("New"); await expect(latest.locator("pre")).toHaveText("A");
    await expect(editor).toContainText("A my draft");
    await other.getByRole("button", { name: "確認した内容を基準に再試行" }).click();
    await other.getByRole("button", { name: "保存を再試行", exact: true }).click();
    await expect(other.getByRole("status")).toHaveText("保存しました");
    await other.reload(); await editNote(other);
    await expect(editor).toContainText("A my draft");
    await expect(other.getByLabel("ノート名（必須）")).toHaveValue("My draft title");
  } finally {
    await other.close(); await request.delete(`/api/documents/${document.id}`);
  }
});
