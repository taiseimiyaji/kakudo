import { expect, test } from "@playwright/test";

const code = `# コードを読む\n\n\`\`\`ts\nconst longUrl = "${"x".repeat(4200)}";\n${Array.from({ length: 100 }, (_, index) => `console.log("ROW_${index + 1}");`).join("\n")}\n\`\`\``;
const codeTrailing = `# コードを読む\n\n\`\`\`ts\n${Array.from({ length: 99 }, (_, index) => `console.log("ROW_${index + 1}");`).join("\n")}\nconst giant = "${"x".repeat(10000)}";\n\`\`\``;
const link = `# 資料と考察\n\n[短い資料リンク](https://example.com/${"u".repeat(3600)}) ${"リンクを読んで考えたことを記録する。".repeat(45)} 中間目印 ${"自分の言葉で根拠を整理する。".repeat(95)}`;

function markerGeometry(element: Element, marker: string) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let text: Node | null;
  while ((text = walker.nextNode())) {
    const index = text.textContent?.indexOf(marker) ?? -1;
    if (index < 0) continue;
    const range = document.createRange(); range.setStart(text, index); range.setEnd(text, index + marker.length);
    const rect = range.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, header: document.querySelector(".note-header")!.getBoundingClientRect().bottom, height: innerHeight };
  }
  return null;
}

for (const width of [390, 1440]) for (const lineBreak of ["LF", "CRLF"] as const) for (const fixture of [{ name: "code", content: code, marker: "ROW_70", selector: ".note-reading pre" }, { name: "code trailing long line", content: codeTrailing, marker: "ROW_60", selector: ".note-reading pre" }, { name: "link", content: link, marker: "中間目印", selector: ".note-reading p" }]) test(`uneven ${fixture.name} stays near writing position at ${width}px ${lineBreak}`, async ({ page, request }) => {
  await page.setViewportSize({ width, height: 844 });
  const content = fixture.content.replaceAll("\n", lineBreak === "CRLF" ? "\r\n" : "\n");
  const { document } = await (await request.post("/api/documents", { data: { title: "長さが異なる行", content } })).json();
  try {
    await page.goto(`/workspaces/default/documents/${document.id}`);
    await page.getByRole("button", { name: "編集", exact: true }).click();
    await page.getByRole("button", { name: "本文を検索", exact: true }).click();
    const input = page.getByLabel("本文の検索語");
    await input.fill(fixture.marker); await input.press("Enter");
    await page.getByRole("button", { name: "検索を閉じる" }).click();
    await page.getByRole("button", { name: "閲覧", exact: true }).click();
    const target = page.locator(fixture.selector).filter({ hasText: fixture.marker });
    await expect(target).toBeVisible();
    await expect.poll(async () => {
      const rect = await target.evaluate(markerGeometry, fixture.marker);
      return !!rect && rect.bottom > rect.header && rect.top < rect.height;
    }).toBe(true);
    const geometry = await target.evaluate(markerGeometry, fixture.marker);
    console.log(JSON.stringify({ width, lineBreak, fixture: fixture.name, geometry }));
  } finally { await request.delete(`/api/documents/${document.id}`); }
});
