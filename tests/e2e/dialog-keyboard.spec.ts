import { expect, test, editNote } from "./manual-note-fixture";

for (const kind of ["quote", "resource"] as const) {
  for (const exit of ["Escape", "cancel button"] as const) {
  test(`${kind} ${exit} restores focus and the learner can continue typing`, async ({ page, context, request }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const { document } = await (await request.post("/api/documents", { data: { title: `Keyboard ${kind}`, content: "Human prose." } })).json();
    try {
      await page.goto(`/workspaces/default/documents/${document.id}`); await editNote(page);
      const editor = page.getByRole("textbox", { name: "Markdown本文" });
      await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" Draft.");
      await page.evaluate((text) => navigator.clipboard.writeText(text), kind === "quote" ? "Quote fixture." : "https://example.com/keyboard");
      await editor.press("ControlOrMeta+V");
      const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
      await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
      if (exit === "Escape") await page.keyboard.press("Escape");
      else {
        for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
        await expect(dialog.getByRole("button", { name: "キャンセル", exact: true })).toBeFocused();
        await page.keyboard.press("Enter");
      }
      await expect(dialog).toHaveCount(0);
      await expect(editor).toBeFocused();
      await page.keyboard.type(" Continued.");
      await expect(editor).toContainText("Human prose. Draft. Continued.");
      expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe("Human prose.");
    } finally { await request.delete(`/api/documents/${document.id}`); }
  });
  }
}

test("resource registration stays modal during a delayed response so Escape cannot discard the next dialog", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { document } = await (await request.post("/api/documents", { data: { title: "Pending dialog", content: "Human prose." } })).json();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let posts = 0;
  let committed = false;
  try {
    await page.route(`**/api/documents/${document.id}/resources?*`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts++; const response = await route.fetch(); committed = true;
      await gate; await route.fulfill({ response });
    });
    await page.goto(`/workspaces/default/documents/${document.id}`); await editNote(page);
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" Draft.");
    await page.evaluate(() => navigator.clipboard.writeText("https://example.com/pending-keyboard"));
    await editor.press("ControlOrMeta+V");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Enter in the focused URL input submits the resource form.
    await page.keyboard.press("Enter");
    await expect.poll(() => committed).toBe(true);
    await expect(dialog.getByText("資料を登録しています。", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "キャンセル", exact: true })).toBeDisabled();
    await page.keyboard.press("Enter"); expect(posts).toBe(1);
    release();
    await expect(dialog).toHaveCount(0); await expect(editor).toBeFocused();
    await page.keyboard.type(" Continued.");
    await expect(editor).toContainText("Human prose. Draft. Continued.");
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe("Human prose.");
    const linked = (await (await request.get(`/api/documents/${document.id}/resources`)).json()).resources;
    expect(linked.filter((item: { url: string }) => item.url === "https://example.com/pending-keyboard")).toHaveLength(1);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); await request.delete(`/api/documents/${document.id}`); }
});

test("a failed resource registration keeps its fields and allows Escape back to the draft", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { document } = await (await request.post("/api/documents", { data: { title: "Failed dialog", content: "Human prose." } })).json();
  try {
    await page.route(`**/api/documents/${document.id}/resources?*`, (route) => route.request().method() === "POST" ? route.fulfill({ status: 500, json: { error: "secret-token stack" } }) : route.continue());
    await page.goto(`/workspaces/default/documents/${document.id}`); await editNote(page);
    const editor = page.getByRole("textbox", { name: "Markdown本文" }); await editor.click();
    await page.evaluate(() => navigator.clipboard.writeText("https://example.com/failed-keyboard")); await editor.press("ControlOrMeta+V");
    const dialog = page.getByRole("dialog");
    await page.keyboard.press("Tab"); await page.keyboard.type("Retained title"); await page.keyboard.press("Enter");
    await expect(dialog.getByRole("alert")).toContainText("入力内容は保持されています");
    await expect(dialog.getByRole("alert")).not.toContainText("secret-token");
    await expect(dialog.getByLabel("資料URL（必須）")).toHaveValue("https://example.com/failed-keyboard");
    await expect(dialog.getByLabel("資料名（任意）")).toHaveValue("Retained title");
    await expect(dialog.getByRole("button", { name: "キャンセル", exact: true })).toBeEnabled();
    await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0); await expect(editor).toBeFocused();
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe("Human prose.");
  } finally { await page.unrouteAll({ behavior: "wait" }); await request.delete(`/api/documents/${document.id}`); }
});

test("Enter submits an attributed quote and restores typing without resetting the draft", async ({ page, context, request }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { document } = await (await request.post("/api/documents", { data: { title: "Quote finish", content: "Human prose." } })).json();
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`); await editNote(page);
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await editor.click(); await editor.press("ControlOrMeta+End"); await editor.pressSequentially(" Draft.");
    await page.evaluate(() => navigator.clipboard.writeText("Quote fixture.")); await editor.press("ControlOrMeta+V");
    await page.keyboard.press("Tab"); await page.keyboard.type("https://example.com/quote-keyboard"); await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toHaveCount(0); await expect(editor).toBeFocused();
    await page.keyboard.type("Continued."); await expect(editor).toContainText("Continued.");
    await page.keyboard.press("ControlOrMeta+Z"); await expect(editor).not.toContainText("Continued.");
    await page.keyboard.press("ControlOrMeta+Z"); await expect(editor).not.toContainText("Quote fixture.");
    await expect(editor).toContainText("Human prose. Draft.");
    const saved = await (await request.get(`/api/documents/${document.id}`)).json(); expect(saved.content).toContain("Quote fixture."); expect(saved.content).not.toContain("Continued.");
    await page.screenshot({ path: testInfo.outputPath("keyboard-dialog-return.png"), fullPage: true });
  } finally { await request.delete(`/api/documents/${document.id}`); }
});
