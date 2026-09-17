import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownPreview } from "../../components/editor/preview";
it("renders Markdown without active HTML, dangerous URLs, or automatic external images", () => {
  const html = renderToStaticMarkup(<MarkdownPreview content={'---\nid: private-id\n---\n# Title\n<script>alert(1)</script>\n[x](javascript:alert)\n![remote](https://example.com/tracker)'} />);
  expect(html).toContain("Title"); expect(html).not.toContain("<script"); expect(html).not.toContain("javascript:"); expect(html).not.toContain("<img"); expect(html).not.toContain("private-id");
});
