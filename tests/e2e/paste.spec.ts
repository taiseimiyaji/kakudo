import { expect, test } from "@playwright/test";
test("native paste requires attribution, cancel preserves prose, URLs open resources and code stays literal", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { document } = await (await request.post("/api/documents", { data: { title: "Paste browser", content: "My words\n\n```ts\n\n```" } })).json();
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toContainText("My words");
    await editor.click(); await editor.press("ControlOrMeta+Home");
    await page.evaluate(() => navigator.clipboard.writeText("Copied claim\nAnother line"));
    await editor.press("ControlOrMeta+V");
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "引用として追加" })).toBeVisible();
    await expect(editor).not.toContainText("Copied claim");
    await dialog.getByRole("button", { name: "キャンセル" }).click();
    await expect(editor).not.toContainText("Copied claim");
    await editor.click(); await editor.press("ControlOrMeta+Home"); await editor.press("ControlOrMeta+V");
    await dialog.getByRole("button", { name: "Add Quote" }).click();
    await expect(dialog).toBeVisible();
    await expect(editor).not.toContainText("Copied claim");
    await dialog.getByLabel("Source URL").fill("https://example.com/source");
    await dialog.getByLabel("Source Title").fill("Primary source");
    await dialog.getByRole("button", { name: "Add Quote" }).click();
    await expect(page.getByRole("status")).toHaveText("引用を追加して保存しました");
    const quoted = await (await request.get(`/api/documents/${document.id}`)).json();
    expect(quoted.content).toContain("> Copied claim\n> Another line");
    expect(quoted.content).toContain("[Primary source](<https://example.com/source>)");
    await editor.click(); await editor.press("ControlOrMeta+Home");
    // Context-menu paste and keyboard paste both reach the DOM paste handler.
    await editor.evaluate((element) => { const data = new DataTransfer(); data.setData("text/plain", "https://example.com/resource"); element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })); });
    await expect(dialog.getByRole("heading", { name: "Resourceとして登録" })).toBeVisible();
    await dialog.getByRole("button", { name: "キャンセル" }).click();
    await editor.click(); await editor.press("ControlOrMeta+End"); await editor.press("ArrowUp"); await editor.press("Home");
    await page.evaluate(() => navigator.clipboard.writeText("const exact = 42;")); await editor.press("ControlOrMeta+V");
    await expect(dialog).toHaveCount(0); await expect(editor).toContainText("const exact = 42;");
    await page.getByRole("button", { name: "保存", exact: true }).click(); await expect(page.getByRole("status")).toHaveText("保存しました");
    const saved = await (await request.get(`/api/documents/${document.id}`)).json();
    expect(saved.content).toContain("```ts\nconst exact = 42;\n```");
  } finally { await request.delete(`/api/documents/${document.id}`); }
});
