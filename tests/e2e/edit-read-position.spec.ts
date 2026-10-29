import { expect, test } from "@playwright/test";
import type { EditorView } from "@codemirror/view";

type EditorDOM = HTMLElement & { cmTile: { root: { view: EditorView } } };
const paragraphs = Array.from({ length: 80 }, (_, index) => `## 見出し ${index + 1}\n\n自分の記録 ${index + 1}。`).join("\n\n");
const longParagraph = `${"長文の論点を自分の言葉で考える。".repeat(45)}長文の途中印。${"長文の根拠をもう一度整理する。".repeat(45)}`;
const richContent = `# 長いノート\n\n${paragraphs}\n\n## 長い段落\n\n${longParagraph}\n\n![観察図](https://example.com/figure.png)\n\n最後の考察を残す。`;

async function searchFor(page: import("@playwright/test").Page, phrase: string) {
  await page.getByRole("button", { name: "本文を検索", exact: true }).click();
  const search = page.getByRole("search", { name: "本文内検索" });
  await search.getByLabel("本文の検索語").fill(phrase);
  await search.getByLabel("本文の検索語").press("Enter");
  await search.getByRole("button", { name: "検索を閉じる" }).click();
}

for (const width of [390, 1440]) for (const lineBreak of ["LF", "CRLF"] as const) test(`editing location remains visible when reading ${width}px ${lineBreak}`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 844 });
  const content = `# 長いノート\n\n${paragraphs}`.replaceAll("\n", lineBreak === "CRLF" ? "\r\n" : "\n");
  const { document } = await (await request.post("/api/documents", { data: { title: "編集から閲覧の位置", content } })).json();
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    await page.getByRole("button", { name: "編集", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await searchFor(page, "見出し 40");
    await expect.poll(() => editor.evaluate((element) => {
      const view = (element as EditorDOM).cmTile.root.view;
      const rect = view.coordsAtPos(view.state.selection.main.head);
      return !!rect && rect.top > document.querySelector(".note-header")!.getBoundingClientRect().bottom && rect.top < innerHeight;
    })).toBe(true);
    const before = await editor.evaluate((element) => {
      const view = (element as EditorDOM).cmTile.root.view;
      return { from: view.state.selection.main.from, to: view.state.selection.main.to, scrollY };
    });
    await page.getByRole("button", { name: "閲覧", exact: true }).click();
    const heading = page.locator(".note-reading h2").filter({ hasText: "見出し 40" });
    await expect.poll(() => heading.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.top > document.querySelector(".note-header")!.getBoundingClientRect().bottom && rect.bottom < innerHeight;
    })).toBe(true);
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await expect(editor).toBeFocused();
    const after = await editor.evaluate((element) => {
      const view = (element as EditorDOM).cmTile.root.view;
      return { from: view.state.selection.main.from, to: view.state.selection.main.to, scrollY };
    });
    expect(after).toEqual(before);
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe(content);
  } finally { await request.delete(`/api/documents/${document.id}`); }
});

for (const width of [390, 1440]) for (const lineBreak of ["LF", "CRLF"] as const) test(`long paragraph, image and tail follow editing at ${width}px ${lineBreak}`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 844 });
  const content = richContent.replaceAll("\n", lineBreak === "CRLF" ? "\r\n" : "\n");
  const { document } = await (await request.post("/api/documents", { data: { title: "長文と画像の位置", content } })).json();
  try {
    for (const [phrase, target] of [["長文の途中印", "paragraph"], ["観察図", "image"], ["最後の考察", "tail"]] as const) {
      await page.goto(`/workspaces/default/documents/${document.id}`);
      await page.getByRole("button", { name: "編集", exact: true }).click();
      await searchFor(page, phrase);
      await page.getByRole("button", { name: "閲覧", exact: true }).click();
      if (target === "paragraph") {
        const paragraph = page.locator(".note-reading p").filter({ hasText: phrase });
        await expect.poll(() => paragraph.evaluate((element, marker) => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          let text: Node | null;
          while ((text = walker.nextNode())) {
            const index = text.textContent?.indexOf(marker) ?? -1;
            if (index < 0) continue;
            const range = document.createRange(); range.setStart(text, index); range.setEnd(text, index + marker.length);
            const rect = range.getBoundingClientRect();
            return rect.bottom > document.querySelector(".note-header")!.getBoundingClientRect().bottom && rect.top < innerHeight;
          }
          return false;
        }, phrase)).toBe(true);
      } else {
        const element = target === "image" ? page.locator(".note-reading .markdown-preview span").filter({ hasText: "[画像: 観察図]" }) : page.locator(".note-reading p").filter({ hasText: "最後の考察を残す。" });
        await expect.poll(() => element.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return rect.bottom > document.querySelector(".note-header")!.getBoundingClientRect().bottom && rect.top < innerHeight;
        })).toBe(true);
      }
    }
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe(content);
  } finally { await request.delete(`/api/documents/${document.id}`); }
});

test("a pending save survives the reading switch and history revisits", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const content = `# 長いノート\n\n${paragraphs}`;
  const { document } = await (await request.post("/api/documents", { data: { title: "保存中の位置", content } })).json();
  let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; });
  let putCount = 0;
  await page.route(`**/api/documents/${document.id}?*`, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    putCount++;
    await gate;
    return route.continue();
  });
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    await page.getByRole("button", { name: "編集", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await searchFor(page, "見出し 40");
    await editor.press("ArrowRight");
    await page.keyboard.insertText(" 人間の追記");
    await editor.press("ControlOrMeta+s");
    await expect.poll(() => putCount).toBe(1);
    await expect(page.locator(".save-state")).toHaveText("保存中…");
    const before = await editor.evaluate((element) => {
      const view = (element as EditorDOM).cmTile.root.view;
      return { from: view.state.selection.main.from, to: view.state.selection.main.to, scrollY };
    });
    await page.getByRole("button", { name: "閲覧", exact: true }).click();
    await expect.poll(() => page.locator(".note-reading h2").filter({ hasText: "見出し 40 人間の追記" }).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > document.querySelector(".note-header")!.getBoundingClientRect().bottom && rect.top < innerHeight;
    })).toBe(true);
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe(content);
    release();
    await expect(page.locator(".save-state")).toHaveText("保存済み");
    const saved = (await (await request.get(`/api/documents/${document.id}`)).json()).content as string;
    expect(saved).toContain("見出し 40 人間の追記");
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await expect(editor).toBeFocused();
    const after = await editor.evaluate((element) => {
      const view = (element as EditorDOM).cmTile.root.view;
      return { from: view.state.selection.main.from, to: view.state.selection.main.to, scrollY };
    });
    expect(after).toEqual(before);
    await page.getByRole("link", { name: "← 学習マップ" }).click();
    const checkRevisit = async () => {
      await expect(page).toHaveURL(new RegExp(`/documents/${document.id}$`));
      const editButton = page.getByRole("button", { name: "編集", exact: true });
      await expect(editButton).toBeVisible();
      if (await editButton.getAttribute("aria-pressed") === "true") {
        expect(await editor.evaluate((element) => (element as EditorDOM).cmTile.root.view.state.sliceDoc())).toBe(saved);
      } else await expect(page.getByRole("region", { name: "閲覧モード" })).toContainText("見出し 40 人間の追記");
    };
    await page.goBack();
    await checkRevisit();
    await page.goForward();
    await page.goBack();
    await checkRevisit();
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe(saved);
  } finally { release(); await request.delete(`/api/documents/${document.id}`); }
});

test("returning from reading keeps the editor ready for synthetic IME input", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const content = `# 長いノート\n\n${paragraphs}`;
  const { document } = await (await request.post("/api/documents", { data: { title: "IMEと位置", content } })).json();
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    await page.getByRole("button", { name: "編集", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    await searchFor(page, "見出し 40");
    await page.getByRole("button", { name: "閲覧", exact: true }).click();
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await expect(editor).toBeFocused();
    await editor.press("ArrowRight");
    await editor.dispatchEvent("compositionstart");
    await page.keyboard.insertText(" 日本語の追記");
    await expect(page.locator(".save-state")).toHaveText("未保存の変更");
    await page.waitForTimeout(1200);
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toBe(content);
    await editor.dispatchEvent("compositionend");
    await editor.press("ControlOrMeta+s");
    await expect(page.locator(".save-state")).toHaveText("保存済み");
    expect((await (await request.get(`/api/documents/${document.id}`)).json()).content).toContain("見出し 40 日本語の追記");
  } finally { await request.delete(`/api/documents/${document.id}`); }
});

test("reading follows the visible writing rather than an older caret", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const content = `# 長いノート\n\n${paragraphs}`;
  const { document } = await (await request.post("/api/documents", { data: { title: "画面とカーソル", content } })).json();
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    await page.getByRole("button", { name: "編集", exact: true }).click();
    const editor = page.getByRole("textbox", { name: "Markdown本文" });
    const oldCaret = await editor.evaluate((element) => {
      const view = (element as EditorDOM).cmTile.root.view;
      const heading = view.state.doc.toString().indexOf("## 見出し 60");
      const absoluteY = view.contentDOM.getBoundingClientRect().top + scrollY + view.lineBlockAt(heading).top;
      window.scrollTo(0, absoluteY - innerHeight * 0.42);
      return view.state.selection.main.head;
    });
    await expect.poll(() => page.locator(".cm-line").evaluateAll((lines) => lines.some((line) => {
      const rect = line.getBoundingClientRect();
      return (line.textContent ?? "").includes("見出し 60") && rect.bottom > document.querySelector(".note-header")!.getBoundingClientRect().bottom && rect.top < innerHeight;
    }))).toBe(true);
    await page.getByRole("button", { name: "閲覧", exact: true }).click();
    await expect.poll(() => page.locator(".note-reading h2").filter({ hasText: "見出し 60" }).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > document.querySelector(".note-header")!.getBoundingClientRect().bottom && rect.top < innerHeight;
    })).toBe(true);
    await page.getByRole("button", { name: "編集", exact: true }).click();
    expect(await editor.evaluate((element) => (element as EditorDOM).cmTile.root.view.state.selection.main.head)).toBe(oldCaret);
  } finally { await request.delete(`/api/documents/${document.id}`); }
});
