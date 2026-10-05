import { openNotePanels } from "./manual-note-fixture";
import { expect, test, editNote } from "./manual-note-fixture";

test("quotes preserve earlier typing, undo, redo and saved revision/source-check consistency", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "Quote undo", content: "Original" } })).json();
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await openNotePanels(page); await editNote(page);
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toContainText("Original");
    await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" my words");
    await editor.evaluate((element) => { const data = new DataTransfer(); data.setData("text/plain", "Reference"); element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })); });
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("出典URL").fill("https://example.com/source");
    await dialog.getByRole("button", { name: "引用を追加" }).click();
    await expect(page.locator(".save-state")).toHaveText("保存済み");
    await expect(editor).toContainText("> Reference");
    const quoted = await (await request.get(`/api/documents/${document.id}`)).json();
    await editor.press("ControlOrMeta+Z");
    await expect(editor).not.toContainText("Reference");
    await expect(editor).toContainText("Original my words");
    await expect(page.getByText("未保存の変更", { exact: true })).toBeVisible();
    await editor.press("ControlOrMeta+Shift+Z");
    await expect(editor).toContainText("> Reference");
    await expect(page.getByText("保存済み", { exact: true })).toBeVisible();
    await editor.press("ControlOrMeta+Z"); await editor.press("ControlOrMeta+Z");
    await expect(editor).toHaveText("Original");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.locator(".save-state")).toHaveText("保存済み");
    const current = await (await request.get(`/api/documents/${document.id}`)).json();
    expect(current.content).toBe("Original"); expect(current.document.currentRevisionId).not.toBe(quoted.document.currentRevisionId);
    await page.getByRole("button", { name: "出典を確認", exact: true }).click();
    await expect(page.getByLabel("レビューの状態")).toContainText("完了");
    const { reviews } = await (await request.get(`/api/documents/${document.id}/reviews`)).json();
    const review = await (await request.get(`/api/reviews/${reviews[0].id}`)).json();
    expect(review.run.sourceChecks).toEqual([]); expect(review.revision.contentSnapshot).toBe("Original");
    await page.reload(); await editNote(page); await expect(editor).toHaveText("Original");
  } finally { await request.delete(`/api/documents/${document.id}`); }
});
