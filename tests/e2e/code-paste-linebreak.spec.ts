import type { EditorView } from "@codemirror/view";
import { expect, test } from "@playwright/test";

type EditorDOM = HTMLElement & { cmTile: { root: { view: EditorView } } };

for (const { name, lineBreak, clipboard } of [
  { name: "CRLF note with LF clipboard", lineBreak: "\r\n", clipboard: "const a = 1;\nconst b = 2;" },
  { name: "LF note with CRLF clipboard", lineBreak: "\n", clipboard: "const a = 1;\r\nconst b = 2;" },
]) {
  test(`${name} keeps code paste, Undo and saved line numbers aligned`, async ({ page, context, request }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const original = ["# 人間のノート", "", "```ts", "", "```", ""].join(lineBreak);
    const inserted = "const a = 1;" + lineBreak + "const b = 2;";
    const expected = ["# 人間のノート", "", "```ts", inserted, "```", ""].join(lineBreak);
    const { document } = await (await request.post("/api/documents", { data: { title: name, content: original } })).json();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    const snapshot = () => editor.evaluate((element) => {
      const view = (element as EditorDOM).cmTile.root.view;
      return { content: view.state.sliceDoc(), lines: view.state.doc.lines,
        caretPrefix: view.state.sliceDoc(0, view.state.selection.main.head),
        renderedLines: document.querySelectorAll(".cm-line").length,
        focused: view.hasFocus };
    });
    try {
      await page.clock.install();
      await page.goto(`/workspaces/default/documents/${document.id}`);
      await page.getByRole("button", { name: "編集", exact: true }).click();
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
      await editor.press("ControlOrMeta+End"); await editor.press("ArrowUp"); await editor.press("ArrowUp"); await editor.press("Home");
      await page.evaluate((text) => navigator.clipboard.writeText(text), clipboard);
      await editor.press("ControlOrMeta+V");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect.poll(snapshot).toMatchObject({ content: expected, lines: 7, renderedLines: 7, focused: true,
        caretPrefix: ["# 人間のノート", "", "```ts", inserted].join(lineBreak) });
      await editor.press("ControlOrMeta+Z");
      await expect.poll(snapshot).toMatchObject({ content: original, lines: 6 });
      await editor.press("ControlOrMeta+Shift+Z");
      await expect.poll(snapshot).toMatchObject({ content: expected, lines: 7 });
      await page.clock.runFor(1000);
      await expect(page.locator(".save-state")).toHaveText("保存済み");
      expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe(expected);
      await page.reload();
      await page.getByRole("button", { name: "編集", exact: true }).click();
      await expect.poll(snapshot).toMatchObject({ content: expected, lines: 7, renderedLines: 7 });
    } finally { await request.delete(`/api/documents/${document.id}`); }
  });
}
