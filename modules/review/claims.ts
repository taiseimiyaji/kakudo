import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import type { RootContent, Root } from "mdast";
export type ReviewSpan = { id: string; text: string; startOffset: number; endOffset: number };
export function reviewSpans(markdown: string): ReviewSpan[] {
  const tree = unified().use(remarkParse).use(remarkFrontmatter, ["yaml", "toml"]).parse(markdown);
  const spans: ReviewSpan[] = [];
  function walk(node: Root | RootContent) {
    if (["code", "blockquote", "yaml", "toml", "html"].includes(node.type)) return;
    if (node.type === "paragraph" || node.type === "heading") {
      const startOffset = node.position?.start.offset; const endOffset = node.position?.end.offset;
      if (startOffset !== undefined && endOffset !== undefined) spans.push({ id: `span-${spans.length}`, text: markdown.slice(startOffset, endOffset), startOffset, endOffset });
      return;
    }
    if ("children" in node) for (const child of node.children) walk(child as RootContent);
  }
  walk(tree); return spans;
}
