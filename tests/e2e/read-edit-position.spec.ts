import { expect, test } from "@playwright/test";
import type { EditorView } from "@codemirror/view";

type EditorDOM = HTMLElement & { cmTile: { root: { view: EditorView } } };

const sections = Array.from({ length: 80 }, (_, index) => `## 見出し ${index + 1}\n\n人間が書いた内容 ${index + 1}。`).join("\n\n");
const paragraph = `長い段落の始まり。${"自分の言葉で確かめたことを丁寧に書く。".repeat(90)}長い段落の終わり。`;
const content = `# 長いノート\n\n${sections}\n\n## 長文の検討\n\n${paragraph}\n\n![観察した図](https://example.com/figure.png)\n\n最後に残した考察。`;

for (const width of [390, 1440]) test(`reading position follows first edit at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 844 });
  const { document } = await (await request.post("/api/documents", { data: { title: "読んでいた位置", content } })).json();
  try {
    const scenarios = [
      { name: "heading", selector: ".note-reading h2", text: "見出し 40", expected: "見出し 40" },
      { name: "paragraph", selector: ".note-reading p", text: "長い段落の始まり", expected: "長い段落の始まり" },
      { name: "image", selector: ".note-reading p", text: "[画像: 観察した図]", expected: "![観察した図]" },
      { name: "end", selector: ".note-reading p", text: "最後に残した考察。", expected: "最後に残した考察。" },
    ];
    for (const scenario of scenarios) {
      await page.goto(`/workspaces/default/documents/${document.id}`);
      const target = page.locator(scenario.selector).filter({ hasText: scenario.text });
      await expect(target).toBeVisible();
      await expect(target).toHaveAttribute("data-source-start", /\d+/);
      await target.evaluate((element) => element.scrollIntoView({ block: "center" }));
      await page.getByRole("button", { name: "編集", exact: true }).click();
      const editor = page.getByRole("textbox", { name: "Markdown本文" });
      await expect(editor).toBeFocused();
      await expect.poll(() => page.locator(".cm-line").evaluateAll((lines, expected) => lines.some((line) => {
        const rect = line.getBoundingClientRect();
        return rect.bottom > document.querySelector(".note-header")!.getBoundingClientRect().bottom && rect.top < innerHeight && (line.textContent ?? "").includes(expected);
      }), scenario.expected), { message: `visible source near ${scenario.name}` }).toBe(true);
    }
    const saved = await (await request.get(`/api/documents/${document.id}`)).json();
    expect(saved.content).toBe(content);
  } finally { await request.delete(`/api/documents/${document.id}`); }
});

test("a long paragraph remains editable near the read point and saves across a revisit", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { document } = await (await request.post("/api/documents", { data: { title: "長文への追記", content } })).json();
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const paragraph = page.locator(".note-reading p").filter({ hasText: "長い段落の始まり" });
    await paragraph.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await page.getByRole("button", { name: "編集", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toBeFocused();
    const caret = () => page.evaluate(() => {
      const selection = getSelection()!, range = document.createRange();
      range.setStart(selection.focusNode!, selection.focusOffset); range.collapse(true);
      const rect = range.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, header: document.querySelector(".note-header")!.getBoundingClientRect().bottom, height: innerHeight };
    });
    await expect.poll(async () => { const position = await caret(); return position.top - position.header; }).toBeGreaterThan(0);
    expect((await caret()).bottom).toBeLessThan((await caret()).height);
    await editor.pressSequentially("人間の追記。");
    await editor.press("ControlOrMeta+s");
    await expect(page.locator(".save-state")).toHaveText("保存済み");
    const saved = (await (await request.get(`/api/documents/${document.id}`)).json()).content as string;
    const insertion = saved.indexOf("人間の追記。");
    expect(insertion).toBeGreaterThan(content.indexOf("長い段落の始まり。"));
    expect(insertion).toBeLessThan(saved.indexOf("長い段落の終わり。"));
    await page.reload();
    await expect(page.getByRole("region", { name: "閲覧モード" })).toContainText("人間の追記。");
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await expect(editor).toBeFocused();
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe(saved);
  } finally { await request.delete(`/api/documents/${document.id}`); }
});

test("opening an existing note at the top keeps the start caret", async ({ page, request }) => {
  const { document } = await (await request.post("/api/documents", { data: { title: "先頭から編集", content } })).json();
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.getByRole("button", { name: "編集", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toBeFocused();
    await editor.pressSequentially("自分の追記。");
    await editor.press("ControlOrMeta+s");
    await expect(page.locator(".save-state")).toHaveText("保存済み");
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe(`自分の追記。${content}`);
  } finally { await request.delete(`/api/documents/${document.id}`); }
});

for (const width of [390, 1440]) test(`CRLF reading offset reaches its Markdown heading at ${width}px`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 844 });
  const crlf = content.replaceAll("\n", "\r\n");
  const { document } = await (await request.post("/api/documents", { data: { title: "CRLF位置確認", content: crlf } })).json();
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    const target = page.locator(".note-reading h2").filter({ hasText: "見出し 40" });
    await target.evaluate((element) => {
      element.scrollIntoView({ block: "center" });
      window.scrollBy(0, element.getBoundingClientRect().top - innerHeight * 0.42);
    });
    expect(Number(await target.getAttribute("data-source-start"))).toBe(crlf.indexOf("## 見出し 40"));
    await page.getByRole("button", { name: "編集", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await expect(editor).toBeFocused();
    const range = await editor.evaluate((element) => {
      const view = (element as EditorDOM).cmTile.root.view;
      const normalized = view.state.doc.toString(), heading = "## 見出し 40";
      return { caret: view.state.selection.main.head, start: normalized.indexOf(heading), end: normalized.indexOf(heading) + heading.length,
        lineBreak: view.state.lineBreak, docLength: view.state.doc.length, sliceLength: view.state.sliceDoc().length };
    });
    expect(range.lineBreak).toBe("\r\n");
    expect(range.docLength).toBe(content.length);
    expect(range.sliceLength).toBe(crlf.length);
    expect(range.caret).toBeGreaterThanOrEqual(range.start);
    expect(range.caret).toBeLessThanOrEqual(range.end);
  } finally { await request.delete(`/api/documents/${document.id}`); }
});
